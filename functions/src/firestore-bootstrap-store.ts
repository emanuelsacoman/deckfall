import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { BootstrapStore } from './player-bootstrap';

/** Admin SDK bypasses Rules: all authorization/invariants live in the operation. */
export function createFirestoreBootstrapStore(firestore: Firestore): BootstrapStore {
  return {
    runTransaction: action => firestore.runTransaction(transaction => action({
      get: async path => {
        const document = await transaction.get(firestore.doc(path));
        return document.exists ? document.data()! : null;
      },
      set: (path, data) => { transaction.set(firestore.doc(path), data); }
    })),
    currentTimestamp: () => Timestamp.now(),
    serverTimestamp: () => FieldValue.serverTimestamp()
  };
}
