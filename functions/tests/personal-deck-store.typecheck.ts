import type {
  GameplayContractError, PERSONAL_DECK_LIMITS, PersonalDeckDraft, PersonalDeckResource,
} from '../../shared/gameplay/lib';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckConflictError,
  PersonalDeckDomainError, PersonalDeckNotFoundError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckDomainErrorCode } from '../src/decks/personal-deck-errors';
import type {
  PersonalDeckReadLimit, PersonalDeckStore, PersonalDeckStoreTransaction,
} from '../src/decks/personal-deck-store';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const store: PersonalDeckStore;
declare const transaction: PersonalDeckStoreTransaction;
declare const resource: PersonalDeckResource;
declare const draft: PersonalDeckDraft;
declare const trustedUid: string;
declare const readLimit: typeof PERSONAL_DECK_LIMITS.maxDecks;

const derivedLimit: Assert<Equal<PersonalDeckReadLimit, typeof PERSONAL_DECK_LIMITS.maxDecks>> = true;
const storeKeys: Assert<Equal<keyof PersonalDeckStore, 'runTransaction'>> = true;
const transactionKeys: Assert<Equal<keyof PersonalDeckStoreTransaction, 'get' | 'list' | 'create' | 'replace' | 'delete'>> = true;
const getShape: Assert<Equal<PersonalDeckStoreTransaction['get'], (deckId: string) => Promise<PersonalDeckResource | null>>> = true;
const listShape: Assert<Equal<PersonalDeckStoreTransaction['list'], (limit: PersonalDeckReadLimit) => Promise<readonly PersonalDeckResource[]>>> = true;
const createShape: Assert<Equal<PersonalDeckStoreTransaction['create'], (value: PersonalDeckResource) => void>> = true;
const replaceShape: Assert<Equal<PersonalDeckStoreTransaction['replace'], (value: PersonalDeckResource) => void>> = true;
const deleteShape: Assert<Equal<PersonalDeckStoreTransaction['delete'], (deckId: string) => void>> = true;

// A single typed unit supports reads, bounded capacity inspection and distinct queued writes.
// This is a compile-time capability check; no adapter or transaction is executed by this file.
const callbackResult: Promise<PersonalDeckResource | null> = store.runTransaction(trustedUid, async tx => {
  const current: PersonalDeckResource | null = await tx.get(resource.id);
  const accountDecks: readonly PersonalDeckResource[] = await tx.list(readLimit);
  const persistedVersion: number | undefined = current?.version;
  const savedDraft: PersonalDeckDraft | undefined = current?.draft;
  const capacityRead: number = accountDecks.length;
  tx.create(resource);
  tx.replace(resource);
  tx.delete(resource.id);
  void [persistedVersion, savedDraft, capacityRead];
  return current;
});

// @ts-expect-error The trusted UID is an explicit backend argument.
store.runTransaction(async (_tx: PersonalDeckStoreTransaction) => resource);
// @ts-expect-error The callback receives an already-scoped transaction, not a client resource as UID.
store.runTransaction(resource, async () => resource);
// @ts-expect-error Persistence reads belong inside the callback, never on the outer store.
store.get(resource.id);
// @ts-expect-error Lists must always declare their bounded read limit.
transaction.list();
// @ts-expect-error An arbitrary numeric request does not become the approved read ceiling.
transaction.list(Number.MAX_SAFE_INTEGER);
// @ts-expect-error A negative read limit cannot become a bounded query.
transaction.list(-1);
// @ts-expect-error There is no unlimited-list switch.
transaction.list(undefined);
// @ts-expect-error Scoped reads do not accept caller-selected ownership as another argument.
transaction.get(resource.id, trustedUid);
// @ts-expect-error Creation consumes the established resource projection, not just player intent.
transaction.create(draft);
// @ts-expect-error Replacement also requires the established resource projection.
transaction.replace(draft);
// @ts-expect-error Delete takes identity only, not a write resource.
transaction.delete(resource);
// @ts-expect-error No ambiguous upsert operation can overwrite a create-if-absent target.
transaction.upsert(resource);
// @ts-expect-error No alternate update schema or merge API is introduced.
transaction.update(resource);
// @ts-expect-error UID remains outside the resource projection.
const resourceUid: PersonalDeckResource = { ...resource, uid: trustedUid };
// @ts-expect-error The resource never duplicates ownership as ownerUid.
const resourceOwner: PersonalDeckResource = { ...resource, ownerUid: trustedUid };
// @ts-expect-error A draft also carries no backend ownership field.
const draftUid: PersonalDeckDraft = { ...draft, uid: trustedUid };
// @ts-expect-error Resource metadata remains readonly at the store boundary.
resource.version = 2;
// @ts-expect-error Nested player intent remains readonly.
resource.draft.name = 'Changed';

async function readonlyListBoundary(): Promise<void> {
  const resources = await transaction.list(readLimit);
  // @ts-expect-error Listing returns a readonly collection, not a mutable store-owned array.
  resources.push(resource);
}

const conflict: PersonalDeckDomainError = new PersonalDeckConflictError();
const notFound: PersonalDeckDomainError = new PersonalDeckNotFoundError();
const alreadyExists: PersonalDeckDomainError = new PersonalDeckAlreadyExistsError();
const capacity: PersonalDeckDomainError = new PersonalDeckCapacityError();
const expectedCodes: readonly PersonalDeckDomainErrorCode[] = [
  'personal-deck-conflict', 'personal-deck-not-found', 'personal-deck-already-exists', 'personal-deck-capacity-exceeded',
];
// @ts-expect-error Invalid payloads use the shared contract error, not a persistence/concurrency code.
const invalidContractCode: PersonalDeckDomainErrorCode = 'invalid-gameplay-contract';
// @ts-expect-error A version conflict cannot be mistaken for a structural gameplay-contract failure.
const conflictAsContract: GameplayContractError = new PersonalDeckConflictError();
// @ts-expect-error The base taxonomy cannot be directly constructed.
new PersonalDeckDomainError('personal-deck-conflict');
// @ts-expect-error Error constructors do not accept UID, versions or contextual payload.
new PersonalDeckConflictError({ uid: trustedUid, currentVersion: resource.version });
// @ts-expect-error Not-found errors do not expose a resource or identity argument.
new PersonalDeckNotFoundError(resource);
// @ts-expect-error Already-exists errors do not expose a destination argument.
new PersonalDeckAlreadyExistsError(resource.id);
// @ts-expect-error Capacity errors are domain decisions without a database cause.
new PersonalDeckCapacityError(new Error('database detail'));
// @ts-expect-error Stable domain codes are readonly.
conflict.code = 'personal-deck-not-found';

void [derivedLimit, storeKeys, transactionKeys, getShape, listShape, createShape, replaceShape, deleteShape,
  callbackResult, resourceUid, resourceOwner, draftUid, readonlyListBoundary, conflict, notFound, alreadyExists,
  capacity, expectedCodes, invalidContractCode, conflictAsContract];
