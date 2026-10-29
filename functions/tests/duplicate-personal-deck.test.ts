import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameplayDeckCatalog, GameplayDeckEntry, PersonalDeckDraft, PersonalDeckResource } from '../src/gameplay';
import {
  GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckResource,
} from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckClockError, PersonalDeckConflictError,
  PersonalDeckContentError, PersonalDeckContentUnavailableError, PersonalDeckNotFoundError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckReadLimit, PersonalDeckStore, PersonalDeckStoreTransaction } from '../src/decks/personal-deck-store';
import { duplicatePersonalDeck } from '../src/decks/duplicate-personal-deck';

const uid = 'backend-verified-42';
const trustedTime = '2026-10-17T12:00:00.123Z';
const historicalVersion = 'historical-v1';
const request = Object.freeze({ sourceDeckId: 'source-a', expectedSourceVersion: 7, newDeckId: 'copy-b' });

function entry(cardId = 'card-a', revision = 3, quantity = 1): GameplayDeckEntry {
  return { cardId, revision, quantity };
}

function draft(overrides: Partial<PersonalDeckDraft> = {}): PersonalDeckDraft {
  return {
    name: 'Meu Deck', rulesVersion: '0.1', contentVersion: historicalVersion,
    entries: [entry('card-a', 3, 2), entry('card-z', 8)], ...overrides,
  };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

type ResourceOverrides = Partial<Omit<PersonalDeckResource, 'draft'>> & { draft?: Partial<PersonalDeckDraft> };

function resource(overrides: ResourceOverrides = {}): PersonalDeckResource {
  return freezeDeep(parsePersonalDeckResource({
    id: request.sourceDeckId, version: 7,
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T11:00:00.000Z',
    ...overrides, draft: draft(overrides.draft),
  }));
}

function catalog(
  entries: readonly GameplayDeckEntry[] = draft().entries,
  contentVersion = historicalVersion, eligible = true,
): GameplayDeckCatalog {
  return {
    rulesVersion: '0.1', contentVersion,
    cards: entries.map(({ cardId, revision }) => ({
      definition: { kind: 'unit', cardId, revision, cost: 1, power: 2, maxLife: 3, guard: false }, eligible,
    })),
  };
}

type FailureStage = 'transaction' | 'get-source' | 'get-destination' | 'list' | 'create' | 'commit';
interface CreationSnapshot {
  readonly source: PersonalDeckResource | null;
  readonly destination: PersonalDeckResource | null;
  readonly count: number;
}

/** Local callback replays exercise decisions and discarded writes, never real database isolation or quota. */
class MemoryDeckStore implements PersonalDeckStore {
  readonly resources = new Map<string, Map<string, PersonalDeckResource>>();
  readonly uids: string[] = [];
  readonly reads: { uid: string; deckId: string; phase: number; attempt: number }[] = [];
  readonly lists: { uid: string; limit: PersonalDeckReadLimit; phase: number; attempt: number }[] = [];
  readonly queuedCreates: { uid: string; resource: PersonalDeckResource; attempt: number }[] = [];
  readonly committedCreates: PersonalDeckResource[] = [];
  readonly completedPhases: number[] = [];
  readonly events: string[] = [];
  readonly failure = new Error('private store failure sentinel');
  discoverySources?: readonly (PersonalDeckResource | null)[];
  creationSnapshots?: readonly CreationSnapshot[];
  beforeReplay?: (phase: number, attempt: number) => void;
  failAt?: { phase: number; stage: FailureStage };
  inCallback = false;
  replaceCalls = 0;
  deleteCalls = 0;

  constructor(readonly source: PersonalDeckResource | null = resource(), public count = 1,
    readonly destination: PersonalDeckResource | null = null, ownerUid = uid) {
    const initial = new Map<string, PersonalDeckResource>();
    if (source) initial.set(source.id, source);
    if (destination) initial.set(destination.id, destination);
    this.resources.set(ownerUid, initial);
  }

  async runTransaction<T>(ownerUid: string, action: (transaction: PersonalDeckStoreTransaction) => Promise<T>): Promise<T> {
    const phase = this.uids.length % 2;
    this.uids.push(ownerUid);
    this.events.push(`transaction:${phase}`);
    const fail = (stage: FailureStage): void => {
      if (this.failAt?.phase === phase && this.failAt.stage === stage) throw this.failure;
    };
    fail('transaction');
    const attempts = phase === 0 ? this.discoverySources?.length ?? 1 : this.creationSnapshots?.length ?? 1;
    let result!: T;
    let finalPending: PersonalDeckResource[] = [];
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) this.beforeReplay?.(phase, attempt);
      const pending: PersonalDeckResource[] = [];
      const snapshot = phase === 1 ? this.creationSnapshots?.[attempt] : undefined;
      let wrote = false;
      this.inCallback = true;
      try {
        result = await action({
          get: async deckId => {
            assert.equal(wrote, false, 'every get must precede create');
            assert.ok(deckId === request.sourceDeckId || phase === 1, 'discovery reads only the source');
            this.events.push(`get:${deckId}`);
            this.reads.push({ uid: ownerUid, deckId, phase, attempt });
            const sourceRead = deckId === request.sourceDeckId;
            fail(sourceRead ? 'get-source' : 'get-destination');
            if (phase === 0 && this.discoverySources) return this.discoverySources[attempt];
            if (snapshot) return sourceRead ? snapshot.source : snapshot.destination;
            return this.resources.get(ownerUid)?.get(deckId) ?? null;
          },
          list: async limit => {
            assert.equal(phase, 1, 'discovery must not query capacity');
            assert.equal(wrote, false, 'list must precede create');
            this.events.push(`list:${limit}`);
            this.lists.push({ uid: ownerUid, limit, phase, attempt });
            fail('list');
            // Simulate bounded snapshot lengths, including zero, independently of a real query's consistency.
            return Array.from({ length: Math.min(snapshot?.count ?? this.count, limit) }, (_, index) =>
              resource({ id: `observed-${index}` }));
          },
          create: value => {
            assert.equal(phase, 1, 'discovery must never write');
            assert.equal(wrote, false, 'duplicate queues exactly one creation per attempt');
            this.events.push(`create:${value.id}`);
            fail('create');
            wrote = true;
            pending.push(value);
            this.queuedCreates.push({ uid: ownerUid, resource: value, attempt });
          },
          replace: () => { this.replaceCalls++; throw new Error('Unexpected replace in duplicate'); },
          delete: () => { this.deleteCalls++; throw new Error('Unexpected delete in duplicate'); },
        });
      } finally {
        this.inCallback = false;
      }
      // The result and writes from earlier successful callbacks are discarded on a retry.
      finalPending = pending;
    }
    fail('commit');
    const current = this.resources.get(ownerUid)!;
    for (const value of finalPending) {
      assert.equal(current.has(value.id), false, 'create must enforce absence at commit');
      current.set(value.id, value);
      this.committedCreates.push(value);
      this.count++;
    }
    this.completedPhases.push(phase);
    this.events.push(`commit:${phase}`);
    return result;
  }
}

class FakeCatalogReader implements PersonalDeckCatalogReader {
  readonly calls: string[] = [];
  failure?: unknown;
  beforeReturn?: () => void;

  constructor(readonly store: MemoryDeckStore, readonly value: GameplayDeckCatalog | null = catalog()) {}

  async get(contentVersion: string): Promise<GameplayDeckCatalog | null> {
    assert.equal(this.store.inCallback, false, 'historical catalog I/O must stay outside transaction callbacks');
    this.calls.push(contentVersion);
    this.store.events.push(`catalog:${contentVersion}`);
    if (this.failure !== undefined) throw this.failure;
    this.beforeReturn?.();
    return this.value;
  }
}

class FakeClock implements PersonalDeckClock {
  calls = 0;
  failure?: unknown;

  constructor(readonly values: readonly unknown[] = [trustedTime], readonly store?: MemoryDeckStore) {}

  now(): string {
    this.calls++;
    this.store?.events.push('clock');
    if (this.store) {
      assert.equal(this.store.inCallback, true);
      assert.equal(this.store.uids.length % 2, 0, 'discovery must not read the clock');
    }
    if (this.failure !== undefined) throw this.failure;
    return this.values[this.calls - 1] as string;
  }
}

function setup(source: PersonalDeckResource | null = resource(), count = 1,
  trusted: GameplayDeckCatalog | null = catalog(), destination: PersonalDeckResource | null = null) {
  const store = new MemoryDeckStore(source, count, destination);
  return { store, reader: new FakeCatalogReader(store, trusted), clock: new FakeClock([trustedTime], store) };
}

function assertNoWrite(store: MemoryDeckStore): void {
  assert.deepEqual(store.queuedCreates, []);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(store.replaceCalls, 0);
  assert.equal(store.deleteCalls, 0);
}

function contentFailure(reason: PersonalDeckContentError['reason']): (failure: unknown) => boolean {
  return failure => failure instanceof PersonalDeckContentError && failure.reason === reason;
}

test('duplicate creates the same normalized draft under the requested ID with fresh version and trusted dates', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  const expected = { id: request.newDeckId, version: 1, draft: original.draft,
    createdAt: trustedTime, updatedAt: trustedTime };
  assert.deepEqual(result, expected);
  assert.deepEqual(parsePersonalDeckResource(result), result);
  assert.deepEqual(store.committedCreates, [expected]);
  assert.deepEqual(store.completedPhases, [0, 1]);
  assert.equal(store.resources.get(uid)?.get(request.sourceDeckId), original);
  assert.equal(original.version, 7);
  assert.notEqual(result.createdAt, original.createdAt);
  assert.notEqual(result.updatedAt, original.updatedAt);
  assert.equal(result.createdAt, result.updatedAt);
  assert.equal(store.replaceCalls, 0);
  assert.equal(store.deleteCalls, 0);
});

test('duplicate discovers read-only, resolves history between phases, then reads source, destination and bounded capacity before create', async () => {
  const { store, reader, clock } = setup();
  await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(store.events, [
    'transaction:0', `get:${request.sourceDeckId}`, 'commit:0', `catalog:${historicalVersion}`,
    'transaction:1', `get:${request.sourceDeckId}`, `get:${request.newDeckId}`,
    `list:${PERSONAL_DECK_LIMITS.maxDecks}`, 'clock', `create:${request.newDeckId}`, 'commit:1',
  ]);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.equal(clock.calls, 1);
});

test('both phases use only the trusted backend UID and preserve another owner resources', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const other = resource({ version: 19 });
  store.resources.set('other-user', new Map([[other.id, other]]));
  await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(store.uids, [uid, uid]);
  assert.ok(store.reads.every(value => value.uid === uid));
  assert.ok(store.lists.every(value => value.uid === uid));
  assert.ok(store.queuedCreates.every(value => value.uid === uid));
  assert.equal(store.resources.get('other-user')?.get(other.id), other);
  assert.equal(store.resources.get('other-user')?.has(request.newDeckId), false);
});

test('invalid duplicate payloads fail before store, catalog or clock I/O', async () => {
  const invalid: unknown[] = [undefined, null, [], 'deck-a', {},
    { sourceDeckId: request.sourceDeckId }, { ...request, sourceDeckId: request.newDeckId },
    ...['sourceDeckId', 'newDeckId'].flatMap(field => ['', ' ', 'users/other/decks/a', 'a'.repeat(129), 1, null]
      .map(value => ({ ...request, [field]: value }))),
    ...[undefined, null, '7', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(expectedSourceVersion => ({ ...request, expectedSourceVersion })),
  ];
  for (const value of invalid) {
    const { store, reader, clock } = setup();
    await assert.rejects(duplicatePersonalDeck(uid, value, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(reader.calls, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('client ownership, version, timestamps, alternate name, draft and bypass flags are rejected before I/O', async () => {
  const fields = {
    uid: 'other', ownerUid: 'other', ownership: [], version: 1, expectedVersion: 7,
    createdAt: trustedTime, updatedAt: trustedTime, name: 'Alternative', draft: draft(),
    force: true, overwrite: true, ignoreVersion: true, isPlayable: true, isValid: true,
    catalog: catalog(), activeVersion: 'active-v2', now: trustedTime,
  };
  for (const [field, value] of Object.entries(fields)) {
    const { store, reader, clock } = setup();
    await assert.rejects(duplicatePersonalDeck(uid, { ...request, [field]: value }, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(reader.calls, []);
    assert.equal(clock.calls, 0);
  }
});

test('request accessors, symbols, hidden fields and inherited payloads are rejected without getter execution', async () => {
  let getters = 0;
  const invalid: unknown[] = [Object.assign(Object.create({ inherited: true }) as object, request),
    { ...request, [Symbol('hidden')]: true }, Object.defineProperty({ ...request }, 'force', { value: true })];
  for (const field of ['sourceDeckId', 'newDeckId', 'expectedSourceVersion', 'force']) {
    invalid.push(Object.defineProperty({ ...request }, field, {
      enumerable: true, get: () => { getters++; throw new Error('client getter must not execute'); },
    }));
  }
  for (const value of invalid) {
    const { store, reader, clock } = setup();
    await assert.rejects(duplicatePersonalDeck(uid, value, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(reader.calls, []);
    assert.equal(clock.calls, 0);
  }
  assert.equal(getters, 0);
});

test('missing discovered source fails before catalog, destination, capacity or clock', async () => {
  const { store, reader, clock } = setup(null, 0);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckNotFoundError);
  assert.deepEqual(store.events, ['transaction:0', `get:${request.sourceDeckId}`]);
  assert.deepEqual(reader.calls, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('either direction of discovered source version mismatch fails before catalog or phase two', async () => {
  for (const version of [1, 6, 8, Number.MAX_SAFE_INTEGER]) {
    const { store, reader, clock } = setup(resource({ version }));
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
    assert.deepEqual(reader.calls, []);
    assert.deepEqual(store.uids, [uid]);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('discovery validates its source projection before resolving historical content', async () => {
  const malformed = { ...resource(), draft: { ...draft(), entries: [entry('card-a', 3, 3)] } } as PersonalDeckResource;
  const { store, reader, clock } = setup(malformed);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), GameplayContractError);
  assert.deepEqual(reader.calls, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('historical catalog absence fails after discovery and before authoritative creation', async () => {
  const { store, reader, clock } = setup(resource(), 1, null);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckContentUnavailableError);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.deepEqual(store.completedPhases, [0]);
  assert.deepEqual(store.uids, [uid]);
  assert.deepEqual(store.lists, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('historical reader failures propagate unchanged after discovery with no phase-two side effects', async () => {
  const { store, reader, clock } = setup();
  reader.failure = new Error('private historical reader sentinel');
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), failure => failure === reader.failure);
  assert.deepEqual(store.uids, [uid]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('the reader receives exactly the source historical version without active catalog fallback', async () => {
  const chosen = 'history-v42';
  const original = resource({ draft: { contentVersion: chosen } });
  const { store, reader, clock } = setup(original, 1, catalog(undefined, chosen));
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(reader.calls, [chosen]);
  assert.equal(result.draft.contentVersion, chosen);
  assert.deepEqual(result.draft.entries, original.draft.entries);
});

test('an unknown historical card is rejected before destination and capacity reads', async () => {
  const original = resource({ draft: { entries: [entry('unknown-card')] } });
  const { store, reader, clock } = setup(original);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), contentFailure('unknown-card'));
  assert.deepEqual(store.uids, [uid]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('an invalid historical revision fails without silently migrating the source reference', async () => {
  const original = resource({ draft: { entries: [entry('card-a', 2, 2)] } });
  const { store, reader, clock } = setup(original);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), contentFailure('revision'));
  assert.deepEqual(original.draft.entries, [entry('card-a', 2, 2)]);
  assert.deepEqual(store.uids, [uid]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('a catalog with another historical version is rejected without adapting provenance', async () => {
  const { store, reader, clock } = setup(resource(), 1, catalog(undefined, 'other-history'));
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), contentFailure('content-version'));
  assert.deepEqual(store.uids, [uid]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('malformed catalog rules and unused canonical definitions remain contract failures', async () => {
  const valid = catalog();
  const invalid = [
    { ...valid, rulesVersion: '0.2' },
    { ...valid, cards: [...valid.cards, { definition: { ...valid.cards[0].definition, cardId: 'unused', cost: -1 }, eligible: true }] },
  ];
  for (const value of invalid) {
    const { store, reader, clock } = setup(resource(), 1, value as unknown as GameplayDeckCatalog);
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.uids, [uid]);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('historically recognized eligible=false references remain duplicable without ownership or publication dependencies', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original, 1, catalog(undefined, historicalVersion, false));
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft, original.draft);
  assert.deepEqual(Object.keys(result).sort(), ['createdAt', 'draft', 'id', 'updatedAt', 'version']);
  assert.equal('isPlayable' in result, false);
  assert.equal('isValid' in result, false);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('empty drafts and empty historical catalogs can be duplicated', async () => {
  const original = resource({ draft: { entries: [] } });
  const { store, reader, clock } = setup(original, 1, catalog([]));
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft.entries, []);
  assert.equal(result.draft.name, original.draft.name);
});

test('an incomplete draft retains its exact quantities without requiring 24 cards', async () => {
  const original = resource({ draft: { entries: [entry('card-a', 3, 2)] } });
  const { store, reader, clock } = setup(original);
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft.entries, original.draft.entries);
  assert.equal(result.draft.entries.reduce((sum, value) => sum + value.quantity, 0), 2);
});

test('a full 24-card draft preserves every pinned identity, revision and quantity', async () => {
  const entries = Array.from({ length: 12 }, (_, index) => entry(`card-${index}`, index + 1, 2));
  const original = resource({ draft: { entries } });
  const { store, reader, clock } = setup(original, 1, catalog(entries));
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft, original.draft);
  assert.equal(result.draft.entries.reduce((sum, value) => sum + value.quantity, 0), PERSONAL_DECK_LIMITS.maxCards);
});

test('the largest safe source version is accepted without increment or version exhaustion', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER });
  const { store, reader, clock } = setup(original);
  const result = await duplicatePersonalDeck(uid, { ...request, expectedSourceVersion: original.version }, store, reader, clock);
  assert.equal(result.version, 1);
  assert.equal(original.version, Number.MAX_SAFE_INTEGER);
  assert.equal(store.resources.get(uid)?.get(original.id), original);
});

test('an existing destination fails before capacity, clock and creation without overwrite or no-op', async () => {
  const destination = resource({ id: request.newDeckId });
  const { store, reader, clock } = setup(resource(), 20, catalog(), destination);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckAlreadyExistsError);
  assert.deepEqual(store.lists, []);
  assert.equal(clock.calls, 0);
  assert.equal(store.resources.get(uid)?.get(destination.id), destination);
  assertNoWrite(store);
});

test('bounded capacity observations of zero and nineteen permit one creation', async () => {
  for (const count of [0, 19]) {
    const { store, reader, clock } = setup(resource(), count);
    const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
    assert.equal(result.version, 1);
    assert.deepEqual(store.lists, [{ uid, limit: PERSONAL_DECK_LIMITS.maxDecks, phase: 1, attempt: 0 }]);
    assert.equal(store.committedCreates.length, 1);
    assert.equal(clock.calls, 1);
  }
});

test('twenty decks exhaust capacity before reading time or queuing a creation', async () => {
  const { store, reader, clock } = setup(resource(), PERSONAL_DECK_LIMITS.maxDecks);
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckCapacityError);
  assert.deepEqual(store.lists, [{ uid, limit: PERSONAL_DECK_LIMITS.maxDecks, phase: 1, attempt: 0 }]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('the capacity check counts empty and historically ineligible saved drafts without filtering', async () => {
  const original = resource({ draft: { entries: [] } });
  const { store, reader, clock } = setup(original, 20, catalog([], historicalVersion, false));
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckCapacityError);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('source disappearance between discovery and creation is not-found before destination or capacity', async () => {
  const { store, reader, clock } = setup();
  store.creationSnapshots = [{ source: null, destination: null, count: 1 }];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckNotFoundError);
  assert.deepEqual(store.reads.map(value => value.deckId), [request.sourceDeckId, request.sourceDeckId]);
  assert.deepEqual(store.lists, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('source version change between phases conflicts even when the draft is unchanged', async () => {
  const { store, reader, clock } = setup();
  store.creationSnapshots = [{ source: resource({ version: 8 }), destination: null, count: 1 }];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
  assert.deepEqual(store.reads.map(value => value.deckId), [request.sourceDeckId, request.sourceDeckId]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('every valid same-version draft difference between phases conflicts before reading the destination', async () => {
  const changed: Partial<PersonalDeckDraft>[] = [
    { name: 'Changed' }, { contentVersion: 'history-v2' }, { entries: [] },
    { entries: [entry('card-a', 3), entry('card-z', 8)] },
    { entries: [entry('card-a', 4, 2), entry('card-z', 8)] },
    { entries: [entry('card-b', 3, 2), entry('card-z', 8)] },
  ];
  for (const replacement of changed) {
    const { store, reader, clock } = setup();
    store.creationSnapshots = [{ source: resource({ draft: replacement }), destination: null, count: 1 }];
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
    assert.deepEqual(store.reads.map(value => value.deckId), [request.sourceDeckId, request.sourceDeckId]);
    assert.deepEqual(store.lists, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('the second source draft is compared after existing normalization rather than raw entry order or whitespace', async () => {
  const original = resource();
  const equivalent = { ...original, draft: { ...original.draft, name: ' \tMeu Deck\n ',
    entries: [entry('card-z', 8), entry(), entry()] } };
  const { store, reader, clock } = setup(original);
  store.creationSnapshots = [{ source: equivalent, destination: null, count: 1 }];
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft, original.draft);
});

test('metadata changes alone at the same source version do not change the validated draft or copied timestamps', async () => {
  const { store, reader, clock } = setup();
  store.creationSnapshots = [{ source: resource({
    createdAt: '2026-10-17T09:00:00.000Z', updatedAt: '2026-10-17T11:30:00.000Z',
  }), destination: null, count: 1 }];
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.equal(result.createdAt, trustedTime);
  assert.equal(result.updatedAt, trustedTime);
  assert.deepEqual(result.draft, resource().draft);
});

test('invalid trusted clock values produce only clock errors after all required reads and before create', async () => {
  const values: unknown[] = [undefined, null, 42, {}, new Date(trustedTime), '', 'now',
    '2026-10-17T12:00:00Z', '2026-10-17T12:00:00.12Z', '2026-10-17T12:00:00.1234Z',
    '2026-10-17T12:00:00.123+00:00', ' 2026-10-17T12:00:00.123Z ',
    '0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z',
    '2026-02-29T12:00:00.000Z', '2026-04-31T12:00:00.000Z',
    '2026-10-17T24:00:00.000Z', '2026-10-17T12:60:00.000Z', '2026-10-17T12:00:60.000Z'];
  for (const value of values) {
    const { store, reader } = setup();
    const clock = new FakeClock([value], store);
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), failure =>
      failure instanceof PersonalDeckClockError && !(failure instanceof GameplayContractError));
    assert.equal(store.reads.length, 3);
    assert.equal(store.lists.length, 1);
    assert.equal(clock.calls, 1);
    assertNoWrite(store);
  }
});

test('canonical leap-day and year-boundary timestamps remain valid new-resource times', async () => {
  for (const time of ['0001-01-01T00:00:00.000Z', '2028-02-29T12:34:56.789Z', '9999-12-31T23:59:59.999Z']) {
    const { store, reader } = setup();
    const result = await duplicatePersonalDeck(uid, request, store, reader, new FakeClock([time], store));
    assert.equal(result.createdAt, time);
    assert.equal(result.updatedAt, time);
  }
});

test('a throwing clock becomes a minimal domain clock error without leaking its cause', async () => {
  const { store, reader, clock } = setup();
  clock.failure = new Error('private clock diagnostic sentinel');
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckClockError);
    assert.notEqual(failure, clock.failure);
    assert.equal(failure.message.includes('private clock diagnostic sentinel'), false);
    assert.equal(Object.hasOwn(failure, 'cause'), false);
    return true;
  });
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('transaction start, reads and completion failures in discovery propagate intact without catalog I/O', async () => {
  for (const stage of ['transaction', 'get-source', 'commit'] as const) {
    const { store, reader, clock } = setup();
    store.failAt = { phase: 0, stage };
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), failure => failure === store.failure);
    assert.deepEqual(reader.calls, []);
    assert.deepEqual(store.completedPhases, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('authoritative store start, source/destination reads, list, create and commit failures propagate intact', async () => {
  for (const stage of ['transaction', 'get-source', 'get-destination', 'list', 'create', 'commit'] as const) {
    const original = resource();
    const { store, reader, clock } = setup(original);
    store.failAt = { phase: 1, stage };
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), failure => failure === store.failure);
    assert.deepEqual(store.completedPhases, [0]);
    assert.deepEqual(store.committedCreates, []);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.equal(store.resources.get(uid)?.has(request.newDeckId), false);
    assert.equal(store.queuedCreates.length, stage === 'commit' ? 1 : 0);
    assert.equal(clock.calls, stage === 'create' || stage === 'commit' ? 1 : 0);
    assert.deepEqual(reader.calls, [historicalVersion]);
  }
});

test('frozen request, original source and historical catalog stay unchanged after duplication', async () => {
  const original = resource();
  const trusted = freezeDeep(catalog());
  const before = structuredClone({ original, trusted, request });
  const { store, reader, clock } = setup(original, 1, trusted);
  await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual({ original, trusted, request }, before);
  assert.equal(Object.isFrozen(original.draft.entries), true);
  assert.ok(original.draft.entries.every(Object.isFrozen));
});

test('result, source, queued creation and nested entries are independent in both mutation directions', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  const queued = store.queuedCreates[0].resource;
  for (const other of [original, queued]) {
    assert.notEqual(result, other);
    assert.notEqual(result.draft, other.draft);
    assert.notEqual(result.draft.entries, other.draft.entries);
    result.draft.entries.forEach((value, index) => assert.notEqual(value, other.draft.entries[index]));
  }
  assert.notEqual(queued.draft, original.draft);
  assert.notEqual(queued.draft.entries[0], original.draft.entries[0]);
  (result as { version: number }).version = 99;
  (result.draft as { name: string }).name = 'Mutated return';
  (result.draft.entries[0] as { revision: number }).revision = 999;
  assert.equal(queued.version, 1);
  assert.equal(queued.draft.name, original.draft.name);
  assert.equal(queued.draft.entries[0].revision, 3);
  (queued.draft.entries[1] as { quantity: number }).quantity = 2;
  assert.equal(result.draft.entries[1].quantity, 1);
  assert.equal(original.draft.entries[1].quantity, 1);
});

test('mutating the client request during historical I/O cannot change parsed IDs or expected source version', async () => {
  const mutable: { sourceDeckId: string; expectedSourceVersion: number; newDeckId: string } = { ...request };
  const { store, reader, clock } = setup();
  reader.beforeReturn = () => {
    mutable.sourceDeckId = 'other-source';
    mutable.newDeckId = 'other-destination';
    mutable.expectedSourceVersion = 999;
  };
  const result = await duplicatePersonalDeck(uid, mutable, store, reader, clock);
  assert.equal(result.id, request.newDeckId);
  assert.deepEqual(store.reads.map(value => value.deckId), [request.sourceDeckId, request.sourceDeckId, request.newDeckId]);
});

test('discovery returns a detached validated projection rather than retaining its mutable source object', async () => {
  const original = resource();
  const mutable = structuredClone(original);
  const { store, reader, clock } = setup(original);
  store.discoverySources = [mutable];
  reader.beforeReturn = () => {
    (mutable.draft as { name: string }).name = 'Mutated projection source';
    (mutable.draft as { contentVersion: string }).contentVersion = 'different-history';
    (mutable.draft.entries[0] as { revision: number }).revision = 999;
  };
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft, original.draft);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('discovery replay uses only its final read projection and performs historical I/O once after all callbacks', async () => {
  const finalSource = resource({ draft: { name: 'Final discovery', contentVersion: 'history-final' } });
  const { store, reader, clock } = setup(finalSource, 1, catalog(undefined, 'history-final'));
  store.discoverySources = [resource(), finalSource];
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.equal(result.draft.name, finalSource.draft.name);
  assert.deepEqual(reader.calls, ['history-final']);
  assert.deepEqual(store.reads.filter(value => value.phase === 0).map(value => value.attempt), [0, 1]);
  assert.equal(store.events.filter(value => value.startsWith('catalog:')).length, 1);
  assert.equal(clock.calls, 1);
});

test('a discovered source version change on replay aborts before catalog and leaves no writes', async () => {
  const { store, reader, clock } = setup();
  store.discoverySources = [resource(), resource({ version: 8 })];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
  assert.deepEqual(store.completedPhases, []);
  assert.deepEqual(reader.calls, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('source deletion on discovery replay fails without resolving history or starting phase two', async () => {
  const { store, reader, clock } = setup();
  store.discoverySources = [resource(), null];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckNotFoundError);
  assert.deepEqual(store.uids, [uid]);
  assert.deepEqual(reader.calls, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('successful creation replay rereads all preconditions, reuses one clock instant and commits only its final candidate', async () => {
  const original = resource();
  const { store, reader } = setup(original, 18);
  store.creationSnapshots = [
    { source: original, destination: null, count: 18 }, { source: original, destination: null, count: 19 },
  ];
  const clock = new FakeClock([trustedTime, '2026-10-18T12:00:00.000Z'], store);
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(store.reads.filter(value => value.phase === 1).map(value => [value.deckId, value.attempt]), [
    [request.sourceDeckId, 0], [request.newDeckId, 0], [request.sourceDeckId, 1], [request.newDeckId, 1],
  ]);
  assert.deepEqual(store.lists.map(value => value.attempt), [0, 1]);
  assert.deepEqual(store.queuedCreates.map(value => value.resource.version), [1, 1]);
  assert.deepEqual(store.queuedCreates.map(value => value.resource.createdAt), [trustedTime, trustedTime]);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.equal(clock.calls, 1);
  assert.deepEqual(store.committedCreates, [store.queuedCreates[1].resource]);
  assert.notEqual(store.committedCreates[0], store.queuedCreates[0].resource);
  assert.equal(store.resources.get(uid)?.get(request.newDeckId), store.queuedCreates[1].resource);
  assert.notEqual(result, store.queuedCreates[1].resource);
  assert.equal(store.resources.get(uid)?.get(original.id), original);
});

test('creation replay rebuilds candidates without aliases to mutable objects from discarded attempts', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  store.creationSnapshots = [
    { source: original, destination: null, count: 1 }, { source: original, destination: null, count: 1 },
  ];
  store.beforeReplay = phase => {
    assert.equal(phase, 1);
    const discarded = store.queuedCreates[0].resource;
    (discarded as { id: string; version: number }).id = 'discarded-id';
    (discarded as { version: number }).version = 99;
    (discarded.draft as { name: string }).name = 'Discarded name';
    (discarded.draft.entries[0] as { revision: number }).revision = 999;
    (discarded.draft.entries as GameplayDeckEntry[]).pop();
  };
  const result = await duplicatePersonalDeck(uid, request, store, reader, clock);
  const [discarded, final] = store.queuedCreates.map(value => value.resource);
  assert.deepEqual(result.draft, original.draft);
  assert.equal(result.id, request.newDeckId);
  assert.equal(result.version, 1);
  assert.notEqual(final, discarded);
  assert.notEqual(final.draft, discarded.draft);
  assert.notEqual(final.draft.entries, discarded.draft.entries);
  assert.notEqual(final.draft.entries[0], discarded.draft.entries[0]);
  assert.deepEqual(store.committedCreates, [final]);
  assert.equal(store.resources.get(uid)?.has('discarded-id'), false);
  assert.equal(clock.calls, 1);
});

test('capacity increasing from nineteen to twenty on creation replay aborts the discarded creation', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original, 19);
  store.creationSnapshots = [
    { source: original, destination: null, count: 19 }, { source: original, destination: null, count: 20 },
  ];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckCapacityError);
  assert.equal(store.queuedCreates.length, 1);
  assert.equal(store.queuedCreates[0].attempt, 0);
  assert.deepEqual(store.committedCreates, []);
  assert.deepEqual(store.completedPhases, [0]);
  assert.equal(store.resources.get(uid)?.has(request.newDeckId), false);
  assert.equal(store.lists.length, 2);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('destination appearance on creation replay aborts before another capacity or clock read', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  store.creationSnapshots = [
    { source: original, destination: null, count: 1 },
    { source: original, destination: resource({ id: request.newDeckId }), count: 2 },
  ];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckAlreadyExistsError);
  assert.equal(store.queuedCreates.length, 1);
  assert.equal(store.lists.length, 1);
  assert.equal(clock.calls, 1);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(store.resources.get(uid)?.has(request.newDeckId), false);
});

test('same-version source draft modification on creation replay conflicts before another destination read', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  store.creationSnapshots = [
    { source: original, destination: null, count: 1 },
    { source: resource({ draft: { name: 'Modified during retry' } }), destination: null, count: 1 },
  ];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
  assert.equal(store.reads.filter(value => value.deckId === request.newDeckId).length, 1);
  assert.equal(store.queuedCreates.length, 1);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('source version change on creation replay conflicts and prevents the first queued write from committing', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  store.creationSnapshots = [
    { source: original, destination: null, count: 1 },
    { source: resource({ version: 8 }), destination: null, count: 1 },
  ];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
  assert.equal(store.queuedCreates.length, 1);
  assert.deepEqual(store.committedCreates, []);
  assert.deepEqual(store.completedPhases, [0]);
  assert.equal(store.resources.get(uid)?.has(request.newDeckId), false);
  assert.equal(store.reads.filter(value => value.deckId === request.newDeckId).length, 1);
  assert.equal(clock.calls, 1);
});

test('source deletion on creation replay becomes not-found and discards the first creation', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  store.creationSnapshots = [
    { source: original, destination: null, count: 1 }, { source: null, destination: null, count: 0 },
  ];
  await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), PersonalDeckNotFoundError);
  assert.equal(store.queuedCreates.length, 1);
  assert.deepEqual(store.committedCreates, []);
  assert.equal(store.lists.length, 1);
  assert.equal(clock.calls, 1);
});

test('a new logical duplicate obtains a new clock instant while preserving the same source', async () => {
  const original = resource();
  const { store, reader } = setup(original);
  const later = '2026-10-17T13:00:00.456Z';
  const clock = new FakeClock([trustedTime, later], store);
  const first = await duplicatePersonalDeck(uid, request, store, reader, clock);
  const second = await duplicatePersonalDeck(uid, { ...request, newDeckId: 'copy-c' }, store, reader, clock);
  assert.equal(first.createdAt, trustedTime);
  assert.equal(second.createdAt, later);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal(clock.calls, 2);
  assert.deepEqual(reader.calls, [historicalVersion, historicalVersion]);
  assert.equal(store.committedCreates.length, 2);
  assert.equal(store.resources.get(uid)?.get(original.id), original);
});

test('domain failures expose generic messages and minimal codes without source, destination, UID or infrastructure context', async () => {
  const cases = [
    { source: null, count: 0, trusted: catalog(), destination: null, code: 'personal-deck-not-found' },
    { source: resource({ version: 8 }), count: 1, trusted: catalog(), destination: null, code: 'personal-deck-conflict' },
    { source: resource(), count: 1, trusted: null, destination: null, code: 'personal-deck-content-unavailable' },
    { source: resource(), count: 1, trusted: catalog([]), destination: null, code: 'personal-deck-content' },
    { source: resource(), count: 2, trusted: catalog(), destination: resource({ id: request.newDeckId }), code: 'personal-deck-already-exists' },
    { source: resource(), count: 20, trusted: catalog(), destination: null, code: 'personal-deck-capacity-exceeded' },
  ];
  for (const value of cases) {
    const { store, reader, clock } = setup(value.source, value.count, value.trusted, value.destination);
    await assert.rejects(duplicatePersonalDeck(uid, request, store, reader, clock), failure => {
      assert.ok(failure instanceof Error);
      assert.equal((failure as Error & { code: string }).code, value.code);
      for (const sensitive of [uid, request.sourceDeckId, request.newDeckId, historicalVersion, 'firestore', 'users/']) {
        assert.equal(failure.message.includes(sensitive), false);
        assert.equal(JSON.stringify(failure).includes(sensitive), false);
      }
      assert.equal(Object.hasOwn(failure, 'cause'), false);
      assert.equal(Object.hasOwn(failure, 'context'), false);
      return true;
    });
  }
});
