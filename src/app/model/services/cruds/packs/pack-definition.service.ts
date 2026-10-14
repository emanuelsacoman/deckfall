import { effect, inject, Injectable, InjectionToken, untracked } from '@angular/core';
import {
  FieldValue, Firestore, Timestamp, collection, doc, getDocFromServer, getDocsFromServer,
  runTransaction, serverTimestamp
} from '@angular/fire/firestore';
import { isAdminSession } from '../../../interfaces/Auth/auth-session';
import {
  PACK_DEFINITION_LIMITS, PackCardInput, PackDefinitionInput, PackDefinitionMetadata, PackDefinitionRecord,
  STARTER_PACK_ID, packRecord, validatePackCards, validatePackDefinitionId, validatePackDefinitionMetadata
} from '../../../interfaces/Packs/pack-definition';
import { PackDefinitionVersion } from '../../../interfaces/Packs/player-pack';
import { AuthService } from '../../fire/auth.service';

export interface PackDefinitionDocument { id: string; data: Record<string, unknown>; }
/** This boundary only manages definitions, never ownership or player instances. */
export interface PackDefinitionTransaction {
  getDefinition(id: string): Promise<Record<string, unknown> | null>;
  getVersion(id: string, version: number): Promise<Record<string, unknown> | null>;
  getCardStatus(id: string): Promise<string | null>;
  setDefinition(id: string, data: Record<string, unknown>): void;
  setVersion(id: string, version: number, data: Record<string, unknown>): void;
}
export interface PackDefinitionClient {
  newId(): string;
  list(): Promise<PackDefinitionDocument[]>;
  get(id: string): Promise<PackDefinitionDocument | null>;
  listVersions(id: string): Promise<PackDefinitionDocument[]>;
  transact<T>(action: (transaction: PackDefinitionTransaction) => Promise<T>): Promise<T>;
  timestamp(): FieldValue;
}
export const PACK_DEFINITION_CLIENT = new InjectionToken<PackDefinitionClient>('Pack definition client', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(Firestore);
    const definitionRef = (id: string) => doc(firestore, 'packDefinitions', id);
    const versionRef = (id: string, version: number) => doc(firestore, 'packDefinitions', id, 'versions', String(version));
    return {
      newId: () => doc(collection(firestore, 'packDefinitions')).id,
      list: async () => {
        const snapshot = await getDocsFromServer(collection(firestore, 'packDefinitions'));
        return snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
      },
      get: async id => {
        const snapshot = await getDocFromServer(definitionRef(id));
        return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
      },
      listVersions: async id => {
        const snapshot = await getDocsFromServer(collection(firestore, 'packDefinitions', id, 'versions'));
        return snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
      },
      transact: action => runTransaction(firestore, transaction => action({
        getDefinition: async id => {
          const snapshot = await transaction.get(definitionRef(id));
          return snapshot.exists() ? snapshot.data() : null;
        },
        getVersion: async (id, version) => {
          const snapshot = await transaction.get(versionRef(id, version));
          return snapshot.exists() ? snapshot.data() : null;
        },
        getCardStatus: async id => {
          const snapshot = await transaction.get(doc(firestore, 'cards', id));
          const status = snapshot.data()?.['status'];
          return typeof status === 'string' ? status : null;
        },
        setDefinition: (id, data) => { transaction.set(definitionRef(id), data); },
        setVersion: (id, version, data) => { transaction.set(versionRef(id, version), data); }
      })),
      timestamp: () => serverTimestamp()
    };
  }
});

@Injectable({ providedIn: 'root' })
export class PackDefinitionService {
  private readonly auth = inject(AuthService);
  private readonly client = inject(PACK_DEFINITION_CLIENT);
  private activeUid: string | null | undefined;
  private epoch = 0;
  private readonly pending = new Set<string>();

  constructor() {
    effect(() => {
      const current = this.auth.currentUser();
      untracked(() => this.synchronize(isAdminSession(current) ? current!.uid : null));
    });
  }

  async list(): Promise<PackDefinitionRecord[]> {
    const session = await this.requireAdmin();
    const documents = await this.client.list();
    this.assertCurrent(session);
    return documents.map(parseDefinition).sort((a, b) =>
      Number(b.id === STARTER_PACK_ID) - Number(a.id === STARTER_PACK_ID) || a.name.localeCompare(b.name, 'pt-BR'));
  }

  async getById(id: string): Promise<PackDefinitionRecord | null> {
    validatePackDefinitionId(id);
    const session = await this.requireAdmin();
    const document = await this.client.get(id);
    this.assertCurrent(session);
    if (document && document.id !== id) throw new Error('A identidade do pacote é inválida.');
    return document ? parseDefinition(document) : null;
  }

  async listVersions(id: string): Promise<PackDefinitionVersion[]> {
    validatePackDefinitionId(id);
    const session = await this.requireAdmin();
    const documents = await this.client.listVersions(id);
    this.assertCurrent(session);
    return documents.map(item => {
      const version = Number(item.id);
      if (String(version) !== item.id) throw new Error('Identificador de versão de pacote inválido.');
      return parseVersion(item.data, version);
    }).sort((a, b) => b.version - a.version);
  }

  async create(input: PackDefinitionInput): Promise<string> {
    const data = packRecord(input, ['name', 'description', 'active', 'cards'], ['isStarter']);
    if (data['isStarter'] !== undefined && typeof data['isStarter'] !== 'boolean') throw new Error('Tipo de pacote inválido.');
    const starter = data['isStarter'] === true;
    const metadata = validatePackDefinitionMetadata({ name: data['name'], description: data['description'], active: data['active'] }, starter);
    const cards = validatePackCards(data['cards']);
    const session = await this.requireAdmin();
    const id = starter ? STARTER_PACK_ID : this.client.newId();
    validatePackDefinitionId(id);
    if (!starter && id === STARTER_PACK_ID) throw new Error('O identificador starter é reservado ao pacote inicial.');
    return this.mutate(`create:${starter ? STARTER_PACK_ID : 'pack'}`, session, async transaction => {
      const existing = await transaction.getDefinition(id);
      const existingVersion = await transaction.getVersion(id, 1);
      if (existing || existingVersion) throw new Error('Este pacote já existe. Recarregue a lista para criar uma nova versão.');
      await this.assertPublished(transaction, cards);
      this.assertCurrent(session);
      const timestamp = this.client.timestamp();
      transaction.setDefinition(id, { ...metadata, currentVersion: 1, createdAt: timestamp, updatedAt: timestamp });
      transaction.setVersion(id, 1, { version: 1, cards, createdAt: timestamp });
      return id;
    });
  }

  async createVersion(id: string, input: PackCardInput[], expectedVersion: number, activate?: boolean): Promise<number> {
    validatePackDefinitionId(id);
    const cards = validatePackCards(input);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > PACK_DEFINITION_LIMITS.version) {
      throw new Error('Versão original do pacote inválida. Recarregue o editor.');
    }
    if (activate !== undefined && typeof activate !== 'boolean') throw new Error('Ativação do pacote inválida.');
    const session = await this.requireAdmin();
    return this.mutate(id, session, async transaction => {
      const data = await transaction.getDefinition(id);
      if (!data) throw new Error('Pacote não encontrado. Recarregue a lista.');
      const definition = parseDefinition({ id, data });
      if (definition.currentVersion !== expectedVersion) throw new Error('O pacote recebeu outra versão. Recarregue antes de criar uma nova versão.');
      if (definition.currentVersion >= PACK_DEFINITION_LIMITS.version) throw new Error('O pacote atingiu o limite de versões.');
      const next = definition.currentVersion + 1;
      const previous = await transaction.getVersion(id, definition.currentVersion);
      if (!previous) throw new Error('A versão atual do pacote está ausente. Confira a configuração antes de avançar.');
      parseVersion(previous, definition.currentVersion);
      if (await transaction.getVersion(id, next)) throw new Error('A próxima versão já existe. Nenhuma versão existente pode ser sobrescrita.');
      await this.assertPublished(transaction, cards);
      this.assertCurrent(session);
      const timestamp = this.client.timestamp();
      const { id: ignoredId, ...persisted } = definition;
      transaction.setDefinition(id, { ...persisted, currentVersion: next, active: activate ?? definition.active, updatedAt: timestamp });
      transaction.setVersion(id, next, { version: next, cards, createdAt: timestamp });
      return next;
    });
  }

  async updateMetadata(original: PackDefinitionRecord, input: PackDefinitionMetadata): Promise<void> {
    validatePackDefinitionId(original.id);
    const metadata = validatePackDefinitionMetadata(input, original.id === STARTER_PACK_ID);
    const session = await this.requireAdmin();
    await this.mutate(original.id, session, async transaction => {
      const data = await transaction.getDefinition(original.id);
      if (!data) throw new Error('O pacote foi removido. Recarregue a lista.');
      const definition = parseDefinition({ id: original.id, data });
      if (!(original.updatedAt instanceof Timestamp) || !definition.updatedAt.isEqual(original.updatedAt) || definition.currentVersion !== original.currentVersion) {
        throw new Error('O pacote mudou em outra sessão. Recarregue antes de salvar.');
      }
      const version = await transaction.getVersion(original.id, definition.currentVersion);
      if (!version) throw new Error('A versão atual do pacote está ausente.');
      const current = parseVersion(version, definition.currentVersion);
      if (metadata.active) await this.assertPublished(transaction, current.cards);
      this.assertCurrent(session);
      transaction.setDefinition(original.id, {
        ...metadata, currentVersion: definition.currentVersion, createdAt: definition.createdAt, updatedAt: this.client.timestamp()
      });
    });
  }

  private async assertPublished(transaction: PackDefinitionTransaction, cards: PackCardInput[]): Promise<void> {
    const statuses = await Promise.all(cards.map(card => transaction.getCardStatus(card.cardId)));
    if (statuses.some(status => status !== 'published')) throw new Error('Somente cartas publicadas podem fazer parte de um pacote. Recarregue o catálogo.');
  }

  private async mutate<T>(key: string, session: AdminOperationSession, action: (transaction: PackDefinitionTransaction) => Promise<T>): Promise<T> {
    this.assertCurrent(session);
    if (this.pending.has(key)) throw new Error('Já existe uma operação em andamento para este pacote.');
    this.pending.add(key);
    try {
      const result = await this.client.transact(transaction => { this.assertCurrent(session); return action(transaction); });
      this.assertCurrent(session);
      return result;
    } finally { this.pending.delete(key); }
  }

  private async requireAdmin(): Promise<AdminOperationSession> {
    const session = await this.auth.waitForSession();
    if (!isAdminSession(session)) throw new Error('Somente administradores podem gerenciar definições de pacotes.');
    this.synchronize(session!.uid);
    const operation = { uid: session!.uid, epoch: this.epoch };
    this.assertCurrent(operation);
    return operation;
  }

  private synchronize(uid: string | null): void {
    if (this.activeUid !== uid) { this.activeUid = uid; ++this.epoch; }
  }

  private assertCurrent(session: AdminOperationSession): void {
    const current = this.auth.currentUser();
    this.synchronize(isAdminSession(current) ? current!.uid : null);
    if (!isAdminSession(current) || current!.uid !== session.uid || this.epoch !== session.epoch) {
      throw new Error('A sessão administrativa mudou. Entre novamente e recarregue os pacotes.');
    }
  }
}

interface AdminOperationSession { uid: string; epoch: number; }

function parseDefinition(document: PackDefinitionDocument): PackDefinitionRecord {
  validatePackDefinitionId(document.id);
  const data = packRecord(document.data, ['name', 'description', 'active', 'currentVersion', 'createdAt', 'updatedAt']);
  const metadata = validatePackDefinitionMetadata({ name: data['name'], description: data['description'], active: data['active'] }, document.id === STARTER_PACK_ID);
  const version = data['currentVersion'];
  const createdAt = data['createdAt'];
  const updatedAt = data['updatedAt'];
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > PACK_DEFINITION_LIMITS.version ||
      !(createdAt instanceof Timestamp) || !(updatedAt instanceof Timestamp) || updatedAt.toMillis() < createdAt.toMillis()) {
    throw new Error('A definição do pacote possui versão ou datas inválidas.');
  }
  return { id: document.id, ...metadata, currentVersion: version, createdAt, updatedAt };
}

function parseVersion(value: unknown, expected: number): PackDefinitionVersion {
  const data = packRecord(value, ['version', 'cards', 'createdAt']);
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > PACK_DEFINITION_LIMITS.version ||
      data['version'] !== expected || !(data['createdAt'] instanceof Timestamp)) throw new Error('Versão de pacote inválida.');
  return { version: expected, cards: validatePackCards(data['cards']), createdAt: data['createdAt'] };
}
