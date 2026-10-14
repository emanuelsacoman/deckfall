import { effect, inject, Injectable, InjectionToken, untracked } from '@angular/core';
import { Firestore, Timestamp, collection, doc, getDocFromServer, getDocsFromServer } from '@angular/fire/firestore';
import { Functions } from '@angular/fire/functions';
import { httpsCallable } from 'firebase/functions';
import { isAuthenticatedSession } from '../../../interfaces/Auth/auth-session';
import { CARD_LIMITS, CARD_RARITIES, CardRarity } from '../../../interfaces/Cards/card';
import { PLAYER_COLLECTION_MAX_QUANTITY } from '../../../interfaces/Collection/player-card-collection';
import {
  PACK_INSTANCE_ID_PATTERN, PACK_MAX_CARDS, PACK_MAX_VERSION, PackOpenedCard, PackOpenResult, PlayerPack
} from '../../../interfaces/Packs/player-pack';
import { AuthService } from '../../fire/auth.service';
import { PLAYER_INITIALIZATION_TIMEOUT_MS } from '../../fire/player-initialization.service';
import { validateCardId } from '../../tools/card-validation';
import { validateUserUid } from '../../tools/user-validation';

export interface PlayerPackDocument {
  id: string;
  data: Record<string, unknown>;
}

/** Public error code and safe copy; SDK messages and details never escape. */
export class PlayerPackError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = 'PlayerPackError';
  }
}

/** Read-only Firestore boundary plus one server-authoritative callable. */
export interface PlayerPackClient {
  list(uid: string): Promise<PlayerPackDocument[]>;
  get(uid: string, packInstanceId: string): Promise<PlayerPackDocument | null>;
  open(packInstanceId: string): Promise<PackOpenResult>;
}

export const PLAYER_PACK_CLIENT = new InjectionToken<PlayerPackClient>('Player pack client', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(Firestore);
    const callable = httpsCallable<{ packInstanceId: string }, PackOpenResult>(
      inject(Functions), 'openPack', { timeout: PLAYER_INITIALIZATION_TIMEOUT_MS }
    );
    return {
      list: async uid => {
        const snapshot = await getDocsFromServer(collection(firestore, 'users', uid, 'packs'));
        return snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
      },
      get: async (uid, id) => {
        const snapshot = await getDocFromServer(doc(firestore, 'users', uid, 'packs', id));
        return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
      },
      // No UID, version, state, card IDs or quantities are caller-controlled.
      open: async packInstanceId => (await callable({ packInstanceId })).data
    };
  }
});

@Injectable({ providedIn: 'root' })
export class PlayerPackService {
  private readonly auth = inject(AuthService);
  private readonly client = inject(PLAYER_PACK_CLIENT);
  private readonly pending = new Map<string, Promise<PackOpenResult>>();
  private activeUid: string | null | undefined;
  private version = 0;

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      untracked(() => this.synchronizeSession(isAuthenticatedSession(session) ? session.uid : null));
    });
  }

  async listCurrentUser(): Promise<PlayerPack[]> {
    const session = await this.requireSession();
    try {
      this.assertCurrent(session);
      const documents = await this.client.list(session.uid);
      this.assertCurrent(session);
      return documents.map(item => parsePlayerPack(item)).sort((a, b) =>
        Number(a.state === 'opened') - Number(b.state === 'opened') ||
        b.acquiredAt.toMillis() - a.acquiredAt.toMillis() || a.id.localeCompare(b.id));
    } catch (error: unknown) {
      this.assertCurrent(session);
      throw packError(error);
    }
  }

  async getCurrentUser(packInstanceId: string): Promise<PlayerPack | null> {
    validatePackInstanceId(packInstanceId);
    const session = await this.requireSession();
    try {
      this.assertCurrent(session);
      const document = await this.client.get(session.uid, packInstanceId);
      this.assertCurrent(session);
      if (!document) return null;
      if (document.id !== packInstanceId) throw new Error('Invalid pack identity');
      return parsePlayerPack(document);
    } catch (error: unknown) {
      this.assertCurrent(session);
      throw packError(error);
    }
  }

  async openCurrentUser(packInstanceId: string): Promise<PackOpenResult> {
    validatePackInstanceId(packInstanceId);
    const session = await this.requireSession();
    this.assertCurrent(session);
    const key = `${session.uid}/${packInstanceId}`;
    let request = this.pending.get(key);
    if (!request) {
      let invocation: Promise<PackOpenResult>;
      try { invocation = this.client.open(packInstanceId); }
      catch (error: unknown) { invocation = Promise.reject(error); }
      const backendRequest = invocation.finally(() => {
        if (this.pending.get(key) === backendRequest) this.pending.delete(key);
      });
      this.pending.set(key, backendRequest);
      request = backendRequest;
    }
    try {
      const result = await request;
      this.assertCurrent(session);
      return parseOpenResult(result, packInstanceId);
    } catch (error: unknown) {
      this.assertCurrent(session);
      throw packError(error);
    }
  }

  private async requireSession(): Promise<{ uid: string; version: number }> {
    const session = await this.auth.waitForSession();
    if (!isAuthenticatedSession(session)) throw new Error('Entre com uma conta com perfil válido para consultar seus pacotes.');
    const uid = validateUserUid(session.uid);
    const current = this.auth.currentUser();
    if (!isAuthenticatedSession(current) || current.uid !== uid) throw sessionChangedError();
    this.synchronizeSession(uid);
    return { uid, version: this.version };
  }

  private synchronizeSession(uid: string | null): void {
    if (this.activeUid !== uid) {
      this.activeUid = uid;
      ++this.version;
    }
    // Accepted backend transactions survive local navigation and logout.
  }

  private assertCurrent(session: { uid: string; version: number }): void {
    const current = this.auth.currentUser();
    this.synchronizeSession(isAuthenticatedSession(current) ? current.uid : null);
    if (session.version !== this.version || current?.uid !== session.uid || !isAuthenticatedSession(current)) {
      throw sessionChangedError();
    }
  }
}

export function validatePackInstanceId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !PACK_INSTANCE_ID_PATTERN.test(value)) {
    throw new Error('Identificador de pacote inválido.');
  }
}

function parsePlayerPack(document: PlayerPackDocument): PlayerPack {
  validatePackInstanceId(document.id);
  const data = fields(document.data, ['packId', 'definitionVersion', 'source', 'state', 'acquiredAt', 'openedAt'], ['revealedCards']);
  validatePackInstanceId(data['packId']);
  const version = data['definitionVersion'];
  if (!Number.isInteger(version) || typeof version !== 'number' || version < 1 || version > PACK_MAX_VERSION || data['source'] !== 'starter') {
    throw new Error('Invalid pack definition');
  }
  const acquiredAt = data['acquiredAt'];
  const openedAt = data['openedAt'];
  if (!(acquiredAt instanceof Timestamp)) throw new Error('Invalid acquisition date');
  if (data['state'] === 'sealed') {
    if (openedAt !== null || 'revealedCards' in data) throw new Error('Invalid sealed pack');
    return { id: document.id, packId: data['packId'], definitionVersion: version, source: 'starter', state: 'sealed', acquiredAt, openedAt: null };
  }
  if (data['state'] !== 'opened' || !(openedAt instanceof Timestamp) || openedAt.toMillis() < acquiredAt.toMillis()) {
    throw new Error('Invalid opened pack');
  }
  return {
    id: document.id, packId: data['packId'], definitionVersion: version, source: 'starter', state: 'opened', acquiredAt, openedAt,
    revealedCards: parseRevealedCards(data['revealedCards'])
  };
}

function parseOpenResult(value: unknown, expectedId: string): PackOpenResult {
  const data = fields(value, ['packInstanceId', 'alreadyOpened', 'revealedCards']);
  if (data['packInstanceId'] !== expectedId || typeof data['alreadyOpened'] !== 'boolean') throw new Error('Invalid opening response');
  return { packInstanceId: expectedId, alreadyOpened: data['alreadyOpened'], revealedCards: parseRevealedCards(data['revealedCards']) };
}

function parseRevealedCards(value: unknown): PackOpenedCard[] {
  if (!Array.isArray(value) || !value.length || value.length > PACK_MAX_CARDS) throw new Error('Invalid revealed cards');
  const ids = new Set<string>();
  return value.map(item => {
    const data = fields(item, ['cardId', 'name', 'rarity', 'quantity']);
    const id = data['cardId'];
    if (typeof id !== 'string') throw new Error('Invalid card ID');
    validateCardId(id);
    if (ids.has(id)) throw new Error('Duplicate revealed card');
    ids.add(id);
    const name = data['name'];
    const rarity = data['rarity'];
    const quantity = data['quantity'];
    if (typeof name !== 'string' || !name.trim() || name.length > CARD_LIMITS.name ||
        typeof rarity !== 'string' || !(CARD_RARITIES as readonly string[]).includes(rarity) ||
        typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > PLAYER_COLLECTION_MAX_QUANTITY) {
      throw new Error('Invalid revealed card');
    }
    return { cardId: id, name, rarity: rarity as CardRarity, quantity };
  });
}

function fields(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid pack data');
  const record = value as Record<string, unknown>;
  if (required.some(key => !Object.prototype.hasOwnProperty.call(record, key)) ||
      Object.keys(record).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('Invalid pack fields');
  return record;
}

function sessionChangedError(): Error {
  return new Error('Sua conta mudou. Carregue novamente os pacotes da sessão atual.');
}

function packError(error: unknown): Error {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  const knownCodes = ['functions/unauthenticated', 'functions/permission-denied', 'permission-denied',
    'firestore/permission-denied', 'functions/not-found', 'functions/failed-precondition',
    'functions/deadline-exceeded', 'functions/unavailable'];
  const code = typeof rawCode === 'string' && knownCodes.includes(rawCode) ? rawCode : null;
  switch (code) {
    case 'functions/unauthenticated': case 'functions/permission-denied':
    case 'permission-denied': case 'firestore/permission-denied':
      return new PlayerPackError('Não foi possível confirmar o acesso a este pacote. Entre novamente ou contate um administrador.', code);
    case 'functions/not-found':
      return new PlayerPackError('Este pacote não foi encontrado na sua conta.', code);
    case 'functions/failed-precondition':
      return new PlayerPackError('Este pacote não pode ser aberto agora. Contate um administrador ou tente novamente mais tarde.', code);
    case 'functions/deadline-exceeded':
      return new PlayerPackError('A abertura demorou mais que o esperado. Tente novamente para recuperar o resultado com segurança.', code);
    default:
      return new PlayerPackError('Não foi possível carregar ou abrir o pacote. Confira sua conexão e tente novamente.', code);
  }
}
