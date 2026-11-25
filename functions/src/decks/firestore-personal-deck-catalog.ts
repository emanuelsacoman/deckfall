import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { GameplayContractError, parseGameplayDeckCatalog, parseGameplayDeckList, validateGameplayDeck } from '../gameplay';
import type { GameplayDeckCatalog } from '../gameplay';
import type { PersonalDeckCatalogReader } from './personal-deck-catalog';

const maxEnvelopeBytes = 64 * 1024;

/** Persistence-only envelope checks; gameplay definitions/compositions stay in the shared parsers. */
function exactRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new GameplayContractError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(descriptors).length !== fields.length ||
      fields.some(field => !descriptors[field] || !descriptors[field].enumerable ||
        descriptors[field].get || descriptors[field].set)) throw new GameplayContractError();
  return value as Record<string, unknown>;
}

function identifier(value: unknown): string {
  // Same ASCII identifier boundary as Gameplay Contract, without accepting arbitrary paths.
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new GameplayContractError();
  return value;
}

function decode(value: unknown, contentVersion: string): GameplayDeckCatalog {
  const document = exactRecord(value, ['schemaVersion', 'catalog', 'trainingReferences', 'createdAt']);
  if (document['schemaVersion'] !== 1) throw new GameplayContractError();
  const catalog = parseGameplayDeckCatalog(document['catalog']);
  if (catalog.contentVersion !== contentVersion) throw new GameplayContractError();
  const createdAt = document['createdAt'];
  if (!(createdAt instanceof Timestamp)) throw new GameplayContractError();
  const references = document['trainingReferences'];
  if (!Array.isArray(references)) throw new GameplayContractError();
  const identities = new Set<string>();
  const trainingReferences = references.map(value => {
    const reference = exactRecord(value, ['referenceId', 'referenceDeck']);
    const referenceId = identifier(reference['referenceId']);
    if (identities.has(referenceId)) throw new GameplayContractError();
    identities.add(referenceId);
    const referenceDeck = parseGameplayDeckList(reference['referenceDeck']);
    // Validate every reference, including references the personal-deck caller does not use.
    validateGameplayDeck(referenceDeck, { kind: 'training-reference', catalog, referenceId, referenceDeck });
    return { referenceId, referenceDeck };
  });
  // ISO milliseconds are only the size-measurement projection; the source Timestamp is never rewritten.
  const normalized = { schemaVersion: 1, catalog, trainingReferences, createdAt: createdAt.toDate().toISOString() };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > maxEnvelopeBytes) throw new GameplayContractError();
  return catalog;
}

/** Global historical read only; neither active config nor personal state participates in this adapter. */
export function createFirestorePersonalDeckCatalogReader(firestore: Firestore): PersonalDeckCatalogReader {
  return {
    get: async contentVersion => {
      const id = identifier(contentVersion);
      if (/^__.*__$/.test(id)) throw new GameplayContractError();
      const snapshot = await firestore.collection('gameplayContentVersions').doc(id).get();
      if (!snapshot.exists) return null;
      return decode(snapshot.data(), snapshot.id);
    },
  };
}
