import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/** Technical limits mirrored by Angular/Rules; unrelated to deck or gameplay rules. */
export const PLAYER_COLLECTION_MAX_QUANTITY = 9999;
export const STARTER_COLLECTION_MAX_CARDS = 25;
export const STARTER_COLLECTION_MAX_VERSION = 1000000;
export const STARTER_COLLECTION_PATH = 'starterCollections/default';

export interface PlayerProfile {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  starterGrantedAt: Timestamp | null;
  /** Audit of the one-time grant, never a condition for granting a newer version. */
  starterVersion?: number;
}

export interface StarterCollection {
  active: boolean;
  version: number;
  cards: { cardId: string; quantity: number }[];
  updatedAt: Timestamp;
}

export interface InitializePlayerRequest {
  auth?: { uid: string } | null;
  data?: unknown;
}

export interface InitializePlayerResult {
  initialized: true;
  alreadyInitialized: boolean;
  /** Number of copies added, rather than number of distinct card IDs. */
  cardsGranted: number;
}

export type BootstrapErrorCode = 'unauthenticated' | 'invalid-argument' | 'permission-denied' | 'failed-precondition';

export class PlayerBootstrapError extends Error {
  constructor(readonly code: BootstrapErrorCode, message: string) {
    super(message);
    this.name = 'PlayerBootstrapError';
  }
}

export interface BootstrapTransaction {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
}

/** The production adapter must commit all sets atomically and retry conflicts. */
export interface BootstrapStore {
  runTransaction<T>(action: (transaction: BootstrapTransaction) => Promise<T>): Promise<T>;
  /** Trusted backend clock used to reject malformed future persisted dates. */
  currentTimestamp(): Timestamp;
  serverTimestamp(): FieldValue | Timestamp;
}

const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
function fail(message: string): never { throw new PlayerBootstrapError('failed-precondition', message); }

export async function initializePlayerOperation(
  request: InitializePlayerRequest, store: BootstrapStore
): Promise<InitializePlayerResult> {
  const uid = request.auth?.uid;
  if (!uid) throw new PlayerBootstrapError('unauthenticated', 'Entre em uma conta para iniciar sua jornada.');
  if (!identifier.test(uid)) throw new PlayerBootstrapError('permission-denied', 'A identidade autenticada não possui um UID válido.');
  if (request.data != null && (!isRecord(request.data) || Object.keys(request.data).length !== 0)) {
    throw new PlayerBootstrapError('invalid-argument', 'initializePlayer não aceita parâmetros.');
  }

  return store.runTransaction(async transaction => {
    const playerPath = `players/${uid}`;
    const [user, player] = await Promise.all([
      transaction.get(`users/${uid}`), transaction.get(playerPath)
    ]);
    if (!user || (user['role'] !== 'member' && user['role'] !== 'admin') || user['role'] !== user['roleId']) {
      throw new PlayerBootstrapError('permission-denied', 'Sua conta precisa de um perfil válido para iniciar a jornada.');
    }
    const profile = player ? validatePlayer(player, store.currentTimestamp()) : null;
    if (profile?.starterGrantedAt) {
      return { initialized: true, alreadyInitialized: true, cardsGranted: 0 };
    }

    const starter = validateStarter(await transaction.get(STARTER_COLLECTION_PATH));
    const entries = await Promise.all(starter.cards.map(async item => {
      const entryPath = `users/${uid}/collection/${item.cardId}`;
      const [card, existing] = await Promise.all([
        transaction.get(`cards/${item.cardId}`), transaction.get(entryPath)
      ]);
      if (!card || card['status'] !== 'published') fail('A coleção inicial contém uma carta que não está publicada.');
      const owned = existing ? validateOwnedEntry(existing, store.currentTimestamp()) : null;
      const quantity = (owned?.quantity ?? 0) + item.quantity;
      if (quantity > PLAYER_COLLECTION_MAX_QUANTITY) fail('A coleção inicial ultrapassa o limite de quantidade de uma carta.');
      return { entryPath, quantity, firstAcquiredAt: owned?.firstAcquiredAt ?? null };
    }));

    // No writes before every profile/configuration/card/quantity invariant is checked.
    // The same server timestamp resolves to the transaction commit time on every write.
    const now = store.serverTimestamp();
    for (const entry of entries) {
      transaction.set(entry.entryPath, {
        quantity: entry.quantity, firstAcquiredAt: entry.firstAcquiredAt ?? now, lastAcquiredAt: now
      });
    }
    transaction.set(playerPath, {
      createdAt: profile?.createdAt ?? now, updatedAt: now,
      starterGrantedAt: now, starterVersion: starter.version
    });
    return {
      initialized: true, alreadyInitialized: false,
      cardsGranted: starter.cards.reduce((total, item) => total + item.quantity, 0)
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasFields(data: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(data);
  return required.every(key => Object.hasOwn(data, key)) && keys.every(key => required.includes(key) || optional.includes(key));
}

function validPositiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function validateStarter(data: Record<string, unknown> | null): StarterCollection {
  if (!data) fail('A coleção inicial ainda não foi configurada por um administrador.');
  if (!hasFields(data, ['active', 'version', 'cards', 'updatedAt']) || typeof data['active'] !== 'boolean' ||
      !validPositiveInteger(data['version'], STARTER_COLLECTION_MAX_VERSION) || !(data['updatedAt'] instanceof Timestamp) ||
      !Array.isArray(data['cards']) || data['cards'].length < 1 || data['cards'].length > STARTER_COLLECTION_MAX_CARDS) {
    fail('A configuração da coleção inicial é inválida.');
  }
  if (!data['active']) fail('A coleção inicial está desativada.');
  const seen = new Set<string>();
  const cards = data['cards'].map((item: unknown) => {
    if (!isRecord(item) || !hasFields(item, ['cardId', 'quantity']) || typeof item['cardId'] !== 'string' ||
        !identifier.test(item['cardId']) || !validPositiveInteger(item['quantity'], PLAYER_COLLECTION_MAX_QUANTITY)) {
      fail('A coleção inicial contém um ID ou quantidade inválida.');
    }
    if (seen.has(item['cardId'])) fail('A coleção inicial contém uma carta duplicada.');
    seen.add(item['cardId']);
    return { cardId: item['cardId'], quantity: item['quantity'] };
  });
  return { active: data['active'], version: data['version'], cards, updatedAt: data['updatedAt'] };
}

function validatePlayer(data: Record<string, unknown>, latest: Timestamp): PlayerProfile {
  if (!hasFields(data, ['createdAt', 'updatedAt', 'starterGrantedAt'], ['starterVersion']) ||
      !(data['createdAt'] instanceof Timestamp) || !(data['updatedAt'] instanceof Timestamp) ||
      data['createdAt'].valueOf() > data['updatedAt'].valueOf() || data['updatedAt'].valueOf() > latest.valueOf() ||
      (data['starterGrantedAt'] !== null && !(data['starterGrantedAt'] instanceof Timestamp))) {
    fail('O estado de jogador está inválido e precisa ser revisado por um administrador.');
  }
  const granted = data['starterGrantedAt'];
  if (granted === null ? Object.hasOwn(data, 'starterVersion') :
      !validPositiveInteger(data['starterVersion'], STARTER_COLLECTION_MAX_VERSION) ||
      granted.valueOf() < data['createdAt'].valueOf() || granted.valueOf() > data['updatedAt'].valueOf()) {
    fail('O registro da concessão inicial está inválido e precisa ser revisado por um administrador.');
  }
  return {
    createdAt: data['createdAt'], updatedAt: data['updatedAt'], starterGrantedAt: granted,
    ...(granted === null ? {} : { starterVersion: data['starterVersion'] as number })
  };
}

function validateOwnedEntry(data: Record<string, unknown>, latest: Timestamp): {
  quantity: number; firstAcquiredAt: Timestamp; lastAcquiredAt: Timestamp;
} {
  if (!hasFields(data, ['quantity', 'firstAcquiredAt', 'lastAcquiredAt']) ||
      !validPositiveInteger(data['quantity'], PLAYER_COLLECTION_MAX_QUANTITY) ||
      !(data['firstAcquiredAt'] instanceof Timestamp) || !(data['lastAcquiredAt'] instanceof Timestamp) ||
      data['firstAcquiredAt'].valueOf() > data['lastAcquiredAt'].valueOf() || data['lastAcquiredAt'].valueOf() > latest.valueOf()) {
    fail('Uma entrada existente na coleção está inválida e precisa ser revisada por um administrador.');
  }
  return { quantity: data['quantity'], firstAcquiredAt: data['firstAcquiredAt'], lastAcquiredAt: data['lastAcquiredAt'] };
}
