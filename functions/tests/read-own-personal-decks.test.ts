import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckResource } from '../src/gameplay';
import type { PersonalDeckResource } from '../src/gameplay';
import { PlayerBootstrapError } from '../src/pack-domain';
import { getOwnPersonalDeck, listOwnPersonalDecks } from '../src/decks/read-own-personal-decks';
import type { PersonalDeckProfileReader, PersonalDeckReadContext } from '../src/decks/read-own-personal-decks';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';

// Unit authorization/contract tests only: both ports are doubles, never Firebase Auth or Rules.
const createdAt = '2026-11-25T12:00:00.000Z';
const later = '2026-11-25T13:00:00.000Z';
const context: PersonalDeckReadContext = { auth: { uid: 'alice' } };
function resource(id = 'saved', updatedAt = createdAt): PersonalDeckResource {
  return parsePersonalDeckResource({ id, version: 3, createdAt, updatedAt, draft: {
    name: id, rulesVersion: '0.1', contentVersion: 'unavailable-history',
    entries: [{ cardId: 'historical-card', revision: 17, quantity: 1 }],
  } });
}

function harness(profile: Readonly<Record<string, unknown>> | null = { role: 'member', roleId: 'member' }) {
  const events: string[] = [];
  const accounts = new Map<string, PersonalDeckResource[]>([
    ['alice', [resource()]], ['bob', [resource('other-only'), { ...resource(), draft: { ...resource().draft, name: 'Bob private' } }]],
  ]);
  let listOverride: unknown;
  let getOverride: unknown;
  let overrideGet = false;
  let profileFailure: Error | undefined;
  let storeFailure: Error | undefined;
  const profiles: PersonalDeckProfileReader = { get: async uid => {
    events.push(`profile:${uid}`);
    if (profileFailure) throw profileFailure;
    return profile;
  } };
  const store: PersonalDeckStore = { runTransaction: async (uid, action) => {
    events.push(`transaction:${uid}`);
    if (storeFailure) throw storeFailure;
    return action({
      get: async id => {
        events.push(`get:${id}`);
        return (overrideGet ? getOverride : accounts.get(uid)?.find(value => value.id === id) ?? null) as PersonalDeckResource | null;
      },
      list: async limit => {
        events.push(`list:${limit}`);
        return (listOverride === undefined ? (accounts.get(uid) ?? []).slice(0, limit) : listOverride) as readonly PersonalDeckResource[];
      },
      create: () => { assert.fail('Read operations must never create'); },
      replace: () => { assert.fail('Read operations must never replace'); },
      delete: () => { assert.fail('Read operations must never delete'); },
    });
  } };
  return { events, accounts, profiles, store,
    getValue: (value: unknown) => { overrideGet = true; getOverride = value; },
    listValue: (value: unknown) => { listOverride = value; },
    failProfile: (value: Error) => { profileFailure = value; },
    failStore: (value: Error) => { storeFailure = value; },
  };
}
type Harness = ReturnType<typeof harness>;
function invoke(operation: 'get' | 'list', h: Harness, identity: unknown = context, request?: unknown) {
  return operation === 'get'
    ? getOwnPersonalDeck(identity as PersonalDeckReadContext, request === undefined ? { deckId: 'saved' } : request, h.store, h.profiles)
    : listOwnPersonalDecks(identity as PersonalDeckReadContext, request === undefined ? {} : request, h.store, h.profiles);
}
const accessError = (code: string) => (error: unknown) => error instanceof PlayerBootstrapError && error.code === code;

for (const role of ['member', 'admin']) {
  test(`${role} reads only its own account with profile authorization before store access`, async () => {
    const h = harness({ role, roleId: role, contactEmail: 'ignored@example.test', privateMetadata: 'not returned' });
    assert.deepEqual(await invoke('get', h), resource());
    assert.deepEqual(h.events, ['profile:alice', 'transaction:alice', 'get:saved']);
    h.events.length = 0;
    assert.deepEqual(await invoke('list', h), [resource()]);
    assert.deepEqual(h.events, ['profile:alice', 'transaction:alice', 'list:20']);
    assert.equal(await invoke('get', h, context, { deckId: 'other-only' }), null);
    const bob = await getOwnPersonalDeck({ auth: { uid: 'bob' } }, { deckId: 'saved' }, h.store, h.profiles);
    assert.equal(bob?.draft.name, 'Bob private');
  });
}

for (const operation of ['get', 'list'] as const) {
  test(`${operation} rejects missing authenticated context before any profile or store read`, async () => {
    for (const identity of [null, undefined, {}, { auth: null }, { auth: undefined }]) {
      const h = harness();
      // Explicit undefined must reach the operation rather than invoke's convenience default.
      const action = operation === 'get' ? getOwnPersonalDeck(identity as PersonalDeckReadContext, { deckId: 'saved' }, h.store, h.profiles)
        : listOwnPersonalDecks(identity as PersonalDeckReadContext, {}, h.store, h.profiles);
      await assert.rejects(action, accessError('unauthenticated'));
      assert.deepEqual(h.events, []);
    }
  });

  test(`${operation} rejects malformed identities and arbitrary owner paths before I/O`, async () => {
    const invalid = ['', 'a/b', '.', '..', '__reserved__', 'x'.repeat(1501), '\ud800', null, 123];
    const identities: unknown[] = invalid.map(uid => ({ auth: { uid } }));
    identities.push('alice', { uid: 'alice' }, { auth: { uid: 'alice', ownerUid: 'bob' } }, { auth: { uid: 'alice' }, uid: 'bob' });
    let getterReads = 0;
    identities.push({ auth: Object.defineProperty({}, 'uid', { enumerable: true, get: () => { getterReads++; return 'alice'; } }) });
    for (const identity of identities) {
      const h = harness();
      await assert.rejects(invoke(operation, h, identity), accessError('permission-denied'));
      assert.deepEqual(h.events, []);
    }
    assert.equal(getterReads, 0);
  });

  test(`${operation} rejects absent or inconsistent profiles without starting a deck transaction`, async () => {
    for (const profile of [null, {}, { role: 'member' }, { roleId: 'member' },
      { role: 'member', roleId: 'admin' }, { role: 'admin', roleId: 'member' },
      { role: 'owner', roleId: 'owner' }, { email: 'admin@example.test' }]) {
      const h = harness(profile);
      await assert.rejects(invoke(operation, h), accessError('permission-denied'));
      assert.deepEqual(h.events, ['profile:alice']);
    }
    let reads = 0;
    const accessor = { roleId: 'member' };
    Object.defineProperty(accessor, 'role', { enumerable: true, get: () => { reads++; return 'member'; } });
    const h = harness(accessor);
    await assert.rejects(invoke(operation, h), accessError('permission-denied'));
    assert.equal(reads, 0);
    const inherited = harness(Object.create({ role: 'admin', roleId: 'admin' }));
    await assert.rejects(invoke(operation, inherited), accessError('permission-denied'));
  });

  test(`${operation} rejects extra payload fields including cross-account ownership even for admin`, async () => {
    for (const field of ['uid', 'ownerUid', 'path', 'auth', 'ownership', 'limit', 'orderBy']) {
      const h = harness({ role: 'admin', roleId: 'admin' });
      const request = { ...(operation === 'get' ? { deckId: 'saved' } : {}), [field]: 'bob' };
      await assert.rejects(invoke(operation, h, context, request), GameplayContractError);
      assert.deepEqual(h.events, []);
    }
  });

  test(`${operation} rejects malformed request objects without executing accessors or starting I/O`, async () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, operation === 'get' ? 'deckId' : 'uid', {
      enumerable: true, get: () => { reads++; return 'saved'; },
    });
    const hidden = Object.defineProperty(operation === 'get' ? { deckId: 'saved' } : {}, 'uid', { value: 'bob' });
    const symbolic = { ...(operation === 'get' ? { deckId: 'saved' } : {}), [Symbol('uid')]: 'bob' };
    for (const request of [null, [], 'saved', accessor, hidden, symbolic]) {
      const h = harness();
      await assert.rejects(invoke(operation, h, context, request), GameplayContractError);
      assert.deepEqual(h.events, []);
    }
    assert.equal(reads, 0);
  });

  test(`${operation} propagates profile infrastructure failures intact`, async () => {
    const h = harness();
    const failure = new Error('profile infrastructure failed');
    h.failProfile(failure);
    await assert.rejects(invoke(operation, h), error => error === failure);
    assert.deepEqual(h.events, ['profile:alice']);
  });

  test(`${operation} propagates store failures intact instead of reporting empty data`, async () => {
    const h = harness();
    const failure = new Error('store infrastructure failed');
    h.failStore(failure);
    await assert.rejects(invoke(operation, h), error => error === failure);
    assert.deepEqual(h.events, ['profile:alice', 'transaction:alice']);
  });
}

test('get rejects missing, invalid and reserved deck identifiers before any I/O', async () => {
  for (const deckId of ['', '/', 'a/b', '..', '__reserved__', 'x'.repeat(129), null, 123, undefined]) {
    const h = harness();
    await assert.rejects(invoke('get', h, context, { deckId }), GameplayContractError);
    assert.deepEqual(h.events, []);
  }
  await assert.rejects(invoke('get', harness(), context, {}), GameplayContractError);
});

test('UID validation preserves the existing Unicode and punctuation boundary of the deck store', async () => {
  const h = harness();
  const uid = 'José.😀@account';
  h.accounts.set(uid, [resource()]);
  assert.deepEqual(await invoke('get', h, { auth: { uid } }), resource());
  assert.deepEqual(h.events, [`profile:${uid}`, `transaction:${uid}`, 'get:saved']);
});

test('missing resource and empty account return explicit absence without creating anything', async () => {
  const h = harness();
  h.accounts.set('alice', []);
  assert.equal(await invoke('get', h), null);
  assert.deepEqual(await invoke('list', h), []);
  assert.deepEqual(h.accounts.get('alice'), []);
});

test('list requests the existing bounded ceiling rather than a client-selected limit', async () => {
  const h = harness();
  h.accounts.set('alice', Array.from({ length: PERSONAL_DECK_LIMITS.maxDecks }, (_, index) => resource(`deck-${index}`)));
  const result = await listOwnPersonalDecks(context, {}, h.store, h.profiles);
  assert.equal(result.length, 20);
  assert.deepEqual(h.events, ['profile:alice', 'transaction:alice', 'list:20']);
});

test('list sorts newest first and breaks ties by ASCII ID without sorting the source array', async () => {
  const h = harness();
  const values = [resource('z', later), resource('old'), resource('a', later), resource('Z', later)];
  const before = values.slice();
  h.accounts.set('alice', values);
  const result = await listOwnPersonalDecks(context, {}, h.store, h.profiles);
  assert.deepEqual(result.map(value => value.id), ['Z', 'a', 'z', 'old']);
  assert.deepEqual(values, before);
});

for (const operation of ['get', 'list'] as const) {
  test(`${operation} rejects malformed persisted resources rather than hiding corruption`, async () => {
    for (const invalid of [undefined, {}, { ...resource(), version: 0 }, { ...resource(), extra: true },
      { ...resource(), updatedAt: 'not-a-date' }, { ...resource(), draft: { ...resource().draft, ownership: true } }]) {
      const h = harness();
      if (operation === 'get') h.getValue(invalid);
      else h.listValue([resource('valid'), invalid]);
      await assert.rejects(invoke(operation, h), GameplayContractError);
    }
  });
}

test('get rejects a resource with an ID different from the requested deck', async () => {
  const h = harness();
  h.getValue(resource('other'));
  await assert.rejects(invoke('get', h), GameplayContractError);
});

test('list rejects duplicate IDs, oversized responses and malformed arrays', async () => {
  const sparse = new Array(1);
  for (const values of [[resource(), resource()], Array.from({ length: 21 }, (_, index) => resource(`d-${index}`)),
    sparse, null, {}, Object.assign([resource()], { uid: 'bob' })]) {
    const h = harness();
    h.listValue(values);
    await assert.rejects(invoke('list', h), GameplayContractError);
  }
});

test('get and list return detached resources and never mutate persisted data or need historical content', async () => {
  const h = harness();
  const source = h.accounts.get('alice')![0];
  const before = structuredClone([...h.accounts]);
  Object.freeze(source.draft.entries[0]);
  Object.freeze(source.draft.entries);
  Object.freeze(source.draft);
  Object.freeze(source);
  const first = await getOwnPersonalDeck(context, { deckId: 'saved' }, h.store, h.profiles);
  const listed = await listOwnPersonalDecks(context, {}, h.store, h.profiles);
  assert.ok(first);
  assert.notEqual(first, listed[0]);
  assert.notEqual(first.draft.entries, source.draft.entries);
  (first.draft.entries[0] as { quantity: number }).quantity = 2;
  assert.deepEqual(listed[0], source);
  assert.deepEqual([...h.accounts], before);
  assert.equal(listed[0].draft.contentVersion, 'unavailable-history');
  assert.deepEqual(Object.keys(listed[0]).sort(), ['createdAt', 'draft', 'id', 'updatedAt', 'version']);
});

test('identity and deck ID are captured before awaiting profile authorization', async () => {
  const h = harness();
  let release!: (value: Record<string, unknown>) => void;
  const pending = new Promise<Record<string, unknown>>(resolve => { release = resolve; });
  const identities: string[] = [];
  const profiles: PersonalDeckProfileReader = { get: uid => { identities.push(uid); return pending; } };
  const mutable = { auth: { uid: 'alice' } };
  const request = { deckId: 'saved' };
  const operation = getOwnPersonalDeck(mutable, request, h.store, profiles);
  mutable.auth.uid = 'bob';
  request.deckId = 'other-only';
  release({ role: 'member', roleId: 'member' });
  assert.deepEqual(await operation, resource());
  assert.deepEqual(identities, ['alice']);
  assert.deepEqual(h.events, ['transaction:alice', 'get:saved']);
});
