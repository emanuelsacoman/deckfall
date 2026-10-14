import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { BootstrapStore, BootstrapTransaction, PlayerBootstrapError, PlayerRequest } from '../src/pack-domain';

export const old = Timestamp.fromMillis(1000);
export const now = Timestamp.fromMillis(2000);
export const future = Timestamp.fromMillis(3000);
export const request: PlayerRequest = { auth: { uid: 'member' }, data: {} };
export const openRequest: PlayerRequest = { ...request, data: { packInstanceId: 'starter' } };
export const user = (role = 'member') => ({ role, roleId: role });
export const entry = (quantity = 1) => ({ quantity, firstAcquiredAt: old, lastAcquiredAt: old });
export const player = (granted: Timestamp | null = now) => ({
  createdAt: old, updatedAt: now, starterGrantedAt: granted,
  ...(granted ? { starterVersion: 1, starterPackInstanceId: 'starter' } : {})
});
export const definition = () => ({ name: 'StarterPack', description: 'A jornada começa aqui.', active: true, currentVersion: 1, createdAt: old, updatedAt: old });
export const version = (cards = [{ cardId: 'cardA', quantity: 2 }, { cardId: 'cardC', quantity: 1 }]) => ({ version: 1, cards, createdAt: old });
export const sealed = () => ({ packId: 'starter', definitionVersion: 1, source: 'starter', state: 'sealed', acquiredAt: now, openedAt: null });
export const snapshot = () => [{ cardId: 'cardA', name: 'Aurora', rarity: 'common', quantity: 2 }, { cardId: 'cardC', name: 'Crepúsculo', rarity: 'legendary', quantity: 1 }];
export const opened = () => ({ ...sealed(), state: 'opened', openedAt: now, revealedCards: snapshot() });

/** Optimistic retry and staged writes model the properties required from Firestore. */
export class MemoryStore implements BootstrapStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  private readonly versions = new Map<string, number>();
  readonly reads: string[] = [];
  commits = 0;
  attempts = 0;
  beforeCommit?: () => void;
  commitError?: Error;
  constructor(initialized = false) {
    this.put('users/member', user());
    this.put('packDefinitions/starter', definition());
    this.put('packDefinitions/starter/versions/1', version());
    this.put('cards/cardA', { status: 'published', name: 'Aurora', rarity: 'common' });
    this.put('cards/cardC', { status: 'published', name: 'Crepúsculo', rarity: 'legendary' });
    if (initialized) { this.put('players/member', player()); this.put('users/member/packs/starter', sealed()); }
  }
  put(path: string, data: Record<string, unknown>): void {
    this.documents.set(path, data);
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }
  currentTimestamp(): Timestamp { return now; }
  serverTimestamp(): Timestamp { return now; }
  async runTransaction<T>(action: (transaction: BootstrapTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 10; attempt++) {
      this.attempts++;
      const reads = new Map<string, number>();
      const writes = new Map<string, Record<string, unknown>>();
      const result = await action({
        get: async path => {
          assert.equal(writes.size, 0, 'transaction reads must precede every write');
          this.reads.push(path);
          reads.set(path, this.versions.get(path) ?? 0);
          return this.documents.get(path) ?? null;
        },
        set: (path, data) => { writes.set(path, data); }
      });
      const beforeCommit = this.beforeCommit;
      this.beforeCommit = undefined;
      beforeCommit?.();
      if ([...reads].some(([path, revision]) => (this.versions.get(path) ?? 0) !== revision)) continue;
      if (this.commitError) throw this.commitError;
      for (const [path, data] of writes) this.put(path, data);
      if (writes.size) this.commits++;
      return result;
    }
    throw new Error('Too many test transaction conflicts.');
  }
}
export async function rejected(
  operation: (request: PlayerRequest, store: BootstrapStore) => Promise<unknown>, store: MemoryStore,
  code: PlayerBootstrapError['code'] = 'failed-precondition', value = request
): Promise<void> {
  const original = new Map(store.documents);
  const commits = store.commits;
  await assert.rejects(operation(value, store), (error: unknown) => error instanceof PlayerBootstrapError && error.code === code);
  assert.deepEqual(store.documents, original, 'failure must preserve every document');
  assert.equal(store.commits, commits);
}
