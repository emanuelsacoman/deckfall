import type { Firestore } from 'firebase-admin/firestore';
import type { PersonalDeckResource } from '../src/gameplay';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import { createFirestorePersonalDeckStore } from '../src/decks/firestore-personal-deck-store';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const firestore: Firestore;
declare const resource: PersonalDeckResource;
const factoryContract: Assert<Equal<typeof createFirestorePersonalDeckStore, (db: Firestore) => PersonalDeckStore>> = true;
const store: PersonalDeckStore = createFirestorePersonalDeckStore(firestore);
const inferredCallbackResult: Promise<PersonalDeckResource | null> = store.runTransaction('trusted-uid', tx => tx.get(resource.id));
const genericCallbackResult: Promise<number> = store.runTransaction('trusted-uid', async () => 42);

// @ts-expect-error A real Admin SDK Firestore instance is required, never an arbitrary path.
createFirestorePersonalDeckStore('users/other/decks');
// @ts-expect-error Caller-selected project/UID options do not widen the factory boundary.
createFirestorePersonalDeckStore(firestore, { uid: 'other' });
// @ts-expect-error The adapter exposes the existing transaction port, without upsert.
store.upsert(resource);
// @ts-expect-error Reads stay transaction-scoped, with trusted ownership supplied once.
store.get(resource.id);

void [factoryContract, inferredCallbackResult, genericCallbackResult];
