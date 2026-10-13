import { Timestamp } from '@angular/fire/firestore';

/** The Authentication UID is the document ID, never a duplicated field. */
export interface PlayerProfile {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  starterGrantedAt: Timestamp | null;
  starterVersion?: number;
}

/** Only the UX result of the trusted initializePlayer operation. */
export interface PlayerInitializationResult {
  initialized: true;
  alreadyInitialized: boolean;
  /** Total copies added, not the number of different card IDs. */
  cardsGranted: number;
}

export type PlayerInitializationStatus = 'idle' | 'preparing' | 'ready' | 'error';
