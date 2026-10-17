import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PersonalDeckResource } from '../src/gameplay';
import { GameplayContractError, parsePersonalDeckResource } from '../src/gameplay';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import {
  PersonalDeckClockError, PersonalDeckConflictError, PersonalDeckNotFoundError, PersonalDeckVersionExhaustedError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckStore, PersonalDeckStoreTransaction } from '../src/decks/personal-deck-store';
import { renamePersonalDeck } from '../src/decks/rename-personal-deck';

const uid = 'backend-verified-42';
const request = Object.freeze({ deckId: 'deck-a', expectedVersion: 7, name: 'Novo Deck' });
const trustedTime = '2026-10-17T12:00:00.123Z';

type ResourceOverrides = Partial<Omit<PersonalDeckResource, 'draft'>> & {
  draft?: Partial<PersonalDeckResource['draft']>;
};

/** The port returns validated, normalized resources; freeze that projection rather than raw rows. */
function resource(overrides: ResourceOverrides = {}): PersonalDeckResource {
  const parsed = parsePersonalDeckResource({
    id: 'deck-a', version: 7,
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T11:00:00.000Z',
    ...overrides,
    draft: {
      name: 'Meu Deck', rulesVersion: '0.1', contentVersion: 'historical-v1',
      entries: [
        { cardId: 'a-unknown', revision: 999, quantity: 1 },
        { cardId: 'Z-archived', revision: 42, quantity: 1 },
        { cardId: 'a-unknown', revision: 999, quantity: 1 },
      ],
      ...overrides.draft,
    },
  });
  parsed.draft.entries.forEach(entry => Object.freeze(entry));
  Object.freeze(parsed.draft.entries);
  Object.freeze(parsed.draft);
  return Object.freeze(parsed);
}

class FakeClock implements PersonalDeckClock {
  calls = 0;
  failure?: unknown;

  constructor(readonly values: readonly unknown[] = [trustedTime], readonly events?: string[]) {}

  now(): string {
    this.calls++;
    this.events?.push('clock');
    if (this.failure !== undefined) throw this.failure;
    return this.values[this.calls - 1] as string;
  }
}

type FailureStage = 'transaction' | 'get' | 'replace' | 'commit';

/** Test double only: queued local writes and callback replays do not prove database atomicity. */
class MemoryDeckStore implements PersonalDeckStore {
  readonly resources = new Map<string, Map<string, PersonalDeckResource>>();
  readonly uids: string[] = [];
  readonly reads: { uid: string; deckId: string; attempt: number }[] = [];
  readonly queuedReplacements: { uid: string; resource: PersonalDeckResource; attempt: number }[] = [];
  readonly events: string[] = [];
  readonly failure = new Error('store failure sentinel');
  failAt?: FailureStage;
  replayResources?: readonly (PersonalDeckResource | null)[];
  commits = 0;

  constructor(initialResource: PersonalDeckResource | null = resource(), ownerUid = uid) {
    this.resources.set(ownerUid, new Map(initialResource ? [[initialResource.id, initialResource]] : []));
  }

  async runTransaction<T>(ownerUid: string, action: (transaction: PersonalDeckStoreTransaction) => Promise<T>): Promise<T> {
    this.uids.push(ownerUid);
    this.events.push('transaction');
    if (this.failAt === 'transaction') throw this.failure;
    const attemptCount = this.replayResources?.length ?? 1;
    let result!: T;
    let finalPending: PersonalDeckResource[] = [];
    for (let attempt = 0; attempt < attemptCount; attempt++) {
      const pending: PersonalDeckResource[] = [];
      const unexpected = (operation: string): never => {
        this.events.push(operation);
        throw new Error(`Unexpected ${operation} in rename`);
      };
      result = await action({
        get: async deckId => {
          this.events.push(`get:${deckId}`);
          this.reads.push({ uid: ownerUid, deckId, attempt });
          if (this.failAt === 'get') throw this.failure;
          return this.replayResources ? this.replayResources[attempt] : this.resources.get(ownerUid)?.get(deckId) ?? null;
        },
        list: async () => unexpected('list'),
        create: () => unexpected('create'),
        delete: () => unexpected('delete'),
        replace: replacement => {
          this.events.push(`replace:${replacement.id}`);
          if (this.failAt === 'replace') throw this.failure;
          pending.push(replacement);
          this.queuedReplacements.push({ uid: ownerUid, resource: replacement, attempt });
        },
      });
      // A replay discards the first callback's pending writes and result.
      finalPending = pending;
    }
    if (this.failAt === 'commit') throw this.failure;
    for (const replacement of finalPending) this.resources.get(ownerUid)?.set(replacement.id, replacement);
    this.commits++;
    this.events.push('commit');
    return result;
  }
}

function assertNoWrite(store: MemoryDeckStore): void {
  assert.deepEqual(store.queuedReplacements, []);
  assert.equal(store.commits, 0);
}

test('rename reads and replaces in one transaction, preserving identity, creation time and every draft field except name', async () => {
  const original = resource();
  const store = new MemoryDeckStore(original);
  const clock = new FakeClock([trustedTime], store.events);
  const result = await renamePersonalDeck(uid, request, store, clock);
  const expected = { ...original, version: 8, updatedAt: trustedTime, draft: { ...original.draft, name: request.name } };
  assert.deepEqual(result, expected);
  assert.deepEqual(store.queuedReplacements.map(item => item.resource), [expected]);
  assert.deepEqual(store.events, ['transaction', 'get:deck-a', 'clock', 'replace:deck-a', 'commit']);
  assert.equal(store.resources.get(uid)?.get(original.id), store.queuedReplacements[0].resource);
  assert.equal(result.id, original.id);
  assert.equal(result.createdAt, original.createdAt);
  assert.equal(result.version, original.version + 1);
  assert.equal(result.updatedAt, trustedTime);
  assert.equal(result.draft.rulesVersion, original.draft.rulesVersion);
  assert.equal(result.draft.contentVersion, original.draft.contentVersion);
  assert.deepEqual(result.draft.entries, original.draft.entries);
  assert.equal(clock.calls, 1);
  assert.equal(store.commits, 1);
});

test('rename uses existing name trim while preserving internal spacing and Unicode', async () => {
  const store = new MemoryDeckStore();
  const result = await renamePersonalDeck(uid, { ...request, name: ' \tÉter  雪 🃏\n ' }, store, new FakeClock());
  assert.equal(result.draft.name, 'Éter  雪 🃏');
  assert.equal(result.version, 8);
});

test('rename passes the trusted backend UID and leaves the same resource ID under another owner alone', async () => {
  const ownerUid = 'trusted-Backend_UID-42';
  const original = resource();
  const other = resource({ version: 19 });
  const store = new MemoryDeckStore(original, ownerUid);
  store.resources.set('other-user', new Map([[other.id, other]]));
  await renamePersonalDeck(ownerUid, request, store, new FakeClock());
  assert.deepEqual(store.uids, [ownerUid]);
  assert.deepEqual(store.reads, [{ uid: ownerUid, deckId: request.deckId, attempt: 0 }]);
  assert.equal(store.queuedReplacements[0].uid, ownerUid);
  assert.equal(store.resources.get('other-user')?.get(other.id), other);
});

test('missing resource is not-found before clock access or replace', async () => {
  const store = new MemoryDeckStore(null);
  const clock = new FakeClock();
  await assert.rejects(renamePersonalDeck(uid, request, store, clock), PersonalDeckNotFoundError);
  assert.deepEqual(store.events, ['transaction', 'get:deck-a']);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('either direction of version mismatch is conflict before clock access or replace', async () => {
  for (const version of [1, 6, 8, Number.MAX_SAFE_INTEGER]) {
    const original = resource({ version });
    const store = new MemoryDeckStore(original);
    const clock = new FakeClock();
    await assert.rejects(renamePersonalDeck(uid, request, store, clock), PersonalDeckConflictError);
    assert.deepEqual(store.events, ['transaction', 'get:deck-a']);
    assert.equal(clock.calls, 0);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assertNoWrite(store);
  }
});

test('invalid requests fail with GameplayContractError before transaction and clock', async () => {
  const invalid: unknown[] = [
    undefined, null, [], 'deck-a', {}, { ...request, name: undefined },
    { deckId: request.deckId, name: request.name }, { expectedVersion: 7, name: request.name },
    ...['', ' ', 'users/other/decks/deck-a', 'a'.repeat(129), 1, null].map(deckId => ({ ...request, deckId })),
    ...[undefined, null, '7', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(expectedVersion => ({ ...request, expectedVersion })),
    ...['', ' \t\n ', 'a'.repeat(81), 1, null, []].map(name => ({ ...request, name })),
  ];
  for (const value of invalid) {
    const store = new MemoryDeckStore();
    const clock = new FakeClock();
    await assert.rejects(renamePersonalDeck(uid, value, store, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('client UID, owner, desired version, times, composition and override flags are rejected before any dependency', async () => {
  const fields = {
    uid: 'other', ownerUid: 'other', version: 8, createdAt: trustedTime, updatedAt: trustedTime,
    now: trustedTime, draft: resource().draft, force: true, admin: true, ignoreVersion: true,
    rulesVersion: '0.1', contentVersion: 'active-v2', entries: [],
  };
  for (const [key, value] of Object.entries(fields)) {
    const store = new MemoryDeckStore();
    const clock = new FakeClock();
    await assert.rejects(renamePersonalDeck(uid, { ...request, [key]: value }, store, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.equal(clock.calls, 0);
  }
});

test('hostile request accessors, prototypes, symbols and hidden fields fail without invoking accessors', async () => {
  let getterCalls = 0;
  const values: unknown[] = [
    Object.assign(Object.create({ inherited: true }) as object, request),
    { ...request, [Symbol('hidden')]: true },
    Object.defineProperty({ ...request }, 'force', { value: true, enumerable: false }),
  ];
  for (const field of ['deckId', 'expectedVersion', 'name', 'force']) {
    values.push(Object.defineProperty({ ...request }, field, {
      enumerable: true,
      get: () => { getterCalls++; throw new Error('client accessor must not execute'); },
    }));
  }
  for (const value of values) {
    const store = new MemoryDeckStore();
    const clock = new FakeClock();
    await assert.rejects(renamePersonalDeck(uid, value, store, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.equal(clock.calls, 0);
  }
  assert.equal(getterCalls, 0);
});

test('empty and incomplete historical decks rename without catalog, ownership, publication, quota or eligibility reads', async () => {
  for (const original of [resource({ draft: { entries: [] } }), resource()]) {
    const store = new MemoryDeckStore(original);
    const result = await renamePersonalDeck(uid, request, store, new FakeClock());
    assert.deepEqual(result.draft.entries, original.draft.entries);
    assert.equal(result.draft.contentVersion, 'historical-v1');
    assert.deepEqual(store.events, ['transaction', 'get:deck-a', 'replace:deck-a', 'commit']);
    assert.equal(store.reads.length, 1);
    // Every other operation in the injected port throws, and no catalog/ownership port exists.
    assert.equal(store.queuedReplacements.length, 1);
  }
});

test('equal names, including equality after trim, return an unchanged resource without clock or replacement', async () => {
  for (const name of ['Meu Deck', ' \tMeu Deck\n ']) {
    const original = resource();
    const store = new MemoryDeckStore(original);
    const clock = new FakeClock();
    const result = await renamePersonalDeck(uid, { ...request, name }, store, clock);
    assert.deepEqual(result, original);
    assert.equal(result.version, 7);
    assert.equal(result.updatedAt, original.updatedAt);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.deepEqual(store.events, ['transaction', 'get:deck-a', 'commit']);
    assert.deepEqual(store.queuedReplacements, []);
    assert.equal(clock.calls, 0);
  }
});

test('equal name still requires both an existing resource and exactly the observed version', async () => {
  for (const existing of [null, resource({ version: 8 })]) {
    const store = new MemoryDeckStore(existing);
    const clock = new FakeClock();
    await assert.rejects(
      renamePersonalDeck(uid, { ...request, name: ' Meu Deck ' }, store, clock),
      existing ? PersonalDeckConflictError : PersonalDeckNotFoundError,
    );
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('a no-op at the largest safe version remains valid without clock access or overflow', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER });
  const store = new MemoryDeckStore(original);
  const clock = new FakeClock();
  const result = await renamePersonalDeck(uid, {
    ...request, expectedVersion: Number.MAX_SAFE_INTEGER, name: 'Meu Deck',
  }, store, clock);
  assert.deepEqual(result, original);
  assert.equal(result.version, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(store.queuedReplacements, []);
  assert.equal(clock.calls, 0);
});

test('an actual change at the largest safe version fails with the dedicated stable error before clock or write', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER });
  const store = new MemoryDeckStore(original);
  const clock = new FakeClock();
  await assert.rejects(renamePersonalDeck(uid, { ...request, expectedVersion: original.version }, store, clock), error => {
    assert.ok(error instanceof PersonalDeckVersionExhaustedError);
    assert.equal(error.code, 'personal-deck-version-exhausted');
    assert.equal(error instanceof PersonalDeckConflictError, false);
    return true;
  });
  assert.equal(clock.calls, 0);
  assert.equal(original.version, Number.MAX_SAFE_INTEGER);
  assertNoWrite(store);
});

test('incrementing the penultimate safe version produces exactly the largest safe version', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER - 1 });
  const store = new MemoryDeckStore(original);
  const result = await renamePersonalDeck(uid, { ...request, expectedVersion: original.version }, store, new FakeClock());
  assert.equal(result.version, Number.MAX_SAFE_INTEGER);
  assert.equal(Number.isSafeInteger(result.version), true);
  assert.equal(store.queuedReplacements.length, 1);
});

test('trusted time earlier than creation fails as a clock domain error without write', async () => {
  const store = new MemoryDeckStore();
  const clock = new FakeClock(['2026-10-17T09:59:59.999Z']);
  await assert.rejects(renamePersonalDeck(uid, request, store, clock), PersonalDeckClockError);
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('trusted time after creation but earlier than stored update fails without clamping or write', async () => {
  const original = resource();
  const store = new MemoryDeckStore(original);
  const clock = new FakeClock(['2026-10-17T10:59:59.999Z']);
  await assert.rejects(renamePersonalDeck(uid, request, store, clock), error => {
    assert.ok(error instanceof PersonalDeckClockError);
    assert.equal(error.code, 'personal-deck-invalid-time');
    assert.equal(error instanceof GameplayContractError, false);
    return true;
  });
  assert.equal(original.updatedAt, '2026-10-17T11:00:00.000Z');
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('trusted time equal to stored update is accepted while an actual name change still increments version', async () => {
  const original = resource();
  const store = new MemoryDeckStore(original);
  const clock = new FakeClock([original.updatedAt]);
  const result = await renamePersonalDeck(uid, request, store, clock);
  assert.equal(result.updatedAt, original.updatedAt);
  assert.equal(result.version, original.version + 1);
  assert.equal(result.draft.name, request.name);
  assert.equal(clock.calls, 1);
});

test('invalid trusted timestamp formats and calendar values become clock errors rather than client contract errors', async () => {
  const values: unknown[] = [
    undefined, null, 42, new Date('2026-10-17T12:00:00.000Z'), {}, '', 'now',
    '2026-10-17T12:00:00Z', '2026-10-17T12:00:00.12Z', '2026-10-17T12:00:00.1234Z',
    '2026-10-17T12:00:00.123+00:00', '2026-10-17t12:00:00.123z', ' 2026-10-17T12:00:00.123Z ',
    '0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', '10000-01-01T00:00:00.000Z',
    '2026-02-29T12:00:00.000Z', '2026-04-31T12:00:00.000Z', '2026-13-01T12:00:00.000Z',
    '2026-10-17T24:00:00.000Z', '2026-10-17T12:60:00.000Z', '2026-10-17T12:00:60.000Z',
  ];
  for (const value of values) {
    const store = new MemoryDeckStore();
    const clock = new FakeClock([value]);
    await assert.rejects(renamePersonalDeck(uid, request, store, clock), error => {
      assert.ok(error instanceof PersonalDeckClockError);
      assert.equal(error instanceof GameplayContractError, false);
      return true;
    });
    assert.equal(clock.calls, 1);
    assertNoWrite(store);
  }
});

test('valid leap day and both supported year boundaries retain canonical string timestamps', async () => {
  for (const time of ['0001-01-01T00:00:00.000Z', '2028-02-29T12:34:56.789Z', '9999-12-31T23:59:59.999Z']) {
    const original = resource({ createdAt: '0001-01-01T00:00:00.000Z', updatedAt: '0001-01-01T00:00:00.000Z' });
    const result = await renamePersonalDeck(uid, request, new MemoryDeckStore(original), new FakeClock([time]));
    assert.equal(result.updatedAt, time);
    assert.equal(typeof result.updatedAt, 'string');
    assert.equal(result.createdAt, original.createdAt);
  }
});

test('a throwing trusted clock becomes a minimal domain clock error without writing', async () => {
  const store = new MemoryDeckStore();
  const clock = new FakeClock();
  clock.failure = new Error('private clock diagnostic sentinel');
  await assert.rejects(renamePersonalDeck(uid, request, store, clock), error => {
    assert.ok(error instanceof PersonalDeckClockError);
    assert.notEqual(error, clock.failure);
    assert.equal(error.code, 'personal-deck-invalid-time');
    assert.equal(error.message.includes('private clock diagnostic sentinel'), false);
    assert.equal(error instanceof GameplayContractError, false);
    return true;
  });
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('a no-op does not depend on a working trusted clock and returns detached draft data', async () => {
  const original = resource();
  const store = new MemoryDeckStore(original);
  const clock = new FakeClock();
  clock.failure = new Error('clock must not be called');
  const result = await renamePersonalDeck(uid, { ...request, name: original.draft.name }, store, clock);
  assert.deepEqual(result, original);
  assert.notEqual(result, original);
  assert.notEqual(result.draft, original.draft);
  assert.notEqual(result.draft.entries, original.draft.entries);
  assert.notEqual(result.draft.entries[0], original.draft.entries[0]);
  (result.draft.entries[0] as { revision: number }).revision = 10;
  assert.equal(original.draft.entries[0].revision, 42);
  assert.equal(clock.calls, 0);
  assert.deepEqual(store.queuedReplacements, []);
});

test('store start, read, replace and commit failures propagate by identity without arbitrary conversion', async () => {
  for (const stage of ['transaction', 'get', 'replace', 'commit'] as const) {
    const original = resource();
    const store = new MemoryDeckStore(original);
    const clock = new FakeClock();
    store.failAt = stage;
    await assert.rejects(renamePersonalDeck(uid, request, store, clock), error => error === store.failure);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.equal(store.commits, 0);
    assert.equal(store.queuedReplacements.length, stage === 'commit' ? 1 : 0);
    assert.equal(clock.calls, stage === 'transaction' || stage === 'get' ? 0 : 1);
  }
});

test('deeply frozen request and normalized source remain immutable across successful rename', async () => {
  const original = resource();
  const before = structuredClone(original);
  const beforeRequest = structuredClone(request);
  const result = await renamePersonalDeck(uid, request, new MemoryDeckStore(original), new FakeClock());
  assert.deepEqual(original, before);
  assert.deepEqual(request, beforeRequest);
  assert.deepEqual(result.draft.entries, before.draft.entries);
  assert.equal(Object.isFrozen(original), true);
  assert.equal(Object.isFrozen(original.draft), true);
  assert.equal(Object.isFrozen(original.draft.entries), true);
  assert.equal(original.draft.entries.every(entry => Object.isFrozen(entry)), true);
});

test('returned resource is detached from both original data and the object queued for replacement', async () => {
  const original = resource();
  const store = new MemoryDeckStore(original);
  const result = await renamePersonalDeck(uid, request, store, new FakeClock());
  const queued = store.queuedReplacements[0].resource;
  for (const other of [original, queued]) {
    assert.notEqual(result, other);
    assert.notEqual(result.draft, other.draft);
    assert.notEqual(result.draft.entries, other.draft.entries);
    result.draft.entries.forEach((entry, index) => assert.notEqual(entry, other.draft.entries[index]));
  }
  (result as { version: number }).version = 99;
  (result.draft as { name: string }).name = 'Mutated return';
  (result.draft.entries[0] as { revision: number }).revision = 10;
  assert.equal(queued.version, 8);
  assert.equal(queued.draft.name, request.name);
  assert.equal(queued.draft.entries[0].revision, 42);
  assert.equal(original.draft.entries[0].revision, 42);
  (queued.draft.entries[1] as { quantity: number }).quantity = 1;
  assert.equal(result.draft.entries[1].quantity, 2);
  assert.equal(original.draft.entries[1].quantity, 2);
});

test('callback replay rereads the observed resource, calculates one increment and uses one stable instant', async () => {
  const first = resource();
  const second = resource({ draft: { entries: [{ cardId: 'replayed-card', revision: 5, quantity: 1 }] } });
  const store = new MemoryDeckStore(first);
  store.replayResources = [first, second];
  const clock = new FakeClock([trustedTime, '2026-10-18T12:00:00.000Z']);
  const result = await renamePersonalDeck(uid, request, store, clock);
  assert.equal(store.reads.length, 2);
  assert.equal(store.queuedReplacements.length, 2);
  assert.deepEqual(store.queuedReplacements.map(item => item.resource.version), [8, 8]);
  assert.deepEqual(store.queuedReplacements.map(item => item.resource.updatedAt), [trustedTime, trustedTime]);
  assert.deepEqual(result.draft.entries, second.draft.entries);
  assert.deepEqual(store.queuedReplacements[0].resource.draft.entries, first.draft.entries);
  assert.equal(result.version, 8);
  assert.equal(clock.calls, 1);
  assert.equal(store.commits, 1);
  assert.equal(first.version, 7);
  assert.equal(second.version, 7);
  assert.equal(request.expectedVersion, 7);
});

test('callback replay with a changed observed version becomes conflict instead of reusing the previous candidate', async () => {
  const first = resource();
  const second = resource({ version: 8 });
  const store = new MemoryDeckStore(first);
  store.replayResources = [first, second];
  const clock = new FakeClock([trustedTime]);
  await assert.rejects(renamePersonalDeck(uid, request, store, clock), PersonalDeckConflictError);
  assert.equal(store.reads.length, 2);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(store.queuedReplacements[0].attempt, 0);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
  assert.equal(store.commits, 0);
  assert.equal(clock.calls, 1);
});

test('callback replay rejects a newer stored update beyond its cached time without recalibrating the clock', async () => {
  const first = resource();
  const second = resource({ updatedAt: '2026-10-17T12:00:00.124Z' });
  const store = new MemoryDeckStore(first);
  store.replayResources = [first, second];
  const clock = new FakeClock([trustedTime, '2026-10-17T13:00:00.000Z']);
  await assert.rejects(renamePersonalDeck(uid, request, store, clock), PersonalDeckClockError);
  assert.equal(store.reads.length, 2);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(clock.calls, 1);
  assert.equal(store.commits, 0);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
});

test('callback replay deciding no-op returns the replayed resource and discards the first attempt replacement', async () => {
  const first = resource();
  const second = resource({ draft: { name: request.name }, updatedAt: '2026-10-17T11:30:00.000Z' });
  const store = new MemoryDeckStore(first);
  store.replayResources = [first, second];
  const clock = new FakeClock([trustedTime]);
  const result = await renamePersonalDeck(uid, request, store, clock);
  assert.deepEqual(result, second);
  assert.equal(result.version, 7);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(store.queuedReplacements[0].attempt, 0);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
  assert.equal(clock.calls, 1);
  assert.equal(store.commits, 1);
});

test('separate logical rename calls acquire their own instant and compare their own expected version', async () => {
  const store = new MemoryDeckStore();
  const later = '2026-10-17T13:00:00.456Z';
  const clock = new FakeClock([trustedTime, later]);
  const first = await renamePersonalDeck(uid, request, store, clock);
  const second = await renamePersonalDeck(uid, {
    deckId: first.id, expectedVersion: first.version, name: 'Outro Nome',
  }, store, clock);
  assert.equal(first.version, 8);
  assert.equal(first.updatedAt, trustedTime);
  assert.equal(second.version, 9);
  assert.equal(second.updatedAt, later);
  assert.equal(clock.calls, 2);
  assert.equal(store.commits, 2);
});
