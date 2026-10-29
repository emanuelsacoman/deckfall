import type {
  GameplayDeckCatalog, GameplayValidatedDeck, PersonalDeckDraft, PersonalDeckDuplicateRequest, PersonalDeckResource,
} from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import * as duplicateDomain from '../src/decks/duplicate-personal-deck';
import { duplicatePersonalDeck } from '../src/decks/duplicate-personal-deck';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const uid: string;
declare const request: unknown;
declare const store: PersonalDeckStore;
declare const reader: PersonalDeckCatalogReader;
declare const clock: PersonalDeckClock;
declare const catalog: GameplayDeckCatalog;
declare const draft: PersonalDeckDraft;
declare const typedRequest: PersonalDeckDuplicateRequest;

const signature: Assert<Equal<typeof duplicatePersonalDeck,
  (uid: string, request: unknown, store: PersonalDeckStore, catalogReader: PersonalDeckCatalogReader,
    clock: PersonalDeckClock) => Promise<PersonalDeckResource>>> = true;
const apiKeys: Assert<Equal<keyof typeof duplicateDomain, 'duplicatePersonalDeck'>> = true;
const requestKeys: Assert<Equal<keyof PersonalDeckDuplicateRequest,
  'sourceDeckId' | 'expectedSourceVersion' | 'newDeckId'>> = true;
const result: Promise<PersonalDeckResource> = duplicatePersonalDeck(uid, request, store, reader, clock);
const typedResult: Promise<PersonalDeckResource> = duplicatePersonalDeck(uid, typedRequest, store, reader, clock);

// Structural backend ports need no Firestore SDK, timestamp, callable or ownership types.
const plainStore: PersonalDeckStore = { runTransaction: async (_uid, action) => action({
  get: async () => null, list: async () => [], create: () => {}, replace: () => {}, delete: () => {},
}) };
const plainReader: PersonalDeckCatalogReader = { get: async () => catalog };
const plainClock: PersonalDeckClock = { now: () => '2026-10-17T12:00:00.000Z' };
const plainResult = duplicatePersonalDeck(uid, request, plainStore, plainReader, plainClock);

// @ts-expect-error A trusted UID is a separate required string argument.
duplicatePersonalDeck(request, request, store, reader, clock);
// @ts-expect-error The store cannot be replaced with a catalog reader.
duplicatePersonalDeck(uid, request, reader, reader, clock);
// @ts-expect-error A raw catalog cannot replace the historical reader port.
duplicatePersonalDeck(uid, request, store, catalog, clock);
// @ts-expect-error The trusted clock must be supplied explicitly.
duplicatePersonalDeck(uid, request, store, reader);
// @ts-expect-error Historical catalog resolution is required.
duplicatePersonalDeck(uid, request, store, clock, clock);
// @ts-expect-error Duplicate accepts no caller-defined destination version.
duplicatePersonalDeck(uid, request, store, reader, clock, 1);
// @ts-expect-error No caller-provided ownership or active catalog context is accepted.
duplicatePersonalDeck(uid, request, store, { catalog, ownership: [] }, clock);
// @ts-expect-error UID is trusted separately, never accepted as typed client intent.
const clientUid: PersonalDeckDuplicateRequest = { ...typedRequest, uid };
// @ts-expect-error The duplicate request has no owner field.
const clientOwner: PersonalDeckDuplicateRequest = { ...typedRequest, ownerUid: uid };
// @ts-expect-error Only the backend chooses the initial destination version.
const clientVersion: PersonalDeckDuplicateRequest = { ...typedRequest, version: 1 };
// @ts-expect-error Source concurrency uses expectedSourceVersion exclusively.
const clientExpectedVersion: PersonalDeckDuplicateRequest = { ...typedRequest, expectedVersion: 1 };
// @ts-expect-error The draft must be loaded from the trusted source.
const clientDraft: PersonalDeckDuplicateRequest = { ...typedRequest, draft };
// @ts-expect-error The source name must be preserved rather than supplied by the client.
const clientName: PersonalDeckDuplicateRequest = { ...typedRequest, name: 'Alternative' };
// @ts-expect-error New resource creation time is supplied exclusively by the clock.
const clientCreatedAt: PersonalDeckDuplicateRequest = { ...typedRequest, createdAt: plainClock.now() };
// @ts-expect-error New resource update time is supplied exclusively by the clock.
const clientUpdatedAt: PersonalDeckDuplicateRequest = { ...typedRequest, updatedAt: plainClock.now() };
// @ts-expect-error Duplicate has no bypass option.
const clientForce: PersonalDeckDuplicateRequest = { ...typedRequest, force: true };
// @ts-expect-error Persisted draft intent does not provide admission to a battle.
const battleResult: Promise<GameplayValidatedDeck> = result;
// @ts-expect-error This module exposes no migration operation.
duplicateDomain.migratePersonalDeckRevisions(uid, request, store, reader, clock);
// @ts-expect-error This module exposes no adapter or callable.
duplicateDomain.duplicatePersonalDeckCallable;

async function resultBoundary(): Promise<void> {
  const copied = await result;
  // @ts-expect-error Generated resource metadata remains readonly.
  copied.version = 2;
  // @ts-expect-error Pinned source revisions remain readonly.
  copied.draft.entries[0]!.revision = 2;
  // @ts-expect-error Source precondition is not part of the returned resource.
  copied.expectedSourceVersion;
  // @ts-expect-error No battle admission authority is returned.
  copied.isPlayable;
  // @ts-expect-error No persisted validation receipt is returned.
  copied.isValid;
}

void [signature, apiKeys, requestKeys, result, typedResult, plainResult, clientUid, clientOwner, clientVersion,
  clientExpectedVersion, clientDraft, clientName, clientCreatedAt, clientUpdatedAt, clientForce, battleResult, resultBoundary];
