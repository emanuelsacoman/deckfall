import type { FirebaseOptions } from 'firebase/app';

export interface FirebaseRuntimeConfiguration {
  production: boolean;
  firebase: FirebaseOptions;
  firebaseEmulators?: boolean;
}

export const FIREBASE_EMULATOR_HOST = '127.0.0.1';
export const FIREBASE_EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199, functions: 5001 } as const;

/** All SDKs must use one isolated demo project, never a mix of local and production data. */
export function shouldConnectFirebaseEmulators(config: FirebaseRuntimeConfiguration, hostname = globalThis.location?.hostname ?? ''): boolean {
  if (config.firebaseEmulators !== true) return false;
  if (config.production) throw new Error('Emuladores Firebase não podem ser habilitados no build de produção.');
  if (!config.firebase.projectId?.startsWith('demo-')) throw new Error('Use um projeto demo- para testar todos os serviços Firebase em emuladores.');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) throw new Error('Emuladores Firebase só podem ser usados em localhost.');
  return true;
}
