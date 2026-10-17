import type {
  GameplayDeckCatalog, GameplayValidatedDeck, PersonalDeckResource, PersonalDeckUpdateRequest,
} from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import { PersonalDeckContentUnavailableError, PersonalDeckDomainError } from '../src/decks/personal-deck-errors';
import * as updateDomain from '../src/decks/update-personal-deck';
import { updatePersonalDeck } from '../src/decks/update-personal-deck';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const uid: string;
declare const request: unknown;
declare const store: PersonalDeckStore;
declare const reader: PersonalDeckCatalogReader;
declare const clock: PersonalDeckClock;
declare const catalog: GameplayDeckCatalog;
declare const typedRequest: PersonalDeckUpdateRequest;

const signature: Assert<Equal<typeof updatePersonalDeck,
  (uid: string, request: unknown, store: PersonalDeckStore, catalogReader: PersonalDeckCatalogReader,
    clock: PersonalDeckClock) => Promise<PersonalDeckResource>>> = true;
const apiKeys: Assert<Equal<keyof typeof updateDomain, 'updatePersonalDeck'>> = true;
const requestKeys: Assert<Equal<keyof PersonalDeckUpdateRequest, 'deckId' | 'expectedVersion' | 'draft'>> = true;
const result: Promise<PersonalDeckResource> = updatePersonalDeck(uid, request, store, reader, clock);
const typedResult: Promise<PersonalDeckResource> = updatePersonalDeck(uid, typedRequest, store, reader, clock);

// Plain structural ports suffice: no Firebase SDK, transaction, Timestamp or callable types are required.
const plainStore: PersonalDeckStore = { runTransaction: async (_uid, action) => action({
  get: async () => null, list: async () => [], create: () => {}, replace: () => {}, delete: () => {},
}) };
const plainReader: PersonalDeckCatalogReader = { get: async () => catalog };
const plainClock: PersonalDeckClock = { now: () => '2026-10-17T12:00:00.000Z' };
const plainResult = updatePersonalDeck(uid, request, plainStore, plainReader, plainClock);

// @ts-expect-error Trusted backend UID is a separate required string argument.
updatePersonalDeck(request, request, store, reader, clock);
// @ts-expect-error The store is a mandatory backend port.
updatePersonalDeck(uid, request, reader, reader, clock);
// @ts-expect-error A raw catalog from a caller cannot replace the trusted reader port.
updatePersonalDeck(uid, request, store, catalog, clock);
// @ts-expect-error Trusted time is required explicitly.
updatePersonalDeck(uid, request, store, reader);
// @ts-expect-error Catalog resolution cannot be omitted.
updatePersonalDeck(uid, request, store, clock, clock);
// @ts-expect-error No ownership parameter is part of the update operation.
updatePersonalDeck(uid, request, store, reader, clock, []);
// @ts-expect-error No authoritative ownership/catalog context replaces a reader.
updatePersonalDeck(uid, request, store, { catalog, ownership: [] }, clock);
// @ts-expect-error The strict client request contract carries no UID. unknown payloads are checked at runtime.
const clientUid: PersonalDeckUpdateRequest = { ...typedRequest, uid };
// @ts-expect-error The client requests a comparison, not a new persisted document version.
const clientVersion: PersonalDeckUpdateRequest = { ...typedRequest, version: 8 };
// @ts-expect-error The client cannot provide trusted timestamps.
const clientTime: PersonalDeckUpdateRequest = { ...typedRequest, updatedAt: plainClock.now() };
// @ts-expect-error Saving intent is not canonical validation or admission to play.
const battleResult: Promise<GameplayValidatedDeck> = result;
// @ts-expect-error There is no automatic revision migration API.
updateDomain.migratePersonalDeckRevisions(uid, request, store, reader, clock);

async function readonlyResultBoundary(): Promise<void> {
  const updated = await result;
  // @ts-expect-error Resource metadata remains readonly.
  updated.version = 9;
  // @ts-expect-error Pinned revisions remain readonly; no automatic latest revision is exposed.
  updated.draft.entries[0]!.revision = 2;
  // @ts-expect-error No migration result metadata is returned.
  updated.newRevision;
  // @ts-expect-error No playability receipt is returned.
  updated.isPlayable;
}

const unavailable = new PersonalDeckContentUnavailableError();
const domainError: PersonalDeckDomainError = unavailable;
// @ts-expect-error Missing content errors take no identity, version, path or cause.
new PersonalDeckContentUnavailableError({ contentVersion: 'v1', uid });
// @ts-expect-error No sensitive content version is attached to this domain failure.
unavailable.contentVersion;

void [signature, apiKeys, requestKeys, result, typedResult, plainResult, clientUid, clientVersion, clientTime,
  battleResult, readonlyResultBoundary, domainError];
