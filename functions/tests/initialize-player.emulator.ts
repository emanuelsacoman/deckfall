import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { PLAYER_FUNCTIONS_REGION } from '../src/config';

// This test intentionally refuses all real projects and remote service hosts.
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
const app = initializeApp({ projectId }, 'bootstrap-integration');
const firestore = getFirestore(app);
const endpoint = `http://${functionsHost}/${projectId}/${PLAYER_FUNCTIONS_REGION}/initializePlayer`;
let accountNumber = 0;
let token: string;
let uid: string;

interface CallableResponse {
  result?: { initialized: true; alreadyInitialized: boolean; cardsGranted: number };
  error?: { status: string; message: string };
}

async function call(data: unknown = {}, authToken: string | null = token): Promise<CallableResponse> {
  const response = await fetch(endpoint, {
    method: 'POST', headers: {
      'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify({ data }), signal: AbortSignal.timeout(20000)
  });
  return await response.json() as CallableResponse;
}

async function collection(cardId: string) {
  return await firestore.doc(`users/${uid}/collection/${cardId}`).get();
}

async function assertNoGrant(): Promise<void> {
  assert.equal((await firestore.doc(`players/${uid}`).get()).exists, false);
  assert.equal((await firestore.collection(`users/${uid}/collection`).get()).size, 0);
}

before(async () => {
  const response = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});

beforeEach(async () => {
  const cleared = await fetch(`http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(cleared.ok, true);
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `bootstrap-${++accountNumber}@example.test`, password: randomBytes(24).toString('base64url'), returnSecureToken: true })
  });
  assert.equal(response.ok, true);
  const account = await response.json() as { localId: string; idToken: string };
  uid = account.localId;
  token = account.idToken;
  await Promise.all([
    firestore.doc(`users/${uid}`).set({ role: 'member', roleId: 'member' }),
    firestore.doc('cards/cardA').set({ status: 'published' }),
    firestore.doc('cards/cardC').set({ status: 'published' }),
    firestore.doc('starterCollections/default').set({
      active: true, version: 1,
      cards: [{ cardId: 'cardA', quantity: 2 }, { cardId: 'cardC', quantity: 1 }],
      updatedAt: FieldValue.serverTimestamp()
    })
  ]);
});

after(async () => { await firestore.terminate(); await deleteApp(app); });

test('callable rejects an anonymous request before all writes', async () => {
  assert.equal((await call({}, null)).error?.status, 'UNAUTHENTICATED');
  await assertNoGrant();
});

test('callable cannot grant to a caller-selected UID', async () => {
  assert.equal((await call({ uid: 'another-user' })).error?.status, 'INVALID_ARGUMENT');
  await assertNoGrant();
});

test('callable rejects missing and inconsistent users profiles', async () => {
  await firestore.doc(`users/${uid}`).delete();
  assert.equal((await call()).error?.status, 'PERMISSION_DENIED');
  await assertNoGrant();
  await firestore.doc(`users/${uid}`).set({ role: 'admin', roleId: 'member' });
  assert.equal((await call()).error?.status, 'PERMISSION_DENIED');
  await assertNoGrant();
});

test('callable grants with real server timestamps and only the minimum player fields', async () => {
  assert.deepEqual((await call()).result, { initialized: true, alreadyInitialized: false, cardsGranted: 3 });
  const player = (await firestore.doc(`players/${uid}`).get()).data()!;
  const owned = (await collection('cardA')).data()!;
  assert.deepEqual(Object.keys(player).sort(), ['createdAt', 'starterGrantedAt', 'starterVersion', 'updatedAt']);
  assert.equal(player['starterVersion'], 1);
  assert.ok(player['createdAt'] instanceof Timestamp);
  assert.ok(player['starterGrantedAt'].isEqual(player['createdAt']));
  assert.ok(player['updatedAt'].isEqual(player['createdAt']));
  assert.equal(owned['quantity'], 2);
  assert.ok(owned['firstAcquiredAt'].isEqual(player['createdAt']));
  assert.ok(owned['lastAcquiredAt'].isEqual(player['createdAt']));
});

test('callable retry and subsequent starter edits never duplicate ownership', async () => {
  await call();
  const original = (await collection('cardA')).data()!;
  await firestore.doc('starterCollections/default').update({ version: 2, cards: [{ cardId: 'cardA', quantity: 9 }] });
  assert.deepEqual((await call()).result, { initialized: true, alreadyInitialized: true, cardsGranted: 0 });
  assert.deepEqual((await collection('cardA')).data(), original);
  assert.equal((await firestore.doc(`players/${uid}`).get()).data()?.['starterVersion'], 1);
});

test('real Firestore transactions serialize two simultaneous callable grants', async () => {
  const results = await Promise.all([call(), call()]);
  assert.equal(results.every(value => value.result?.initialized === true), true);
  assert.deepEqual(results.map(value => value.result!.alreadyInitialized).sort(), [false, true]);
  assert.equal((await collection('cardA')).data()?.['quantity'], 2);
  assert.equal((await collection('cardC')).data()?.['quantity'], 1);
});

test('callable adds to manually granted cards and preserves their firstAcquiredAt', async () => {
  const first = Timestamp.fromMillis(1000);
  await firestore.doc(`users/${uid}/collection/cardA`).set({ quantity: 3, firstAcquiredAt: first, lastAcquiredAt: first });
  await firestore.doc(`users/${uid}/collection/cardB`).set({ quantity: 4, firstAcquiredAt: first, lastAcquiredAt: first });
  assert.equal((await call()).result?.cardsGranted, 3);
  const owned = (await collection('cardA')).data()!;
  assert.equal(owned['quantity'], 5);
  assert.ok(owned['firstAcquiredAt'].isEqual(first));
  assert.ok(owned['lastAcquiredAt'].toMillis() > first.toMillis());
  assert.equal((await collection('cardB')).data()?.['quantity'], 4);
});

test('a draft starter card returns a clear error without partial documents', async () => {
  await firestore.doc('cards/cardC').update({ status: 'draft' });
  assert.equal((await call()).error?.status, 'FAILED_PRECONDITION');
  await assertNoGrant();
});

test('overflow on one entry preserves every existing entry and omits the marker', async () => {
  const first = Timestamp.fromMillis(1000);
  await firestore.doc(`users/${uid}/collection/cardC`).set({ quantity: 9999, firstAcquiredAt: first, lastAcquiredAt: first });
  assert.equal((await call()).error?.status, 'FAILED_PRECONDITION');
  assert.equal((await firestore.doc(`players/${uid}`).get()).exists, false);
  assert.equal((await collection('cardA')).exists, false);
  assert.equal((await collection('cardC')).data()?.['quantity'], 9999);
});

test('missing/inactive starter leaves players and ownership untouched', async () => {
  await firestore.doc('starterCollections/default').delete();
  assert.equal((await call()).error?.status, 'FAILED_PRECONDITION');
  await assertNoGrant();
  await firestore.doc('starterCollections/default').set({ active: false, version: 1, cards: [], updatedAt: FieldValue.serverTimestamp() });
  assert.equal((await call()).error?.status, 'FAILED_PRECONDITION');
  await assertNoGrant();
});

test('valid admins can initialize their own player profile', async () => {
  await firestore.doc(`users/${uid}`).update({ role: 'admin', roleId: 'admin' });
  assert.equal((await call()).result?.initialized, true);
  assert.equal((await collection('cardA')).data()?.['quantity'], 2);
});
