import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, Firestore, QueryDocumentSnapshot, DocumentSnapshot } from 'firebase-admin/firestore';
import { GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckResource } from '../gameplay';
import type { PersonalDeckResource } from '../gameplay';
import type { PersonalDeckStore, PersonalDeckStoreTransaction } from './personal-deck-store';
import { personalDeckOwnerUid as userSegment, personalDeckId as deckSegment } from './personal-deck-identifiers';

const documentFields = [
  'schemaVersion', 'name', 'version', 'rulesVersion', 'contentVersion', 'entries', 'createdAt', 'updatedAt',
] as const;

function timestampIso(value: unknown): string {
  if (!(value instanceof Timestamp) || value.nanoseconds % 1_000_000 !== 0) throw new GameplayContractError();
  return value.toDate().toISOString();
}

/** Only the persistence envelope is translated here; all deck validation stays in the shared parser. */
function normalizedDocument(resource: PersonalDeckResource) {
  const document = {
    schemaVersion: 1, name: resource.draft.name, version: resource.version,
    rulesVersion: resource.draft.rulesVersion, contentVersion: resource.draft.contentVersion,
    entries: resource.draft.entries, createdAt: resource.createdAt, updatedAt: resource.updatedAt,
  };
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > PERSONAL_DECK_LIMITS.maxDocumentBytes) {
    throw new GameplayContractError();
  }
  return document;
}

function encode(value: PersonalDeckResource): { id: string; data: DocumentData } {
  const resource = parsePersonalDeckResource(value);
  const document = normalizedDocument(resource);
  return {
    id: deckSegment(resource.id),
    data: {
      ...document,
      createdAt: Timestamp.fromMillis(Date.parse(resource.createdAt)),
      updatedAt: Timestamp.fromMillis(Date.parse(resource.updatedAt)),
    },
  };
}

function decode(snapshot: DocumentSnapshot | QueryDocumentSnapshot): PersonalDeckResource {
  const data: unknown = snapshot.data();
  if (data === null || typeof data !== 'object' || Array.isArray(data) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(data))) throw new GameplayContractError();
  const descriptors = Object.getOwnPropertyDescriptors(data);
  if (Object.getOwnPropertySymbols(data).length || Object.keys(descriptors).length !== documentFields.length ||
      documentFields.some(field => !descriptors[field] || !descriptors[field].enumerable ||
        descriptors[field].get || descriptors[field].set)) throw new GameplayContractError();
  const document = data as Record<string, unknown>;
  if (document['schemaVersion'] !== 1) throw new GameplayContractError();
  const resource = parsePersonalDeckResource({
    id: deckSegment(snapshot.id), version: document['version'],
    draft: {
      name: document['name'], rulesVersion: document['rulesVersion'],
      contentVersion: document['contentVersion'], entries: document['entries'],
    },
    createdAt: timestampIso(document['createdAt']), updatedAt: timestampIso(document['updatedAt']),
  });
  normalizedDocument(resource);
  return resource;
}

/** Admin SDK persistence only: callers must authenticate/authorize uid before reaching this adapter. */
export function createFirestorePersonalDeckStore(firestore: Firestore): PersonalDeckStore {
  return {
    runTransaction: async (uid, action) => {
      const decks = firestore.collection('users').doc(userSegment(uid)).collection('decks');
      return firestore.runTransaction(async transaction => {
        // Firestore may replay this callback. Never carry confirmations or handles between attempts.
        const present = new Set<string>();
        let active = true;
        let wrote = false;
        let pendingReads = 0;
        let failed = false;
        let failure: unknown;
        const guard = (condition: boolean): void => {
          if (!condition) throw new GameplayContractError();
        };
        const write = (operation: () => void): void => {
          try {
            guard(active && pendingReads === 0 && !failed);
            operation();
            wrote = true;
          } catch (error: unknown) {
            failed = true;
            failure = error;
            throw error;
          }
        };
        const read = async <T>(operation: () => Promise<T>): Promise<T> => {
          try {
            guard(active && !wrote && !failed);
            pendingReads++;
            try { return await operation(); } finally { pendingReads--; }
          } catch (error: unknown) {
            failed = true;
            failure = error;
            throw error;
          }
        };
        const scoped: PersonalDeckStoreTransaction = {
          get: deckId => read(async () => {
            const id = deckSegment(deckId);
            const snapshot = await transaction.get(decks.doc(id));
            if (!snapshot.exists) return null;
            const resource = decode(snapshot);
            present.add(id);
            return resource;
          }),
          list: limit => read(async () => {
            guard(limit === PERSONAL_DECK_LIMITS.maxDecks);
            // No where/orderBy on optional fields: corrupt documents must be parsed, never filtered out.
            const snapshot = await transaction.get(decks.limit(limit));
            const resources = snapshot.docs.map(decode);
            resources.forEach(resource => present.add(resource.id));
            return resources;
          }),
          create: resource => write(() => {
            const encoded = encode(resource);
            transaction.create(decks.doc(encoded.id), encoded.data);
          }),
          replace: resource => write(() => {
            const encoded = encode(resource);
            guard(present.has(encoded.id));
            // A validated read in this attempt establishes existence; its transaction precondition
            // prevents a concurrent deletion from becoming an upsert. No merge preserves stray fields.
            transaction.set(decks.doc(encoded.id), encoded.data);
          }),
          delete: deckId => write(() => {
            const id = deckSegment(deckId);
            guard(present.has(id));
            transaction.delete(decks.doc(id));
          }),
        };
        try {
          const result = await action(scoped);
          if (failed) throw failure;
          guard(pendingReads === 0);
          return result;
        } finally {
          active = false;
        }
      });
    },
  };
}
