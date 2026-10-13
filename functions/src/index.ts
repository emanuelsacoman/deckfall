import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createFirestoreBootstrapStore } from './firestore-bootstrap-store';
import { initializePlayerOperation, PlayerBootstrapError } from './player-bootstrap';
import { PLAYER_FUNCTIONS_REGION } from './config';

const app = getApps()[0] ?? initializeApp();
const store = createFirestoreBootstrapStore(getFirestore(app));

export const initializePlayer = onCall(
  { region: PLAYER_FUNCTIONS_REGION, timeoutSeconds: 30, memory: '256MiB' },
  async request => {
    try {
      return await initializePlayerOperation(request, store);
    } catch (error: unknown) {
      if (error instanceof PlayerBootstrapError) throw new HttpsError(error.code, error.message);
      // Do not expose SDK internals, identity data, or administrative documents.
      logger.error('initializePlayer transaction failed.', {
        name: error instanceof Error ? error.name : 'UnknownError'
      });
      throw new HttpsError('internal', 'Não foi possível preparar sua jornada. Tente novamente.');
    }
  }
);
