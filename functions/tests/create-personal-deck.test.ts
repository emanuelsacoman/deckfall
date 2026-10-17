import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameplayDeckCatalog, GameplayDeckEntry, PersonalDeckDraft, PersonalDeckResource } from '../src/gameplay';
import {
  GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckDraft, parsePersonalDeckResource,
} from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckClockError, PersonalDeckConflictError,
  PersonalDeckContentError, PersonalDeckContentUnavailableError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckReadLimit, PersonalDeckStore, PersonalDeckStoreTransaction } from '../src/decks/personal-deck-store';
import { createPersonalDeck } from '../src/decks/create-personal-deck';

const uid = 'backend-verified-42';
const trustedTime = '2026-10-17T12:00:00.123Z';
const historicalVersion = 'historical-v1';

function entry(cardId = 'card-a', revision = 3, quantity = 1): GameplayDeckEntry {
  return { cardId, revision, quantity };
}

function draft(overrides: Partial<PersonalDeckDraft> = {}): PersonalDeckDraft {
  return { name: 'Meu Deck', rulesVersion: '0.1', contentVersion: historicalVersion, entries: [entry()], ...overrides };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function resource(id = 'deck-a'): PersonalDeckResource {
  return freezeDeep(parsePersonalDeckResource({
    id, version: 7, draft: draft(),
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T11:00:00.000Z',
  }));
}

const request = freezeDeep({
  deckId: 'deck-a', draft: draft({ name: 'Novo Deck', entries: [entry('card-z', 8), entry('card-a', 3, 2)] }),
});

function catalog(
  entries: readonly GameplayDeckEntry[] = [entry(), entry('card-z', 8)],
  contentVersion = historicalVersion, eligible = true,
): GameplayDeckCatalog {
  return {
    rulesVersion: '0.1', contentVersion,
    cards: entries.map(({ cardId, revision }) => ({
      definition: { kind: 'unit', cardId, revision, cost: 1, power: 2, maxLife: 3, guard: false }, eligible,
    })),
  };
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

class FakeCatalogReader implements PersonalDeckCatalogReader {
  readonly calls: string[] = [];
  failure?: unknown;
  beforeReturn?: () => void;

  constructor(readonly value: GameplayDeckCatalog | null = catalog(), readonly events?: string[]) {}

  async get(contentVersion: string): Promise<GameplayDeckCatalog | null> {
    this.calls.push(contentVersion);
    this.events?.push(`catalog:${contentVersion}`);
    if (this.failure !== undefined) throw this.failure;
    this.beforeReturn?.();
    return this.value;
  }
}

type FailureStage = 'transaction' | 'get' | 'list' | 'create' | 'commit';
interface ReplaySnapshot { readonly destination: PersonalDeckResource | null; readonly count: number }

/** Callback replay and queued writes test domain decisions, never database isolation or the real hard cap. */
class MemoryDeckStore implements PersonalDeckStore {
  readonly resources = new Map<string, Map<string, PersonalDeckResource>>();
  readonly uids: string[] = [];
  readonly reads: { uid: string; deckId: string; attempt: number }[] = [];
  readonly lists: { uid: string; limit: PersonalDeckReadLimit; attempt: number }[] = [];
  readonly queuedCreates: { uid: string; resource: PersonalDeckResource; attempt: number }[] = [];
  readonly committedCreates: PersonalDeckResource[] = [];
  readonly events: string[] = [];
  readonly failure = new Error('store failure sentinel');
  failAt?: FailureStage;
  replaySnapshots?: readonly ReplaySnapshot[];
  beforeReplay?: () => void;
  commits = 0;
  replaceCalls = 0;
  deleteCalls = 0;

  constructor(count = 0, destination: PersonalDeckResource | null = null, ownerUid = uid) {
    const initial = Array.from({ length: count }, (_, index) => resource(`existing-${index}`));
    const resources = new Map(initial.map(value => [value.id, value]));
    if (destination) resources.set(destination.id, destination);
    this.resources.set(ownerUid, resources);
  }

  async runTransaction<T>(ownerUid: string, action: (transaction: PersonalDeckStoreTransaction) => Promise<T>): Promise<T> {
    this.uids.push(ownerUid);
    this.events.push('transaction');
    if (this.failAt === 'transaction') throw this.failure;
    let result!: T;
    let finalPending: PersonalDeckResource[] = [];
    const attempts = this.replaySnapshots?.length ?? 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) this.beforeReplay?.();
      const pending: PersonalDeckResource[] = [];
      const snapshot = this.replaySnapshots?.[attempt];
      let wrote = false;
      result = await action({
        get: async deckId => {
          assert.equal(wrote, false, 'get must precede create');
          this.events.push(`get:${deckId}`);
          this.reads.push({ uid: ownerUid, deckId, attempt });
          if (this.failAt === 'get') throw this.failure;
          return snapshot ? snapshot.destination : this.resources.get(ownerUid)?.get(deckId) ?? null;
        },
        list: async limit => {
          assert.equal(wrote, false, 'list must precede create');
          this.events.push(`list:${limit}`);
          this.lists.push({ uid: ownerUid, limit, attempt });
          if (this.failAt === 'list') throw this.failure;
          return snapshot
            ? Array.from({ length: snapshot.count }, (_, index) => resource(`observed-${index}`))
            : [...(this.resources.get(ownerUid)?.values() ?? [])].slice(0, limit);
        },
        create: value => {
          this.events.push(`create:${value.id}`);
          if (this.failAt === 'create') throw this.failure;
          wrote = true;
          pending.push(value);
          this.queuedCreates.push({ uid: ownerUid, resource: value, attempt });
        },
        replace: () => { this.replaceCalls++; throw new Error('Unexpected replace in create'); },
        delete: () => { this.deleteCalls++; throw new Error('Unexpected delete in create'); },
      });
      // Only the successful final attempt can commit; all earlier queued writes are discarded.
      finalPending = pending;
    }
    if (this.failAt === 'commit') throw this.failure;
    const current = this.resources.get(ownerUid)!;
    for (const value of finalPending) {
      assert.equal(current.has(value.id), false, 'create must remain create-if-absent at commit');
      current.set(value.id, value);
      this.committedCreates.push(value);
    }
    this.commits++;
    this.events.push('commit');
    return result;
  }
}

function setup(count = 0, trusted: GameplayDeckCatalog | null = catalog(), destination: PersonalDeckResource | null = null) {
  const store = new MemoryDeckStore(count, destination);
  const reader = new FakeCatalogReader(trusted, store.events);
  const clock = new FakeClock([trustedTime], store.events);
  return { store, reader, clock };
}

function assertNoWrite(store: MemoryDeckStore): void {
  assert.deepEqual(store.queuedCreates, []);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(store.commits, 0);
  assert.equal(store.replaceCalls, 0);
  assert.equal(store.deleteCalls, 0);
}

function contentFailure(reason: PersonalDeckContentError['reason']): (failure: unknown) => boolean {
  return failure => failure instanceof PersonalDeckContentError && failure.reason === reason;
}

test('create stores and returns one complete normalized PersonalDeckResource', async () => {
  const { store, reader, clock } = setup();
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  const expected = {
    id: request.deckId, version: 1, draft: parsePersonalDeckDraft(request.draft),
    createdAt: trustedTime, updatedAt: trustedTime,
  };
  assert.deepEqual(result, expected);
  assert.deepEqual(parsePersonalDeckResource(result), result);
  assert.deepEqual(store.committedCreates, [expected]);
  assert.equal(store.resources.get(uid)?.get(request.deckId), store.queuedCreates[0].resource);
  assert.equal(store.commits, 1);
});

test('create delegates trimming, duplicate aggregation and entry ordering to the draft parser', async () => {
  const value = { ...request, draft: draft({ name: ' \tÉter  雪 🃏\n ', entries: [entry('card-z', 8), entry(), entry()] }) };
  const { store, reader, clock } = setup();
  const result = await createPersonalDeck(uid, value, store, reader, clock);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(value.draft));
  assert.equal(result.draft.name, 'Éter  雪 🃏');
  assert.deepEqual(result.draft.entries, [entry('card-a', 3, 2), entry('card-z', 8)]);
});

test('create preserves the requested identifier without generating a replacement ID', async () => {
  const value = { ...request, deckId: 'chosen-Deck_42' };
  const { store, reader, clock } = setup();
  const result = await createPersonalDeck(uid, value, store, reader, clock);
  assert.equal(result.id, value.deckId);
  assert.deepEqual(store.reads.map(read => read.deckId), [value.deckId]);
  assert.equal(store.queuedCreates[0].resource.id, value.deckId);
});

test('create generates version one and equal trusted creation/update timestamps', async () => {
  const { store, reader, clock } = setup();
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  assert.equal(result.version, 1);
  assert.equal(result.createdAt, trustedTime);
  assert.equal(result.updatedAt, result.createdAt);
  assert.equal(clock.calls, 1);
  assert.equal(Object.hasOwn(result, 'expectedVersion'), false);
});

test('create orders catalog, transaction, destination read, bounded list, clock and create before commit', async () => {
  const { store, reader, clock } = setup();
  await createPersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(store.events, [
    `catalog:${historicalVersion}`, 'transaction', 'get:deck-a',
    `list:${PERSONAL_DECK_LIMITS.maxDecks}`, 'clock', 'create:deck-a', 'commit',
  ]);
  assert.equal(store.queuedCreates.length, 1);
  assert.equal(store.replaceCalls, 0);
  assert.equal(store.deleteCalls, 0);
});

test('invalid create payloads fail before reader, store and clock access', async () => {
  const invalid: unknown[] = [
    undefined, null, [], 'deck-a', {}, { deckId: request.deckId }, { draft: request.draft },
    ...['', ' ', 'users/other/decks/a', 'a'.repeat(129), 1, null].map(deckId => ({ ...request, deckId })),
    ...['', ' \t\n ', 'a'.repeat(81), 1, null].map(name => ({ ...request, draft: { ...request.draft, name } })),
    { ...request, draft: draft({ entries: [entry('card-a', 3, 3)] }) },
    { ...request, draft: draft({ entries: [entry(), entry('card-a', 4)] }) },
    { ...request, draft: { ...request.draft, rulesVersion: '0.2' } },
  ];
  for (const value of invalid) {
    const { store, reader, clock } = setup();
    await assert.rejects(createPersonalDeck(uid, value, store, reader, clock), GameplayContractError);
    assert.deepEqual(reader.calls, []);
    assert.deepEqual(store.events, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('create rejects client UID, version, expectedVersion, timestamps and authority fields before dependencies', async () => {
  const fields = {
    uid: 'other', ownerUid: 'other', version: 1, expectedVersion: 7, createdAt: trustedTime, updatedAt: trustedTime,
    isValid: true, isPlayable: true, ownership: [], force: true, overwrite: true,
    catalog: catalog(), activeVersion: 'active-v2', now: trustedTime,
  };
  for (const [field, value] of Object.entries(fields)) {
    const { store, reader, clock } = setup();
    await assert.rejects(createPersonalDeck(uid, { ...request, [field]: value }, store, reader, clock), GameplayContractError);
    assert.deepEqual(reader.calls, []);
    assert.deepEqual(store.events, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('create rejects request accessors, symbols, hidden properties and inherited payloads without executing getters', async () => {
  let getterCalls = 0;
  const values: unknown[] = [
    Object.assign(Object.create({ inherited: true }) as object, request),
    { ...request, [Symbol('hidden')]: true },
    Object.defineProperty({ ...request }, 'force', { value: true, enumerable: false }),
  ];
  for (const field of ['deckId', 'draft', 'expectedVersion']) values.push(Object.defineProperty({ ...request }, field, {
    enumerable: true, get: () => { getterCalls++; throw new Error('client accessor must not execute'); },
  }));
  for (const value of values) {
    const { store, reader, clock } = setup();
    await assert.rejects(createPersonalDeck(uid, value, store, reader, clock), GameplayContractError);
    assert.deepEqual(reader.calls, []);
    assert.deepEqual(store.uids, []);
    assert.equal(clock.calls, 0);
  }
  assert.equal(getterCalls, 0);
});

test('the reader receives exactly the requested historical contentVersion without active fallback', async () => {
  const chosen = 'historical-v3';
  const { store, reader, clock } = setup(0, catalog(undefined, chosen));
  const result = await createPersonalDeck(uid, { ...request, draft: { ...request.draft, contentVersion: chosen } },
    store, reader, clock);
  assert.deepEqual(reader.calls, [chosen]);
  assert.equal(result.draft.contentVersion, chosen);
});

test('missing historical content fails before opening a personal transaction', async () => {
  const { store, reader, clock } = setup(0, null);
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), PersonalDeckContentUnavailableError);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.deepEqual(store.uids, []);
  assert.deepEqual(store.reads, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('catalog-reader failures propagate intact before transaction or clock access', async () => {
  const { store, reader, clock } = setup();
  reader.failure = new Error('private reader failure sentinel');
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => failure === reader.failure);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('unknown card references fail historical checking before opening a transaction', async () => {
  const { store, reader, clock } = setup();
  await assert.rejects(createPersonalDeck(uid, { ...request, draft: draft({ entries: [entry('unknown-card')] }) },
    store, reader, clock), contentFailure('unknown-card'));
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('revision mismatches fail without silently replacing the requested revision', async () => {
  const value = freezeDeep({ ...request, draft: draft({ entries: [entry('card-a', 2, 2)] }) });
  const { store, reader, clock } = setup();
  await assert.rejects(createPersonalDeck(uid, value, store, reader, clock), contentFailure('revision'));
  assert.deepEqual(value.draft.entries, [entry('card-a', 2, 2)]);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
});

test('a different historical catalog contentVersion is rejected without adapting the request', async () => {
  const { store, reader, clock } = setup(0, catalog(undefined, 'other-history'));
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), contentFailure('content-version'));
  assert.equal(request.draft.contentVersion, historicalVersion);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
});

test('incompatible catalog rules remain a contract failure rather than availability or content-reference failure', async () => {
  const corrupt = { ...catalog(), rulesVersion: '0.2' } as unknown as GameplayDeckCatalog;
  const { store, reader, clock } = setup(0, corrupt);
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), GameplayContractError);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
});

test('structurally corrupt canonical cards are rejected before transaction even when the corrupt card is unused', async () => {
  const valid = catalog();
  const corrupt = { ...valid, cards: [...valid.cards, {
    definition: { ...valid.cards[0].definition, cardId: 'unused', cost: -1 }, eligible: true,
  }] } as unknown as GameplayDeckCatalog;
  const { store, reader, clock } = setup(0, corrupt);
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), GameplayContractError);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('historically recognized eligible=false cards are accepted without returning admission authority', async () => {
  const { store, reader, clock } = setup(0, catalog(undefined, historicalVersion, false));
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(request.draft));
  assert.equal('isPlayable' in result, false);
  assert.equal('isValid' in result, false);
  assert.equal('kind' in result, false);
});

test('create accepts empty drafts and an empty historical catalog', async () => {
  const { store, reader, clock } = setup(0, catalog([]));
  const result = await createPersonalDeck(uid, { ...request, draft: draft({ entries: [] }) }, store, reader, clock);
  assert.deepEqual(result.draft.entries, []);
  assert.equal(result.version, 1);
});

test('create accepts partial drafts without requiring a 24-card deck', async () => {
  const { store, reader, clock } = setup();
  const result = await createPersonalDeck(uid, { ...request, draft: draft({ entries: [entry('card-a', 3, 2)] }) },
    store, reader, clock);
  assert.equal(result.draft.entries.reduce((total, value) => total + value.quantity, 0), 2);
});

test('create accepts a complete draft of 24 historically recognized cards', async () => {
  const entries = Array.from({ length: 12 }, (_, index) => entry(`card-${index}`, 1, 2));
  const { store, reader, clock } = setup(0, catalog(entries));
  const result = await createPersonalDeck(uid, { ...request, draft: draft({ entries }) }, store, reader, clock);
  assert.equal(result.draft.entries.reduce((total, value) => total + value.quantity, 0), PERSONAL_DECK_LIMITS.maxCards);
  assert.deepEqual(result.draft.entries, parsePersonalDeckDraft(draft({ entries })).entries);
});

test('create needs no ownership, collection, Card publication or active-config dependency', async () => {
  const { store, reader, clock } = setup(0, catalog(undefined, historicalVersion, false));
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(Object.keys(result).sort(), ['createdAt', 'draft', 'id', 'updatedAt', 'version']);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.equal(store.queuedCreates.length, 1);
  // No ownership/publication object exists in any of the supplied ports or test fixtures.
});

test('an existing destination fails before quota, clock or write and is never treated as a no-op', async () => {
  const existing = resource();
  const { store, reader, clock } = setup(0, catalog(), existing);
  await assert.rejects(createPersonalDeck(uid, { ...request, draft: existing.draft }, store, reader, clock),
    PersonalDeckAlreadyExistsError);
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`, 'transaction', 'get:deck-a']);
  assert.deepEqual(store.lists, []);
  assert.equal(clock.calls, 0);
  assert.equal(store.resources.get(uid)?.get(existing.id), existing);
  assertNoWrite(store);
});

test('already-exists has priority over quota when the destination was observed as existing', async () => {
  const { store, reader, clock } = setup(PERSONAL_DECK_LIMITS.maxDecks, catalog(), resource());
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckAlreadyExistsError);
    assert.equal(failure instanceof PersonalDeckCapacityError, false);
    assert.equal(failure instanceof PersonalDeckConflictError, false);
    return true;
  });
  assert.deepEqual(store.lists, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

for (const count of [0, 18, 19]) {
  test(`create permits an account with ${count} existing decks and lists the approved bound`, async () => {
    const { store, reader, clock } = setup(count);
    await createPersonalDeck(uid, request, store, reader, clock);
    assert.equal(store.resources.get(uid)?.size, count + 1);
    assert.deepEqual(store.lists, [{ uid, limit: PERSONAL_DECK_LIMITS.maxDecks, attempt: 0 }]);
    assert.equal(store.queuedCreates.length, 1);
    assert.equal(store.committedCreates.length, 1);
  });
}

test('20 observed decks produce capacity failure without clock or create', async () => {
  const { store, reader, clock } = setup(PERSONAL_DECK_LIMITS.maxDecks);
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckCapacityError);
    assert.equal(failure.code, 'personal-deck-capacity-exceeded');
    assert.equal(failure instanceof PersonalDeckConflictError, false);
    return true;
  });
  assert.deepEqual(store.events, [
    `catalog:${historicalVersion}`, 'transaction', 'get:deck-a', `list:${PERSONAL_DECK_LIMITS.maxDecks}`,
  ]);
  assert.equal(clock.calls, 0);
  assert.equal(store.resources.get(uid)?.size, PERSONAL_DECK_LIMITS.maxDecks);
  assertNoWrite(store);
});

test('the capacity decision also rejects a list longer than the configured bound', async () => {
  const { store, reader, clock } = setup();
  // Defensive domain comparison only: a real adapter must honor the bounded list contract.
  store.replaySnapshots = [{ destination: null, count: PERSONAL_DECK_LIMITS.maxDecks + 1 }];
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), PersonalDeckCapacityError);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('create uses only the trusted UID and does not modify a different owner collection', async () => {
  const ownerUid = 'trusted-Backend_UID-42';
  const store = new MemoryDeckStore(0, null, ownerUid);
  const other = resource();
  store.resources.set('other-user', new Map([[other.id, other]]));
  await createPersonalDeck(ownerUid, request, store, new FakeCatalogReader(), new FakeClock());
  assert.deepEqual(store.uids, [ownerUid]);
  assert.deepEqual(store.reads, [{ uid: ownerUid, deckId: request.deckId, attempt: 0 }]);
  assert.deepEqual(store.lists, [{ uid: ownerUid, limit: PERSONAL_DECK_LIMITS.maxDecks, attempt: 0 }]);
  assert.equal(store.queuedCreates[0].uid, ownerUid);
  assert.equal(store.resources.get('other-user')?.get(other.id), other);
});

test('invalid clock types, ISO formats and calendar dates become ClockError before create', async () => {
  const invalid: unknown[] = [
    undefined, null, 42, {}, new Date(trustedTime), '', 'now',
    '2026-10-17T12:00:00Z', '2026-10-17T12:00:00.12Z', '2026-10-17T12:00:00.1234Z',
    '2026-10-17T12:00:00.123+00:00', '2026-10-17t12:00:00.123z', ` ${trustedTime} `,
    '0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', '10000-01-01T00:00:00.000Z',
    '2026-02-29T12:00:00.000Z', '2026-04-31T12:00:00.000Z', '2026-13-01T12:00:00.000Z',
    '2026-10-17T24:00:00.000Z', '2026-10-17T12:60:00.000Z', '2026-10-17T12:00:60.000Z',
  ];
  for (const value of invalid) {
    const { store, reader } = setup();
    const clock = new FakeClock([value]);
    await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => {
      assert.ok(failure instanceof PersonalDeckClockError);
      assert.equal(failure instanceof GameplayContractError, false);
      return true;
    });
    assert.equal(clock.calls, 1);
    assert.equal(store.lists.length, 1);
    assertNoWrite(store);
  }
});

test('a throwing trusted clock produces a minimal ClockError without leaking the original failure', async () => {
  const { store, reader, clock } = setup();
  clock.failure = new Error('private clock diagnostic sentinel');
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckClockError);
    assert.notEqual(failure, clock.failure);
    assert.equal(failure.message.includes('private clock diagnostic sentinel'), false);
    assert.equal(Object.hasOwn(failure, 'cause'), false);
    return true;
  });
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('canonical leap-day and boundary timestamps are preserved without local clock substitution', async () => {
  for (const time of ['0001-01-01T00:00:00.000Z', '2028-02-29T12:34:56.789Z', '9999-12-31T23:59:59.999Z']) {
    const { store, reader } = setup();
    const result = await createPersonalDeck(uid, request, store, reader, new FakeClock([time]));
    assert.equal(result.createdAt, time);
    assert.equal(result.updatedAt, time);
  }
});

for (const stage of ['transaction', 'get', 'list', 'create', 'commit'] as const) {
  test(`store ${stage} failures propagate unchanged without a committed create`, async () => {
    const { store, reader, clock } = setup();
    store.failAt = stage;
    await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => failure === store.failure);
    assert.equal(store.resources.get(uid)?.has(request.deckId), false);
    assert.deepEqual(store.committedCreates, []);
    assert.equal(store.commits, 0);
    assert.equal(store.queuedCreates.length, stage === 'commit' ? 1 : 0);
    assert.equal(clock.calls, stage === 'create' || stage === 'commit' ? 1 : 0);
    assert.deepEqual(reader.calls, [historicalVersion]);
  });
}

test('deeply frozen request, draft and canonical catalog remain unchanged', async () => {
  const trusted = freezeDeep(catalog());
  const beforeRequest = structuredClone(request);
  const beforeCatalog = structuredClone(trusted);
  const { store, reader, clock } = setup(0, trusted);
  await createPersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(request, beforeRequest);
  assert.deepEqual(trusted, beforeCatalog);
  assert.equal(Object.isFrozen(request.draft), true);
  assert.equal(Object.isFrozen(request.draft.entries), true);
  assert.equal(request.draft.entries.every(value => Object.isFrozen(value)), true);
});

test('the queued create is detached from every mutable request level', async () => {
  const mutable = { deckId: request.deckId, draft: { ...draft(), entries: [{ ...entry() }] } };
  const { store, reader, clock } = setup();
  await createPersonalDeck(uid, mutable, store, reader, clock);
  const queued = store.queuedCreates[0].resource;
  assert.notEqual(queued.draft, mutable.draft);
  assert.notEqual(queued.draft.entries, mutable.draft.entries);
  assert.notEqual(queued.draft.entries[0], mutable.draft.entries[0]);
  mutable.deckId = 'other-deck';
  mutable.draft.name = 'Changed input';
  mutable.draft.entries[0].revision = 999;
  assert.equal(queued.id, request.deckId);
  assert.equal(queued.draft.name, 'Meu Deck');
  assert.equal(queued.draft.entries[0].revision, 3);
});

test('the returned resource is detached from both request and queued create at every nested level', async () => {
  const { store, reader, clock } = setup();
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  const queued = store.queuedCreates[0].resource;
  assert.notEqual(result, queued);
  for (const otherDraft of [request.draft, queued.draft]) {
    assert.notEqual(result.draft, otherDraft);
    assert.notEqual(result.draft.entries, otherDraft.entries);
    for (const value of result.draft.entries) {
      assert.equal(otherDraft.entries.includes(value), false);
    }
  }
  (result as { version: number }).version = 99;
  (result.draft as { name: string }).name = 'Mutated return';
  (result.draft.entries[0] as { revision: number }).revision = 999;
  assert.equal(queued.version, 1);
  assert.equal(queued.draft.name, request.draft.name);
  assert.equal(queued.draft.entries[0].revision, 3);
  (queued.draft.entries[1] as { quantity: number }).quantity = 2;
  assert.equal(result.draft.entries[1].quantity, 1);
  assert.equal(request.draft.entries[0].quantity, 1);
});

test('mutating the input while awaiting the reader cannot change the already parsed intention', async () => {
  const mutable = { deckId: request.deckId, draft: { ...draft(), entries: [{ ...entry() }] } };
  const before = parsePersonalDeckDraft(mutable.draft);
  const { store, reader, clock } = setup();
  reader.beforeReturn = () => {
    mutable.deckId = 'changed-deck';
    mutable.draft.name = 'Changed while awaiting';
    mutable.draft.contentVersion = 'changed-history';
    mutable.draft.entries[0].revision = 999;
    mutable.draft.entries[0].quantity = 2;
  };
  const result = await createPersonalDeck(uid, mutable, store, reader, clock);
  assert.equal(result.id, request.deckId);
  assert.deepEqual(result.draft, before);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('callback replay rereads destination and capacity while reusing one catalog lookup and one trusted instant', async () => {
  const { store, reader } = setup(18);
  store.replaySnapshots = [{ destination: null, count: 18 }, { destination: null, count: 19 }];
  const clock = new FakeClock([trustedTime, '2026-10-18T12:00:00.000Z']);
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(store.reads.map(value => value.attempt), [0, 1]);
  assert.deepEqual(store.lists.map(value => value.attempt), [0, 1]);
  assert.deepEqual(store.lists.map(value => value.limit), [PERSONAL_DECK_LIMITS.maxDecks, PERSONAL_DECK_LIMITS.maxDecks]);
  assert.deepEqual(store.queuedCreates.map(value => value.resource.version), [1, 1]);
  assert.deepEqual(store.queuedCreates.map(value => value.resource.createdAt), [trustedTime, trustedTime]);
  assert.deepEqual(store.queuedCreates.map(value => value.resource.updatedAt), [trustedTime, trustedTime]);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.equal(store.commits, 1);
  assert.deepEqual(store.committedCreates, [store.queuedCreates[1].resource]);
  assert.deepEqual(result, store.queuedCreates[1].resource);
  assert.notEqual(result, store.queuedCreates[1].resource);
});

test('a replay from 19 to 20 observed decks fails capacity and discards the first queued create', async () => {
  const { store, reader, clock } = setup(19);
  store.replaySnapshots = [{ destination: null, count: 19 }, { destination: null, count: 20 }];
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), PersonalDeckCapacityError);
  assert.equal(store.reads.length, 2);
  assert.equal(store.lists.length, 2);
  assert.equal(store.queuedCreates.length, 1);
  assert.equal(store.queuedCreates[0].attempt, 0);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(store.resources.get(uid)?.has(request.deckId), false);
  assert.equal(store.resources.get(uid)?.size, 19);
  assert.equal(store.commits, 0);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
  // This simulated replay is not proof of 19 + two real concurrent creates never reaching 21.
});

test('a replay observing an existing destination fails already-exists without a second quota read or commit', async () => {
  const { store, reader, clock } = setup();
  store.replaySnapshots = [{ destination: null, count: 0 }, { destination: resource(), count: 1 }];
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), PersonalDeckAlreadyExistsError);
  assert.equal(store.reads.length, 2);
  assert.equal(store.lists.length, 1);
  assert.equal(store.queuedCreates.length, 1);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(store.resources.get(uid)?.has(request.deckId), false);
  assert.equal(store.commits, 0);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('a replay reconstructs the candidate from recognized intent rather than reusing a discarded mutable write', async () => {
  const { store, reader, clock } = setup();
  store.replaySnapshots = [{ destination: null, count: 0 }, { destination: null, count: 0 }];
  store.beforeReplay = () => {
    const discarded = store.queuedCreates[0].resource;
    (discarded as { version: number }).version = 999;
    (discarded.draft as { name: string }).name = 'Mutated discarded write';
    (discarded.draft.entries[0] as { revision: number }).revision = 999;
  };
  const result = await createPersonalDeck(uid, request, store, reader, clock);
  assert.equal(result.version, 1);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(request.draft));
  assert.notEqual(store.queuedCreates[0].resource, store.queuedCreates[1].resource);
  assert.notEqual(store.queuedCreates[0].resource.draft, store.queuedCreates[1].resource.draft);
  assert.notEqual(store.queuedCreates[0].resource.draft.entries[0], store.queuedCreates[1].resource.draft.entries[0]);
  assert.deepEqual(store.committedCreates, [store.queuedCreates[1].resource]);
  assert.equal(clock.calls, 1);
});

test('separate logical creates obtain separate instants while each resource starts at version one', async () => {
  const { store, reader } = setup();
  const later = '2026-10-17T13:00:00.456Z';
  const clock = new FakeClock([trustedTime, later]);
  const first = await createPersonalDeck(uid, request, store, reader, clock);
  const second = await createPersonalDeck(uid, { ...request, deckId: 'deck-b' }, store, reader, clock);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal(first.createdAt, trustedTime);
  assert.equal(second.createdAt, later);
  assert.equal(clock.calls, 2);
  assert.equal(store.commits, 2);
  assert.equal(store.resources.get(uid)?.size, 2);
});

test('repeating an already committed create returns already-exists instead of a no-op or conflict', async () => {
  const { store, reader, clock } = setup();
  const first = await createPersonalDeck(uid, request, store, reader, clock);
  await assert.rejects(createPersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckAlreadyExistsError);
    assert.equal(failure instanceof PersonalDeckConflictError, false);
    return true;
  });
  assert.equal(store.commits, 1);
  assert.equal(store.queuedCreates.length, 1);
  assert.equal(store.lists.length, 1);
  assert.equal(clock.calls, 1);
  assert.equal(store.resources.get(uid)?.get(first.id)?.version, 1);
});

test('historical reference validation precedes an otherwise already-existing destination', async () => {
  const { store, reader, clock } = setup(0, catalog(), resource());
  await assert.rejects(createPersonalDeck(uid, { ...request, draft: draft({ entries: [entry('unknown-card')] }) },
    store, reader, clock), contentFailure('unknown-card'));
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});
