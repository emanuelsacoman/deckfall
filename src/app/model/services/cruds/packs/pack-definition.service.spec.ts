import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldValue, Timestamp, serverTimestamp } from 'firebase/firestore';
import { AuthSession } from '../../../interfaces/Auth/auth-session';
import {
  PackDefinitionInput, STARTER_PACK_NAME, validatePackCards, validatePackDefinitionMetadata
} from '../../../interfaces/Packs/pack-definition';
import { AuthService } from '../../fire/auth.service';
import {
  PACK_DEFINITION_CLIENT, PackDefinitionClient, PackDefinitionDocument,
  PackDefinitionService, PackDefinitionTransaction
} from './pack-definition.service';

const first = Timestamp.fromMillis(100);
const last = Timestamp.fromMillis(200);
const input = (overrides: Partial<PackDefinitionInput> = {}): PackDefinitionInput => ({
  name: 'Pacote Aurora', description: 'Cartas de Aurora.', active: false,
  cards: [{ cardId: 'cardA', quantity: 2 }], ...overrides
});
const session = (role = 'admin', uid = 'admin'): AuthSession => ({ uid, email: null, displayName: '', role, roleId: role });
const definition = (overrides: Record<string, unknown> = {}) => ({
  name: 'Pacote Aurora', description: 'Cartas de Aurora.', active: false, currentVersion: 1,
  createdAt: first, updatedAt: last, ...overrides
});
const version = (overrides: Record<string, unknown> = {}) => ({
  version: 1, cards: [{ cardId: 'cardA', quantity: 2 }], createdAt: first, ...overrides
});

class MemoryPackClient implements PackDefinitionClient {
  readonly definitions = new Map<string, Record<string, unknown>>();
  readonly versions = new Map<string, Record<string, unknown>>();
  readonly statuses = new Map<string, string>([['cardA', 'published'], ['cardB', 'published']]);
  transactionCount = 0;
  commits = 0;
  listCount = 0;
  beforeRead?: () => void | Promise<void>;
  beforeCommit?: () => void;
  commitError?: Error;
  newId(): string { return 'packA'; }
  async list(): Promise<PackDefinitionDocument[]> {
    ++this.listCount;
    await this.beforeRead?.();
    return [...this.definitions].map(([id, data]) => ({ id, data }));
  }
  async get(id: string): Promise<PackDefinitionDocument | null> {
    await this.beforeRead?.();
    const data = this.definitions.get(id);
    return data ? { id, data } : null;
  }
  async listVersions(id: string): Promise<PackDefinitionDocument[]> {
    return [...this.versions].filter(([key]) => key.startsWith(`${id}/`)).map(([key, data]) => ({ id: key.split('/')[1], data }));
  }
  async transact<T>(action: (transaction: PackDefinitionTransaction) => Promise<T>): Promise<T> {
    ++this.transactionCount;
    const writes: { target: Map<string, Record<string, unknown>>; key: string; data: Record<string, unknown> }[] = [];
    const read = async <T>(value: T): Promise<T> => {
      expect(writes.length).withContext('every read precedes writes').toBe(0);
      await this.beforeRead?.();
      return value;
    };
    const result = await action({
      getDefinition: id => read(this.definitions.get(id) ?? null),
      getVersion: (id, number) => read(this.versions.get(`${id}/${number}`) ?? null),
      getCardStatus: id => read(this.statuses.get(id) ?? null),
      setDefinition: (id, data) => { writes.push({ target: this.definitions, key: id, data }); },
      setVersion: (id, number, data) => { writes.push({ target: this.versions, key: `${id}/${number}`, data }); }
    });
    this.beforeCommit?.();
    if (this.commitError) throw this.commitError;
    const committed = Timestamp.fromMillis(1000 + this.transactionCount);
    for (const write of writes) {
      write.target.set(write.key, Object.fromEntries(Object.entries(write.data).map(([key, value]) =>
        [key, value instanceof FieldValue ? committed : value])));
    }
    if (writes.length) ++this.commits;
    return result;
  }
  timestamp(): FieldValue { return serverTimestamp(); }
  seed(id = 'packA', overrides: Record<string, unknown> = {}): void {
    this.definitions.set(id, definition({ ...(id === 'starter' ? { name: STARTER_PACK_NAME } : {}), ...overrides }));
    this.versions.set(`${id}/1`, version());
  }
}

describe('PackDefinitionService', () => {
  let client: MemoryPackClient;
  let current: ReturnType<typeof signal<AuthSession | null>>;
  let service: PackDefinitionService;
  beforeEach(() => {
    client = new MemoryPackClient();
    current = signal<AuthSession | null>(session());
    TestBed.configureTestingModule({ providers: [
      { provide: PACK_DEFINITION_CLIENT, useValue: client },
      { provide: AuthService, useValue: { currentUser: current, waitForSession: async () => current() } }
    ] });
    service = TestBed.inject(PackDefinitionService);
  });

  it('lists definitions with the starter first and versions newest first', async () => {
    client.seed(); client.seed('starter');
    client.versions.set('packA/2', version({ version: 2 }));
    expect((await service.list()).map(item => item.id)).toEqual(['starter', 'packA']);
    expect((await service.listVersions('packA')).map(item => item.version)).toEqual([2, 1]);
  });

  it('rejects noncanonical version document IDs even when the numeric field matches', async () => {
    for (const id of ['01', '1.0', '1e0', '+1', ' 1']) {
      client.versions.clear();
      client.versions.set(`packA/${id}`, version());
      await expectAsync(service.listVersions('packA')).toBeRejectedWithError(/Identificador de versão de pacote inválido/);
    }
    client.versions.clear();
    client.versions.set('packA/1', version());
    client.versions.set('packA/1000000', version({ version: 1000000 }));
    expect((await service.listVersions('packA')).map(item => item.version)).toEqual([1000000, 1]);
  });

  it('denies anonymous, member and inconsistent profiles before any persistence', async () => {
    for (const invalid of [null, session('member'), { ...session(), roleId: 'member' }]) {
      current.set(invalid);
      await expectAsync(service.list()).toBeRejectedWithError(/administradores/);
      await expectAsync(service.create(input())).toBeRejectedWithError(/administradores/);
    }
    expect(client.listCount).toBe(0); expect(client.transactionCount).toBe(0);
  });

  it('creates metadata and version one in one commit without player or collection writes', async () => {
    expect(await service.create(input({ active: true }))).toBe('packA');
    expect(client.commits).toBe(1);
    expect(client.definitions.get('packA')).toEqual(definition({ active: true, createdAt: Timestamp.fromMillis(1001), updatedAt: Timestamp.fromMillis(1001) }));
    expect(client.versions.get('packA/1')).toEqual(version({ createdAt: Timestamp.fromMillis(1001) }));
  });

  it('creates the unique initial StarterPack under the reserved starter ID', async () => {
    expect(await service.create(input({ name: STARTER_PACK_NAME, isStarter: true, active: true }))).toBe('starter');
    expect(client.definitions.get('starter')?.['name']).toBe('StarterPack');
    expect(client.versions.has('starter/1')).toBeTrue();
    await expectAsync(service.create(input({ name: STARTER_PACK_NAME, isStarter: true }))).toBeRejectedWithError(/já existe/);
    expect(client.commits).toBe(1);
  });

  it('reserves the name and its case, space, underscore and hyphen variations', async () => {
    for (const name of ['StarterPack', 'starterpack', 'STARTER PACK', 'Starter-Pack', 's_t_a_r_t_e_r_p_a_c_k']) {
      await expectAsync(service.create(input({ name }))).toBeRejectedWithError(/reservado/);
    }
    for (const name of ['Starter Pack', ' StarterPack ', 'Outro']) {
      await expectAsync(service.create(input({ name, isStarter: true }))).toBeRejectedWithError(/reservado/);
    }
    expect(client.transactionCount).toBe(0);
  });

  it('rejects unknown fields, invalid flags, bad quantity, duplicates and excessive items', async () => {
    const bad = [
      { ...input(), uid: 'other' }, { ...input(), isStarter: 'yes' }, { ...input(), cards: [] },
      input({ cards: [{ cardId: 'cards/a', quantity: 1 }] }), input({ cards: [{ cardId: 'cardA', quantity: 0 }] }),
      input({ cards: [{ cardId: 'cardA', quantity: 1.5 }] }), input({ cards: [{ cardId: 'cardA', quantity: 10000 }] }),
      input({ cards: [{ cardId: 'cardA', quantity: 1 }, { cardId: 'cardA', quantity: 2 }] }),
      input({ cards: Array.from({ length: 26 }, (_, index) => ({ cardId: `card${index}`, quantity: 1 })) })
    ];
    for (const value of bad) await expectAsync(service.create(value as PackDefinitionInput)).toBeRejected();
    expect(client.transactionCount).toBe(0);
  });

  it('rechecks published status in the transaction and preserves all data on failure', async () => {
    for (const status of ['draft', 'archived', 'missing']) {
      client.statuses.set('cardA', status);
      await expectAsync(service.create(input())).toBeRejectedWithError(/publicadas/);
      expect(client.definitions.size).toBe(0); expect(client.versions.size).toBe(0);
    }
    expect(client.commits).toBe(0);
  });

  it('does not overwrite a definition or an orphan existing version', async () => {
    client.seed();
    await expectAsync(service.create(input())).toBeRejectedWithError(/já existe/);
    client.definitions.clear();
    await expectAsync(service.create(input())).toBeRejectedWithError(/já existe/);
    expect(client.versions.get('packA/1')).toEqual(version()); expect(client.commits).toBe(0);
  });

  it('failed commit persists neither metadata nor initial version', async () => {
    client.commitError = new Error('offline');
    await expectAsync(service.create(input())).toBeRejectedWithError('offline');
    expect(client.definitions.size).toBe(0); expect(client.versions.size).toBe(0);
  });

  it('creates a new immutable version and preserves prior version and creation date', async () => {
    client.seed();
    expect(await service.createVersion('packA', [{ cardId: 'cardB', quantity: 4 }], 1, true)).toBe(2);
    expect(client.versions.get('packA/1')).toEqual(version());
    expect(client.versions.get('packA/2')?.['cards']).toEqual([{ cardId: 'cardB', quantity: 4 }]);
    expect(client.definitions.get('packA')?.['createdAt']).toEqual(first);
    expect(client.definitions.get('packA')?.['active']).toBeTrue();
    expect(client.definitions.get('packA')?.['currentVersion']).toBe(2);
    expect(client.definitions.get('packA')?.['id']).toBeUndefined();
  });

  it('preserves active state when version activation was not explicitly selected', async () => {
    client.seed('packA', { active: true });
    await service.createVersion('packA', [{ cardId: 'cardB', quantity: 1 }], 1);
    expect(client.definitions.get('packA')?.['active']).toBeTrue();
  });

  it('rejects absent current version, next-version collision and technical version overflow', async () => {
    client.seed(); client.versions.clear();
    await expectAsync(service.createVersion('packA', input().cards, 1)).toBeRejectedWithError(/ausente/);
    client.seed(); client.versions.set('packA/2', version({ version: 2 }));
    await expectAsync(service.createVersion('packA', input().cards, 1)).toBeRejectedWithError(/sobrescrita/);
    expect(client.versions.get('packA/2')).toEqual(version({ version: 2 }));
    client.seed('packA', { currentVersion: 1000000 });
    await expectAsync(service.createVersion('packA', input().cards, 1000000)).toBeRejectedWithError(/limite/);
    expect(client.commits).toBe(0);
  });

  it('rejects an editor based on an older version without advancing the remote version', async () => {
    client.seed('packA', { currentVersion: 2 });
    client.versions.set('packA/2', version({ version: 2, cards: [{ cardId: 'cardB', quantity: 4 }] }));
    await expectAsync(service.createVersion('packA', input().cards, 1)).toBeRejectedWithError(/recebeu outra versão/);
    expect(client.definitions.get('packA')?.['currentVersion']).toBe(2);
    expect(client.versions.has('packA/3')).toBeFalse();
    expect(client.versions.get('packA/2')?.['cards']).toEqual([{ cardId: 'cardB', quantity: 4 }]);
    expect(client.commits).toBe(0);
  });

  it('preserves actual activation changes on the same version instead of replaying editor metadata', async () => {
    client.seed();
    const original = (await service.getById('packA'))!;
    client.definitions.set('packA', definition({ active: true, updatedAt: Timestamp.fromMillis(300) }));
    await service.createVersion('packA', [{ cardId: 'cardB', quantity: 1 }], original.currentVersion);
    expect(client.definitions.get('packA')?.['currentVersion']).toBe(2);
    expect(client.definitions.get('packA')?.['active']).toBeTrue();
  });

  it('requires a valid explicit original version before beginning a transaction', async () => {
    for (const expected of [0, 1.5, NaN, 1000001, undefined]) {
      await expectAsync(service.createVersion('packA', input().cards, expected as number)).toBeRejectedWithError(/Versão original/);
    }
    expect(client.transactionCount).toBe(0);
  });

  it('updates only metadata and keeps the immutable current version', async () => {
    client.seed(); const original = (await service.getById('packA'))!;
    await service.updateMetadata(original, { name: 'Aurora II', description: '', active: true });
    expect(client.definitions.get('packA')?.['name']).toBe('Aurora II');
    expect(client.definitions.get('packA')?.['currentVersion']).toBe(1);
    expect(client.definitions.get('packA')?.['createdAt']).toEqual(first);
    expect(client.versions.get('packA/1')).toEqual(version());
  });

  it('rejects stale metadata changes and activation with newly unpublished cards', async () => {
    client.seed(); const original = (await service.getById('packA'))!;
    client.definitions.set('packA', definition({ updatedAt: Timestamp.fromMillis(300) }));
    await expectAsync(service.updateMetadata(original, { name: 'Nova', description: '', active: false })).toBeRejectedWithError(/outra sessão/);
    client.seed(); client.statuses.set('cardA', 'draft');
    await expectAsync(service.updateMetadata(original, { name: 'Nova', description: '', active: true })).toBeRejectedWithError(/publicadas/);
    expect(client.commits).toBe(0);
    await service.updateMetadata(original, { name: 'Nova', description: '', active: false });
    expect(client.definitions.get('packA')?.['active']).toBeFalse();
  });

  it('discards a list response after an administrative session change', async () => {
    client.seed(); client.beforeRead = () => current.set(session('member'));
    await expectAsync(service.list()).toBeRejectedWithError(/sessão administrativa mudou/);
  });

  it('prevents transaction writes after logout during reads', async () => {
    client.beforeRead = () => current.set(null);
    await expectAsync(service.create(input())).toBeRejectedWithError(/sessão administrativa mudou/);
    expect(client.definitions.size).toBe(0); expect(client.versions.size).toBe(0); expect(client.commits).toBe(0);
  });

  it('does not apply a confirmed transaction result to a new admin session', async () => {
    client.beforeCommit = () => current.set(session('admin', 'another-admin'));
    await expectAsync(service.create(input())).toBeRejectedWithError(/sessão administrativa mudou/);
    // Server-accepted commits survive logout; only their UI response is discarded.
    expect(client.commits).toBe(1);
  });

  it('suppresses a concurrent local operation and permits retry after failure', async () => {
    let resolveRead!: () => void;
    const held = new Promise<void>(resolve => { resolveRead = resolve; });
    client.beforeRead = () => held;
    const firstCreate = service.create(input());
    await Promise.resolve(); await Promise.resolve();
    await expectAsync(service.create(input())).toBeRejectedWithError(/andamento/);
    resolveRead(); await firstCreate;
    client.definitions.clear(); client.versions.clear(); client.beforeRead = undefined;
    await expectAsync(service.create(input())).toBeResolvedTo('packA');
  });

  it('rejects malformed stored dates, identities and versions', async () => {
    client.seed('packA', { createdAt: null });
    await expectAsync(service.list()).toBeRejectedWithError(/datas inválidas/);
    client.definitions.clear(); client.seed('invalid/id');
    await expectAsync(service.list()).toBeRejectedWithError(/Identificador/);
    client.definitions.clear(); client.versions.clear(); client.seed();
    client.versions.set('packA/2', version({ version: 1 }));
    await expectAsync(service.listVersions('packA')).toBeRejectedWithError(/Versão de pacote inválida/);
  });
});

describe('Pack definition input validation', () => {
  it('accepts technical quantity boundaries and normalizes ordinary metadata whitespace', () => {
    expect(validatePackCards([{ cardId: 'a', quantity: 9999 }])).toEqual([{ cardId: 'a', quantity: 9999 }]);
    expect(validatePackDefinitionMetadata({ name: ' Aurora ', description: ' Texto ', active: false }, false)).toEqual({ name: 'Aurora', description: 'Texto', active: false });
  });
  it('rejects oversized metadata and extra item fields', () => {
    expect(() => validatePackDefinitionMetadata({ name: 'a'.repeat(121), description: '', active: true }, false)).toThrow();
    expect(() => validatePackDefinitionMetadata({ name: 'Aurora', description: 'a'.repeat(1001), active: true }, false)).toThrow();
    expect(() => validatePackCards([{ cardId: 'a', quantity: 1, state: 'opened' }])).toThrow();
  });
});
