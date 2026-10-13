import { Timestamp } from '@angular/fire/firestore';
import { Card } from '../Cards/card';

/** Technical document limit; this is not a deck or gameplay copy limit. */
export const PLAYER_COLLECTION_MAX_QUANTITY = 9999;

/** cardId comes from the document path and is never duplicated in Firestore. */
export interface PlayerCardCollectionEntry {
  cardId: string;
  quantity: number;
  firstAcquiredAt: Timestamp | null;
  lastAcquiredAt: Timestamp | null;
}

/** Client-only join. Unavailable cards expose ownership without protected metadata. */
export interface PlayerOwnedCard {
  collection: PlayerCardCollectionEntry;
  card: Card | null;
}
