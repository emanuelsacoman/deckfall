import type {
  GameplayDeckCatalog, GameplayValidatedDeck, PersonalDeckCreateRequest, PersonalDeckResource,
} from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import * as createDomain from '../src/decks/create-personal-deck';
import { createPersonalDeck } from '../src/decks/create-personal-deck';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const uid: string;
declare const request: unknown;
declare const store: PersonalDeckStore;
declare const reader: PersonalDeckCatalogReader;
declare const clock: PersonalDeckClock;
declare const catalog: GameplayDeckCatalog;
declare const typedRequest: PersonalDeckCreateRequest;

const signature: Assert<Equal<typeof createPersonalDeck,
  (uid: string, request: unknown, store: PersonalDeckStore, catalogReader: PersonalDeckCatalogReader,
    clock: PersonalDeckClock) => Promise<PersonalDeckResource>>> = true;
const apiKeys: Assert<Equal<keyof typeof createDomain, 'createPersonalDeck'>> = true;
const requestKeys: Assert<Equal<keyof PersonalDeckCreateRequest, 'deckId' | 'draft'>> = true;
const result: Promise<PersonalDeckResource> = createPersonalDeck(uid, request, store, reader, clock);
const typedResult: Promise<PersonalDeckResource> = createPersonalDeck(uid, typedRequest, store, reader, clock);

// Plain structural ports suffice: no Firebase SDK, Transaction, Timestamp or callable type is required.
const plainStore: PersonalDeckStore = { runTransaction: async (_uid, action) => action({
  get: async () => null, list: async () => [], create: () => {}, replace: () => {}, delete: () => {},
}) };
const plainReader: PersonalDeckCatalogReader = { get: async () => catalog };
const plainClock: PersonalDeckClock = { now: () => '2026-10-17T12:00:00.000Z' };
const plainResult = createPersonalDeck(uid, request, plainStore, plainReader, plainClock);

// @ts-expect-error The trusted backend UID is a separate required string argument.
createPersonalDeck(request, request, store, reader, clock);
// @ts-expect-error The backend store is required and cannot be replaced with a reader.
createPersonalDeck(uid, request, reader, reader, clock);
// @ts-expect-error A caller-provided raw catalog does not replace the trusted reader port.
createPersonalDeck(uid, request, store, catalog, clock);
// @ts-expect-error The trusted clock must be supplied explicitly.
createPersonalDeck(uid, request, store, reader);
// @ts-expect-error Historical catalog resolution cannot be omitted.
createPersonalDeck(uid, request, store, clock, clock);
// @ts-expect-error Create has no additional expectedVersion argument.
createPersonalDeck(uid, request, store, reader, clock, 1);
// @ts-expect-error No ownership context is accepted in place of a catalog reader.
createPersonalDeck(uid, request, store, { catalog, ownership: [] }, clock);
// @ts-expect-error Client create intent contains no UID. unknown payloads are validated at runtime.
const clientUid: PersonalDeckCreateRequest = { ...typedRequest, uid };
// @ts-expect-error Client create intent contains no owner UID.
const clientOwner: PersonalDeckCreateRequest = { ...typedRequest, ownerUid: uid };
// @ts-expect-error Only the backend generates the initial resource version.
const clientVersion: PersonalDeckCreateRequest = { ...typedRequest, version: 1 };
// @ts-expect-error Create has no optimistic concurrency version to compare.
const clientExpectedVersion: PersonalDeckCreateRequest = { ...typedRequest, expectedVersion: 1 };
// @ts-expect-error The client cannot provide the trusted creation timestamp.
const clientCreatedAt: PersonalDeckCreateRequest = { ...typedRequest, createdAt: plainClock.now() };
// @ts-expect-error The client cannot provide the trusted update timestamp.
const clientUpdatedAt: PersonalDeckCreateRequest = { ...typedRequest, updatedAt: plainClock.now() };
// @ts-expect-error Persisted intent is not validation or admission to battle.
const battleResult: Promise<GameplayValidatedDeck> = result;
// @ts-expect-error No duplicate operation is exported by this increment.
createDomain.duplicatePersonalDeck(uid, request, store, reader, clock);
// @ts-expect-error No automatic migration operation is exported.
createDomain.migratePersonalDeckRevisions(uid, request, store, reader, clock);

async function resultBoundary(): Promise<void> {
  const created = await result;
  // @ts-expect-error Generated resource metadata remains readonly.
  created.version = 2;
  // @ts-expect-error Pinned revisions remain readonly.
  created.draft.entries[0]!.revision = 2;
  // @ts-expect-error No expectedVersion is returned or persisted.
  created.expectedVersion;
  // @ts-expect-error No playability authority is returned.
  created.isPlayable;
  // @ts-expect-error No generic validation receipt is returned.
  created.isValid;
}

void [signature, apiKeys, requestKeys, result, typedResult, plainResult, clientUid, clientOwner, clientVersion,
  clientExpectedVersion, clientCreatedAt, clientUpdatedAt, battleResult, resultBoundary];
