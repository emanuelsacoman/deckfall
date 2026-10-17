import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameplayDeckCatalog, GameplayDeckEntry, PersonalDeckDraft, PersonalDeckResource } from '../src/gameplay';
import { GameplayContractError, parsePersonalDeckDraft, parsePersonalDeckResource } from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import {
  PersonalDeckClockError, PersonalDeckConflictError, PersonalDeckContentError, PersonalDeckContentUnavailableError,
  PersonalDeckDomainError, PersonalDeckNotFoundError, PersonalDeckVersionExhaustedError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckStore, PersonalDeckStoreTransaction } from '../src/decks/personal-deck-store';
import { updatePersonalDeck } from '../src/decks/update-personal-deck';

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

type ResourceOverrides = Partial<Omit<PersonalDeckResource, 'draft'>> & { draft?: Partial<PersonalDeckDraft> };

/** The store contract supplies normalized resources, rather than arbitrary persisted rows. */
function resource(overrides: ResourceOverrides = {}): PersonalDeckResource {
  return freezeDeep(parsePersonalDeckResource({
    id: 'deck-a', version: 7,
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T11:00:00.000Z',
    ...overrides, draft: draft(overrides.draft),
  }));
}

const request = freezeDeep({
  deckId: 'deck-a', expectedVersion: 7,
  draft: draft({ name: 'Novo Deck', entries: [entry('card-z', 8), entry('card-a', 3, 2)] }),
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

type FailureStage = 'transaction' | 'get' | 'replace' | 'commit';

/** Local callback replay/queued writes exercise the port contract, not real database atomicity. */
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
        throw new Error(`Unexpected ${operation} in update`);
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
      // The final attempt alone can commit; prior writes and callback results are discarded.
      finalPending = pending;
    }
    if (this.failAt === 'commit') throw this.failure;
    for (const replacement of finalPending) this.resources.get(ownerUid)?.set(replacement.id, replacement);
    this.commits++;
    this.events.push('commit');
    return result;
  }
}

function setup(initial: PersonalDeckResource | null = resource(), trusted: GameplayDeckCatalog | null = catalog()) {
  const store = new MemoryDeckStore(initial);
  const reader = new FakeCatalogReader(trusted, store.events);
  const clock = new FakeClock([trustedTime], store.events);
  return { store, reader, clock };
}

function assertNoWrite(store: MemoryDeckStore): void {
  assert.deepEqual(store.queuedReplacements, []);
  assert.equal(store.commits, 0);
}

function contentFailure(reason: PersonalDeckContentError['reason']): (failure: unknown) => boolean {
  return failure => failure instanceof PersonalDeckContentError && failure.reason === reason;
}

test('update validates historical content before one resource transaction and replaces the complete draft', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  const expected = {
    ...original, version: 8, updatedAt: trustedTime, draft: parsePersonalDeckDraft(request.draft),
  };
  assert.deepEqual(result, expected);
  assert.deepEqual(parsePersonalDeckResource(result), result);
  assert.equal(result.id, original.id);
  assert.equal(result.createdAt, original.createdAt);
  assert.equal(result.version, original.version + 1);
  assert.equal(result.updatedAt, trustedTime);
  assert.deepEqual(store.queuedReplacements.map(item => item.resource), [expected]);
  assert.equal(store.resources.get(uid)?.get(original.id), store.queuedReplacements[0].resource);
  assert.deepEqual(store.events, [
    `catalog:${historicalVersion}`, 'transaction', 'get:deck-a', 'clock', 'replace:deck-a', 'commit',
  ]);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.equal(clock.calls, 1);
});

test('update delegates name trimming, duplicate aggregation and deterministic entry order to existing parsers', async () => {
  const value = {
    ...request, draft: draft({ name: ' \tÉter  雪 🃏\n ', entries: [entry('card-z', 8), entry(), entry()] }),
  };
  const { store, reader, clock } = setup();
  const result = await updatePersonalDeck(uid, value, store, reader, clock);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(value.draft));
  assert.equal(result.draft.name, 'Éter  雪 🃏');
  assert.deepEqual(result.draft.entries, [entry('card-a', 3, 2), entry('card-z', 8)]);
});

test('update passes only the trusted backend UID to the store and preserves another owner resource', async () => {
  const ownerUid = 'trusted-Backend_UID-42';
  const original = resource();
  const other = resource({ version: 19 });
  const store = new MemoryDeckStore(original, ownerUid);
  store.resources.set('other-user', new Map([[other.id, other]]));
  await updatePersonalDeck(ownerUid, request, store, new FakeCatalogReader(), new FakeClock());
  assert.deepEqual(store.uids, [ownerUid]);
  assert.deepEqual(store.reads, [{ uid: ownerUid, deckId: request.deckId, attempt: 0 }]);
  assert.equal(store.queuedReplacements[0].uid, ownerUid);
  assert.equal(store.resources.get('other-user')?.get(other.id), other);
});

test('invalid requests fail before catalog, transaction or clock access', async () => {
  const invalid: unknown[] = [
    undefined, null, [], 'deck-a', {}, { ...request, draft: undefined },
    { deckId: request.deckId, draft: request.draft }, { expectedVersion: 7, draft: request.draft },
    ...['', ' ', 'users/other/decks/deck-a', 'a'.repeat(129), 1, null].map(deckId => ({ ...request, deckId })),
    ...[undefined, null, '7', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(expectedVersion => ({ ...request, expectedVersion })),
    ...['', ' \t\n ', 'a'.repeat(81), 1, null, []].map(name => ({ ...request, draft: { ...request.draft, name } })),
    { ...request, draft: draft({ entries: [entry('card-a', 3, 3)] }) },
    { ...request, draft: draft({ entries: [entry(), entry('card-a', 4)] }) },
    { ...request, draft: { ...request.draft, rulesVersion: '0.2' } },
  ];
  for (const value of invalid) {
    const { store, reader, clock } = setup();
    await assert.rejects(updatePersonalDeck(uid, value, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(reader.calls, []);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('client authority, generated metadata, direct catalogs and playability flags are rejected before dependencies', async () => {
  const fields = {
    uid: 'other', ownerUid: 'other', version: 8, createdAt: trustedTime, updatedAt: trustedTime,
    now: trustedTime, catalog: catalog(), ownership: [], force: true, admin: true,
    ignoreVersion: true, activeVersion: 'active-v2', isPlayable: true, isValid: true,
  };
  for (const [key, value] of Object.entries(fields)) {
    const { store, reader, clock } = setup();
    await assert.rejects(updatePersonalDeck(uid, { ...request, [key]: value }, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(reader.calls, []);
    assert.equal(clock.calls, 0);
  }
});

test('hostile request accessors, symbols, hidden fields and prototypes fail without invoking getters', async () => {
  let getterCalls = 0;
  const values: unknown[] = [
    Object.assign(Object.create({ inherited: true }) as object, request),
    { ...request, [Symbol('hidden')]: true },
    Object.defineProperty({ ...request }, 'force', { value: true, enumerable: false }),
  ];
  for (const field of ['deckId', 'expectedVersion', 'draft', 'force']) {
    values.push(Object.defineProperty({ ...request }, field, {
      enumerable: true,
      get: () => { getterCalls++; throw new Error('client accessor must not execute'); },
    }));
  }
  values.push({ ...request, draft: Object.defineProperty({ ...request.draft }, 'entries', {
    enumerable: true,
    get: () => { getterCalls++; throw new Error('nested client accessor must not execute'); },
  }) });
  for (const value of values) {
    const { store, reader, clock } = setup();
    await assert.rejects(updatePersonalDeck(uid, value, store, reader, clock), GameplayContractError);
    assert.deepEqual(store.events, []);
    assert.deepEqual(reader.calls, []);
    assert.equal(clock.calls, 0);
  }
  assert.equal(getterCalls, 0);
});

test('reader receives exactly the explicit requested historical contentVersion without active-version fallback', async () => {
  const chosen = 'historical-v3';
  const { store, reader, clock } = setup(resource(), catalog(undefined, chosen));
  const result = await updatePersonalDeck(uid, {
    ...request, draft: { ...request.draft, contentVersion: chosen },
  }, store, reader, clock);
  assert.deepEqual(reader.calls, [chosen]);
  assert.equal(result.draft.contentVersion, chosen);
});

test('an absent catalog uses a minimal content-unavailable error distinct from personal deck not-found', async () => {
  const { store, reader, clock } = setup(resource(), null);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckContentUnavailableError);
    assert.ok(failure instanceof PersonalDeckDomainError);
    assert.equal(failure instanceof PersonalDeckNotFoundError, false);
    assert.equal(failure.code, 'personal-deck-content-unavailable');
    assert.equal(failure.name, 'PersonalDeckContentUnavailableError');
    assert.deepEqual(Object.keys(failure).sort(), ['code', 'name']);
    assert.deepEqual(Reflect.ownKeys(failure).sort(), ['code', 'message', 'name', 'stack']);
    for (const field of ['contentVersion', 'cardId', 'revision', 'uid', 'deckId', 'path', 'cause']) {
      assert.equal(Object.hasOwn(failure, field), false);
    }
    const diagnostic = `${failure.message}\n${JSON.stringify(failure)}`;
    for (const secret of [historicalVersion, uid, request.deckId, 'card-a']) assert.equal(diagnostic.includes(secret), false);
    return true;
  });
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('catalog absence is resolved before opening a transaction even when the personal deck is missing', async () => {
  const { store, reader, clock } = setup(null, null);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckContentUnavailableError);
  assert.deepEqual(store.uids, []);
  assert.deepEqual(store.reads, []);
  assert.equal(clock.calls, 0);
});

test('catalog-reader failures propagate unchanged without opening a transaction', async () => {
  const { store, reader, clock } = setup();
  reader.failure = new Error('private catalog infrastructure sentinel');
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => failure === reader.failure);
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('unknown requested identity fails historical reference checking before transaction or clock', async () => {
  const { store, reader, clock } = setup();
  const value = { ...request, draft: draft({ entries: [entry('missing-card')] }) };
  await assert.rejects(updatePersonalDeck(uid, value, store, reader, clock), contentFailure('unknown-card'));
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('a different canonical revision is rejected without migrating the requested revision', async () => {
  const { store, reader, clock } = setup();
  const value = freezeDeep({ ...request, draft: draft({ entries: [entry('card-a', 2, 2)] }) });
  await assert.rejects(updatePersonalDeck(uid, value, store, reader, clock), contentFailure('revision'));
  assert.deepEqual(value.draft.entries, [entry('card-a', 2, 2)]);
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('a catalog for a different contentVersion fails without rewriting the requested version', async () => {
  const { store, reader, clock } = setup(resource(), catalog(undefined, 'other-historical-version'));
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), contentFailure('content-version'));
  assert.equal(request.draft.contentVersion, historicalVersion);
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`]);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('an incompatible trusted catalog rulesVersion remains a contract failure before transaction', async () => {
  const corrupt = { ...catalog(), rulesVersion: '0.2' } as unknown as GameplayDeckCatalog;
  const { store, reader, clock } = setup(resource(), corrupt);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), GameplayContractError);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
});

test('malformed trusted catalog profiles are not converted into content or availability errors', async () => {
  const valid = catalog();
  const corrupt = {
    ...valid,
    cards: [...valid.cards, { definition: { ...valid.cards[0].definition, cardId: 'unused-card', cost: -1 }, eligible: true }],
  } as unknown as GameplayDeckCatalog;
  const { store, reader, clock } = setup(resource(), corrupt);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof GameplayContractError);
    assert.equal(failure instanceof PersonalDeckContentError, false);
    assert.equal(failure instanceof PersonalDeckContentUnavailableError, false);
    return true;
  });
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('duplicated canonical identities are rejected by the existing catalog parser rather than silently repaired', async () => {
  const { store, reader, clock } = setup(resource(), catalog([entry(), entry('card-a', 4)]));
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), GameplayContractError);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
});

test('eligible false is accepted for historical saving without granting match eligibility', async () => {
  const { store, reader, clock } = setup(resource(), catalog(undefined, historicalVersion, false));
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(request.draft));
  assert.equal('isPlayable' in result, false);
  assert.equal('isValid' in result, false);
});

test('empty drafts remain valid updates with an empty historical catalog', async () => {
  const { store, reader, clock } = setup(resource(), catalog([]));
  const result = await updatePersonalDeck(uid, { ...request, draft: draft({ entries: [] }) }, store, reader, clock);
  assert.deepEqual(result.draft.entries, []);
  assert.equal(result.version, 8);
});

test('partial drafts remain valid updates without a complete 24-card composition', async () => {
  const { store, reader, clock } = setup();
  const result = await updatePersonalDeck(uid, {
    ...request, draft: draft({ entries: [entry('card-a', 3, 2)] }),
  }, store, reader, clock);
  assert.equal(result.draft.entries.reduce((total, value) => total + value.quantity, 0), 2);
  assert.equal(result.version, 8);
});

test('a complete 24-card draft is accepted with its explicit references intact', async () => {
  const entries = Array.from({ length: 12 }, (_, index) => entry(`card-${index}`, index + 1, 2));
  const { store, reader, clock } = setup(resource(), catalog(entries));
  const result = await updatePersonalDeck(uid, { ...request, draft: draft({ entries }) }, store, reader, clock);
  assert.equal(result.draft.entries.reduce((total, value) => total + value.quantity, 0), 24);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(draft({ entries })));
});

test('update uses only catalog identity/revision and the personal resource, without ownership or publication reads', async () => {
  const { store, reader, clock } = setup(resource(), catalog(undefined, historicalVersion, false));
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(Object.keys(result).sort(), ['createdAt', 'draft', 'id', 'updatedAt', 'version']);
  assert.deepEqual(Object.keys(result.draft).sort(), ['contentVersion', 'entries', 'name', 'rulesVersion']);
  assert.deepEqual(Object.keys(result.draft.entries[0]).sort(), ['cardId', 'quantity', 'revision']);
  assert.deepEqual(store.events, [
    `catalog:${historicalVersion}`, 'transaction', 'get:deck-a', 'clock', 'replace:deck-a', 'commit',
  ]);
  assert.equal(store.reads.length, 1);
  assert.equal(reader.calls.length, 1);
  // No editorial Card, collection, active catalog, ownership or publication dependency is injected.
});

test('a missing personal deck fails after historical validation but before clock or replacement', async () => {
  const { store, reader, clock } = setup(null);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckNotFoundError);
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`, 'transaction', 'get:deck-a']);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('either direction of expectedVersion mismatch fails before clock or replacement', async () => {
  for (const version of [1, 6, 8, Number.MAX_SAFE_INTEGER]) {
    const original = resource({ version });
    const { store, reader, clock } = setup(original);
    await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
    assert.deepEqual(store.events, [`catalog:${historicalVersion}`, 'transaction', 'get:deck-a']);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.equal(clock.calls, 0);
    assertNoWrite(store);
  }
});

test('same normalized draft is a no-op after trimming, sorting and duplicate aggregation', async () => {
  const original = resource({ draft: {
    entries: [entry('card-a', 3, 2), entry('card-z', 8)],
  } });
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, {
    ...request, draft: draft({ name: ' \tMeu Deck\n ', entries: [entry('card-z', 8), entry(), entry()] }),
  }, store, reader, clock);
  assert.deepEqual(result, original);
  assert.equal(result.version, 7);
  assert.equal(result.updatedAt, original.updatedAt);
  assert.equal(store.resources.get(uid)?.get(original.id), original);
  assert.deepEqual(store.events, [`catalog:${historicalVersion}`, 'transaction', 'get:deck-a', 'commit']);
  assert.deepEqual(store.queuedReplacements, []);
  assert.equal(clock.calls, 0);
});

test('a no-op returns a deep detached copy and needs no working clock', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  clock.failure = new Error('clock must not run on no-op');
  const result = await updatePersonalDeck(uid, { ...request, draft: original.draft }, store, reader, clock);
  assert.deepEqual(result, original);
  assert.notEqual(result, original);
  assert.notEqual(result.draft, original.draft);
  assert.notEqual(result.draft.entries, original.draft.entries);
  assert.notEqual(result.draft.entries[0], original.draft.entries[0]);
  (result.draft.entries[0] as { revision: number }).revision = 999;
  assert.equal(original.draft.entries[0].revision, 3);
  assert.equal(clock.calls, 0);
  assert.deepEqual(store.queuedReplacements, []);
});

test('an otherwise identical draft still requires its historical catalog to exist', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original, null);
  await assert.rejects(updatePersonalDeck(uid, { ...request, draft: original.draft }, store, reader, clock),
    PersonalDeckContentUnavailableError);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('an otherwise identical draft still requires historically recognized references', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original, catalog([]));
  await assert.rejects(updatePersonalDeck(uid, { ...request, draft: original.draft }, store, reader, clock),
    contentFailure('unknown-card'));
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('an otherwise identical draft cannot bypass expectedVersion conflicts', async () => {
  const original = resource({ version: 8 });
  const { store, reader, clock } = setup(original);
  await assert.rejects(updatePersonalDeck(uid, { ...request, draft: original.draft }, store, reader, clock),
    PersonalDeckConflictError);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('an otherwise identical draft cannot bypass resource existence', async () => {
  const { store, reader, clock } = setup(null);
  await assert.rejects(updatePersonalDeck(uid, { ...request, draft: resource().draft }, store, reader, clock),
    PersonalDeckNotFoundError);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('changing only the normalized name is a real update', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, {
    ...request, draft: { ...original.draft, name: 'Outro nome' },
  }, store, reader, clock);
  assert.equal(result.draft.name, 'Outro nome');
  assert.deepEqual(result.draft.entries, original.draft.entries);
  assert.equal(result.draft.contentVersion, original.draft.contentVersion);
  assert.equal(result.version, 8);
  assert.equal(clock.calls, 1);
});

test('changing only entry composition is a real update with full replacement rather than a merge', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, {
    ...request, draft: { ...original.draft, entries: [entry('card-z', 8)] },
  }, store, reader, clock);
  assert.equal(result.draft.name, original.draft.name);
  assert.deepEqual(result.draft.entries, [entry('card-z', 8)]);
  assert.equal(result.version, 8);
});

test('changing only a quantity is detected without adjusting it automatically', async () => {
  const original = resource();
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, {
    ...request, draft: { ...original.draft, entries: [entry('card-a', 3, 2)] },
  }, store, reader, clock);
  assert.deepEqual(result.draft.entries, [entry('card-a', 3, 2)]);
  assert.equal(original.draft.entries[0].quantity, 1);
  assert.equal(result.version, 8);
});

test('an explicit contentVersion-only change is a real update when unchanged references are recognized there', async () => {
  const original = resource();
  const chosen = 'historical-v2';
  const { store, reader, clock } = setup(original, catalog([entry()], chosen));
  const result = await updatePersonalDeck(uid, {
    ...request, draft: { ...original.draft, contentVersion: chosen },
  }, store, reader, clock);
  assert.equal(result.draft.contentVersion, chosen);
  assert.equal(original.draft.contentVersion, historicalVersion);
  assert.deepEqual(result.draft.entries, original.draft.entries);
  assert.equal(result.version, 8);
  assert.equal(result.updatedAt, trustedTime);
  assert.deepEqual(reader.calls, [chosen]);
});

test('a new revision is saved only when explicitly supplied and canonical in the chosen historical version', async () => {
  const original = resource();
  const chosen = 'historical-v2';
  const { store, reader, clock } = setup(original, catalog([entry('card-a', 4)], chosen));
  const result = await updatePersonalDeck(uid, {
    ...request, draft: { ...original.draft, contentVersion: chosen, entries: [entry('card-a', 4)] },
  }, store, reader, clock);
  assert.deepEqual(result.draft.entries, [entry('card-a', 4)]);
  assert.deepEqual(original.draft.entries, [entry('card-a', 3)]);
  assert.equal(result.draft.contentVersion, chosen);
  assert.equal(result.version, 8);
});

test('changing contentVersion never upgrades an omitted revision to the new catalog revision', async () => {
  const original = resource();
  const chosen = 'historical-v2';
  const { store, reader, clock } = setup(original, catalog([entry('card-a', 4)], chosen));
  await assert.rejects(updatePersonalDeck(uid, {
    ...request, draft: { ...original.draft, contentVersion: chosen },
  }, store, reader, clock), contentFailure('revision'));
  assert.deepEqual(original.draft.entries, [entry('card-a', 3)]);
  assert.deepEqual(store.uids, []);
  assert.equal(clock.calls, 0);
  assertNoWrite(store);
});

test('a real change at the maximum safe version fails before clock or replacement without overflow', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER });
  const { store, reader, clock } = setup(original);
  await assert.rejects(updatePersonalDeck(uid, {
    ...request, expectedVersion: original.version,
  }, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckVersionExhaustedError);
    assert.equal(failure.code, 'personal-deck-version-exhausted');
    return true;
  });
  assert.equal(clock.calls, 0);
  assert.equal(original.version, Number.MAX_SAFE_INTEGER);
  assertNoWrite(store);
});

test('a no-op at the maximum safe version remains valid without reading clock', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER });
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, {
    ...request, expectedVersion: original.version, draft: original.draft,
  }, store, reader, clock);
  assert.deepEqual(result, original);
  assert.equal(result.version, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(store.queuedReplacements, []);
  assert.equal(clock.calls, 0);
});

test('the penultimate safe version increments exactly to the maximum safe version', async () => {
  const original = resource({ version: Number.MAX_SAFE_INTEGER - 1 });
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, {
    ...request, expectedVersion: original.version,
  }, store, reader, clock);
  assert.equal(result.version, Number.MAX_SAFE_INTEGER);
  assert.equal(Number.isSafeInteger(result.version), true);
  assert.equal(store.queuedReplacements.length, 1);
});

test('trusted time before creation is rejected without clamping or writing', async () => {
  const { store, reader } = setup();
  const clock = new FakeClock(['2026-10-17T09:59:59.999Z']);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckClockError);
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('trusted time after creation but before stored updatedAt is rejected without clamping', async () => {
  const original = resource();
  const { store, reader } = setup(original);
  const clock = new FakeClock(['2026-10-17T10:59:59.999Z']);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckClockError);
    assert.equal(failure.code, 'personal-deck-invalid-time');
    assert.equal(failure instanceof GameplayContractError, false);
    return true;
  });
  assert.equal(original.updatedAt, '2026-10-17T11:00:00.000Z');
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('trusted time equal to stored updatedAt is allowed for a real change', async () => {
  const original = resource();
  const { store, reader } = setup(original);
  const clock = new FakeClock([original.updatedAt]);
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  assert.equal(result.updatedAt, original.updatedAt);
  assert.equal(result.version, 8);
  assert.equal(clock.calls, 1);
});

test('invalid clock types, formats and calendar dates become domain clock errors', async () => {
  const values: unknown[] = [
    undefined, null, 42, new Date('2026-10-17T12:00:00.000Z'), {}, '', 'now',
    '2026-10-17T12:00:00Z', '2026-10-17T12:00:00.12Z', '2026-10-17T12:00:00.1234Z',
    '2026-10-17T12:00:00.123+00:00', '2026-10-17t12:00:00.123z', ' 2026-10-17T12:00:00.123Z ',
    '0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', '10000-01-01T00:00:00.000Z',
    '2026-02-29T12:00:00.000Z', '2026-04-31T12:00:00.000Z', '2026-13-01T12:00:00.000Z',
    '2026-10-17T24:00:00.000Z', '2026-10-17T12:60:00.000Z', '2026-10-17T12:00:60.000Z',
  ];
  for (const value of values) {
    const { store, reader } = setup();
    const clock = new FakeClock([value]);
    await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => {
      assert.ok(failure instanceof PersonalDeckClockError);
      assert.equal(failure instanceof GameplayContractError, false);
      return true;
    });
    assert.equal(clock.calls, 1);
    assertNoWrite(store);
  }
});

test('valid leap-day and year-boundary timestamps retain canonical strings', async () => {
  for (const time of ['0001-01-01T00:00:00.000Z', '2028-02-29T12:34:56.789Z', '9999-12-31T23:59:59.999Z']) {
    const original = resource({ createdAt: '0001-01-01T00:00:00.000Z', updatedAt: '0001-01-01T00:00:00.000Z' });
    const { store, reader } = setup(original);
    const result = await updatePersonalDeck(uid, request, store, reader, new FakeClock([time]));
    assert.equal(result.updatedAt, time);
    assert.equal(typeof result.updatedAt, 'string');
    assert.equal(result.createdAt, original.createdAt);
  }
});

test('a throwing clock becomes a minimal clock error without its private diagnostic payload', async () => {
  const { store, reader, clock } = setup();
  clock.failure = new Error('private trusted clock diagnostic sentinel');
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => {
    assert.ok(failure instanceof PersonalDeckClockError);
    assert.notEqual(failure, clock.failure);
    assert.equal(failure.message.includes('private trusted clock diagnostic sentinel'), false);
    assert.equal(Object.hasOwn(failure, 'cause'), false);
    return true;
  });
  assert.equal(clock.calls, 1);
  assertNoWrite(store);
});

test('store start, read, replace and commit failures propagate unchanged', async () => {
  for (const stage of ['transaction', 'get', 'replace', 'commit'] as const) {
    const original = resource();
    const { store, reader, clock } = setup(original);
    store.failAt = stage;
    await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), failure => failure === store.failure);
    assert.equal(store.resources.get(uid)?.get(original.id), original);
    assert.equal(store.commits, 0);
    assert.equal(store.queuedReplacements.length, stage === 'commit' ? 1 : 0);
    assert.equal(clock.calls, stage === 'transaction' || stage === 'get' ? 0 : 1);
    assert.equal(reader.calls.length, 1);
  }
});

test('deeply frozen request, catalog and normalized resource remain unchanged after update', async () => {
  const original = resource();
  const trusted = freezeDeep(catalog());
  const beforeResource = structuredClone(original);
  const beforeRequest = structuredClone(request);
  const beforeCatalog = structuredClone(trusted);
  const { store, reader, clock } = setup(original, trusted);
  await updatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(original, beforeResource);
  assert.deepEqual(request, beforeRequest);
  assert.deepEqual(trusted, beforeCatalog);
  assert.equal(Object.isFrozen(original), true);
  assert.equal(Object.isFrozen(original.draft.entries), true);
  assert.equal(original.draft.entries.every(value => Object.isFrozen(value)), true);
});

test('returned resource is detached from request, stored source and queued replacement at every nested level', async () => {
  const original = resource({ draft: { entries: request.draft.entries } });
  const { store, reader, clock } = setup(original);
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  const queued = store.queuedReplacements[0].resource;
  for (const other of [original, queued]) {
    assert.notEqual(result, other);
    assert.notEqual(result.draft, other.draft);
    assert.notEqual(result.draft.entries, other.draft.entries);
    result.draft.entries.forEach((value, index) => assert.notEqual(value, other.draft.entries[index]));
  }
  assert.notEqual(result.draft, request.draft);
  assert.notEqual(result.draft.entries, request.draft.entries);
  (result as { version: number }).version = 99;
  (result.draft as { name: string }).name = 'Mutated return';
  (result.draft.entries[0] as { revision: number }).revision = 999;
  assert.equal(queued.version, 8);
  assert.equal(queued.draft.name, request.draft.name);
  assert.equal(queued.draft.entries[0].revision, 3);
  assert.equal(original.draft.entries[0].revision, 3);
  (queued.draft.entries[1] as { quantity: number }).quantity = 2;
  assert.equal(result.draft.entries[1].quantity, 1);
  assert.equal(original.draft.entries[1].quantity, 1);
  assert.equal(request.draft.entries[0].quantity, 1);
});

test('mutating the original request while awaiting the catalog cannot change the parsed intention', async () => {
  const mutable = {
    deckId: request.deckId, expectedVersion: request.expectedVersion,
    draft: { ...draft(), entries: [{ cardId: 'card-a', revision: 3, quantity: 2 }] },
  };
  const before = parsePersonalDeckDraft(mutable.draft);
  const { store, reader, clock } = setup();
  reader.beforeReturn = () => {
    mutable.deckId = 'different-deck';
    mutable.expectedVersion = 999;
    mutable.draft.name = 'Changed while awaiting';
    mutable.draft.contentVersion = 'different-version';
    mutable.draft.entries[0].revision = 999;
    mutable.draft.entries[0].quantity = 1;
  };
  const result = await updatePersonalDeck(uid, mutable, store, reader, clock);
  assert.deepEqual(result.draft, before);
  assert.equal(result.id, request.deckId);
  assert.equal(result.version, 8);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('transaction replay rereads same-version changed content and recomputes from the second resource metadata', async () => {
  const first = resource();
  const second = resource({
    createdAt: '2026-10-17T09:30:00.000Z', updatedAt: '2026-10-17T11:30:00.000Z',
    draft: { name: 'Conteúdo relido', entries: [entry('card-z', 8)] },
  });
  const { store, reader } = setup(first);
  store.replayResources = [first, second];
  const clock = new FakeClock([trustedTime, '2026-10-18T12:00:00.000Z']);
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  assert.equal(store.reads.length, 2);
  assert.deepEqual(store.queuedReplacements.map(item => item.resource.version), [8, 8]);
  assert.deepEqual(store.queuedReplacements.map(item => item.resource.updatedAt), [trustedTime, trustedTime]);
  assert.equal(store.queuedReplacements[0].resource.createdAt, first.createdAt);
  assert.equal(store.queuedReplacements[1].resource.createdAt, second.createdAt);
  assert.equal(result.createdAt, second.createdAt);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(request.draft));
  assert.equal(result.version, 8);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
  assert.equal(store.resources.get(uid)?.get(first.id), store.queuedReplacements[1].resource);
  assert.equal(store.commits, 1);
  assert.equal(first.version, 7);
  assert.equal(second.version, 7);
});

test('transaction replay observing a new version conflicts and discards all first-attempt queued writes', async () => {
  const first = resource();
  const second = resource({ version: 8 });
  const { store, reader, clock } = setup(first);
  store.replayResources = [first, second];
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckConflictError);
  assert.equal(store.reads.length, 2);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(store.queuedReplacements[0].attempt, 0);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
  assert.equal(store.commits, 0);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('transaction replay becoming a no-op uses the second resource and discards the first replacement', async () => {
  const first = resource();
  const second = resource({ draft: request.draft, updatedAt: '2026-10-17T11:30:00.000Z' });
  const { store, reader, clock } = setup(first);
  store.replayResources = [first, second];
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  assert.deepEqual(result, second);
  assert.notEqual(result, second);
  assert.notEqual(result.draft.entries[0], second.draft.entries[0]);
  assert.equal(result.version, 7);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(store.queuedReplacements[0].attempt, 0);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('transaction replay changing an initial no-op consults clock lazily only for the real update attempt', async () => {
  const first = resource({ draft: request.draft });
  const second = resource();
  const { store, reader, clock } = setup(first);
  store.replayResources = [first, second];
  const result = await updatePersonalDeck(uid, request, store, reader, clock);
  assert.equal(result.version, 8);
  assert.deepEqual(result.draft, parsePersonalDeckDraft(request.draft));
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(store.queuedReplacements[0].attempt, 1);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('transaction replay rejects a second stored updatedAt beyond cached time without recalibrating clock', async () => {
  const first = resource();
  const second = resource({ updatedAt: '2026-10-17T12:00:00.124Z' });
  const { store, reader } = setup(first);
  store.replayResources = [first, second];
  const clock = new FakeClock([trustedTime, '2026-10-17T13:00:00.000Z']);
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckClockError);
  assert.equal(store.reads.length, 2);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(clock.calls, 1);
  assert.equal(store.commits, 0);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('transaction replay observing resource deletion becomes not-found without committing the first write', async () => {
  const first = resource();
  const { store, reader, clock } = setup(first);
  store.replayResources = [first, null];
  await assert.rejects(updatePersonalDeck(uid, request, store, reader, clock), PersonalDeckNotFoundError);
  assert.equal(store.queuedReplacements.length, 1);
  assert.equal(store.resources.get(uid)?.get(first.id), first);
  assert.equal(store.commits, 0);
  assert.equal(clock.calls, 1);
  assert.deepEqual(reader.calls, [historicalVersion]);
});

test('separate logical updates obtain separate clock instants and use their own observed versions', async () => {
  const { store, reader } = setup();
  const later = '2026-10-17T13:00:00.456Z';
  const clock = new FakeClock([trustedTime, later]);
  const first = await updatePersonalDeck(uid, request, store, reader, clock);
  const second = await updatePersonalDeck(uid, {
    deckId: first.id, expectedVersion: first.version, draft: { ...first.draft, name: 'Outro Nome' },
  }, store, reader, clock);
  assert.equal(first.version, 8);
  assert.equal(first.updatedAt, trustedTime);
  assert.equal(second.version, 9);
  assert.equal(second.updatedAt, later);
  assert.equal(clock.calls, 2);
  assert.equal(store.commits, 2);
  assert.deepEqual(reader.calls, [historicalVersion, historicalVersion]);
});
