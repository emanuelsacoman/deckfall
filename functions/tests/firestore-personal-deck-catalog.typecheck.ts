import type { Firestore } from 'firebase-admin/firestore';
import type { GameplayDeckCatalog } from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';
import { createFirestorePersonalDeckCatalogReader } from '../src/decks/firestore-personal-deck-catalog';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const firestore: Firestore;
const factoryContract: Assert<Equal<typeof createFirestorePersonalDeckCatalogReader,
  (db: Firestore) => PersonalDeckCatalogReader>> = true;
const reader = createFirestorePersonalDeckCatalogReader(firestore);
const result: Promise<GameplayDeckCatalog | null> = reader.get('history-v1');
// @ts-expect-error Only an Admin SDK Firestore instance may be injected.
createFirestorePersonalDeckCatalogReader('gameplayContentVersions');
// @ts-expect-error No UID or active-config options widen the global historical reader.
createFirestorePersonalDeckCatalogReader(firestore, { uid: 'other', active: true });
// @ts-expect-error A version is required.
reader.get();
// @ts-expect-error Ownership is not part of this port.
reader.get('history-v1', 'uid');
// @ts-expect-error The reader cannot publish or activate content.
reader.set('history-v1', {});
async function readonlyResult(): Promise<void> {
  const catalog = await result;
  if (catalog) {
    // @ts-expect-error Nested eligibility remains readonly.
    catalog.cards[0].eligible = true;
    // @ts-expect-error Canonical revisions remain readonly.
    catalog.cards[0].definition.revision = 2;
  }
}
void [factoryContract, result, readonlyResult];
