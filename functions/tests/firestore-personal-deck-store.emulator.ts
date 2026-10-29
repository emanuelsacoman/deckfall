import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import { createFirestorePersonalDeckStore } from '../src/decks/firestore-personal-deck-store';
import { createPersonalDeck } from '../src/decks/create-personal-deck';
import { deletePersonalDeck } from '../src/decks/delete-personal-deck';
import { duplicatePersonalDeck } from '../src/decks/duplicate-personal-deck';
import { renamePersonalDeck } from '../src/decks/rename-personal-deck';
import { updatePersonalDeck } from '../src/decks/update-personal-deck';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckConflictError, PersonalDeckNotFoundError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckReadLimit, PersonalDeckStore, PersonalDeckStoreTransaction } from '../src/decks/personal-deck-store';
import { PERSONAL_DECK_LIMITS, parsePersonalDeckResource } from '../src/gameplay';
import type { GameplayDeckCatalog, PersonalDeckDraft, PersonalDeckResource } from '../src/gameplay';

// Validate before initializing the Admin SDK. No credentials, production project, remote host,
// database-wide flush or shared fixture documents are used by this integration suite.
const projectId = 'demo-cardgame';
assert.match(process.env['FIRESTORE_EMULATOR_HOST'] ?? '', /^(127\.0\.0\.1|localhost):\d+$/,
  'FIRESTORE_EMULATOR_HOST must point to a loopback emulator');
assert.equal(process.env['GCLOUD_PROJECT'], projectId, 'Only demo-cardgame is allowed');
if (process.env['GOOGLE_CLOUD_PROJECT'] !== undefined) assert.equal(process.env['GOOGLE_CLOUD_PROJECT'], projectId);
const app = initializeApp({ projectId }, `decks-integration-${randomUUID()}`);
const firestore = getFirestore(app);
const store = createFirestorePersonalDeckStore(firestore);
const ownedUids = new Set<string>();
const initialTime = '2026-10-29T12:00:00.123Z';
const laterTime = '2026-10-29T13:00:00.456Z';
const contentVersion = 'deck-store-history-v1';
const clock = { now: () => initialTime };
const laterClock = { now: () => laterTime };
const catalog: GameplayDeckCatalog = {
  rulesVersion: '0.1', contentVersion,
  cards: [
    { definition: { kind: 'unit', cardId: 'card-a', revision: 3, cost: 1, power: 2, maxLife: 3, guard: false }, eligible: true },
    { definition: { kind: 'unit', cardId: 'card-z', revision: 8, cost: 1, power: 2, maxLife: 3, guard: false }, eligible: false },
  ],
};
const reader: PersonalDeckCatalogReader = {
  get: async version => version === contentVersion ? catalog : null,
};

function owner(): string {
  const uid = `deck-store-test-${randomUUID()}`;
  ownedUids.add(uid);
  return uid;
}

function collection(uid: string) {
  assert.ok(ownedUids.has(uid), 'Direct test access is restricted to this run\'s owned UIDs');
  return firestore.collection('users').doc(uid).collection('decks');
}

function draft(overrides: Partial<PersonalDeckDraft> = {}): PersonalDeckDraft {
  return {
    name: 'Meu Deck', rulesVersion: '0.1', contentVersion,
    entries: [{ cardId: 'card-a', revision: 3, quantity: 2 }], ...overrides,
  };
}

function resource(id = 'deck-a', overrides: Partial<PersonalDeckResource> = {}): PersonalDeckResource {
  return parsePersonalDeckResource({ id, version: 1, draft: draft(), createdAt: initialTime, updatedAt: initialTime, ...overrides });
}

function persisted(value = resource()): DocumentData {
  return {
    schemaVersion: 1, name: value.draft.name, version: value.version,
    rulesVersion: value.draft.rulesVersion, contentVersion: value.draft.contentVersion,
    entries: value.draft.entries.map(entry => ({ ...entry })),
    createdAt: Timestamp.fromDate(new Date(value.createdAt)), updatedAt: Timestamp.fromDate(new Date(value.updatedAt)),
  };
}

async function seed(uid: string, count: number): Promise<void> {
  const batch = firestore.batch();
  for (let index = 0; index < count; index++) batch.create(collection(uid).doc(`seed-${index}`), persisted(resource(`seed-${index}`)));
  await batch.commit();
}

/** Synchronize external historical reads, never block or coordinate inside Firestore callbacks. */
function pairedReader(): PersonalDeckCatalogReader {
  let arrivals = 0;
  let release!: () => void;
  let fail!: (error: Error) => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<void>((resolve, reject) => { release = resolve; fail = reject; });
  return {
    get: async version => {
      assert.equal(version, contentVersion);
      arrivals++;
      if (arrivals === 1) timeout = setTimeout(() => fail(new Error('The second historical reader did not reach the external start barrier')), 20000);
      if (arrivals === 2) { clearTimeout(timeout); release(); }
      await ready;
      return catalog;
    },
  };
}

interface ObservedList { readonly operation: string; readonly transaction: number; readonly attempt: number; readonly count: number }

/** Transparent instrumentation: every read, write, retry and commit still belongs to the real adapter. */
function observedStore(operation: string, observations: ObservedList[]): PersonalDeckStore {
  let transactionNumber = 0;
  return {
    runTransaction: (uid, action) => {
      const transaction = ++transactionNumber;
      let attempt = 0;
      return store.runTransaction(uid, async tx => {
        const currentAttempt = ++attempt;
        return action({
          get: id => tx.get(id),
          list: async limit => {
            const result = await tx.list(limit);
            observations.push({ operation, transaction, attempt: currentAttempt, count: result.length });
            return result;
          },
          create: value => tx.create(value), replace: value => tx.replace(value), delete: id => tx.delete(id),
        });
      });
    },
  };
}

function outcome(value: PromiseSettledResult<PersonalDeckResource>) {
  if (value.status === 'fulfilled') return { status: 'fulfilled', id: value.value.id };
  const reason: unknown = value.reason;
  return reason instanceof Error
    ? { status: 'rejected', name: reason.name, code: (reason as Error & { code?: unknown }).code, message: reason.message }
    : { status: 'rejected', reason: String(reason) };
}

after(async () => {
  try {
    for (const uid of ownedUids) {
      const ownDocuments = await collection(uid).get();
      if (ownDocuments.empty) continue;
      const batch = firestore.batch();
      for (const document of ownDocuments.docs) batch.delete(document.ref);
      await batch.commit();
    }
  } finally {
    await firestore.terminate();
    await deleteApp(app);
  }
});

// Keep capacity probes first: a failure must be investigated before extending persistence.
test('real emulator capacity: nineteen plus concurrent create/create, five independent rounds', { timeout: 300000 }, async t => {
  for (let round = 1; round <= 5; round++) {
    const uid = owner();
    await seed(uid, 19);
    assert.equal((await collection(uid).get()).size, 19);
    const barrier = pairedReader();
    const observations: ObservedList[] = [];
    const results = await Promise.allSettled([
      createPersonalDeck(uid, { deckId: 'create-a', draft: draft() }, observedStore('create-a', observations), barrier, clock),
      createPersonalDeck(uid, { deckId: 'create-b', draft: draft() }, observedStore('create-b', observations), barrier, clock),
    ]);
    const final = await collection(uid).get();
    const fulfilled = results.filter(value => value.status === 'fulfilled').length;
    const capacity = results.filter(value => value.status === 'rejected' && value.reason instanceof PersonalDeckCapacityError).length;
    const other = results.length - fulfilled - capacity;
    t.diagnostic(JSON.stringify({ scenario: 'create/create', round, initial: 19, fulfilled, capacity, other, final: final.size, observations, outcomes: results.map(outcome) }));
    assert.ok(final.size <= PERSONAL_DECK_LIMITS.maxDecks, 'STOP: transactional query allowed more than twenty decks');
    assert.equal(final.size, 20);
    assert.equal(fulfilled, 1, 'Exactly one creation must commit; contention is not capacity evidence');
    assert.equal(capacity, 1, 'The losing operation must fail by domain capacity, not contention or timeout');
    assert.equal(other, 0);
  }
});

test('real emulator capacity: nineteen plus concurrent create/duplicate, five independent rounds', { timeout: 300000 }, async t => {
  for (let round = 1; round <= 5; round++) {
    const uid = owner();
    await seed(uid, 19);
    const sourceBefore = await collection(uid).doc('seed-0').get();
    assert.equal((await collection(uid).get()).size, 19);
    const barrier = pairedReader();
    const observations: ObservedList[] = [];
    const results = await Promise.allSettled([
      createPersonalDeck(uid, { deckId: 'create-a', draft: draft() }, observedStore('create-a', observations), barrier, clock),
      duplicatePersonalDeck(uid, { sourceDeckId: 'seed-0', expectedSourceVersion: 1, newDeckId: 'duplicate-b' }, observedStore('duplicate-b', observations), barrier, clock),
    ]);
    const final = await collection(uid).get();
    const sourceAfter = await collection(uid).doc('seed-0').get();
    const fulfilled = results.filter(value => value.status === 'fulfilled').length;
    const capacity = results.filter(value => value.status === 'rejected' && value.reason instanceof PersonalDeckCapacityError).length;
    const other = results.length - fulfilled - capacity;
    t.diagnostic(JSON.stringify({ scenario: 'create/duplicate', round, initial: 19, fulfilled, capacity, other, final: final.size, observations, outcomes: results.map(outcome) }));
    assert.ok(final.size <= PERSONAL_DECK_LIMITS.maxDecks, 'STOP: transactional query allowed more than twenty decks');
    assert.equal(final.size, 20);
    assert.equal(fulfilled, 1, 'Exactly one creation must commit; contention is not capacity evidence');
    assert.equal(capacity, 1, 'The losing operation must fail by domain capacity, not contention or timeout');
    assert.equal(other, 0);
    assert.deepEqual(sourceAfter.data(), sourceBefore.data());
    assert.ok(sourceAfter.updateTime!.isEqual(sourceBefore.updateTime!));
  }
});

test('all five domains persist flattened resources, versions and exact millisecond timestamps', async () => {
  const uid = owner();
  const requestDraft = draft({
    name: '  Inicial  ', entries: [
      { cardId: 'card-z', revision: 8, quantity: 1 }, { cardId: 'card-a', revision: 3, quantity: 2 },
    ],
  });
  const created = await createPersonalDeck(uid, { deckId: 'deck-a', draft: requestDraft }, store, reader, clock);
  assert.equal(created.version, 1);
  assert.equal(created.draft.name, 'Inicial');
  assert.equal(created.createdAt, initialTime);
  assert.equal(created.updatedAt, initialTime);
  let stored = (await collection(uid).doc('deck-a').get()).data()!;
  assert.deepEqual(Object.keys(stored).sort(), ['contentVersion', 'createdAt', 'entries', 'name', 'rulesVersion', 'schemaVersion', 'updatedAt', 'version']);
  assert.deepEqual(stored, persisted(created));
  assert.ok(stored['createdAt'] instanceof Timestamp);
  assert.ok(stored['updatedAt'] instanceof Timestamp);
  assert.equal(stored['createdAt'].nanoseconds, 123000000);
  assert.deepEqual(await store.runTransaction(uid, tx => tx.get('deck-a')), created);
  const renamed = await renamePersonalDeck(uid, { deckId: 'deck-a', expectedVersion: 1, name: 'Renomeado' }, store, laterClock);
  assert.equal(renamed.version, 2);
  assert.equal(renamed.createdAt, initialTime);
  assert.equal(renamed.updatedAt, laterTime);
  assert.deepEqual(renamed.draft.entries, created.draft.entries);
  const updated = await updatePersonalDeck(uid, {
    deckId: 'deck-a', expectedVersion: 2, draft: draft({ name: 'Atualizado', entries: [] }),
  }, store, reader, laterClock);
  assert.equal(updated.version, 3);
  assert.equal(updated.createdAt, initialTime);
  stored = (await collection(uid).doc('deck-a').get()).data()!;
  assert.deepEqual(stored, persisted(updated));
  assert.equal(stored['updatedAt'].nanoseconds, 456000000);
  const original = await collection(uid).doc('deck-a').get();
  const duplicate = await duplicatePersonalDeck(uid, {
    sourceDeckId: 'deck-a', expectedSourceVersion: 3, newDeckId: 'deck-copy',
  }, store, reader, laterClock);
  assert.equal(duplicate.id, 'deck-copy');
  assert.equal(duplicate.version, 1);
  assert.equal(duplicate.createdAt, laterTime);
  assert.equal(duplicate.updatedAt, laterTime);
  assert.deepEqual(duplicate.draft, updated.draft);
  assert.deepEqual((await collection(uid).doc('deck-copy').get()).data(), persisted(duplicate));
  const sourceAfter = await collection(uid).doc('deck-a').get();
  assert.deepEqual(sourceAfter.data(), original.data());
  assert.ok(sourceAfter.updateTime!.isEqual(original.updateTime!));
  await deletePersonalDeck(uid, { deckId: 'deck-a', expectedVersion: 3 }, store);
  assert.equal((await collection(uid).doc('deck-a').get()).exists, false);
  assert.deepEqual(await store.runTransaction(uid, tx => tx.list(PERSONAL_DECK_LIMITS.maxDecks)), [duplicate]);
});

test('resource timestamp round-trip covers canonical year and millisecond boundaries', async () => {
  const uid = owner();
  const dates = [
    '0001-01-01T00:00:00.000Z', '1969-12-31T23:59:59.999Z', '1970-01-01T00:00:00.000Z',
    initialTime, '9999-12-31T23:59:59.999Z',
  ];
  for (let index = 0; index < dates.length; index++) {
    const date = dates[index];
    const value = resource(`date-${index}`, { createdAt: date, updatedAt: date, version: 7 });
    await store.runTransaction(uid, async tx => { tx.create(value); });
    assert.deepEqual(await store.runTransaction(uid, tx => tx.get(value.id)), value);
    const data = (await collection(uid).doc(value.id).get()).data()!;
    assert.ok(data['createdAt'] instanceof Timestamp);
    assert.equal(data['createdAt'].toDate().toISOString(), date);
    assert.equal(data['createdAt'].nanoseconds % 1000000, 0);
  }
});

test('two users with the same deck ID remain isolated in reads, writes, lists and quota', async () => {
  const first = owner();
  const second = owner();
  await seed(second, 20);
  const created = await createPersonalDeck(first, { deckId: 'seed-0', draft: draft({ name: 'Primeiro' }) }, store, reader, clock);
  const secondBefore = await collection(second).doc('seed-0').get();
  assert.deepEqual(await store.runTransaction(first, tx => tx.list(PERSONAL_DECK_LIMITS.maxDecks)), [created]);
  assert.equal((await store.runTransaction(second, tx => tx.list(PERSONAL_DECK_LIMITS.maxDecks))).length, 20);
  assert.equal((await store.runTransaction(first, tx => tx.get('seed-1'))), null);
  await renamePersonalDeck(first, { deckId: 'seed-0', expectedVersion: 1, name: 'Só primeiro' }, store, laterClock);
  await deletePersonalDeck(first, { deckId: 'seed-0', expectedVersion: 2 }, store);
  const secondAfter = await collection(second).doc('seed-0').get();
  assert.deepEqual(secondAfter.data(), secondBefore.data());
  assert.ok(secondAfter.updateTime!.isEqual(secondBefore.updateTime!));
  assert.equal((await collection(first).get()).size, 0);
  assert.equal((await collection(second).get()).size, 20);
});

test('trusted Unicode and punctuation UID segments remain intact without becoming deck IDs', async () => {
  const uid = `deck-store-test-José.😀@${randomUUID()}`;
  ownedUids.add(uid);
  const created = await createPersonalDeck(uid, { deckId: 'deck-a', draft: draft() }, store, reader, clock);
  assert.deepEqual(await store.runTransaction(uid, tx => tx.get('deck-a')), created);
  assert.deepEqual((await collection(uid).doc('deck-a').get()).data(), persisted(created));
});

test('capacity zero, nineteen and twenty is evaluated against real transactional lists', async () => {
  for (const count of [0, 19, 20]) {
    const uid = owner();
    await seed(uid, count);
    assert.equal((await store.runTransaction(uid, tx => tx.list(PERSONAL_DECK_LIMITS.maxDecks))).length, count);
    const operation = createPersonalDeck(uid, { deckId: 'new-deck', draft: draft() }, store, reader, clock);
    if (count === 20) await assert.rejects(operation, PersonalDeckCapacityError);
    else assert.equal((await operation).id, 'new-deck');
    assert.equal((await collection(uid).get()).size, Math.min(count + 1, 20));
  }
});

test('absent resources return null; domain mutations fail without creating documents', async () => {
  const uid = owner();
  assert.equal(await store.runTransaction(uid, tx => tx.get('missing')), null);
  assert.deepEqual(await store.runTransaction(uid, tx => tx.list(PERSONAL_DECK_LIMITS.maxDecks)), []);
  await assert.rejects(deletePersonalDeck(uid, { deckId: 'missing', expectedVersion: 1 }, store), PersonalDeckNotFoundError);
  await assert.rejects(renamePersonalDeck(uid, { deckId: 'missing', expectedVersion: 1, name: 'Novo' }, store, clock), PersonalDeckNotFoundError);
  await assert.rejects(updatePersonalDeck(uid, { deckId: 'missing', expectedVersion: 1, draft: draft() }, store, reader, clock), PersonalDeckNotFoundError);
  await assert.rejects(duplicatePersonalDeck(uid, { sourceDeckId: 'missing', expectedSourceVersion: 1, newDeckId: 'new' }, store, reader, clock), PersonalDeckNotFoundError);
  assert.equal((await collection(uid).get()).size, 0);
});

test('existing targets fail without overwrite for create, duplicate and direct create preconditions', async () => {
  const uid = owner();
  await seed(uid, 2);
  const before = await collection(uid).doc('seed-1').get();
  await assert.rejects(createPersonalDeck(uid, { deckId: 'seed-1', draft: draft({ name: 'Overwrite' }) }, store, reader, clock), PersonalDeckAlreadyExistsError);
  await assert.rejects(duplicatePersonalDeck(uid, { sourceDeckId: 'seed-0', expectedSourceVersion: 1, newDeckId: 'seed-1' }, store, reader, clock), PersonalDeckAlreadyExistsError);
  // No prior get: this exercises Firestore's actual create-if-absent commit precondition.
  await assert.rejects(store.runTransaction(uid, async tx => {
    tx.create(resource('queued-before-failure'));
    tx.create(resource('seed-1', { draft: draft({ name: 'Overwrite' }) }));
  }));
  const after = await collection(uid).doc('seed-1').get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime!.isEqual(before.updateTime!));
  assert.equal((await collection(uid).doc('queued-before-failure').get()).exists, false);
  assert.equal((await collection(uid).get()).size, 2);
});

test('rename and update no-op preserve Firestore updateTime without consulting the clock', async () => {
  const uid = owner();
  const created = await createPersonalDeck(uid, { deckId: 'deck-a', draft: draft() }, store, reader, clock);
  const before = await collection(uid).doc('deck-a').get();
  const unreadClock = { now: (): string => { throw new Error('No-op must not read the clock'); } };
  assert.deepEqual(await renamePersonalDeck(uid, { deckId: 'deck-a', expectedVersion: 1, name: ' Meu Deck ' }, store, unreadClock), created);
  assert.deepEqual(await updatePersonalDeck(uid, { deckId: 'deck-a', expectedVersion: 1, draft: draft() }, store, reader, unreadClock), created);
  const after = await collection(uid).doc('deck-a').get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime!.isEqual(before.updateTime!));
});

test('replace and delete require existence confirmed by get or list, never no read or absence', async () => {
  const uid = owner();
  await seed(uid, 1);
  const before = await collection(uid).doc('seed-0').get();
  for (const mode of ['unread', 'absent'] as const) {
    for (const operation of ['replace', 'delete'] as const) {
      const id = mode === 'absent' ? 'missing' : 'seed-0';
      await assert.rejects(store.runTransaction(uid, async tx => {
        if (mode === 'absent') assert.equal(await tx.get(id), null);
        if (operation === 'replace') tx.replace(resource(id));
        else tx.delete(id);
      }), `${operation} must reject ${mode} existence confirmation`);
    }
  }
  assert.equal((await collection(uid).doc('missing').get()).exists, false);
  const after = await collection(uid).doc('seed-0').get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime!.isEqual(before.updateTime!));
  await store.runTransaction(uid, async tx => {
    assert.ok(await tx.get('seed-0'));
    tx.replace(resource('seed-0', { version: 5, draft: draft({ name: 'Full replacement', entries: [] }), updatedAt: laterTime }));
  });
  assert.deepEqual((await collection(uid).doc('seed-0').get()).data(), persisted(resource('seed-0', {
    version: 5, draft: draft({ name: 'Full replacement', entries: [] }), updatedAt: laterTime,
  })));
  await store.runTransaction(uid, async tx => {
    const listed = await tx.list(PERSONAL_DECK_LIMITS.maxDecks);
    assert.equal(listed[0].id, 'seed-0');
    tx.replace(resource('seed-0', { version: 6, updatedAt: laterTime }));
  });
  assert.equal((await collection(uid).doc('seed-0').get()).data()?.['version'], 6);
  await store.runTransaction(uid, async tx => {
    const listed = await tx.list(PERSONAL_DECK_LIMITS.maxDecks);
    assert.equal(listed[0].id, 'seed-0');
    tx.delete('seed-0');
  });
  assert.equal((await collection(uid).get()).size, 0);
});

test('reads after queued writes abort the entire transaction for get and list', async () => {
  const uid = owner();
  for (const operation of ['get', 'list'] as const) {
    await assert.rejects(store.runTransaction(uid, async tx => {
      tx.create(resource(`queued-${operation}`));
      if (operation === 'get') await tx.get('other');
      else await tx.list(PERSONAL_DECK_LIMITS.maxDecks);
    }));
  }
  assert.equal((await collection(uid).get()).size, 0);
});

test('writes cannot race pending reads and transaction handles expire with their callback', async () => {
  const uid = owner();
  await seed(uid, 1);
  for (const operation of ['get', 'list'] as const) {
    await assert.rejects(store.runTransaction(uid, async tx => {
      const pending = operation === 'get' ? tx.get('seed-0') : tx.list(PERSONAL_DECK_LIMITS.maxDecks);
      try { tx.create(resource('racing-write')); } finally { await pending; }
    }));
  }
  let retained: PersonalDeckStoreTransaction | undefined;
  await store.runTransaction(uid, async tx => { retained = tx; assert.ok(await tx.get('seed-0')); });
  assert.ok(retained);
  await assert.rejects(retained.get('seed-0'));
  await assert.rejects(retained.list(PERSONAL_DECK_LIMITS.maxDecks));
  assert.throws(() => retained!.create(resource('late-create')));
  assert.throws(() => retained!.replace(resource('seed-0')));
  assert.throws(() => retained!.delete('seed-0'));
  assert.equal((await collection(uid).get()).size, 1);
});

test('callback failure rolls back every queued create, replace and delete and propagates the error', async () => {
  const uid = owner();
  await seed(uid, 2);
  const before = await collection(uid).get();
  const failure = new Error('Expected callback failure');
  await assert.rejects(store.runTransaction(uid, async tx => {
    assert.ok(await tx.get('seed-0'));
    assert.ok(await tx.get('seed-1'));
    tx.create(resource('new-deck'));
    tx.replace(resource('seed-0', { version: 2, updatedAt: laterTime }));
    tx.delete('seed-1');
    throw failure;
  }), error => error === failure);
  const after = await collection(uid).get();
  assert.deepEqual(after.docs.map(doc => doc.data()), before.docs.map(doc => doc.data()));
  after.docs.forEach((doc, index) => assert.ok(doc.updateTime.isEqual(before.docs[index].updateTime)));
});

test('real concurrent edits enforce expected version and commit one mutation', { timeout: 120000 }, async () => {
  const uid = owner();
  await seed(uid, 1);
  const results = await Promise.allSettled([
    renamePersonalDeck(uid, { deckId: 'seed-0', expectedVersion: 1, name: 'Concurrent A' }, store, laterClock),
    renamePersonalDeck(uid, { deckId: 'seed-0', expectedVersion: 1, name: 'Concurrent B' }, store, laterClock),
  ]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(results.filter(value => value.status === 'rejected' && value.reason instanceof PersonalDeckConflictError).length, 1);
  assert.equal((await collection(uid).doc('seed-0').get()).data()?.['version'], 2);
});

test('malformed persisted documents fail get, list and capacity checks without silent filtering or migration', { timeout: 120000 }, async t => {
  const correct = persisted();
  const malformed: readonly { name: string; value: DocumentData }[] = [
    { name: 'unknown-schema', value: { ...correct, schemaVersion: 2 } },
    { name: 'string-schema', value: { ...correct, schemaVersion: '1' } },
    { name: 'missing-schema', value: Object.fromEntries(Object.entries(correct).filter(([key]) => key !== 'schemaVersion')) },
    { name: 'missing-name', value: Object.fromEntries(Object.entries(correct).filter(([key]) => key !== 'name')) },
    { name: 'missing-createdAt', value: Object.fromEntries(Object.entries(correct).filter(([key]) => key !== 'createdAt')) },
    { name: 'missing-updatedAt', value: Object.fromEntries(Object.entries(correct).filter(([key]) => key !== 'updatedAt')) },
    { name: 'extra-id', value: { ...correct, id: 'spoofed' } },
    { name: 'extra-uid', value: { ...correct, uid: 'spoofed' } },
    { name: 'extra-owner', value: { ...correct, ownerUid: 'spoofed' } },
    { name: 'extra-draft', value: { ...correct, draft: draft() } },
    { name: 'extra-playable', value: { ...correct, isPlayable: true } },
    { name: 'invalid-name', value: { ...correct, name: '   ' } },
    { name: 'invalid-version', value: { ...correct, version: 0 } },
    { name: 'fractional-version', value: { ...correct, version: 1.5 } },
    { name: 'unsupported-rules', value: { ...correct, rulesVersion: '99' } },
    { name: 'invalid-content-version', value: { ...correct, contentVersion: '../other' } },
    { name: 'invalid-entry', value: { ...correct, entries: [{ cardId: 'card-a', revision: 0, quantity: 1 }] } },
    { name: 'extra-entry-field', value: { ...correct, entries: [{ cardId: 'card-a', revision: 3, quantity: 1, eligible: true }] } },
    { name: 'invalid-quantity', value: { ...correct, entries: [{ cardId: 'card-a', revision: 3, quantity: 3 }] } },
    { name: 'iso-timestamp', value: { ...correct, createdAt: initialTime } },
    { name: 'numeric-timestamp', value: { ...correct, updatedAt: Date.parse(initialTime) } },
    { name: 'null-timestamp', value: { ...correct, updatedAt: null } },
    { name: 'timestamp-like-object', value: { ...correct, updatedAt: { seconds: 1, nanoseconds: 0 } } },
    { name: 'submillisecond-created', value: { ...correct, createdAt: new Timestamp(correct['createdAt'].seconds, 122001000) } },
    { name: 'submillisecond-updated', value: { ...correct, updatedAt: new Timestamp(correct['updatedAt'].seconds, 123001000) } },
    { name: 'regressive-dates', value: { ...correct, createdAt: Timestamp.fromDate(new Date(laterTime)) } },
  ];
  for (const value of malformed) {
    await t.test(value.name, async () => {
      const uid = owner();
      await collection(uid).doc('bad').set(value.value);
      const before = await collection(uid).doc('bad').get();
      await assert.rejects(store.runTransaction(uid, tx => tx.get('bad')));
      await assert.rejects(store.runTransaction(uid, tx => tx.list(PERSONAL_DECK_LIMITS.maxDecks)));
      await assert.rejects(createPersonalDeck(uid, { deckId: 'new-deck', draft: draft() }, store, reader, clock));
      const after = await collection(uid).doc('bad').get();
      assert.deepEqual(after.data(), before.data());
      assert.ok(after.updateTime!.isEqual(before.updateTime!));
      assert.equal((await collection(uid).get()).size, 1);
    });
  }
});

test('writes validate the existing shared resource parser and abort earlier queued writes', async () => {
  const uid = owner();
  const invalid = [
    { ...resource('invalid'), uid: 'forged' },
    { ...resource('invalid'), version: 0 },
    { ...resource('invalid'), updatedAt: '2026-10-29T12:00:00Z' },
    { ...resource('invalid'), draft: { ...draft(), eligible: true } },
  ];
  for (const value of invalid) {
    await assert.rejects(store.runTransaction(uid, async tx => {
      tx.create(resource('queued-valid'));
      tx.create(value as PersonalDeckResource);
    }));
    assert.equal((await collection(uid).get()).size, 0);
  }
  await assert.rejects(store.runTransaction(uid, async tx => {
    tx.create(resource('queued-valid'));
    try { tx.create(invalid[0] as PersonalDeckResource); } catch { /* A caught validation error must still poison this unit. */ }
  }));
  assert.equal((await collection(uid).get()).size, 0);
});

test('trusted UID, document IDs and read ceiling reject paths and invalid segments before access', async () => {
  const uid = owner();
  for (const invalidUid of ['', '.', '..', 'one/two', '\ud800', '__reserved__', 'x'.repeat(1501)]) {
    let called = false;
    await assert.rejects(store.runTransaction(invalidUid, async () => { called = true; }));
    assert.equal(called, false);
  }
  for (const invalidId of ['', '.', '..', 'one/two', 'one\\two', '__reserved__']) {
    await assert.rejects(store.runTransaction(uid, tx => tx.get(invalidId)));
    await assert.rejects(store.runTransaction(uid, async tx => { tx.delete(invalidId); }));
  }
  for (const invalidLimit of [0, 19, 21, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
    await assert.rejects(store.runTransaction(uid, tx => tx.list(invalidLimit as PersonalDeckReadLimit)));
  }
  assert.equal((await collection(uid).get()).size, 0);
});
