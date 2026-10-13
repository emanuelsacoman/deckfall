import { Injectable, InjectionToken, inject } from '@angular/core';
import {
  FieldValue, Firestore, Timestamp, collection, doc, getDocsFromServer,
  runTransaction, serverTimestamp
} from '@angular/fire/firestore';
import { isAdminSession, isAuthenticatedSession } from '../../../interfaces/Auth/auth-session';
import {
  PLAYER_COLLECTION_MAX_QUANTITY, PlayerCardCollectionEntry, PlayerOwnedCard
} from '../../../interfaces/Collection/player-card-collection';
import { AuthService } from '../../fire/auth.service';
import { validateCardId } from '../../tools/card-validation';
import { validateUserUid } from '../../tools/user-validation';
import { CardService } from '../cards/card.service';

export interface PlayerCollectionDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface PlayerCollectionTransactionState {
  profileExists: boolean;
  cardStatus: string | null;
  entry: Record<string, unknown> | null;
}

export type PlayerCollectionMutation = { kind: 'delete' } | {
  kind: 'set';
  data: {
    quantity: number;
    firstAcquiredAt: Timestamp | FieldValue;
    lastAcquiredAt: FieldValue;
  };
};

/** Replaceable persistence boundary: all transaction reads precede its write. */
export interface PlayerCollectionClient {
  list(uid: string): Promise<PlayerCollectionDocument[]>;
  transact(uid: string, cardId: string, readCard: boolean,
    change: (state: PlayerCollectionTransactionState) => PlayerCollectionMutation): Promise<void>;
  timestamp(): FieldValue;
}

export const PLAYER_COLLECTION_CLIENT = new InjectionToken<PlayerCollectionClient>('Player collection client', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(Firestore);
    return {
      list: async uid => {
        const snapshot = await getDocsFromServer(collection(firestore, 'users', uid, 'collection'));
        return snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
      },
      transact: (uid, cardId, readCard, change) => runTransaction(firestore, async transaction => {
        const profile = await transaction.get(doc(firestore, 'users', uid));
        const card = readCard ? await transaction.get(doc(firestore, 'cards', cardId)) : null;
        const reference = doc(firestore, 'users', uid, 'collection', cardId);
        const entry = await transaction.get(reference);
        const status = card?.data()?.['status'];
        const mutation = change({
          profileExists: profile.exists(),
          cardStatus: typeof status === 'string' ? status : null,
          entry: entry.exists() ? entry.data() : null
        });
        if (mutation.kind === 'delete') transaction.delete(reference);
        else transaction.set(reference, mutation.data);
      }),
      timestamp: () => serverTimestamp()
    };
  }
});

@Injectable({ providedIn: 'root' })
export class PlayerCollectionService {
  private readonly client = inject(PLAYER_COLLECTION_CLIENT);
  private readonly auth = inject(AuthService);
  private readonly cards = inject(CardService);
  private readonly pending = new Set<string>();

  async listCurrentUser(): Promise<PlayerOwnedCard[]> {
    const session = await this.auth.waitForSession();
    if (!isAuthenticatedSession(session)) throw new Error('Entre com uma conta com perfil válido para consultar a coleção.');
    return this.listForUser(session.uid);
  }

  async listForUser(uid: string): Promise<PlayerOwnedCard[]> {
    const id = validateUserUid(uid);
    const session = await this.auth.waitForSession();
    if (!isAuthenticatedSession(session) || (!isAdminSession(session) && session.uid !== id)) {
      throw new Error('Você não possui permissão para consultar esta coleção.');
    }
    const entries = (await this.client.list(id)).map(item => this.parseEntry(item.id, item.data));
    const owned = await Promise.all(entries.map(async entry => {
      try {
        const card = await this.cards.getById(entry.cardId);
        return { collection: entry, card: card?.status === 'published' ? card : null };
      } catch (error: unknown) {
        if (!this.unavailableCard(error)) throw error;
        return { collection: entry, card: null };
      }
    }));
    return owned.sort((a, b) => {
      if (!!a.card !== !!b.card) return a.card ? -1 : 1;
      return (a.card?.name ?? a.collection.cardId).localeCompare(b.card?.name ?? b.collection.cardId, 'pt-BR');
    });
  }

  /** Sets the absolute total; original=null means the admin loaded no existing entry. */
  async setQuantity(uid: string, cardId: string, quantity: number,
      original: PlayerCardCollectionEntry | null): Promise<void> {
    const id = validateUserUid(uid);
    validateCardId(cardId);
    this.validateQuantity(quantity, true);
    this.validateOriginal(cardId, original);
    await this.requireAdmin();
    const key = this.beginOperation(id, cardId);
    try {
      await this.client.transact(id, cardId, quantity > 0, state => {
        if (!state.profileExists) throw new Error('Perfil não encontrado. Não é possível criar ou alterar esta coleção.');
        const current = state.entry ? this.parseEntry(cardId, state.entry) : null;
        this.assertVersion(original, current);
        if (quantity === 0) return { kind: 'delete' };
        if (state.cardStatus !== 'published') throw new Error('Somente cartas publicadas podem ser concedidas ou ter sua quantidade alterada.');
        if (current && !current.firstAcquiredAt) throw new Error('A data de aquisição desta entrada é inválida. Confira a coleção antes de alterar.');
        return {
          kind: 'set',
          data: {
            quantity,
            firstAcquiredAt: current?.firstAcquiredAt ?? this.client.timestamp(),
            lastAcquiredAt: this.client.timestamp()
          }
        };
      });
    } finally { this.pending.delete(key); }
  }

  /** Removal deliberately needs no card read, so unavailable entries can be cleaned. */
  remove(uid: string, cardId: string, original: PlayerCardCollectionEntry): Promise<void> {
    return this.setQuantity(uid, cardId, 0, original);
  }

  private parseEntry(cardId: string, data: Record<string, unknown>): PlayerCardCollectionEntry {
    validateCardId(cardId);
    const quantity = data['quantity'];
    if (typeof quantity !== 'number') throw new Error('Quantidade inválida na coleção.');
    this.validateQuantity(quantity, false);
    return {
      cardId, quantity,
      firstAcquiredAt: data['firstAcquiredAt'] instanceof Timestamp ? data['firstAcquiredAt'] : null,
      lastAcquiredAt: data['lastAcquiredAt'] instanceof Timestamp ? data['lastAcquiredAt'] : null
    };
  }

  private validateQuantity(quantity: number, allowZero: boolean): void {
    if (!Number.isInteger(quantity) || quantity < (allowZero ? 0 : 1) || quantity > PLAYER_COLLECTION_MAX_QUANTITY) {
      throw new Error(`Informe uma quantidade inteira entre ${allowZero ? 0 : 1} e ${PLAYER_COLLECTION_MAX_QUANTITY}. Zero remove a carta da coleção.`);
    }
  }

  private validateOriginal(cardId: string, original: PlayerCardCollectionEntry | null): void {
    if (original && original.cardId !== cardId) throw new Error('A carta da entrada original não pode ser alterada.');
  }

  private assertVersion(original: PlayerCardCollectionEntry | null, current: PlayerCardCollectionEntry | null): void {
    if (original === null && current === null) return;
    if (!original || !current || original.quantity !== current.quantity ||
        !this.sameTimestamp(original.firstAcquiredAt, current.firstAcquiredAt) ||
        !this.sameTimestamp(original.lastAcquiredAt, current.lastAcquiredAt)) {
      throw new Error('A coleção mudou em outra sessão. Recarregue antes de salvar ou remover a carta.');
    }
  }

  private sameTimestamp(a: Timestamp | null, b: Timestamp | null): boolean {
    return a === null ? b === null : b !== null && a.isEqual(b);
  }

  private unavailableCard(error: unknown): boolean {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    return code === 'permission-denied' || code === 'not-found' ||
      code === 'firestore/permission-denied' || code === 'firestore/not-found';
  }

  private async requireAdmin(): Promise<void> {
    if (!isAdminSession(await this.auth.waitForSession())) throw new Error('Somente administradores podem alterar coleções.');
  }

  private beginOperation(uid: string, cardId: string): string {
    const key = `${uid}/${cardId}`;
    if (this.pending.has(key)) throw new Error('Já existe uma operação em andamento para esta carta na coleção.');
    this.pending.add(key);
    return key;
  }
}
