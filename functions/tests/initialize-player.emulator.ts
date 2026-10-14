import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { PLAYER_FUNCTIONS_REGION } from '../src/config';
import { InitializePlayerResult } from '../src/player-bootstrap';
import { OpenPackResult } from '../src/open-pack';

// The integration suite cannot access real projects or remote service hosts.
const projectId = 'demo-cardgame';
function emulatorHost(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  assert.ok(value && /^(127\.0\.0\.1|localhost):\d+$/.test(value), `${name} must point to a local emulator`);
  return value;
}
const firestoreHost = emulatorHost('FIRESTORE_EMULATOR_HOST');
const authHost = emulatorHost('FIREBASE_AUTH_EMULATOR_HOST');
const functionsHost = emulatorHost('FUNCTIONS_EMULATOR_HOST', '127.0.0.1:5001');
assert.equal(process.env['GCLOUD_PROJECT'], projectId, 'Only the demo-cardgame project is allowed');
const app = initializeApp({ projectId }, 'packs-integration');
const firestore = getFirestore(app);
let accountNumber = 0;
let token: string;
let uid: string;
const expectedSnapshot = [
  { cardId: 'cardA', name: 'Aurora', rarity: 'common', quantity: 2 },
  { cardId: 'cardC', name: 'Crepúsculo', rarity: 'legendary', quantity: 1 }
];
interface CallableResponse<T> { result?: T; error?: { status: string; message: string; details?: { reason?: string } }; }
async function call<T>(functionName: string, data: unknown, authToken: string | null = token): Promise<CallableResponse<T>> {
  const response = await fetch(`http://${functionsHost}/${projectId}/${PLAYER_FUNCTIONS_REGION}/${functionName}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ data }), signal: AbortSignal.timeout(20000)
  });
  return await response.json() as CallableResponse<T>;
}
const initialize = (data: unknown = {}, authToken: string | null = token) => call<InitializePlayerResult>('initializePlayer', data, authToken);
const open = (data: unknown = { packInstanceId: 'starter' }, authToken: string | null = token) => call<OpenPackResult>('openPack', data, authToken);
const packRef = () => firestore.doc(`users/${uid}/packs/starter`);
const collectionRef = (cardId: string) => firestore.doc(`users/${uid}/collection/${cardId}`);
async function assertNoGrant(): Promise<void> {
  assert.equal((await firestore.doc(`players/${uid}`).get()).exists, false);
  assert.equal((await firestore.collection(`users/${uid}/packs`).get()).size, 0);
  assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
}
async function signup(): Promise<{ localId: string; idToken: string }> {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `packs-${++accountNumber}@example.test`, password: randomBytes(24).toString('base64url'), returnSecureToken: true })
  });
  assert.equal(response.ok, true); return await response.json() as { localId: string; idToken: string };
}
before(async () => {
  const response = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' }); assert.equal(response.ok, true);
});
beforeEach(async () => {
  const cleared = await fetch(`http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.equal(cleared.ok, true);
  const account = await signup(); uid = account.localId; token = account.idToken;
  const batch = firestore.batch();
  batch.set(firestore.doc(`users/${uid}`), { role: 'member', roleId: 'member' });
  batch.set(firestore.doc('cards/cardA'), { status: 'published', name: 'Aurora', rarity: 'common' });
  batch.set(firestore.doc('cards/cardC'), { status: 'published', name: 'Crepúsculo', rarity: 'legendary' });
  batch.set(firestore.doc('packDefinitions/starter'), {
    name: 'StarterPack', description: 'Inicie sua jornada.', active: true, currentVersion: 1,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(firestore.doc('packDefinitions/starter/versions/1'), {
    version: 1, cards: [{ cardId: 'cardA', quantity: 2 }, { cardId: 'cardC', quantity: 1 }], createdAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
});
after(async () => { await firestore.terminate(); await deleteApp(app); });

test('both Callables reject anonymous requests and do not write', async () => {
  assert.equal((await initialize({}, null)).error?.status, 'UNAUTHENTICATED');
  assert.equal((await open({ packInstanceId: 'starter' }, null)).error?.status, 'UNAUTHENTICATED'); await assertNoGrant();
});
test('both Callables reject UID/content injection', async () => {
  assert.equal((await initialize({ uid: 'other' })).error?.status, 'INVALID_ARGUMENT');
  assert.equal((await open({ packInstanceId: 'starter', uid: 'other' })).error?.status, 'INVALID_ARGUMENT');
  assert.equal((await open({ packInstanceId: 'starter', version: 2, cardIds: ['cardA'] })).error?.status, 'INVALID_ARGUMENT'); await assertNoGrant();
});
test('invalid profile blocks preparation and opening', async () => {
  await firestore.doc(`users/${uid}`).delete(); assert.equal((await initialize()).error?.status, 'PERMISSION_DENIED'); await assertNoGrant();
  await firestore.doc(`users/${uid}`).set({ role: 'admin', roleId: 'member' }); assert.equal((await initialize()).error?.status, 'PERMISSION_DENIED'); await assertNoGrant();
  await firestore.doc(`users/${uid}`).set({ role: 'member', roleId: 'member' }); await initialize();
  await firestore.doc(`users/${uid}`).update({ roleId: 'admin' }); assert.equal((await open()).error?.status, 'PERMISSION_DENIED');
  assert.equal((await packRef().get()).data()?.['state'], 'sealed');
});
test('full Auth -> bootstrap -> sealed -> open -> persisted reveal -> retry flow', async () => {
  assert.deepEqual((await initialize()).result, { initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter' });
  const player = (await firestore.doc(`players/${uid}`).get()).data()!;
  const sealed = (await packRef().get()).data()!;
  assert.deepEqual(Object.keys(player).sort(), ['createdAt', 'starterGrantedAt', 'starterPackInstanceId', 'starterVersion', 'updatedAt']);
  assert.equal(player['starterVersion'], 1); assert.equal(player['starterPackInstanceId'], 'starter'); assert.ok(player['createdAt'] instanceof Timestamp);
  assert.ok(player['starterGrantedAt'].isEqual(player['createdAt'])); assert.ok(player['updatedAt'].isEqual(player['createdAt']));
  assert.equal(sealed['state'], 'sealed'); assert.equal(sealed['openedAt'], null); assert.equal(Object.hasOwn(sealed, 'revealedCards'), false);
  assert.ok(sealed['acquiredAt'].isEqual(player['starterGrantedAt']));
  assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
  const result = (await open()).result!;
  assert.deepEqual(result, { packInstanceId: 'starter', alreadyOpened: false, revealedCards: expectedSnapshot });
  const opened = (await packRef().get()).data()!; assert.equal(opened['state'], 'opened'); assert.deepEqual(opened['revealedCards'], result.revealedCards);
  assert.ok(opened['openedAt'] instanceof Timestamp); assert.ok(opened['acquiredAt'].isEqual(sealed['acquiredAt']));
  const owned = (await collectionRef('cardA').get()).data()!; assert.equal(owned['quantity'], 2);
  assert.ok(owned['firstAcquiredAt'].isEqual(opened['openedAt'])); assert.ok(owned['lastAcquiredAt'].isEqual(opened['openedAt']));
  assert.deepEqual((await open()).result, { ...result, alreadyOpened: true }); assert.deepEqual((await collectionRef('cardA').get()).data(), owned);
  assert.deepEqual((await packRef().get()).data(), opened);
});
test('concurrent bootstrap Callables grant exactly one sealed instance with no cards', async () => {
  const results = await Promise.all([initialize(), initialize()]);
  assert.equal(results.every(value => value.result?.initialized === true), true);
  assert.deepEqual(results.map(value => value.result!.alreadyInitialized).sort(), [false, true]);
  assert.equal((await firestore.collection(`users/${uid}/packs`).get()).size, 1);
  assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
});
test('concurrent open Callables return same snapshot and increment only once', async () => {
  await initialize(); const results = await Promise.all([open(), open()]);
  assert.deepEqual(results.map(value => value.result!.alreadyOpened).sort(), [false, true]);
  assert.deepEqual(results[0].result!.revealedCards, results[1].result!.revealedCards);
  assert.equal((await collectionRef('cardA').get()).data()?.['quantity'], 2); assert.equal((await collectionRef('cardC').get()).data()?.['quantity'], 1);
});
test('currentVersion changes do not regrant and existing pack opens its original version while inactive', async () => {
  await initialize(); const original = (await packRef().get()).data()!;
  await firestore.doc('packDefinitions/starter/versions/2').set({ version: 2, cards: [{ cardId: 'cardA', quantity: 9 }], createdAt: FieldValue.serverTimestamp() });
  await firestore.doc('packDefinitions/starter').update({ currentVersion: 2, active: false, updatedAt: FieldValue.serverTimestamp() });
  assert.deepEqual((await initialize()).result, { initialized: true, alreadyInitialized: true, starterPackGranted: false, starterPackInstanceId: 'starter' });
  assert.deepEqual((await packRef().get()).data(), original);
  assert.deepEqual((await open()).result?.revealedCards, expectedSnapshot); assert.equal((await collectionRef('cardA').get()).data()?.['quantity'], 2);
});
test('open adds to admin-owned quantities preserving dates; bootstrap never changes them', async () => {
  const first = Timestamp.fromMillis(1000);
  await collectionRef('cardA').set({ quantity: 3, firstAcquiredAt: first, lastAcquiredAt: first });
  await collectionRef('cardB').set({ quantity: 4, firstAcquiredAt: first, lastAcquiredAt: first });
  await initialize(); assert.equal((await collectionRef('cardA').get()).data()?.['quantity'], 3);
  await open(); const owned = (await collectionRef('cardA').get()).data()!; assert.equal(owned['quantity'], 5);
  assert.ok(owned['firstAcquiredAt'].isEqual(first)); assert.ok(owned['lastAcquiredAt'].toMillis() > first.toMillis());
  assert.equal((await collectionRef('cardB').get()).data()?.['quantity'], 4);
});
test('draft prevents bootstrap entirely and withdrawal after grant leaves pack sealed', async () => {
  await firestore.doc('cards/cardC').update({ status: 'draft' }); assert.equal((await initialize()).error?.status, 'FAILED_PRECONDITION'); await assertNoGrant();
  await firestore.doc('cards/cardC').update({ status: 'published' }); await initialize(); const original = (await packRef().get()).data()!;
  await firestore.doc('cards/cardC').update({ status: 'archived' }); assert.equal((await open()).error?.status, 'FAILED_PRECONDITION');
  assert.deepEqual((await packRef().get()).data(), original); assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
});
test('overflow cancels all opening writes while leaving player and sealed instance intact', async () => {
  const first = Timestamp.fromMillis(1000); await collectionRef('cardC').set({ quantity: 9999, firstAcquiredAt: first, lastAcquiredAt: first });
  assert.equal((await initialize()).result?.starterPackGranted, true); const original = (await packRef().get()).data()!;
  assert.equal((await open()).error?.status, 'FAILED_PRECONDITION'); assert.deepEqual((await packRef().get()).data(), original);
  assert.equal((await collectionRef('cardA').get()).exists, false); assert.equal((await collectionRef('cardC').get()).data()?.['quantity'], 9999);
});
test('missing/inactive definition and missing version do not create grant markers', async () => {
  await firestore.doc('packDefinitions/starter').update({ active: false }); assert.equal((await initialize()).error?.status, 'FAILED_PRECONDITION'); await assertNoGrant();
  await firestore.doc('packDefinitions/starter').update({ active: true }); await firestore.doc('packDefinitions/starter/versions/1').delete();
  assert.equal((await initialize()).error?.status, 'FAILED_PRECONDITION'); await assertNoGrant();
  await firestore.doc('packDefinitions/starter').delete();
  const missing = await initialize();
  assert.equal(missing.error?.status, 'FAILED_PRECONDITION');
  assert.equal(missing.error?.details?.reason, 'starter-not-configured');
  await assertNoGrant();
});
test('another authenticated UID cannot open an owner pack even knowing its instance ID', async () => {
  await initialize(); const original = (await packRef().get()).data()!; const other = await signup();
  await firestore.doc(`users/${other.localId}`).set({ role: 'member', roleId: 'member' });
  await firestore.doc(`players/${other.localId}`).set((await firestore.doc(`players/${uid}`).get()).data()!);
  assert.equal((await open({ packInstanceId: 'starter' }, other.idToken)).error?.status, 'NOT_FOUND');
  assert.deepEqual((await packRef().get()).data(), original); assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
});
test('opened history remains recoverable after published card and definition removal', async () => {
  await initialize(); const result = (await open()).result!;
  const batch = firestore.batch(); batch.delete(firestore.doc('packDefinitions/starter')); batch.delete(firestore.doc('packDefinitions/starter/versions/1'));
  batch.delete(firestore.doc('cards/cardA')); batch.update(firestore.doc('cards/cardC'), { status: 'archived' }); await batch.commit();
  assert.deepEqual((await open()).result, { ...result, alreadyOpened: true }); assert.equal((await collectionRef('cardA').get()).data()?.['quantity'], 2);
  assert.equal((await initialize()).result?.alreadyInitialized, true);
});
test('admin has the same initialize/open flow with no client privileges used', async () => {
  await firestore.doc(`users/${uid}`).update({ role: 'admin', roleId: 'admin' });
  assert.equal((await initialize()).result?.starterPackGranted, true); assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
  assert.deepEqual((await open()).result?.revealedCards, expectedSnapshot);
});
test('legacy local direct-grant marker is rejected instead of silently awarding a pack', async () => {
  await firestore.doc(`players/${uid}`).set({ createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), starterGrantedAt: FieldValue.serverTimestamp(), starterVersion: 1 });
  assert.equal((await initialize()).error?.status, 'FAILED_PRECONDITION'); assert.equal((await firestore.collection(`users/${uid}/packs`).get()).size, 0);
  assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
});
