import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { connectStorageEmulator, getStorage, provideStorage } from '@angular/fire/storage';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { environment } from '../environments/environment';
import { FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS, FirebaseRuntimeConfiguration, shouldConnectFirebaseEmulators } from './model/services/fire/firebase-runtime-config';
import { PLAYER_FUNCTIONS_REGION } from './model/services/fire/player-initialization.service';

const runtime: FirebaseRuntimeConfiguration = environment;
const useEmulators = shouldConnectFirebaseEmulators(runtime);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => {
      const auth = getAuth();
      if (useEmulators) connectAuthEmulator(auth, `http://${FIREBASE_EMULATOR_HOST}:${FIREBASE_EMULATOR_PORTS.auth}`);
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (useEmulators) connectFirestoreEmulator(firestore, FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS.firestore);
      return firestore;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (useEmulators) connectStorageEmulator(storage, FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS.storage);
      return storage;
    }),
    provideFunctions(() => {
      const functions = getFunctions(undefined, PLAYER_FUNCTIONS_REGION);
      if (useEmulators) connectFunctionsEmulator(functions, FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS.functions);
      return functions;
    })
  ]
};
