import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  BootstrapStore, BootstrapTransaction, initializePlayerOperation, InitializePlayerRequest,
  PlayerBootstrapError, PLAYER_COLLECTION_MAX_QUANTITY, STARTER_COLLECTION_MAX_CARDS
} from '../src/player-bootstrap';

const old = Timestamp.fromMillis(1000);
const now = Timestamp.fromMillis(2000);
const request: InitializePlayerRequest = { auth: { uid: 'member' }, data: {} };
const user = (role = 'member') => ({ role, roleId: role });
const entry = (quantity = 1) => ({ quantity, firstAcquiredAt: old, lastAcquiredAt: old });
const player = (granted: Timestamp | null = now) => ({
  createdAt: old, updatedAt: now, starterGrantedAt: granted, ...(granted ? { starterVersion: 1 } : {})
});
const starter = (cards = [{ cardId: 'cardA', quantity: 2 }, { cardId: 'cardC', quantity: 1 }]) => ({
  active: true, version: 1, cards, updatedAt: old
});

/** Optimistic transactions: shared marker conflicts retry, and writes are staged. */
class MemoryStore implements BootstrapStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  private readonly versions = new Map<string, number>();
  readonly reads: string[] = [];
  commits = 0;
  attempts = 0;
  beforeCommit?: () => void;
  commitError?: Error;

  constructor() {
    this.put('users/member', user());
    this.put('starterCollections/default', starter());
    this.put('cards/cardA', { status: 'published' });
    this.put('cards/cardC', { status: 'published' });
  }

  put(path: string, data: Record<string, unknown>): void {
    this.documents.set(path, data);
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }

  currentTimestamp(): Timestamp { return now; }
  serverTimestamp(): Timestamp { return now; }

  async runTransaction<T>(action: (transaction: BootstrapTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 10; attempt++) {
      this.attempts++;
      const reads = new Map<string, number>();
      const writes = new Map<string, Record<string, unknown>>();
      const result = await action({
        get: async path => {
          assert.equal(writes.size, 0, 'transaction reads must precede every write');
          this.reads.push(path);
          reads.set(path, this.versions.get(path) ?? 0);
          return this.documents.get(path) ?? null;
        },
        set: (path, data) => { writes.set(path, data); }
      });
      const beforeCommit = this.beforeCommit;
      this.beforeCommit = undefined;
      beforeCommit?.();
      if ([...reads].some(([path, version]) => (this.versions.get(path) ?? 0) !== version)) continue;
      if (this.commitError) throw this.commitError;
      for (const [path, data] of writes) this.put(path, data);
      if (writes.size) this.commits++;
      return result;
    }
    throw new Error('Too many test transaction conflicts.');
  }
}

async function rejected(store: MemoryStore, code: PlayerBootstrapError['code'], value = request): Promise<void> {
  const original = new Map(store.documents);
  await assert.rejects(initializePlayerOperation(value, store), (error: unknown) =>
    error instanceof PlayerBootstrapError && error.code === code);
  assert.deepEqual(store.documents, original, 'failed initialization must preserve all documents');
  assert.equal(store.commits, 0);
}

test('rejects unauthenticated request before accessing persistence', async () => {
  const store = new MemoryStore();
  await rejected(store, 'unauthenticated', { data: {} });
  assert.equal(store.attempts, 0);
});

test('rejects malformed authenticated UID before constructing document paths', async () => {
  const store = new MemoryStore();
  await rejected(store, 'permission-denied', { auth: { uid: 'member/other' }, data: {} });
  assert.equal(store.attempts, 0);
});

test('accepts only an empty request, never a caller-selected UID or parameters', async () => {
  for (const data of [{ uid: 'admin' }, { quantity: 100 }, 'member', [], true, 2, new Date(), { arbitrary: null }]) {
    const store = new MemoryStore();
    await rejected(store, 'invalid-argument', { ...request, data });
    assert.equal(store.attempts, 0);
  }
});

test('accepts null and omitted callable data as empty requests', async () => {
  for (const data of [null, undefined]) {
    assert.equal((await initializePlayerOperation({ ...request, data }, new MemoryStore())).cardsGranted, 3);
  }
});

test('rejects missing identity profile without creating players or collection', async () => {
  const store = new MemoryStore();
  store.documents.delete('users/member');
  await rejected(store, 'permission-denied');
});

test('rejects inconsistent, missing, and unsupported profile roles', async () => {
  for (const profile of [
    { role: 'member', roleId: 'admin' }, { role: 'admin', roleId: 'member' }, { role: 'owner', roleId: 'owner' },
    { role: 'member' }, { roleId: 'member' }, { role: null, roleId: null },
    { role: ['member'], roleId: ['member'] }, { role: 1, roleId: 1 }, {}
  ]) {
    const store = new MemoryStore();
    store.put('users/member', profile);
    await rejected(store, 'permission-denied');
  }
});

test('initializes a valid member and grants a previously empty collection atomically', async () => {
  const store = new MemoryStore();
  const result = await initializePlayerOperation(request, store);
  assert.deepEqual(result, { initialized: true, alreadyInitialized: false, cardsGranted: 3 });
  assert.deepEqual(store.documents.get('users/member/collection/cardA'), {
    quantity: 2, firstAcquiredAt: now, lastAcquiredAt: now
  });
  assert.deepEqual(store.documents.get('users/member/collection/cardC'), {
    quantity: 1, firstAcquiredAt: now, lastAcquiredAt: now
  });
  assert.deepEqual(store.documents.get('players/member'), {
    createdAt: now, updatedAt: now, starterGrantedAt: now, starterVersion: 1
  });
  assert.equal(store.commits, 1);
});

test('a valid admin receives the same player experience without email authorization', async () => {
  const store = new MemoryStore();
  store.put('users/admin', user('admin'));
  const result = await initializePlayerOperation({ auth: { uid: 'admin' } }, store);
  assert.equal(result.cardsGranted, 3);
  assert.equal(store.documents.get('users/admin/collection/cardA')?.['quantity'], 2);
  assert.equal(store.documents.has('players/member'), false);
});

test('minimal legacy member/admin identity profiles are accepted', async () => {
  for (const role of ['member', 'admin']) {
    const store = new MemoryStore();
    store.put('users/member', user(role));
    assert.equal((await initializePlayerOperation(request, store)).initialized, true);
    assert.deepEqual(store.documents.get('users/member'), user(role));
  }
});

test('email never makes an invalid identity profile authorized', async () => {
  const store = new MemoryStore();
  store.put('users/member', { email: 'admin@example.com', contactEmail: 'admin@example.com', role: 'owner', roleId: 'owner' });
  await rejected(store, 'permission-denied');
});

test('a second call reports alreadyInitialized without changing any quantities or timestamps', async () => {
  const store = new MemoryStore();
  await initializePlayerOperation(request, store);
  const original = new Map(store.documents);
  const result = await initializePlayerOperation(request, store);
  assert.deepEqual(result, { initialized: true, alreadyInitialized: true, cardsGranted: 0 });
  assert.deepEqual(store.documents, original);
  assert.equal(store.commits, 1);
});

test('alreadyInitialized does not read starter, cards, or ownership', async () => {
  const store = new MemoryStore();
  store.put('players/member', player());
  store.documents.delete('starterCollections/default');
  assert.equal((await initializePlayerOperation(request, store)).alreadyInitialized, true);
  assert.deepEqual(store.reads.sort(), ['players/member', 'users/member']);
});

test('a starter version change cannot trigger a second grant', async () => {
  const store = new MemoryStore();
  await initializePlayerOperation(request, store);
  store.put('starterCollections/default', { ...starter([{ cardId: 'cardA', quantity: 9999 }]), version: 2 });
  assert.equal((await initializePlayerOperation(request, store)).alreadyInitialized, true);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 2);
  assert.equal(store.documents.get('players/member')?.['starterVersion'], 1);
});

test('two concurrent calls retry their shared player marker and grant only once', async () => {
  const store = new MemoryStore();
  const results = await Promise.all([initializePlayerOperation(request, store), initializePlayerOperation(request, store)]);
  assert.deepEqual(results.map(result => result.alreadyInitialized).sort(), [false, true]);
  assert.equal(results.reduce((total, result) => total + result.cardsGranted, 0), 3);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 2);
  assert.equal(store.commits, 1);
  assert.ok(store.attempts >= 3, 'both calls must have competed before retry');
});

test('missing starter fails with no player or ownership writes', async () => {
  const store = new MemoryStore();
  store.documents.delete('starterCollections/default');
  await rejected(store, 'failed-precondition');
});

test('inactive starter cannot mark an empty or populated starter as granted', async () => {
  for (const cards of [[], starter().cards]) {
    const store = new MemoryStore();
    store.put('starterCollections/default', { ...starter(cards), active: false });
    await rejected(store, 'failed-precondition');
  }
});

test('empty active starter does not silently initialize', async () => {
  const store = new MemoryStore();
  store.put('starterCollections/default', starter([]));
  await rejected(store, 'failed-precondition');
});

test('starter schema rejects missing/extra fields and invalid timestamps or booleans', async () => {
  for (const change of [
    { unknown: true }, { active: 'true' }, { active: null }, { cards: 'cardA' }, { cards: {} },
    { updatedAt: null }, { updatedAt: '2026-10-12' }, { updatedAt: new Date() }
  ]) {
    const store = new MemoryStore();
    store.put('starterCollections/default', { ...starter(), ...change });
    await rejected(store, 'failed-precondition');
  }
  const store = new MemoryStore();
  store.put('starterCollections/default', { active: true, cards: starter().cards, updatedAt: old });
  await rejected(store, 'failed-precondition');
});

test('starter version is a positive integer within its documented technical limit', async () => {
  for (const version of [0, -1, 1.5, '1', NaN, Infinity, 1000001, Number.MAX_SAFE_INTEGER]) {
    const store = new MemoryStore();
    store.put('starterCollections/default', { ...starter(), version });
    await rejected(store, 'failed-precondition');
  }
});

test('valid starter version is captured in the player audit record', async () => {
  const store = new MemoryStore();
  store.put('starterCollections/default', { ...starter(), version: 1000000 });
  await initializePlayerOperation(request, store);
  assert.equal(store.documents.get('players/member')?.['starterVersion'], 1000000);
});

test('starter item ID must be a safe document identifier without whitespace, slashes, or excessive length', async () => {
  for (const cardId of ['', ' ', '../cards/x', 'cards/x', 'card.a', 'a'.repeat(129), null, 1]) {
    const store = new MemoryStore();
    store.put('starterCollections/default', { ...starter(), cards: [{ cardId, quantity: 1 }] });
    await rejected(store, 'failed-precondition');
  }
});

test('starter quantities must be positive safe integers no greater than collection limit', async () => {
  for (const quantity of [0, -1, 1.2, NaN, Infinity, '2', null, PLAYER_COLLECTION_MAX_QUANTITY + 1]) {
    const store = new MemoryStore();
    store.put('starterCollections/default', { ...starter(), cards: [{ cardId: 'cardA', quantity }] });
    await rejected(store, 'failed-precondition');
  }
});

test('starter items reject missing fields, extra fields, and non-map values', async () => {
  for (const item of [{ cardId: 'cardA' }, { quantity: 1 }, { cardId: 'cardA', quantity: 1, uid: 'other' }, null, 'cardA', []]) {
    const store = new MemoryStore();
    store.put('starterCollections/default', { ...starter(), cards: [item] });
    await rejected(store, 'failed-precondition');
  }
});

test('duplicate cardIds fail before looking up global cards', async () => {
  const store = new MemoryStore();
  store.put('starterCollections/default', starter([{ cardId: 'cardA', quantity: 1 }, { cardId: 'cardA', quantity: 2 }]));
  await rejected(store, 'failed-precondition');
  assert.equal(store.reads.some(path => path.startsWith('cards/')), false);
});

test('starter exceeding 25 items fails before card lookups', async () => {
  const store = new MemoryStore();
  store.put('starterCollections/default', starter(Array.from({ length: STARTER_COLLECTION_MAX_CARDS + 1 }, (_, index) => ({ cardId: `card${index}`, quantity: 1 }))));
  await rejected(store, 'failed-precondition');
});

test('exactly 25 distinct published starter items succeed', async () => {
  const store = new MemoryStore();
  const cards = Array.from({ length: STARTER_COLLECTION_MAX_CARDS }, (_, index) => ({ cardId: `card${index}`, quantity: 1 }));
  cards.forEach(item => store.put(`cards/${item.cardId}`, { status: 'published' }));
  store.put('starterCollections/default', starter(cards));
  assert.equal((await initializePlayerOperation(request, store)).cardsGranted, 25);
});

test('a missing global card prevents all initialization writes', async () => {
  const store = new MemoryStore();
  store.documents.delete('cards/cardC');
  await rejected(store, 'failed-precondition');
});

test('draft card cannot be granted, even when other items are valid', async () => {
  const store = new MemoryStore();
  store.put('cards/cardC', { status: 'draft' });
  await rejected(store, 'failed-precondition');
});

test('archived card cannot be granted, even when other items are valid', async () => {
  const store = new MemoryStore();
  store.put('cards/cardC', { status: 'archived' });
  await rejected(store, 'failed-precondition');
});

test('a card without a valid published status fails safely', async () => {
  const store = new MemoryStore();
  store.put('cards/cardC', { name: 'Card' });
  await rejected(store, 'failed-precondition');
});

test('starter adds to previous ownership and preserves unrelated cards', async () => {
  const store = new MemoryStore();
  store.put('users/member/collection/cardA', entry(1));
  store.put('users/member/collection/cardB', entry(3));
  await initializePlayerOperation(request, store);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 3);
  assert.deepEqual(store.documents.get('users/member/collection/cardB'), entry(3));
  assert.equal(store.documents.get('users/member/collection/cardC')?.['quantity'], 1);
  assert.equal(store.reads.includes('users/member/collection/cardB'), false);
});

test('previous firstAcquiredAt is preserved while lastAcquiredAt uses backend time', async () => {
  const store = new MemoryStore();
  store.put('users/member/collection/cardA', entry(3));
  await initializePlayerOperation(request, store);
  const owned = store.documents.get('users/member/collection/cardA');
  assert.equal(owned?.['firstAcquiredAt'], old);
  assert.equal(owned?.['lastAcquiredAt'], now);
  assert.equal(owned?.['quantity'], 5);
});

test('exact collection quantity limit succeeds for an existing entry', async () => {
  const store = new MemoryStore();
  store.put('users/member/collection/cardA', entry(PLAYER_COLLECTION_MAX_QUANTITY - 2));
  await initializePlayerOperation(request, store);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], PLAYER_COLLECTION_MAX_QUANTITY);
});

test('exact collection quantity limit succeeds for a new entry', async () => {
  const store = new MemoryStore();
  store.put('starterCollections/default', starter([{ cardId: 'cardA', quantity: PLAYER_COLLECTION_MAX_QUANTITY }]));
  assert.equal((await initializePlayerOperation(request, store)).cardsGranted, PLAYER_COLLECTION_MAX_QUANTITY);
});

test('sum overflowing even the last starter entry fails with no partial grant or marker', async () => {
  const store = new MemoryStore();
  store.put('users/member/collection/cardC', entry(PLAYER_COLLECTION_MAX_QUANTITY));
  await rejected(store, 'failed-precondition');
  assert.equal(store.documents.has('users/member/collection/cardA'), false);
  assert.equal(store.documents.has('players/member'), false);
});

test('malformed existing ownership quantities fail rather than being overwritten', async () => {
  for (const quantity of [0, -1, 1.5, '2', null, PLAYER_COLLECTION_MAX_QUANTITY + 1]) {
    const store = new MemoryStore();
    store.put('users/member/collection/cardA', { ...entry(), quantity });
    await rejected(store, 'failed-precondition');
  }
});

test('malformed existing ownership dates, missing fields, and extra fields fail safely', async () => {
  for (const override of [
    { firstAcquiredAt: null }, { lastAcquiredAt: null }, { firstAcquiredAt: '1000' },
    { firstAcquiredAt: now, lastAcquiredAt: old }, { unknown: true }
  ]) {
    const store = new MemoryStore();
    store.put('users/member/collection/cardA', { ...entry(), ...override });
    await rejected(store, 'failed-precondition');
  }
  const store = new MemoryStore();
  store.put('users/member/collection/cardA', { quantity: 1, firstAcquiredAt: old });
  await rejected(store, 'failed-precondition');
});

test('an existing uninitialized player preserves createdAt and receives marker only with grant', async () => {
  const store = new MemoryStore();
  store.put('players/member', player(null));
  await initializePlayerOperation(request, store);
  assert.deepEqual(store.documents.get('players/member'), {
    createdAt: old, updatedAt: now, starterGrantedAt: now, starterVersion: 1
  });
});

test('future player dates fail without granting or overwriting an uninitialized player', async () => {
  const future = Timestamp.fromMillis(now.toMillis() + 1000);
  for (const dates of [
    { createdAt: future, updatedAt: future },
    { createdAt: old, updatedAt: future }
  ]) {
    const store = new MemoryStore();
    store.put('players/member', { ...player(null), ...dates });
    store.put('users/member/collection/cardA', entry(4));
    await rejected(store, 'failed-precondition');
    assert.equal(store.documents.get('players/member')?.['starterGrantedAt'], null);
    assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 4);
    assert.equal(store.documents.has('users/member/collection/cardC'), false);
  }
});

test('future ownership dates fail without changing quantities or creating the player marker', async () => {
  const future = Timestamp.fromMillis(now.toMillis() + 1000);
  for (const dates of [
    { firstAcquiredAt: future, lastAcquiredAt: future },
    { firstAcquiredAt: old, lastAcquiredAt: future }
  ]) {
    const store = new MemoryStore();
    store.put('users/member/collection/cardA', { ...entry(4), ...dates });
    await rejected(store, 'failed-precondition');
    assert.equal(store.documents.has('players/member'), false);
    assert.equal(store.documents.has('users/member/collection/cardC'), false);
  }
});

test('an invalid existing player cannot be reset or treated as initialized', async () => {
  for (const invalid of [
    {}, { ...player(), uid: 'member' }, { ...player(), createdAt: null }, { ...player(), updatedAt: 'now' },
    { ...player(), starterGrantedAt: false }, { ...player(), starterGrantedAt: old, createdAt: now },
    { ...player(), updatedAt: old }, { ...player(), starterVersion: 0 }, { ...player(), starterVersion: 1000001 },
    { ...player(), starterVersion: '1' }, { ...player(null), starterVersion: 1 }
  ]) {
    const store = new MemoryStore();
    store.put('players/member', invalid);
    await rejected(store, 'failed-precondition');
  }
  const store = new MemoryStore();
  store.put('players/member', { createdAt: old, updatedAt: now, starterGrantedAt: now });
  await rejected(store, 'failed-precondition');
});

test('already initialized users still require a valid current identity profile', async () => {
  const store = new MemoryStore();
  store.put('players/member', player());
  store.put('users/member', { role: 'member', roleId: 'admin' });
  await rejected(store, 'permission-denied');
});

test('commit failure does not leave staged player or ownership writes', async () => {
  const store = new MemoryStore();
  const original = new Map(store.documents);
  store.commitError = new Error('commit unavailable');
  await assert.rejects(initializePlayerOperation(request, store), /commit unavailable/);
  assert.deepEqual(store.documents, original);
});

test('concurrent admin quantity change is included when the transaction retries', async () => {
  const store = new MemoryStore();
  store.put('users/member/collection/cardA', entry(1));
  store.beforeCommit = () => store.put('users/member/collection/cardA', entry(4));
  await initializePlayerOperation(request, store);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 6);
  assert.equal(store.commits, 1);
  assert.equal(store.attempts, 2);
});

test('a concurrent card unpublication prevents granting after retry', async () => {
  const store = new MemoryStore();
  store.beforeCommit = () => store.put('cards/cardC', { status: 'draft' });
  await assert.rejects(initializePlayerOperation(request, store), error => error instanceof PlayerBootstrapError && error.code === 'failed-precondition');
  assert.equal(store.documents.has('players/member'), false);
  assert.equal(store.documents.has('users/member/collection/cardA'), false);
  assert.equal(store.commits, 0);
});

test('a concurrent profile revocation prevents granting after retry', async () => {
  const store = new MemoryStore();
  store.beforeCommit = () => store.put('users/member', { role: 'member', roleId: 'admin' });
  await assert.rejects(initializePlayerOperation(request, store), error => error instanceof PlayerBootstrapError && error.code === 'permission-denied');
  assert.equal(store.documents.has('players/member'), false);
  assert.equal(store.commits, 0);
});

test('a concurrent starter edit uses the new configuration on retry', async () => {
  const store = new MemoryStore();
  store.beforeCommit = () => store.put('starterCollections/default', { ...starter([{ cardId: 'cardC', quantity: 4 }]), version: 2 });
  const result = await initializePlayerOperation(request, store);
  assert.equal(result.cardsGranted, 4);
  assert.equal(store.documents.has('users/member/collection/cardA'), false);
  assert.equal(store.documents.get('users/member/collection/cardC')?.['quantity'], 4);
  assert.equal(store.documents.get('players/member')?.['starterVersion'], 2);
});

test('result exposes only UX fields and never profile/configuration/identity documents', async () => {
  const result = await initializePlayerOperation(request, new MemoryStore());
  assert.deepEqual(Object.keys(result).sort(), ['alreadyInitialized', 'cardsGranted', 'initialized']);
});
