import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import { createFirestorePersonalDeckCatalogReader } from '../src/decks/firestore-personal-deck-catalog';
import { createFirestorePersonalDeckStore } from '../src/decks/firestore-personal-deck-store';
import { createPersonalDeck } from '../src/decks/create-personal-deck';
import { PersonalDeckContentUnavailableError } from '../src/decks/personal-deck-errors';
import { GameplayContractError, GameplayDeckValidationError } from '../src/gameplay';
import type { GameplayDeckCatalog, GameplayDeckList } from '../src/gameplay';

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
