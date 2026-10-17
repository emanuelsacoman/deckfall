import type { PERSONAL_DECK_LIMITS, PersonalDeckResource } from '../gameplay';

/** v0.1 bounded read ceiling, derived from the shared limit rather than a second quota constant. */
export type PersonalDeckReadLimit = typeof PERSONAL_DECK_LIMITS.maxDecks;

/**
 * One trusted UID's resources in the transaction's consistent view.
 * Complete every get/list before queuing writes. Do not retain this handle after the callback.
 * The future adapter validates/converts stored data; malformed resources must fail, not disappear
 * from listings or capacity checks. No catalog, ownership, version increment or no-op decisions.
 */
export interface PersonalDeckStoreTransaction {
  get(deckId: string): Promise<PersonalDeckResource | null>;

  /** At most limit resources, or all if fewer exist; no eligibility filters or unbounded fetch. */
  list(limit: PersonalDeckReadLimit): Promise<readonly PersonalDeckResource[]>;

  /** Queue creation of resource.id; require absence at commit, never overwrite an existing target. */
  create(resource: PersonalDeckResource): void;

  /** Queue a full replacement of resource.id, previously read as present; never create or merge. */
  replace(resource: PersonalDeckResource): void;

  /** Queue deletion of an ID previously read as present; not a replacement or an absence success. */
  delete(deckId: string): void;
}

/**
 * Backend port only, with no implementation or authentication of its arguments.
 * uid must come from trusted authentication/authorization, never a client deck payload.
 * A future adapter scopes every read/write to that UID, commits all writes atomically, and may
 * retry action on contention. The domain compares versions and capacity inside action, before
 * writes. Callbacks must not produce external side effects; failures abort every queued write.
 * This interface proves neither atomicity nor the concurrent account quota.
 */
export interface PersonalDeckStore {
  runTransaction<T>(uid: string, action: (transaction: PersonalDeckStoreTransaction) => Promise<T>): Promise<T>;
}
