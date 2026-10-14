import { Timestamp } from '@angular/fire/firestore';

/** The Authentication UID is the document ID, never a duplicated field. */
export interface PlayerProfile {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  starterGrantedAt: Timestamp | null;
  starterVersion?: number;
  starterPackInstanceId?: string;
}

/** Only the UX result of the trusted initializePlayer operation. */
export interface PlayerInitializationResult {
  initialized: true;
  alreadyInitialized: boolean;
  starterPackGranted: boolean;
  starterPackInstanceId: string;
}

export type PlayerInitializationStatus = 'idle' | 'preparing' | 'ready' | 'error';
