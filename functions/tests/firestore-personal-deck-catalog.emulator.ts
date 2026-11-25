import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import { createFirestorePersonalDeckCatalogReader } from '../src/decks/firestore-personal-deck-catalog';
import { createFirestorePersonalDeckStore } from '../src/decks/firestore-personal-deck-store';
import { createPersonalDeck } from '../src/decks/create-personal-deck';
import { updatePersonalDeck } from '../src/decks/update-personal-deck';
import { duplicatePersonalDeck } from '../src/decks/duplicate-personal-deck';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckConflictError,
  PersonalDeckContentError, PersonalDeckContentUnavailableError, PersonalDeckNotFoundError,
} from '../src/decks/personal-deck-errors';
import { GameplayContractError, GameplayDeckValidationError, parsePersonalDeckDraft, parsePersonalDeckResource } from '../src/gameplay';
import type { GameplayDeckCatalog, GameplayDeckList, PersonalDeckDraft, PersonalDeckResource } from '../src/gameplay';

// Fail closed before initializing Admin SDK: fixtures and cleanup belong only to this emulator run.
const projectId = 'demo-cardgame';
assert.match(process.env['FIRESTORE_EMULATOR_HOST'] ?? '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(process.env['GCLOUD_PROJECT'], projectId);
if (process.env['GOOGLE_CLOUD_PROJECT'] !== undefined) assert.equal(process.env['GOOGLE_CLOUD_PROJECT'], projectId);
const app = initializeApp({ projectId }, `historical-catalog-${randomUUID()}`);
const firestore = getFirestore(app);
const reader = createFirestorePersonalDeckCatalogReader(firestore);
const store = createFirestorePersonalDeckStore(firestore);
const versions = new Set<string>();
const uids = new Set<string>();
const initialTime = '2026-11-25T12:34:56.789Z';
const editTime = '2026-11-25T13:34:56.123Z';
const duplicateTime = '2026-11-25T14:34:56.456Z';
const initialClock: PersonalDeckClock = { now: () => initialTime };
const editClock: PersonalDeckClock = { now: () => editTime };
const duplicateClock: PersonalDeckClock = { now: () => duplicateTime };

function version(): string {
  const id = `catalog-${randomUUID()}`;
  versions.add(id);
  return id;
}

function fixture(contentVersion: string) {
  const catalog: GameplayDeckCatalog = {
    rulesVersion: '0.1', contentVersion,
    cards: Array.from({ length: 12 }, (_, index) => ({
      definition: { kind: 'unit' as const, cardId: `unit-${index}`, revision: index + 1,
        cost: 1, power: 2, maxLife: 3, guard: index === 0 }, eligible: true,
    })),
  };
  // Include a deeply nested effect and an ineligible historical definition outside the training deck.
  const withActions: GameplayDeckCatalog = { ...catalog, cards: [...catalog.cards,
    { definition: { kind: 'action', cardId: 'old-action', revision: 17, cost: 2,
      effect: { kind: 'damage', amount: 3 } }, eligible: false },
  ] };
  const referenceDeck: GameplayDeckList = {
    rulesVersion: '0.1', contentVersion,
    entries: catalog.cards.map(card => ({ cardId: card.definition.cardId, revision: card.definition.revision, quantity: 2 })),
  };
  return { schemaVersion: 1, catalog: withActions,
    trainingReferences: [{ referenceId: 'training-standard', referenceDeck }],
    createdAt: Timestamp.fromDate(new Date(initialTime)) };
}

function document(contentVersion: string) { return firestore.collection('gameplayContentVersions').doc(contentVersion); }

async function seed(contentVersion: string, data: DocumentData = fixture(contentVersion)): Promise<void> {
  await document(contentVersion).create(data);
}

function normalizedBytes(data: ReturnType<typeof fixture>): number {
  // Independent oracle: include the entire envelope, including references and the ISO UTC date.
  return Buffer.byteLength(JSON.stringify({ ...data, createdAt: data.createdAt.toDate().toISOString() }), 'utf8');
}

function sizedFixture(contentVersion: string, bytes: number): ReturnType<typeof fixture> {
  const data = fixture(contentVersion);
  data.trainingReferences = [];
  const referenceDeck = fixture(contentVersion).trainingReferences[0].referenceDeck;
  while (true) {
    const next = { referenceId: `ref-${data.trainingReferences.length}`, referenceDeck };
    data.trainingReferences.push(next);
    if (normalizedBytes(data) > bytes) { data.trainingReferences.pop(); break; }
  }
  let remaining = bytes - normalizedBytes(data);
  for (const reference of data.trainingReferences) {
    const padding = Math.min(remaining, 128 - reference.referenceId.length);
    reference.referenceId += 'x'.repeat(padding);
    remaining -= padding;
  }
  assert.equal(remaining, 0, 'Fixture must reach the byte boundary using valid reference IDs');
  assert.equal(normalizedBytes(data), bytes);
  return data;
}

function personalRequest(contentVersion: string) {
  return { deckId: 'historical-draft', draft: { name: 'Historical draft', rulesVersion: '0.1', contentVersion,
    entries: [{ cardId: 'old-action', revision: 17, quantity: 1 }] } };
}

function user(): string {
  const uid = `catalog-reader-${randomUUID()}`;
  uids.add(uid);
  return uid;
}

function decks(uid: string) {
  assert.ok(uids.has(uid), 'Fixture access is restricted to UIDs owned by this run');
  return firestore.collection('users').doc(uid).collection('decks');
}

async function createSource(uid: string, contentVersion: string, overrides: Partial<PersonalDeckDraft> = {}, deckId = 'source') {
  return createPersonalDeck(uid, { deckId, draft: { ...personalRequest(contentVersion).draft, ...overrides } },
    store, reader, initialClock);
}

async function captureDecks(uid: string) {
  return (await decks(uid).get()).docs.map(snapshot => ({
    id: snapshot.id, data: snapshot.data(), updateTime: snapshot.updateTime,
  }));
}

async function assertUnchanged(uid: string, before: Awaited<ReturnType<typeof captureDecks>>) {
  assert.deepEqual(await captureDecks(uid), before, 'All documents, including updateTime, must remain intact');
}

async function assertPersisted(uid: string, expected: PersonalDeckResource) {
  const snapshot = await decks(uid).doc(expected.id).get();
  const data = snapshot.data()!;
  assert.ok(snapshot.exists);
  assert.deepEqual(Object.keys(data).sort(),
    ['contentVersion', 'createdAt', 'entries', 'name', 'rulesVersion', 'schemaVersion', 'updatedAt', 'version']);
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.createdAt instanceof Timestamp && data.updatedAt instanceof Timestamp);
  // Check the database independently of the store's decoder, then check the real adapter round-trip.
  assert.deepEqual(parsePersonalDeckResource({
    id: snapshot.id, version: data.version,
    draft: { name: data.name, rulesVersion: data.rulesVersion, contentVersion: data.contentVersion, entries: data.entries },
    createdAt: data.createdAt.toDate().toISOString(), updatedAt: data.updatedAt.toDate().toISOString(),
  }), expected);
  assert.deepEqual(await store.runTransaction(uid, tx => tx.get(expected.id)), expected);
}

/** A gate outside transaction callbacks; every historical read still goes through the real adapter. */
function pausedHistoricalReader() {
  let reached!: () => void;
  let release!: () => void;
  let entered = false;
  const arrived = new Promise<void>(resolve => { reached = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  const gatedReader: PersonalDeckCatalogReader = {
    get: async contentVersion => {
      const catalog = await reader.get(contentVersion);
      entered = true;
      reached();
      await proceed;
      return catalog;
    },
  };
  return { reader: gatedReader, arrived, release, entered: () => entered };
}

/** Inject only a failing real commit precondition; no reads, writes or results are simulated. */
function failingCommitStore(blocker: PersonalDeckResource, writes: string[]): PersonalDeckStore {
  return {
    runTransaction: (uid, action) => store.runTransaction(uid, async tx => {
      let wrote = false;
      const result = await action({
        ...tx,
        create: value => { tx.create(value); wrote = true; writes.push(`create:${value.id}`); },
        replace: value => { tx.replace(value); wrote = true; writes.push(`replace:${value.id}`); },
      });
      if (wrote) {
        // This document already exists. The emulator must reject the whole commit with code 6.
        tx.create(blocker);
        writes.push(`precondition:${blocker.id}`);
      }
      return result;
    }),
  };
}

after(async () => {
  // Never flush a database or delete content owned by another run.
  for (const uid of uids) {
    const decks = await firestore.collection('users').doc(uid).collection('decks').get();
    const batch = firestore.batch();
    decks.docs.forEach(snapshot => batch.delete(snapshot.ref));
    if (!decks.empty) await batch.commit();
  }
  const batch = firestore.batch();
  for (const id of versions) batch.delete(document(id));
  if (versions.size) await batch.commit();
  await firestore.terminate();
  await deleteApp(app);
});

test('reads the requested historical catalog with exact canonical profiles and revisions', async () => {
  const id = version();
  const data = fixture(id);
  await seed(id, data);
  assert.deepEqual(await reader.get(id), data.catalog);
});

test('missing historical content returns null without falling back to another existing version', async () => {
  await seed(version());
  assert.equal(await reader.get(version()), null);
});

test('required trainingReferences may be empty and do not change the catalog', async () => {
  const id = version();
  const data = { ...fixture(id), trainingReferences: [] };
  await seed(id, data);
  assert.deepEqual(await reader.get(id), data.catalog);
});

for (const schemaVersion of [0, 2, '1', null]) {
  test(`rejects unknown schemaVersion ${JSON.stringify(schemaVersion)}`, async () => {
    const id = version();
    await seed(id, { ...fixture(id), schemaVersion });
    await assert.rejects(reader.get(id), GameplayContractError);
  });
}

test('rejects an existing empty document instead of reporting absence', async () => {
  const id = version();
  await seed(id, {});
  await assert.rejects(reader.get(id), GameplayContractError);
});

for (const field of ['schemaVersion', 'catalog', 'trainingReferences', 'createdAt']) {
  test(`rejects missing envelope field ${field}`, async () => {
    const id = version();
    const data: DocumentData = fixture(id);
    delete data[field];
    await seed(id, data);
    await assert.rejects(reader.get(id), GameplayContractError);
  });
}

test('rejects extra envelope fields', async () => {
  const id = version();
  await seed(id, { ...fixture(id), active: true });
  await assert.rejects(reader.get(id), GameplayContractError);
});

test('rejects catalog contentVersion different from the document ID', async () => {
  const id = version();
  await seed(id, fixture('another-history'));
  await assert.rejects(reader.get(id), GameplayContractError);
});

const corruptCatalogs: [string, (data: DocumentData) => void][] = [
  ['unknown rules', data => { data.catalog.rulesVersion = '0.2'; }],
  ['extra catalog field', data => { data.catalog.ownerUid = 'forged'; }],
  ['missing catalog cards', data => { delete data.catalog.cards; }],
  ['duplicate canonical identity', data => { data.catalog.cards.push(data.catalog.cards[0]); }],
  ['duplicate identity with a different revision', data => { data.catalog.cards.push({
    ...data.catalog.cards[0], definition: { ...data.catalog.cards[0].definition, revision: 99 },
  }); }],
  ['invalid eligibility', data => { data.catalog.cards[0].eligible = 'false'; }],
  ['extra card field', data => { data.catalog.cards[0].published = true; }],
  ['missing definition', data => { delete data.catalog.cards[0].definition; }],
  ['invalid unit definition', data => { data.catalog.cards[0].definition.maxLife = 0; }],
  ['invalid revision', data => { data.catalog.cards[0].definition.revision = 0; }],
  ['extra definition field', data => { data.catalog.cards[0].definition.rarity = 'rare'; }],
  ['invalid action effect', data => { data.catalog.cards[12].definition.effect.amount = 2; }],
  ['extra effect field', data => { data.catalog.cards[12].definition.effect.target = 'any'; }],
];
for (const [description, corrupt] of corruptCatalogs) {
  test(`rejects corrupted catalog: ${description}`, async () => {
    const id = version();
    const data: DocumentData = fixture(id);
    corrupt(data);
    await seed(id, data);
    await assert.rejects(reader.get(id), GameplayContractError);
  });
}

for (const [description, createdAt] of [
  ['ISO string', initialTime], ['null', null], ['number', 123],
  ['timestamp-shaped map', { seconds: 123, nanoseconds: 0 }],
] as const) {
  test(`rejects invalid createdAt: ${description}`, async () => {
    const id = version();
    await seed(id, { ...fixture(id), createdAt });
    await assert.rejects(reader.get(id), GameplayContractError);
  });
}

test('accepts a valid microsecond Timestamp without rewriting its source precision', async () => {
  const id = version();
  const createdAt = new Timestamp(123, 1000);
  await seed(id, { ...fixture(id), createdAt });
  assert.deepEqual(await reader.get(id), fixture(id).catalog);
  assert.ok((await document(id).get()).get('createdAt').isEqual(createdAt));
});

for (const iso of ['0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z']) {
  test(`accepts exact millisecond Timestamp at ${iso}`, async () => {
    const id = version();
    await seed(id, { ...fixture(id), createdAt: Timestamp.fromDate(new Date(iso)) });
    assert.deepEqual(await reader.get(id), fixture(id).catalog);
  });
}

for (const bytes of [65536, 65537]) {
  test(`${bytes === 65536 ? 'accepts' : 'rejects'} the complete normalized envelope at ${bytes} bytes`, async () => {
    const id = version();
    const data = sizedFixture(id, bytes);
    assert.ok(Buffer.byteLength(JSON.stringify(data.catalog), 'utf8') < 65536,
      'Training references, rather than just the catalog, must count towards the limit');
    await seed(id, data);
    if (bytes === 65536) assert.deepEqual(await reader.get(id), data.catalog);
    else await assert.rejects(reader.get(id), GameplayContractError);
  });
}

test('preserves eligible=false and does not require collection, publication, UID or player configuration', async () => {
  const id = version();
  await seed(id);
  const result = await reader.get(id);
  assert.equal(result?.cards[12].eligible, false);
  assert.equal(result?.cards[12].definition.revision, 17);
});

const corruptReferences: [string, (data: DocumentData) => void][] = [
  ['not an array', data => { data.trainingReferences = {}; }],
  ['null reference', data => { data.trainingReferences = [null]; }],
  ['missing referenceId', data => { delete data.trainingReferences[0].referenceId; }],
  ['missing referenceDeck', data => { delete data.trainingReferences[0].referenceDeck; }],
  ['extra reference field', data => { data.trainingReferences[0].bypassOwnership = true; }],
  ['invalid reference ID', data => { data.trainingReferences[0].referenceId = 'references/path'; }],
  ['overlong reference ID', data => { data.trainingReferences[0].referenceId = 'r'.repeat(129); }],
  ['duplicate reference ID', data => { data.trainingReferences.push(data.trainingReferences[0]); }],
  ['unknown reference rules', data => { data.trainingReferences[0].referenceDeck.rulesVersion = '0.2'; }],
  ['extra deck field', data => { data.trainingReferences[0].referenceDeck.name = 'not part of deck list'; }],
];
for (const [description, corrupt] of corruptReferences) {
  test(`rejects malformed training reference: ${description}`, async () => {
    const id = version();
    const data: DocumentData = fixture(id);
    corrupt(data);
    await seed(id, data);
    await assert.rejects(reader.get(id), GameplayContractError);
  });
}

const invalidTrainingDecks: [string, string, (data: DocumentData) => void][] = [
  ['different content version', 'content-version', data => { data.trainingReferences[0].referenceDeck.contentVersion = 'other'; }],
  ['incomplete composition', 'size', data => { data.trainingReferences[0].referenceDeck.entries.pop(); }],
  ['too many copies', 'copies', data => {
    data.trainingReferences[0].referenceDeck.entries[0].quantity = 3;
    data.trainingReferences[0].referenceDeck.entries[1].quantity = 1;
  }],
  ['unknown identity', 'unknown-card', data => { data.trainingReferences[0].referenceDeck.entries[0].cardId = 'missing-card'; }],
  ['wrong revision', 'revision', data => { data.trainingReferences[0].referenceDeck.entries[0].revision = 99; }],
  ['ineligible identity', 'ineligible-card', data => { data.catalog.cards[0].eligible = false; }],
];
for (const [description, reason, corrupt] of invalidTrainingDecks) {
  test(`rejects the entire document for an invalid training deck: ${description}`, async () => {
    const id = version();
    const data: DocumentData = fixture(id);
    corrupt(data);
    await seed(id, data);
    await assert.rejects(reader.get(id), error => error instanceof GameplayDeckValidationError && error.reason === reason);
  });
}

test('checks all training references even when the first is valid', async () => {
  const id = version();
  const data = fixture(id);
  data.trainingReferences.push({ referenceId: 'broken-second-reference', referenceDeck: {
    rulesVersion: '0.1', contentVersion: id, entries: [],
  } });
  await seed(id, data);
  await assert.rejects(reader.get(id), GameplayDeckValidationError);
});

test('returns independent nested projections without changing the source data or updateTime', async () => {
  const id = version();
  await seed(id);
  const before = await document(id).get();
  const first = await reader.get(id);
  const second = await reader.get(id);
  assert.ok(first && second);
  assert.notEqual(first, second);
  assert.notEqual(first.cards, second.cards);
  assert.notEqual(first.cards[12].definition, second.cards[12].definition);
  const mutable = first as unknown as DocumentData;
  mutable.contentVersion = 'modified';
  mutable.cards[0].definition.revision = 999;
  mutable.cards[12].eligible = true;
  mutable.cards[12].definition.effect.amount = 1;
  mutable.cards.pop();
  assert.deepEqual(second, fixture(id).catalog);
  assert.deepEqual(await reader.get(id), fixture(id).catalog);
  const after = await document(id).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime?.isEqual(before.updateTime!));
});

test('propagates a real SDK database failure instead of returning null', async () => {
  const failedApp = initializeApp({ projectId }, `invalid-database-catalog-${randomUUID()}`);
  // A malformed database resource makes the loopback emulator reject the RPC deterministically.
  const failedFirestore = getFirestore(failedApp, 'invalid/database');
  try {
    const failedReader = createFirestorePersonalDeckCatalogReader(failedFirestore);
    const rpcFailure = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 3;
    const id = version();
    await assert.rejects(failedReader.get(id), rpcFailure);
    const uid = user();
    const decks = firestore.collection('users').doc(uid).collection('decks');
    assert.equal((await decks.get()).size, 0);
    await assert.rejects(createPersonalDeck(uid, personalRequest(id), store, failedReader,
      { now: () => initialTime }), rpcFailure);
    assert.equal((await decks.get()).size, 0);
    // Invalid identifiers must fail at the contract boundary even when the database cannot be used.
    await assert.rejects(failedReader.get('arbitrary/path'), GameplayContractError);
  } finally {
    await failedFirestore.terminate();
    await deleteApp(failedApp);
  }
});

for (const invalid of ['', '.', '..', 'a/b', 'a//b', '/root', 'history/', '__reserved__',
  'a'.repeat(129), 'with space', 'ação', 'line\nfeed', 'bad\\path', null, 123]) {
  test(`rejects malformed version/path ${JSON.stringify(invalid)}`, async () => {
    await assert.rejects(reader.get(invalid as string), GameplayContractError);
  });
}

for (const valid of ['a', 'A_1-valid', 'a'.repeat(128)]) {
  test(`accepts the valid identifier boundary of length ${valid.length}`, async () => {
    // Missing documents still demonstrate that the valid path reached the emulator.
    assert.equal(await reader.get(valid), null);
  });
}

test('createPersonalDeck integrates the real reader and store with a historical emulator fixture', async () => {
  const id = version();
  const uid = user();
  await seed(id);
  const request = personalRequest(id);
  const result = await createPersonalDeck(uid, request, store, reader, { now: () => initialTime });
  assert.deepEqual(result.draft, request.draft);
  assert.equal(result.version, 1);
  const persisted = await firestore.collection('users').doc(uid).collection('decks').doc(request.deckId).get();
  assert.equal(persisted.exists, true);
  assert.equal(persisted.get('contentVersion'), id);
  assert.deepEqual(persisted.get('entries'), request.draft.entries);
  assert.equal(persisted.get('version'), 1);
  assert.equal(persisted.get('createdAt').toDate().toISOString(), initialTime);
});

for (const condition of ['missing', 'corrupt', 'invalid-training-reference']) {
  test(`real reader/store prevent createPersonalDeck writes when historical content is ${condition}`, async () => {
    const id = version();
    const uid = user();
    const decks = firestore.collection('users').doc(uid).collection('decks');
    if (condition === 'corrupt') await seed(id, { ...fixture(id), schemaVersion: 2 });
    if (condition === 'invalid-training-reference') {
      const data = fixture(id);
      data.trainingReferences[0].referenceDeck = { rulesVersion: '0.1', contentVersion: id, entries: [] };
      await seed(id, data);
    }
    const before = await decks.get();
    assert.equal(before.size, 0);
    const errorType = condition === 'missing' ? PersonalDeckContentUnavailableError :
      condition === 'corrupt' ? GameplayContractError : GameplayDeckValidationError;
    await assert.rejects(createPersonalDeck(uid, personalRequest(id), store, reader,
      { now: () => initialTime }), errorType);
    assert.equal((await decks.get()).size, 0);
  });
}

// These domain integrations use the real catalog reader and store. Only clocks are deterministic
// fixtures; the two wrappers below synchronize a race or add an actual failing commit precondition.
test('real update persists the changed draft, increments version and preserves creation time', async () => {
  const uid = user();
  const id = version();
  await seed(id);
  const source = await createSource(uid, id);
  const before = await decks(uid).doc(source.id).get();
  const draft = { ...source.draft, name: '  Updated historical draft  ',
    entries: [{ cardId: 'old-action', revision: 17, quantity: 2 }] };
  const updated = await updatePersonalDeck(uid, { deckId: source.id, expectedVersion: source.version, draft },
    store, reader, editClock);
  assert.deepEqual(updated, { ...source, version: 2, updatedAt: editTime, draft: parsePersonalDeckDraft(draft) });
  assert.equal(updated.createdAt, initialTime);
  await assertPersisted(uid, updated);
  assert.equal((await decks(uid).get()).size, 1);
  assert.ok(!(await decks(uid).doc(source.id).get()).updateTime!.isEqual(before.updateTime!));
});

test('real update changes historical provenance and revision only when explicitly requested and recognized', async () => {
  const uid = user();
  const originalId = version();
  const nextId = version();
  await seed(originalId);
  const next: DocumentData = fixture(nextId);
  next.catalog.cards[0].definition.revision = 41;
  next.trainingReferences[0].referenceDeck.entries[0].revision = 41;
  await seed(nextId, next);
  const originalCatalog = await document(originalId).get();
  const nextCatalog = await document(nextId).get();
  const source = await createSource(uid, originalId, { entries: [{ cardId: 'unit-0', revision: 1, quantity: 1 }] });
  const before = await captureDecks(uid);
  const revision41 = [{ cardId: 'unit-0', revision: 41, quantity: 1 }];
  const wrongRevision = (error: unknown) => error instanceof PersonalDeckContentError && error.reason === 'revision';
  // Revision 41 exists in B, not A; revision 1 exists in A, not B. No automatic substitution is allowed.
  await assert.rejects(updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
    draft: { ...source.draft, entries: revision41 } }, store, reader, editClock), wrongRevision);
  await assert.rejects(updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
    draft: { ...source.draft, contentVersion: nextId } }, store, reader, editClock), wrongRevision);
  await assertUnchanged(uid, before);
  const updated = await updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
    draft: { ...source.draft, contentVersion: nextId, entries: revision41 } }, store, reader, editClock);
  assert.equal(updated.version, 2);
  assert.equal(updated.draft.contentVersion, nextId);
  assert.deepEqual(updated.draft.entries, revision41);
  assert.equal(source.draft.contentVersion, originalId);
  assert.deepEqual(source.draft.entries, [{ cardId: 'unit-0', revision: 1, quantity: 1 }]);
  await assertPersisted(uid, updated);
  for (const snapshot of [originalCatalog, nextCatalog]) {
    const after = await snapshot.ref.get();
    assert.deepEqual(after.data(), snapshot.data());
    assert.ok(after.updateTime!.isEqual(snapshot.updateTime!));
  }
});

test('real update normalized no-op preserves all data and Firestore updateTime without reading the clock', async () => {
  const uid = user();
  const id = version();
  await seed(id);
  const source = await createSource(uid, id, { entries: [
    { cardId: 'unit-0', revision: 1, quantity: 2 }, { cardId: 'old-action', revision: 17, quantity: 1 },
  ] });
  const before = await captureDecks(uid);
  let clockReads = 0;
  const clock: PersonalDeckClock = { now: () => { clockReads++; return editTime; } };
  const result = await updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
    draft: { ...source.draft, name: `  ${source.draft.name}  `, entries: [
      { cardId: 'unit-0', revision: 1, quantity: 1 }, { cardId: 'old-action', revision: 17, quantity: 1 },
      { cardId: 'unit-0', revision: 1, quantity: 1 },
    ] } }, store, reader, clock);
  assert.deepEqual(result, source);
  assert.equal(clockReads, 0);
  await assertUnchanged(uid, before);
  await assertPersisted(uid, result);
});

for (const composition of ['empty', 'partial-ineligible', 'complete']) {
  test(`real update accepts ${composition} drafts with the requested historical references intact`, async () => {
    const uid = user();
    const id = version();
    await seed(id);
    const source = await createSource(uid, id);
    const entries = composition === 'empty' ? [] : composition === 'partial-ineligible'
      ? [{ cardId: 'old-action', revision: 17, quantity: 1 }]
      : fixture(id).trainingReferences[0].referenceDeck.entries;
    const updated = await updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
      draft: { ...source.draft, name: `Updated ${composition}`, entries } }, store, reader, editClock);
    assert.equal(updated.version, 2);
    assert.deepEqual(updated.draft, parsePersonalDeckDraft({ ...source.draft, name: `Updated ${composition}`, entries }));
    assert.equal(updated.createdAt, source.createdAt);
    assert.equal(updated.updatedAt, editTime);
    await assertPersisted(uid, updated);
  });
}

test('real update refuses a stale expectedVersion without changing the persisted resource', async () => {
  const uid = user();
  const id = version();
  await seed(id);
  const source = await createSource(uid, id);
  const current = await updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
    draft: { ...source.draft, name: 'Committed version two' } }, store, reader, editClock);
  const before = await captureDecks(uid);
  await assert.rejects(updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
    draft: { ...current.draft, name: 'Stale overwrite' } }, store, reader, duplicateClock), PersonalDeckConflictError);
  await assertUnchanged(uid, before);
  await assertPersisted(uid, current);
});

test('real update with valid historical content still refuses a missing personal deck', async () => {
  const uid = user();
  const id = version();
  await seed(id);
  await assert.rejects(updatePersonalDeck(uid, { ...personalRequest(id), expectedVersion: 1 },
    store, reader, editClock), PersonalDeckNotFoundError);
  assert.equal((await decks(uid).get()).size, 0);
});

const historicalFailures = ['missing-catalog', 'corrupt-catalog', 'invalid-training-reference', 'unknown-identity', 'wrong-revision'] as const;
for (const operation of ['update', 'duplicate'] as const) {
  for (const condition of historicalFailures) {
    test(`real ${operation} refuses ${condition} without any partial or unrelated writes`, async () => {
      const uid = user();
      const id = version();
      await seed(id);
      const source = await createSource(uid, id);
      const unrelated = await createSource(uid, id, { name: 'Unrelated deck' }, 'unrelated');
      const badEntries = [{ cardId: condition === 'unknown-identity' ? 'unknown-card' : 'old-action',
        revision: condition === 'wrong-revision' ? 999 : 17, quantity: 1 }];
      if (condition === 'missing-catalog') await document(id).delete();
      if (condition === 'corrupt-catalog') await document(id).update({ schemaVersion: 2 });
      if (condition === 'invalid-training-reference') await document(id).update({
        trainingReferences: [{ referenceId: 'broken', referenceDeck: { rulesVersion: '0.1', contentVersion: id, entries: [] } }],
      });
      if (operation === 'duplicate' && (condition === 'unknown-identity' || condition === 'wrong-revision')) {
        // Simulate an anomalous historical reference only after a valid domain-created source exists.
        await firestore.runTransaction(async tx => {
          const snapshot = await tx.get(decks(uid).doc(source.id));
          assert.equal(snapshot.get('version'), 1);
          tx.update(snapshot.ref, { entries: badEntries });
        });
      }
      const before = await captureDecks(uid);
      const failure = (error: unknown) => condition === 'missing-catalog'
        ? error instanceof PersonalDeckContentUnavailableError
        : condition === 'corrupt-catalog' ? error instanceof GameplayContractError
        : condition === 'invalid-training-reference' ? error instanceof GameplayDeckValidationError
        : error instanceof PersonalDeckContentError && error.reason ===
          (condition === 'unknown-identity' ? 'unknown-card' : 'revision');
      const request = operation === 'update'
        ? updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
          draft: { ...source.draft, name: 'Must not be saved', entries: badEntries } }, store, reader, editClock)
        : duplicatePersonalDeck(uid, { sourceDeckId: source.id, expectedSourceVersion: 1, newDeckId: 'copy' },
          store, reader, duplicateClock);
      await assert.rejects(request, failure);
      await assertUnchanged(uid, before);
      assert.equal((await decks(uid).doc('copy').get()).exists, false);
      await assertPersisted(uid, unrelated);
      const retained = operation === 'duplicate' && (condition === 'unknown-identity' || condition === 'wrong-revision')
        ? { ...source, draft: { ...source.draft, entries: badEntries } } : source;
      await assertPersisted(uid, retained);
    });
  }
}

test('real duplicate resets version, preserves the normalized draft and leaves its origin entirely intact', async () => {
  const uid = user();
  const id = version();
  await seed(id);
  const created = await createSource(uid, id, { name: '  Normalized source  ', entries: [
    { cardId: 'unit-0', revision: 1, quantity: 1 }, { cardId: 'old-action', revision: 17, quantity: 1 },
    { cardId: 'unit-0', revision: 1, quantity: 1 },
  ] });
  const source = await updatePersonalDeck(uid, { deckId: created.id, expectedVersion: 1,
    draft: { ...created.draft, name: '  Updated normalized source  ' } }, store, reader, editClock);
  const before = await captureDecks(uid);
  const copy = await duplicatePersonalDeck(uid, { sourceDeckId: source.id, expectedSourceVersion: 2, newDeckId: 'copy' },
    store, reader, duplicateClock);
  assert.deepEqual(copy, { id: 'copy', version: 1, draft: source.draft, createdAt: duplicateTime, updatedAt: duplicateTime });
  assert.notEqual(copy.createdAt, source.createdAt);
  assert.notEqual(copy.updatedAt, source.updatedAt);
  assert.equal(copy.draft.name, 'Updated normalized source');
  assert.deepEqual(copy.draft.entries, [
    { cardId: 'old-action', revision: 17, quantity: 1 }, { cardId: 'unit-0', revision: 1, quantity: 2 },
  ]);
  assert.deepEqual((await captureDecks(uid)).filter(value => value.id !== copy.id), before);
  await assertPersisted(uid, source);
  await assertPersisted(uid, copy);
});

for (const composition of ['empty', 'partial-ineligible']) {
  test(`real duplicate preserves a ${composition} historical draft without requiring playability`, async () => {
    const uid = user();
    const id = version();
    await seed(id);
    const source = await createSource(uid, id, { entries: composition === 'empty' ? []
      : [{ cardId: 'old-action', revision: 17, quantity: 1 }] });
    const before = await captureDecks(uid);
    const copy = await duplicatePersonalDeck(uid, { sourceDeckId: source.id, expectedSourceVersion: 1, newDeckId: 'copy' },
      store, reader, duplicateClock);
    assert.deepEqual(copy.draft, source.draft);
    assert.equal(copy.version, 1);
    assert.equal(copy.createdAt, duplicateTime);
    assert.equal(copy.updatedAt, duplicateTime);
    assert.deepEqual((await captureDecks(uid)).filter(value => value.id !== copy.id), before);
    await assertPersisted(uid, source);
    await assertPersisted(uid, copy);
  });
}

for (const condition of ['missing-source', 'stale-source-version', 'existing-destination']) {
  test(`real duplicate refuses ${condition} without altering any document`, async () => {
    const uid = user();
    const id = version();
    await seed(id);
    const source = condition === 'missing-source' ? null : await createSource(uid, id);
    const destination = condition === 'existing-destination'
      ? await createSource(uid, id, { name: 'Existing destination' }, 'copy') : null;
    const before = await captureDecks(uid);
    const errorType = condition === 'missing-source' ? PersonalDeckNotFoundError
      : condition === 'stale-source-version' ? PersonalDeckConflictError : PersonalDeckAlreadyExistsError;
    await assert.rejects(duplicatePersonalDeck(uid, { sourceDeckId: 'source',
      expectedSourceVersion: condition === 'stale-source-version' ? 2 : 1, newDeckId: 'copy' },
      store, reader, duplicateClock), errorType);
    await assertUnchanged(uid, before);
    assert.equal((await decks(uid).doc('copy').get()).exists, destination !== null);
    if (source) await assertPersisted(uid, source);
    if (destination) await assertPersisted(uid, destination);
  });
}

for (const count of [19, 20]) {
  test(`real duplicate checks capacity with ${count} persisted decks including its source`, async () => {
    const uid = user();
    const id = version();
    await seed(id);
    const source = await createSource(uid, id);
    // Fillers are ordinary structurally valid decks, persisted by the real store in one transaction.
    await store.runTransaction(uid, async tx => {
      for (let index = 1; index < count; index++) tx.create({ ...source, id: `filler-${index}` });
    });
    const before = await captureDecks(uid);
    assert.equal(before.length, count);
    const operation = duplicatePersonalDeck(uid, { sourceDeckId: source.id, expectedSourceVersion: 1, newDeckId: 'copy' },
      store, reader, duplicateClock);
    if (count === 20) {
      await assert.rejects(operation, PersonalDeckCapacityError);
      await assertUnchanged(uid, before);
      assert.equal((await decks(uid).doc('copy').get()).exists, false);
    } else {
      const copy = await operation;
      assert.equal((await decks(uid).get()).size, 20);
      assert.deepEqual((await captureDecks(uid)).filter(value => value.id !== 'copy'), before);
      assert.deepEqual(copy.draft, source.draft);
      assert.equal(copy.version, 1);
      await assertPersisted(uid, copy);
    }
    await assertPersisted(uid, source);
    assert.equal((await store.runTransaction(uid, tx => tx.list(20))).length, 20);
  });
}

for (const change of ['version', 'composition-without-version']) {
  test(`real duplicate detects a committed ${change} change between discovery and final transaction`, { timeout: 20000 }, async () => {
    const uid = user();
    const id = version();
    await seed(id);
    const source = await createSource(uid, id);
    const gate = pausedHistoricalReader();
    const operation = duplicatePersonalDeck(uid, { sourceDeckId: source.id, expectedSourceVersion: 1, newDeckId: 'copy' },
      store, gate.reader, duplicateClock);
    let concurrent = source;
    let afterConcurrent!: Awaited<ReturnType<typeof captureDecks>>;
    try {
      // An early operation failure also releases this wait; no timer or sleep chooses the ordering.
      await Promise.race([gate.arrived, operation]);
      assert.ok(gate.entered(), 'Discovery and the real historical read must finish before the competing write');
      if (change === 'version') {
        concurrent = await updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
          draft: { ...source.draft, name: 'Concurrent version two' } }, store, reader, editClock);
      } else {
        // Deliberate anomaly: change only composition, preserving version and both domain timestamps.
        const entries = [{ cardId: 'old-action', revision: 17, quantity: 2 }];
        await firestore.runTransaction(async tx => {
          const snapshot = await tx.get(decks(uid).doc(source.id));
          assert.equal(snapshot.get('version'), 1);
          tx.update(snapshot.ref, { entries });
        });
        concurrent = { ...source, draft: { ...source.draft, entries } };
      }
      afterConcurrent = await captureDecks(uid);
    } finally { gate.release(); }
    await assert.rejects(operation, PersonalDeckConflictError);
    await assertUnchanged(uid, afterConcurrent);
    assert.equal((await decks(uid).doc('copy').get()).exists, false);
    await assertPersisted(uid, concurrent);
  });
}

for (const operation of ['update', 'duplicate'] as const) {
  test(`real ${operation} commit failure rolls back its queued write and preserves all updateTimes`, async () => {
    const uid = user();
    const id = version();
    await seed(id);
    const source = await createSource(uid, id);
    const blocker = await createSource(uid, id, { name: 'Existing precondition fixture' }, 'blocker');
    const before = await captureDecks(uid);
    const writes: string[] = [];
    const failingStore = failingCommitStore(blocker, writes);
    const result = operation === 'update'
      ? updatePersonalDeck(uid, { deckId: source.id, expectedVersion: 1,
        draft: { ...source.draft, name: 'Must roll back' } }, failingStore, reader, editClock)
      : duplicatePersonalDeck(uid, { sourceDeckId: source.id, expectedSourceVersion: 1, newDeckId: 'copy' },
        failingStore, reader, duplicateClock);
    await assert.rejects(result, error => error instanceof Error && 'code' in error && error.code === 6);
    assert.deepEqual(writes, [operation === 'update' ? 'replace:source' : 'create:copy', 'precondition:blocker'],
      'The domain write must be queued before the real commit precondition fails');
    await assertUnchanged(uid, before);
    assert.equal((await decks(uid).doc('copy').get()).exists, false);
    await assertPersisted(uid, source);
    await assertPersisted(uid, blocker);
  });
}
