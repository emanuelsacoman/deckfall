import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openPackOperation as open } from '../src/open-pack';
import { definition, entry, future, MemoryStore, now, old, opened, openRequest, player, rejected, sealed, snapshot, user, version } from './pack-fixtures';

const failOpen = (store: MemoryStore, code: Parameters<typeof rejected>[2] = 'failed-precondition', value = openRequest) => rejected(open, store, code, value);
test('open rejects anonymous and malformed authenticated identities', async () => {
  const store = new MemoryStore(true); await failOpen(store, 'unauthenticated', { data: { packInstanceId: 'starter' } });
  await failOpen(store, 'permission-denied', { auth: { uid: 'member/other' }, data: { packInstanceId: 'starter' } }); assert.equal(store.attempts, 0);
});
test('open exact payload rejects injected UID/cards/quantities/version/state', async () => {
  for (const data of [null, [], {}, 'starter', { packInstanceId: 'starter', uid: 'other' }, { packInstanceId: 'starter', cardIds: ['cardA'] },
    { packInstanceId: 'starter', quantity: 3 }, { packInstanceId: 'starter', version: 2 }, { packInstanceId: 'starter', state: 'opened' }]) {
    const store = new MemoryStore(true); await failOpen(store, 'invalid-argument', { ...openRequest, data }); assert.equal(store.attempts, 0);
  }
});
test('open rejects invalid instance IDs before document access', async () => {
  for (const packInstanceId of ['', ' ', '../starter', 'users/other/packs/starter', 'a'.repeat(129), null, 1]) {
    const store = new MemoryStore(true); await failOpen(store, 'invalid-argument', { ...openRequest, data: { packInstanceId } }); assert.equal(store.attempts, 0);
  }
});
test('open requires a current consistent identity profile', async () => {
  for (const profile of [null, { role: 'member', roleId: 'admin' }, { role: 'owner', roleId: 'owner' }]) {
    const store = new MemoryStore(true); if (profile) store.put('users/member', profile); else store.documents.delete('users/member'); await failOpen(store, 'permission-denied');
  }
});
test('valid admin can open only their own authenticated pack', async () => {
  const store = new MemoryStore(true); store.put('users/member', user('admin')); assert.equal((await open(openRequest, store)).alreadyOpened, false);
});
test('missing player cannot open an otherwise existing pack', async () => {
  const store = new MemoryStore(true); store.documents.delete('players/member'); await failOpen(store);
});
test('missing own pack is not-found without searching other users', async () => {
  const store = new MemoryStore(true); store.documents.delete('users/member/packs/starter'); store.put('users/other/packs/starter', sealed());
  await failOpen(store, 'not-found'); assert.equal(store.reads.some(path => path.startsWith('users/other')), false);
});
test('another UID cannot open the owner pack using its ID', async () => {
  const store = new MemoryStore(true); store.put('users/other', user()); store.put('players/other', player());
  await failOpen(store, 'not-found', { auth: { uid: 'other' }, data: { packInstanceId: 'starter' } });
  assert.deepEqual(store.documents.get('users/member/packs/starter'), sealed());
});
test('uninitialized or legacy player cannot open without a valid grant marker', async () => {
  for (const profile of [player(null), { createdAt: old, updatedAt: now, starterGrantedAt: now, starterVersion: 1 }]) {
    const store = new MemoryStore(true); store.put('players/member', profile); await failOpen(store);
  }
});
test('invalid player schema and future date block even opened review', async () => {
  for (const override of [{ extra: true }, { updatedAt: future }, { starterVersion: '1' }, { starterPackInstanceId: 'other' }]) {
    const store = new MemoryStore(true); store.put('users/member/packs/starter', opened()); store.put('players/member', { ...player(), ...override }); await failOpen(store);
  }
});
test('invalid pack envelope, source, state, version or dates cause no writes', async () => {
  for (const override of [{ packId: 'paid' }, { source: 'shop' }, { state: 'opening' }, { definitionVersion: 0 }, { definitionVersion: 1000001 },
    { definitionVersion: '1' }, { acquiredAt: null }, { acquiredAt: future }, { openedAt: now }, { revealedCards: [] }, { uid: 'member' }]) {
    const store = new MemoryStore(true); store.put('users/member/packs/starter', { ...sealed(), ...override }); await failOpen(store);
  }
});
test('pack and player version/acquiredAt/instance audit must agree', async () => {
  for (const override of [{ definitionVersion: 2 }, { acquiredAt: old }]) {
    const store = new MemoryStore(true); store.put('users/member/packs/starter', { ...sealed(), ...override }); await failOpen(store);
  }
  const store = new MemoryStore(true); store.put('users/member/packs/copied', sealed());
  await failOpen(store, 'failed-precondition', { ...openRequest, data: { packInstanceId: 'copied' } });
});
test('sealed open atomically persists small snapshot and adds cards to empty collection', async () => {
  const store = new MemoryStore(true); const originalPlayer = store.documents.get('players/member');
  const result = await open(openRequest, store);
  assert.deepEqual(result, { packInstanceId: 'starter', alreadyOpened: false, revealedCards: snapshot() });
  assert.deepEqual(store.documents.get('users/member/packs/starter'), opened());
  assert.deepEqual(store.documents.get('users/member/collection/cardA'), { quantity: 2, firstAcquiredAt: now, lastAcquiredAt: now });
  assert.deepEqual(store.documents.get('users/member/collection/cardC'), { quantity: 1, firstAcquiredAt: now, lastAcquiredAt: now });
  assert.equal(store.documents.get('players/member'), originalPlayer); assert.equal(store.commits, 1);
  assert.deepEqual(Object.keys(result.revealedCards[0]).sort(), ['cardId', 'name', 'quantity', 'rarity']);
});
test('existing ownership sums pack quantities and preserves first acquisition/unrelated entries', async () => {
  const store = new MemoryStore(true); store.put('users/member/collection/cardA', entry(3)); store.put('users/member/collection/cardB', entry(4));
  await open(openRequest, store);
  assert.deepEqual(store.documents.get('users/member/collection/cardA'), { quantity: 5, firstAcquiredAt: old, lastAcquiredAt: now });
  assert.deepEqual(store.documents.get('users/member/collection/cardB'), entry(4)); assert.equal(store.reads.includes('users/member/collection/cardB'), false);
});
test('pinned version opens after currentVersion changes without adopting new content', async () => {
  const store = new MemoryStore(true); store.put('packDefinitions/starter', { ...definition(), currentVersion: 2 });
  store.put('packDefinitions/starter/versions/2', { ...version([{ cardId: 'cardC', quantity: 9 }]), version: 2 });
  assert.deepEqual((await open(openRequest, store)).revealedCards, snapshot());
  assert.equal(store.reads.includes('packDefinitions/starter/versions/2'), false); assert.equal(store.documents.get('users/member/collection/cardC')?.['quantity'], 1);
});
test('definition inactive blocks grants but does not strand an already sealed pack', async () => {
  const store = new MemoryStore(true); store.put('packDefinitions/starter', { ...definition(), active: false });
  assert.equal((await open(openRequest, store)).alreadyOpened, false);
});
test('missing definition or pinned version preserves sealed instance and collection', async () => {
  for (const path of ['packDefinitions/starter', 'packDefinitions/starter/versions/1']) {
    const store = new MemoryStore(true); store.documents.delete(path); await failOpen(store);
  }
});
test('malformed definition/version never trusts Admin SDK or Console writes', async () => {
  for (const target of ['definition', 'version']) {
    const store = new MemoryStore(true); store.put(target === 'definition' ? 'packDefinitions/starter' : 'packDefinitions/starter/versions/1',
      target === 'definition' ? { ...definition(), currentVersion: 0 } : { ...version(), version: 2 }); await failOpen(store);
  }
});
test('missing or withdrawn card prevents all collection writes and keeps pack sealed', async () => {
  for (const status of [null, 'draft', 'archived']) {
    const store = new MemoryStore(true); if (status === null) store.documents.delete('cards/cardC'); else store.put('cards/cardC', { status, name: 'Card', rarity: 'rare' });
    await failOpen(store); assert.equal(store.documents.get('users/member/packs/starter')?.['state'], 'sealed');
  }
});
test('invalid card name/rarity does not persist an unusable reveal snapshot', async () => {
  for (const override of [{ name: null }, { name: ' ' }, { rarity: 'uncommon' }, { rarity: null }]) {
    const store = new MemoryStore(true); store.put('cards/cardA', { status: 'published', name: 'Card', rarity: 'rare', ...override }); await failOpen(store);
  }
});
test('duplicate content and invalid quantities cannot grant any entries', async () => {
  for (const cards of [[{ cardId: 'cardA', quantity: 0 }], [{ cardId: 'cardA', quantity: 1.2 }], [{ cardId: 'cardA', quantity: 10000 }],
    [{ cardId: 'cardA', quantity: 1 }, { cardId: 'cardA', quantity: 2 }]]) {
    const store = new MemoryStore(true); store.put('packDefinitions/starter/versions/1', version(cards)); await failOpen(store);
  }
});
test('existing and new quantities can reach exactly 9999', async () => {
  const store = new MemoryStore(true); store.put('users/member/collection/cardA', entry(9997)); await open(openRequest, store);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 9999);
  const empty = new MemoryStore(true); empty.put('packDefinitions/starter/versions/1', version([{ cardId: 'cardA', quantity: 9999 }]));
  await open(openRequest, empty); assert.equal(empty.documents.get('users/member/collection/cardA')?.['quantity'], 9999);
});
test('overflow on last item aborts every write and leaves original sealed pack', async () => {
  const store = new MemoryStore(true); store.put('users/member/collection/cardC', entry(9999)); await failOpen(store);
  assert.equal(store.documents.has('users/member/collection/cardA'), false); assert.deepEqual(store.documents.get('users/member/packs/starter'), sealed());
});
test('malformed ownership quantities cannot be overwritten by opening', async () => {
  for (const quantity of [0, -1, 1.5, '2', null, 10000, NaN]) {
    const store = new MemoryStore(true); store.put('users/member/collection/cardA', { ...entry(), quantity }); await failOpen(store);
  }
});
test('malformed ownership dates/envelope aborts the complete opening', async () => {
  for (const override of [{ firstAcquiredAt: null }, { lastAcquiredAt: null }, { firstAcquiredAt: now, lastAcquiredAt: old },
    { firstAcquiredAt: future, lastAcquiredAt: future }, { lastAcquiredAt: future }, { extra: true }]) {
    const store = new MemoryStore(true); store.put('users/member/collection/cardA', { ...entry(), ...override }); await failOpen(store);
  }
});
test('second opening returns exactly persisted snapshot without writes or current content reads', async () => {
  const store = new MemoryStore(true); const first = await open(openRequest, store); const original = new Map(store.documents); store.reads.length = 0;
  assert.deepEqual(await open(openRequest, store), { ...first, alreadyOpened: true }); assert.deepEqual(store.documents, original); assert.equal(store.commits, 1);
  assert.deepEqual(store.reads.sort(), ['players/member', 'users/member', 'users/member/packs/starter']);
});
test('opened history survives removed definitions/cards and damaged current collection', async () => {
  const store = new MemoryStore(true); store.put('users/member/packs/starter', opened());
  store.documents.delete('packDefinitions/starter'); store.documents.delete('packDefinitions/starter/versions/1'); store.documents.delete('cards/cardA');
  store.put('cards/cardC', { status: 'archived' }); store.put('users/member/collection/cardA', { quantity: 'invalid' });
  assert.deepEqual((await open(openRequest, store)).revealedCards, snapshot()); assert.equal(store.commits, 0);
});
test('opened snapshots reject missing/extra fields, invalid names/rarity/quantity and duplicates', async () => {
  for (const revealedCards of [undefined, [], [{ cardId: 'cardA', name: 'Aurora', rarity: 'common' }],
    [{ ...snapshot()[0], extra: true }], [{ ...snapshot()[0], name: '' }], [{ ...snapshot()[0], rarity: 'uncommon' }],
    [{ ...snapshot()[0], quantity: 0 }], [{ ...snapshot()[0], cardId: 'cards/x' }], [snapshot()[0], snapshot()[0]]]) {
    const store = new MemoryStore(true); store.put('users/member/packs/starter', { ...opened(), revealedCards }); await failOpen(store);
  }
});
test('openedAt must be real, ordered and nonfuture to recover history', async () => {
  for (const openedAt of [null, 'now', old, future]) {
    const store = new MemoryStore(true); store.put('users/member/packs/starter', { ...opened(), openedAt }); await failOpen(store);
  }
});
test('concurrent opens retry and grant exactly once with identical persisted results', async () => {
  const store = new MemoryStore(true); const results = await Promise.all([open(openRequest, store), open(openRequest, store)]);
  assert.deepEqual(results.map(result => result.alreadyOpened).sort(), [false, true]); assert.deepEqual(results[0].revealedCards, results[1].revealedCards);
  assert.deepEqual(store.documents.get('users/member/packs/starter')?.['revealedCards'], results[0].revealedCards);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 2); assert.equal(store.commits, 1); assert.ok(store.attempts >= 3);
});
test('commit failure leaves neither collection increments nor opened marker', async () => {
  const store = new MemoryStore(true); const original = new Map(store.documents); store.commitError = new Error('commit unavailable');
  await assert.rejects(open(openRequest, store), /commit unavailable/); assert.deepEqual(store.documents, original);
});
test('concurrent manual quantity change is included after conflict retry', async () => {
  const store = new MemoryStore(true); store.put('users/member/collection/cardA', entry(1));
  store.beforeCommit = () => store.put('users/member/collection/cardA', entry(4)); await open(openRequest, store);
  assert.equal(store.documents.get('users/member/collection/cardA')?.['quantity'], 6); assert.equal(store.attempts, 2); assert.equal(store.commits, 1);
});
test('concurrent card withdrawal or identity revocation aborts retried opening', async () => {
  for (const path of ['cards/cardC', 'users/member']) {
    const store = new MemoryStore(true); store.beforeCommit = () => store.put(path, path === 'cards/cardC' ? { status: 'draft' } : { role: 'member', roleId: 'admin' });
    await assert.rejects(open(openRequest, store)); assert.equal(store.documents.get('users/member/packs/starter')?.['state'], 'sealed');
    assert.equal(store.documents.has('users/member/collection/cardA'), false); assert.equal(store.commits, 0);
  }
});
