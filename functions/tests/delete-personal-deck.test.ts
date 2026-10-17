import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PersonalDeckResource } from '../../shared/gameplay/lib';
import { deletePersonalDeck } from '../src/decks/delete-personal-deck';
import { PersonalDeckConflictError, PersonalDeckNotFoundError } from '../src/decks/personal-deck-errors';
import type { PersonalDeckStore, PersonalDeckStoreTransaction } from '../src/decks/personal-deck-store';
import { GameplayContractError } from '../src/gameplay';

const uid = 'backend-verified-42';
const request = Object.freeze({ deckId: 'deck-a', expectedVersion: 7 });

function resource(version = 7, entries: PersonalDeckResource['draft']['entries'] = []): PersonalDeckResource {
  return Object.freeze({
    id: 'deck-a', version,
    draft: Object.freeze({
      name: 'Rascunho pessoal', rulesVersion: '0.1', contentVersion: 'historical-v1',
      entries: Object.freeze(entries.map(entry => Object.freeze({ ...entry }))),
    }),
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T11:00:00.000Z',
  });
}

type FailureStage = 'transaction' | 'get' | 'delete' | 'commit';

/** Test double only: observations and queued local deletes do not prove a database's atomicity. */
class MemoryDeckStore implements PersonalDeckStore {
  readonly resources = new Map<string, Map<string, PersonalDeckResource>>();
  readonly uids: string[] = [];
  readonly reads: { uid: string; deckId: string }[] = [];
  readonly queuedDeletes: { uid: string; deckId: string }[] = [];
  readonly events: string[] = [];
  readonly failure = new Error('store failure sentinel');
  failAt?: FailureStage;
  commits = 0;

  constructor(initialResource: PersonalDeckResource | null = resource(), ownerUid = uid) {
    this.resources.set(ownerUid, new Map(initialResource ? [[initialResource.id, initialResource]] : []));
  }

  async runTransaction<T>(ownerUid: string, action: (transaction: PersonalDeckStoreTransaction) => Promise<T>): Promise<T> {
    this.uids.push(ownerUid);
    this.events.push('transaction');
    if (this.failAt === 'transaction') throw this.failure;
    const pending: string[] = [];
    const unexpected = (operation: string): never => {
      this.events.push(operation);
      throw new Error(`Unexpected ${operation} in delete`);
    };
    const result = await action({
      get: async deckId => {
        this.events.push(`get:${deckId}`);
        this.reads.push({ uid: ownerUid, deckId });
        if (this.failAt === 'get') throw this.failure;
        return this.resources.get(ownerUid)?.get(deckId) ?? null;
      },
      list: async () => unexpected('list'),
      create: () => unexpected('create'),
      replace: () => unexpected('replace'),
      delete: deckId => {
        this.events.push(`delete:${deckId}`);
        if (this.failAt === 'delete') throw this.failure;
        pending.push(deckId);
        this.queuedDeletes.push({ uid: ownerUid, deckId });
      },
    });
    if (this.failAt === 'commit') throw this.failure;
    for (const deckId of pending) this.resources.get(ownerUid)?.delete(deckId);
    this.commits++;
    this.events.push('commit');
    return result;
  }
}

test('delete with the observed version reads then queues deletion in one callback and returns void', async () => {
  const store = new MemoryDeckStore();
  assert.equal(await deletePersonalDeck(uid, request, store), undefined);
  assert.deepEqual(store.events, ['transaction', 'get:deck-a', 'delete:deck-a', 'commit']);
  assert.deepEqual(store.queuedDeletes, [{ uid, deckId: 'deck-a' }]);
  assert.equal(store.resources.get(uid)?.has('deck-a'), false);
  assert.equal(store.commits, 1);
});

test('delete passes exactly the trusted backend UID and leaves the same ID under another owner alone', async () => {
  const trustedUid = 'trusted-Backend_UID-42';
  const own = resource();
  const other = resource(19);
  const store = new MemoryDeckStore(own, trustedUid);
  store.resources.set('other-user', new Map([[other.id, other]]));
  await deletePersonalDeck(trustedUid, request, store);
  assert.deepEqual(store.uids, [trustedUid]);
  assert.deepEqual(store.reads, [{ uid: trustedUid, deckId: 'deck-a' }]);
  assert.deepEqual(store.queuedDeletes, [{ uid: trustedUid, deckId: 'deck-a' }]);
  assert.equal(store.resources.get('other-user')?.get(other.id), other);
});

test('missing deck is not-found rather than conflict and never queues a write', async () => {
  const store = new MemoryDeckStore(null);
  await assert.rejects(deletePersonalDeck(uid, request, store), PersonalDeckNotFoundError);
  assert.deepEqual(store.events, ['transaction', 'get:deck-a']);
  assert.deepEqual(store.queuedDeletes, []);
  assert.equal(store.commits, 0);
});

test('a lower or higher stored version is conflict with no fallback, increment or queued write', async () => {
  for (const version of [1, 6, 8, Number.MAX_SAFE_INTEGER]) {
    const original = resource(version);
    const store = new MemoryDeckStore(original);
    await assert.rejects(deletePersonalDeck(uid, request, store), PersonalDeckConflictError);
    assert.deepEqual(store.events, ['transaction', 'get:deck-a']);
    assert.deepEqual(store.queuedDeletes, []);
    assert.equal(store.commits, 0);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.equal(original.version, version);
    assert.equal(request.expectedVersion, 7);
  }
});

test('exact equality accepts both version one and the largest safe version without incrementing', async () => {
  for (const version of [1, Number.MAX_SAFE_INTEGER]) {
    const original = resource(version);
    const value = Object.freeze({ deckId: original.id, expectedVersion: version });
    const store = new MemoryDeckStore(original);
    await deletePersonalDeck(uid, value, store);
    assert.equal(value.expectedVersion, version);
    assert.equal(original.version, version);
    assert.equal(store.queuedDeletes.length, 1);
  }
});

test('invalid payloads fail with the shared contract error before opening a transaction', async () => {
  const invalid: unknown[] = [
    undefined, null, [], 'deck-a', {}, { deckId: 'deck-a' }, { expectedVersion: 7 },
    { deckId: 'users/other/decks/deck-a', expectedVersion: 7 },
    ...['', ' ', 'a'.repeat(129), 4, null].map(deckId => ({ deckId, expectedVersion: 7 })),
    ...[undefined, null, '7', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(expectedVersion => ({ deckId: 'deck-a', expectedVersion })),
  ];
  for (const value of invalid) {
    const store = new MemoryDeckStore();
    await assert.rejects(deletePersonalDeck(uid, value, store), GameplayContractError);
    assert.deepEqual(store.uids, []);
    assert.deepEqual(store.events, []);
    assert.deepEqual(store.queuedDeletes, []);
  }
});

test('client authority, persistence and composition fields are rejected before any store access', async () => {
  const forged = {
    uid: 'other', ownerUid: 'other', version: 8, createdAt: 'now', updatedAt: 'now',
    draft: resource().draft, admin: true, force: true, ignoreVersion: true,
  };
  for (const [key, value] of Object.entries(forged)) {
    const store = new MemoryDeckStore();
    await assert.rejects(deletePersonalDeck(uid, { ...request, [key]: value }, store), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(store.queuedDeletes, []);
  }
});

test('request accessors are rejected without execution or a transaction', async () => {
  let getterCalls = 0;
  for (const field of ['deckId', 'expectedVersion', 'force']) {
    const value = Object.defineProperty({ ...request }, field, {
      enumerable: true,
      get: () => { getterCalls++; throw new Error('client accessor must not execute'); },
    });
    const store = new MemoryDeckStore();
    await assert.rejects(deletePersonalDeck(uid, value, store), GameplayContractError);
    assert.deepEqual(store.events, []);
  }
  assert.equal(getterCalls, 0);
});

test('empty and incomplete historical drafts with unrecognized references can be deleted without catalog checks', async () => {
  const drafts = [resource(), resource(7, [{ cardId: 'unknown-or-archived', revision: 999, quantity: 1 }])];
  for (const original of drafts) {
    const store = new MemoryDeckStore(original);
    await deletePersonalDeck(uid, request, store);
    assert.deepEqual(store.reads, [{ uid, deckId: original.id }]);
    assert.deepEqual(store.events, ['transaction', 'get:deck-a', 'delete:deck-a', 'commit']);
    assert.equal(original.draft.contentVersion, 'historical-v1');
  }
});

test('delete requires no ownership, publication, eligibility, listing, capacity, create or replace operation', async () => {
  // The injected port exposes only personal resources; every other store method throws in this fake.
  const store = new MemoryDeckStore(resource(7, [{ cardId: 'not-owned', revision: 42, quantity: 2 }]));
  await deletePersonalDeck(uid, request, store);
  assert.deepEqual(store.events, ['transaction', 'get:deck-a', 'delete:deck-a', 'commit']);
  assert.equal(store.reads.length, 1);
  assert.equal(store.queuedDeletes.length, 1);
});

test('store start, read, queue and commit errors propagate by identity without domain remapping', async () => {
  for (const stage of ['transaction', 'get', 'delete', 'commit'] as const) {
    const original = resource();
    const store = new MemoryDeckStore(original);
    store.failAt = stage;
    await assert.rejects(deletePersonalDeck(uid, request, store), error => error === store.failure);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.equal(store.commits, 0);
    assert.equal(store.queuedDeletes.length, stage === 'commit' ? 1 : 0);
  }
});

test('deeply frozen request and resource remain unchanged after a successful delete', async () => {
  const original = resource(7, [{ cardId: 'unknown-card', revision: 3, quantity: 1 }]);
  const requestBefore = structuredClone(request);
  const resourceBefore = structuredClone(original);
  const store = new MemoryDeckStore(original);
  await deletePersonalDeck(uid, request, store);
  assert.deepEqual(request, requestBefore);
  assert.deepEqual(original, resourceBefore);
  assert.equal(Object.isFrozen(original.draft.entries[0]), true);
  assert.equal(Object.isFrozen(original.draft.entries), true);
  assert.equal(Object.isFrozen(original.draft), true);
  assert.equal(Object.isFrozen(original), true);
});

test('a repeated request can become not-found after the first deletion without an exactly-once receipt', async () => {
  const store = new MemoryDeckStore();
  await deletePersonalDeck(uid, request, store);
  await assert.rejects(deletePersonalDeck(uid, request, store), PersonalDeckNotFoundError);
  assert.deepEqual(store.uids, [uid, uid]);
  assert.equal(store.reads.length, 2);
  assert.equal(store.queuedDeletes.length, 1);
  assert.equal(store.commits, 1);
});

test('a simulated callback replay reads again and keeps the original expectedVersion', async () => {
  for (const replayVersion of [7, 8]) {
    const resources = [resource(), resource(replayVersion)];
    const reads: number[] = [];
    const pending: string[][] = [[], []];
    let commits = 0;
    const store: PersonalDeckStore = {
      async runTransaction<T>(trustedUid: string, action: (transaction: PersonalDeckStoreTransaction) => Promise<T>): Promise<T> {
        assert.equal(trustedUid, uid);
        const transaction = (attempt: number): PersonalDeckStoreTransaction => ({
          get: async deckId => {
            assert.equal(deckId, request.deckId);
            reads.push(resources[attempt].version);
            return resources[attempt];
          },
          list: async () => { throw new Error('Unexpected list'); },
          create: () => { throw new Error('Unexpected create'); },
          replace: () => { throw new Error('Unexpected replace'); },
          delete: deckId => { pending[attempt].push(deckId); },
        });
        // Deliberately discard the first attempt's writes, as a local callback replay simulation.
        await action(transaction(0));
        const result = await action(transaction(1));
        commits++;
        return result;
      },
    };
    if (replayVersion === 7) {
      assert.equal(await deletePersonalDeck(uid, request, store), undefined);
      assert.deepEqual(pending, [['deck-a'], ['deck-a']]);
      assert.equal(commits, 1);
    } else {
      await assert.rejects(deletePersonalDeck(uid, request, store), PersonalDeckConflictError);
      assert.deepEqual(pending, [['deck-a'], []]);
      assert.equal(commits, 0);
    }
    assert.deepEqual(reads, [7, replayVersion]);
    assert.equal(request.expectedVersion, 7);
  }
});
