import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PACK_MAX_CARDS, PlayerBootstrapError } from '../src/pack-domain';
import { initializePlayerOperation as initialize } from '../src/player-bootstrap';
import { definition, entry, future, MemoryStore, now, old, opened, player, rejected, request, sealed, user, version } from './pack-fixtures';

test('initialize rejects anonymous auth before persistence', async () => {
  const store = new MemoryStore(); await rejected(initialize, store, 'unauthenticated', { data: {} }); assert.equal(store.attempts, 0);
});
test('initialize rejects malformed authenticated UID before constructing paths', async () => {
  const store = new MemoryStore(); await rejected(initialize, store, 'permission-denied', { auth: { uid: 'member/other' } }); assert.equal(store.attempts, 0);
});
test('initialize accepts no caller-selected identity/content/parameters', async () => {
  for (const data of [{ uid: 'admin' }, { cardIds: ['cardA'] }, { packInstanceId: 'starter' }, 'member', [], true, 2, new Date()]) {
    const store = new MemoryStore(); await rejected(initialize, store, 'invalid-argument', { ...request, data }); assert.equal(store.attempts, 0);
  }
});
test('null and omitted initialize data are empty payloads', async () => {
  for (const data of [null, undefined]) assert.equal((await initialize({ ...request, data }, new MemoryStore())).starterPackGranted, true);
});
test('missing user profile does not create player or pack', async () => {
  const store = new MemoryStore(); store.documents.delete('users/member'); await rejected(initialize, store, 'permission-denied');
});
test('inconsistent or unsupported roles cannot initialize, including admin-like email', async () => {
  for (const profile of [{ role: 'member', roleId: 'admin' }, { role: 'admin', roleId: 'member' }, { role: 'owner', roleId: 'owner' },
    { role: 'member' }, { roleId: 'member' }, {}, { role: null, roleId: null }, { email: 'admin@example.test' }]) {
    const store = new MemoryStore(); store.put('users/member', profile); await rejected(initialize, store, 'permission-denied');
  }
});
test('first initialization creates exactly one sealed Starter Pack and no collection', async () => {
  const store = new MemoryStore();
  assert.deepEqual(await initialize(request, store), { initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter' });
  assert.deepEqual(store.documents.get('users/member/packs/starter'), sealed());
  assert.deepEqual(store.documents.get('players/member'), { createdAt: now, updatedAt: now, starterGrantedAt: now, starterVersion: 1, starterPackInstanceId: 'starter' });
  assert.equal([...store.documents.keys()].some(path => path.includes('/collection/')), false);
  assert.equal(store.reads.some(path => path.includes('/collection/')), false);
  assert.equal(store.documents.get('users/member/packs/starter')?.['revealedCards'], undefined);
  assert.equal(store.commits, 1);
});
test('admin receives the same sealed pack exclusively under authenticated UID', async () => {
  const store = new MemoryStore(); store.put('users/admin', user('admin'));
  assert.equal((await initialize({ auth: { uid: 'admin' } }, store)).starterPackGranted, true);
  assert.deepEqual(store.documents.get('users/admin/packs/starter'), sealed()); assert.equal(store.documents.has('players/member'), false);
});
test('bootstrap neither reads nor modifies malformed existing collection data', async () => {
  const store = new MemoryStore(); const existing = { quantity: 'invalid', private: true };
  store.put('users/member/collection/cardA', existing); store.put('users/member/collection/cardB', entry(3));
  await initialize(request, store); assert.deepEqual(store.documents.get('users/member/collection/cardA'), existing);
  assert.deepEqual(store.documents.get('users/member/collection/cardB'), entry(3));
  assert.equal(store.reads.some(path => path.includes('/collection/')), false);
});
test('second call returns original instance without writes or current definition reads', async () => {
  const store = new MemoryStore(); await initialize(request, store); const original = new Map(store.documents);
  store.reads.length = 0;
  assert.deepEqual(await initialize(request, store), { initialized: true, alreadyInitialized: true, starterPackGranted: false, starterPackInstanceId: 'starter' });
  assert.deepEqual(store.documents, original); assert.equal(store.commits, 1);
  assert.deepEqual(store.reads.sort(), ['players/member', 'users/member', 'users/member/packs/starter']);
});
test('new definition versions or deactivation never grant another Starter Pack', async () => {
  const store = new MemoryStore(true); store.put('packDefinitions/starter', { ...definition(), active: false, currentVersion: 2 });
  store.documents.delete('packDefinitions/starter/versions/1'); store.documents.delete('cards/cardA');
  assert.equal((await initialize(request, store)).alreadyInitialized, true); assert.deepEqual(store.documents.get('users/member/packs/starter'), sealed());
});
test('opened Starter Pack also satisfies bootstrap without regrant', async () => {
  const store = new MemoryStore(true); store.put('users/member/packs/starter', opened());
  assert.equal((await initialize(request, store)).alreadyInitialized, true); assert.equal(store.commits, 0);
});
test('two concurrent initialize calls create exactly one Starter Pack and no cards', async () => {
  const store = new MemoryStore(); const results = await Promise.all([initialize(request, store), initialize(request, store)]);
  assert.deepEqual(results.map(value => value.alreadyInitialized).sort(), [false, true]);
  assert.equal(results.filter(value => value.starterPackGranted).length, 1); assert.equal(store.commits, 1); assert.ok(store.attempts >= 3);
  assert.equal([...store.documents.keys()].filter(path => path.startsWith('users/member/packs/')).length, 1);
  assert.equal([...store.documents.keys()].some(path => path.includes('/collection/')), false);
});
test('missing definition does not fall back to obsolete Starter Collection', async () => {
  const store = new MemoryStore(); store.documents.delete('packDefinitions/starter');
  store.put('starterCollections/default', { active: true, version: 1, cards: [{ cardId: 'cardA', quantity: 1 }], updatedAt: old });
  await rejected(initialize, store); assert.equal(store.reads.includes('starterCollections/default'), false);
});

test('missing starter exposes only the bounded starter-not-configured reason', async () => {
  const store = new MemoryStore(); store.documents.delete('packDefinitions/starter');
  await assert.rejects(initialize(request, store), (error: unknown) =>
    error instanceof PlayerBootstrapError && error.code === 'failed-precondition' && error.reason === 'starter-not-configured');
  assert.equal(store.commits, 0);
});

test('starter definition requires the dedicated exact StarterPack name', async () => {
  for (const name of ['Starter Pack', 'starterpack', 'Starter-Pack', ' StarterPack ', 'Outro pacote']) {
    const store = new MemoryStore(); store.put('packDefinitions/starter', { ...definition(), name });
    await rejected(initialize, store);
  }
});
test('inactive definition prevents new grant even with valid version', async () => {
  const store = new MemoryStore(); store.put('packDefinitions/starter', { ...definition(), active: false }); await rejected(initialize, store);
});
test('malformed definition fields, dates, text or version cannot create marker', async () => {
  for (const override of [{ extra: true }, { name: '' }, { name: ' ' }, { name: 'a'.repeat(121) }, { description: null },
    { description: 'a'.repeat(1001) }, { active: 'true' }, { currentVersion: 0 }, { currentVersion: 1.5 }, { currentVersion: 1000001 },
    { currentVersion: '1' }, { currentVersion: NaN }, { createdAt: null }, { updatedAt: null }, { createdAt: now, updatedAt: old }, { updatedAt: future }]) {
    const store = new MemoryStore(); store.put('packDefinitions/starter', { ...definition(), ...override }); await rejected(initialize, store);
  }
});
test('missing pinned version fails with no partial pack or player', async () => {
  const store = new MemoryStore(); store.documents.delete('packDefinitions/starter/versions/1'); await rejected(initialize, store);
});
test('canonical version path matches numeric currentVersion including technical upper bound', async () => {
  const store = new MemoryStore(); store.put('packDefinitions/starter', { ...definition(), currentVersion: 1000000 });
  store.put('packDefinitions/starter/versions/1000000', { ...version(), version: 1000000 }); await initialize(request, store);
  assert.equal(store.documents.get('users/member/packs/starter')?.['definitionVersion'], 1000000);
  assert.equal(store.documents.get('players/member')?.['starterVersion'], 1000000);
});
test('version mismatch, malformed dates/envelope and empty content fail', async () => {
  for (const override of [{ version: 2 }, { version: '1' }, { createdAt: null }, { createdAt: future }, { extra: true }, { cards: [] }, { cards: 'cardA' }]) {
    const store = new MemoryStore(); store.put('packDefinitions/starter/versions/1', { ...version(), ...override }); await rejected(initialize, store);
  }
});
test('invalid IDs or quantities never reach card reads', async () => {
  for (const item of [{ cardId: 'cards/x', quantity: 1 }, { cardId: '', quantity: 1 }, { cardId: 'a'.repeat(129), quantity: 1 },
    { cardId: 'cardA', quantity: 0 }, { cardId: 'cardA', quantity: 9999.1 }, { cardId: 'cardA', quantity: 10000 },
    { cardId: 'cardA', quantity: '1' }, { cardId: 'cardA', quantity: NaN }, { cardId: 'cardA' }, { cardId: 'cardA', quantity: 1, extra: true }, null]) {
    const store = new MemoryStore(); store.put('packDefinitions/starter/versions/1', { ...version(), cards: [item] }); await rejected(initialize, store);
    assert.equal(store.reads.some(path => path.startsWith('cards/')), false);
  }
});
test('duplicate IDs and more than 25 items fail before card reads', async () => {
  for (const cards of [[{ cardId: 'cardA', quantity: 1 }, { cardId: 'cardA', quantity: 2 }],
    Array.from({ length: PACK_MAX_CARDS + 1 }, (_, index) => ({ cardId: `card${index}`, quantity: 1 }))]) {
    const store = new MemoryStore(); store.put('packDefinitions/starter/versions/1', version(cards)); await rejected(initialize, store);
    assert.equal(store.reads.some(path => path.startsWith('cards/')), false);
  }
});
test('25 distinct published cards can grant one pack without exposing content', async () => {
  const store = new MemoryStore(); const cards = Array.from({ length: PACK_MAX_CARDS }, (_, index) => ({ cardId: `card${index}`, quantity: 1 }));
  cards.forEach(item => store.put(`cards/${item.cardId}`, { name: item.cardId, rarity: 'rare', status: 'published' }));
  store.put('packDefinitions/starter/versions/1', version(cards));
  assert.deepEqual(Object.keys(await initialize(request, store)).sort(), ['alreadyInitialized', 'initialized', 'starterPackGranted', 'starterPackInstanceId']);
});
test('missing, draft and archived cards prevent every bootstrap write', async () => {
  for (const status of [null, 'draft', 'archived']) {
    const store = new MemoryStore(); if (status === null) store.documents.delete('cards/cardC'); else store.put('cards/cardC', { status, name: 'Card', rarity: 'rare' });
    await rejected(initialize, store);
  }
});
test('published card requires valid name and existing CardRarity', async () => {
  for (const override of [{ name: '' }, { name: 'a'.repeat(121) }, { rarity: 'uncommon' }, { rarity: null }]) {
    const store = new MemoryStore(); store.put('cards/cardA', { status: 'published', name: 'Card', rarity: 'rare', ...override }); await rejected(initialize, store);
  }
});
test('uninitialized player preserves creation date when pack and marker commit', async () => {
  const store = new MemoryStore(); store.put('players/member', player(null)); await initialize(request, store);
  assert.equal(store.documents.get('players/member')?.['createdAt'], old); assert.equal(store.documents.get('players/member')?.['starterPackInstanceId'], 'starter');
});
test('legacy direct-grant markers require explicit local reset and never grant again', async () => {
  const store = new MemoryStore(); const legacy = { createdAt: old, updatedAt: now, starterGrantedAt: now, starterVersion: 1 };
  store.put('players/member', legacy); store.put('users/member/collection/cardA', entry(2)); await rejected(initialize, store);
  assert.deepEqual(store.documents.get('players/member'), legacy); assert.equal(store.documents.has('users/member/packs/starter'), false);
});
test('invalid or future player state cannot be reset or considered initialized', async () => {
  for (const override of [{ extra: true }, { createdAt: null }, { updatedAt: 'now' }, { updatedAt: future }, { starterGrantedAt: false },
    { starterGrantedAt: old, createdAt: now }, { updatedAt: old }, { starterVersion: 0 }, { starterVersion: '1' }, { starterPackInstanceId: 'other' }]) {
    const store = new MemoryStore(true); store.put('players/member', { ...player(), ...override }); await rejected(initialize, store);
  }
  const store = new MemoryStore(); store.put('players/member', { ...player(null), starterPackInstanceId: 'starter' }); await rejected(initialize, store);
});
test('missing pack or inconsistent audit never regenerates an initialized starter', async () => {
  for (const change of ['missing', 'version', 'date', 'source', 'snapshot']) {
    const store = new MemoryStore(true);
    if (change === 'missing') store.documents.delete('users/member/packs/starter');
    else store.put('users/member/packs/starter', { ...sealed(), ...(change === 'version' ? { definitionVersion: 2 } : change === 'date' ? { acquiredAt: old } : change === 'source' ? { source: 'shop' } : { revealedCards: [] }) });
    await rejected(initialize, store);
  }
});
test('orphan instance without initialized marker is not overwritten', async () => {
  const store = new MemoryStore(); store.put('users/member/packs/starter', sealed()); await rejected(initialize, store);
});
test('commit failure leaves no staged marker or instance', async () => {
  const store = new MemoryStore(); const original = new Map(store.documents); store.commitError = new Error('commit unavailable');
  await assert.rejects(initialize(request, store), /commit unavailable/); assert.deepEqual(store.documents, original);
});
test('card unpublication and user revocation during commit conflict abort safely', async () => {
  for (const path of ['cards/cardC', 'users/member']) {
    const store = new MemoryStore(); store.beforeCommit = () => store.put(path, path === 'cards/cardC' ? { status: 'draft' } : { role: 'member', roleId: 'admin' });
    await assert.rejects(initialize(request, store), error => error instanceof PlayerBootstrapError &&
      error.code === (path === 'cards/cardC' ? 'failed-precondition' : 'permission-denied'));
    assert.equal(store.documents.has('players/member'), false); assert.equal(store.documents.has('users/member/packs/starter'), false);
    assert.equal(store.commits, 0); assert.equal(store.attempts, 2);
  }
});
test('concurrent currentVersion update is retried before granting the pinned instance', async () => {
  const store = new MemoryStore(); store.put('packDefinitions/starter/versions/2', { ...version([{ cardId: 'cardC', quantity: 4 }]), version: 2 });
  store.beforeCommit = () => store.put('packDefinitions/starter', { ...definition(), currentVersion: 2 }); await initialize(request, store);
  assert.equal(store.documents.get('users/member/packs/starter')?.['definitionVersion'], 2); assert.equal(store.documents.get('players/member')?.['starterVersion'], 2);
  assert.equal(store.commits, 1); assert.equal(store.attempts, 2);
});
