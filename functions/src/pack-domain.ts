import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/** Technical limits, independent from future gameplay/economy rules. */
export const PLAYER_COLLECTION_MAX_QUANTITY = 9999;
export const PACK_MAX_CARDS = 25;
export const PACK_MAX_VERSION = 1000000;
export const STARTER_PACK_ID = 'starter';
export const STARTER_PACK_NAME = 'StarterPack';
/** A UID-scoped constant prevents a new definition version from granting again. */
export const STARTER_PACK_INSTANCE_ID = 'starter';
export const STARTER_PACK_PATH = 'packDefinitions/starter';
export const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type CardRarity = typeof CARD_RARITIES[number];

export interface PlayerProfile {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  starterGrantedAt: Timestamp | null;
  starterVersion?: number;
  starterPackInstanceId?: string;
}
export interface PackDefinition {
  name: string;
  description: string;
  active: boolean;
  currentVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface PackDefinitionVersion {
  version: number;
  cards: { cardId: string; quantity: number }[];
  createdAt: Timestamp;
}
export interface PackOpenedCard {
  cardId: string;
  name: string;
  rarity: CardRarity;
  quantity: number;
}
export type PlayerPack = {
  packId: typeof STARTER_PACK_ID;
  definitionVersion: number;
  source: 'starter';
  acquiredAt: Timestamp;
} & ({ state: 'sealed'; openedAt: null } |
  { state: 'opened'; openedAt: Timestamp; revealedCards: PackOpenedCard[] });

export interface PlayerRequest { auth?: { uid: string } | null; data?: unknown; }
export type PlayerOperationErrorCode = 'unauthenticated' | 'invalid-argument' | 'permission-denied' | 'failed-precondition' | 'not-found';
export class PlayerBootstrapError extends Error {
  constructor(readonly code: PlayerOperationErrorCode, message: string, readonly reason?: 'starter-not-configured') {
    super(message);
    this.name = 'PlayerBootstrapError';
  }
}
export interface BootstrapTransaction {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
}
/** The adapter commits all sets atomically and retries conflicting transactions. */
export interface BootstrapStore {
  runTransaction<T>(action: (transaction: BootstrapTransaction) => Promise<T>): Promise<T>;
  currentTimestamp(): Timestamp;
  serverTimestamp(): FieldValue | Timestamp;
}

export const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
export function fail(message: string): never { throw new PlayerBootstrapError('failed-precondition', message); }
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function hasFields(data: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(data);
  return required.every(key => Object.hasOwn(data, key)) && keys.every(key => required.includes(key) || optional.includes(key));
}
export function validPositiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}
function validText(value: unknown, maximum: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (empty || value.trim().length > 0);
}
function orderedDates(first: unknown, last: unknown, latest: Timestamp): first is Timestamp {
  return first instanceof Timestamp && last instanceof Timestamp &&
    first.valueOf() <= last.valueOf() && last.valueOf() <= latest.valueOf();
}
export function authenticatedUid(request: PlayerRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new PlayerBootstrapError('unauthenticated', 'Entre em uma conta para continuar sua jornada.');
  if (typeof uid !== 'string' || !identifier.test(uid)) {
    throw new PlayerBootstrapError('permission-denied', 'A identidade autenticada não possui um UID válido.');
  }
  return uid;
}
export function validateUser(data: Record<string, unknown> | null): void {
  if (!data || (data['role'] !== 'member' && data['role'] !== 'admin') || data['role'] !== data['roleId']) {
    throw new PlayerBootstrapError('permission-denied', 'Sua conta precisa de um perfil válido para continuar a jornada.');
  }
}
export function validatePlayer(data: Record<string, unknown>, latest: Timestamp): PlayerProfile {
  if (!hasFields(data, ['createdAt', 'updatedAt', 'starterGrantedAt'], ['starterVersion', 'starterPackInstanceId']) ||
      !orderedDates(data['createdAt'], data['updatedAt'], latest) ||
      (data['starterGrantedAt'] !== null && !(data['starterGrantedAt'] instanceof Timestamp))) {
    fail('O estado de jogador está inválido e precisa ser revisado por um administrador.');
  }
  const granted = data['starterGrantedAt'];
  if (granted === null ? Object.hasOwn(data, 'starterVersion') || Object.hasOwn(data, 'starterPackInstanceId') :
      !validPositiveInteger(data['starterVersion'], PACK_MAX_VERSION) || data['starterPackInstanceId'] !== STARTER_PACK_INSTANCE_ID ||
      granted.valueOf() < data['createdAt'].valueOf() || granted.valueOf() > (data['updatedAt'] as Timestamp).valueOf()) {
    fail('O registro do Starter Pack está inválido. Dados locais do bootstrap anterior precisam ser recriados nos emuladores; não há reconcessão automática.');
  }
  return {
    createdAt: data['createdAt'], updatedAt: data['updatedAt'] as Timestamp, starterGrantedAt: granted,
    ...(granted === null ? {} : { starterVersion: data['starterVersion'] as number, starterPackInstanceId: STARTER_PACK_INSTANCE_ID })
  };
}
export function validateDefinition(data: Record<string, unknown> | null, latest: Timestamp): PackDefinition {
  if (!data) throw new PlayerBootstrapError('failed-precondition', 'O Starter Pack ainda não foi configurado por um administrador.', 'starter-not-configured');
  if (!hasFields(data, ['name', 'description', 'active', 'currentVersion', 'createdAt', 'updatedAt']) ||
      data['name'] !== STARTER_PACK_NAME || !validText(data['description'], 1000, true) || typeof data['active'] !== 'boolean' ||
      !validPositiveInteger(data['currentVersion'], PACK_MAX_VERSION) || !orderedDates(data['createdAt'], data['updatedAt'], latest)) {
    fail('A definição do Starter Pack é inválida.');
  }
  return data as unknown as PackDefinition;
}
function validateItems(value: unknown, snapshot: boolean): (PackOpenedCard | { cardId: string; quantity: number })[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PACK_MAX_CARDS) fail('O conteúdo do pacote é inválido.');
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    const required = snapshot ? ['cardId', 'name', 'rarity', 'quantity'] : ['cardId', 'quantity'];
    if (!isRecord(item) || !hasFields(item, required) || typeof item['cardId'] !== 'string' || !identifier.test(item['cardId']) ||
        !validPositiveInteger(item['quantity'], PLAYER_COLLECTION_MAX_QUANTITY) ||
        (snapshot && (!validText(item['name'], 120) || !CARD_RARITIES.includes(item['rarity'] as CardRarity)))) {
      fail('O pacote contém um ID, quantidade ou resultado inválido.');
    }
    if (seen.has(item['cardId'])) fail('O pacote contém uma carta duplicada; use quantity para representar cópias.');
    seen.add(item['cardId']);
    return snapshot ? { cardId: item['cardId'], name: item['name'] as string, rarity: item['rarity'] as CardRarity, quantity: item['quantity'] } :
      { cardId: item['cardId'], quantity: item['quantity'] };
  });
}
export function validateVersion(data: Record<string, unknown> | null, expectedVersion: number, latest: Timestamp): PackDefinitionVersion {
  if (!data) fail('A versão concedida do Starter Pack não foi configurada.');
  if (!hasFields(data, ['version', 'cards', 'createdAt']) || data['version'] !== expectedVersion ||
      !validPositiveInteger(data['version'], PACK_MAX_VERSION) || !(data['createdAt'] instanceof Timestamp) ||
      data['createdAt'].valueOf() > latest.valueOf()) fail('A versão do Starter Pack é inválida.');
  return { version: expectedVersion, cards: validateItems(data['cards'], false), createdAt: data['createdAt'] };
}
export function validatePack(data: Record<string, unknown>, latest: Timestamp): PlayerPack {
  const opened = data['state'] === 'opened';
  if (!hasFields(data, ['packId', 'definitionVersion', 'source', 'state', 'acquiredAt', 'openedAt'], opened ? ['revealedCards'] : []) ||
      data['packId'] !== STARTER_PACK_ID || data['source'] !== 'starter' || !validPositiveInteger(data['definitionVersion'], PACK_MAX_VERSION) ||
      !(data['acquiredAt'] instanceof Timestamp) || data['acquiredAt'].valueOf() > latest.valueOf() ||
      (data['state'] !== 'sealed' && !opened) || (opened ? !orderedDates(data['acquiredAt'], data['openedAt'], latest) : data['openedAt'] !== null) ||
      (opened && !Object.hasOwn(data, 'revealedCards'))) fail('A instância do pacote está inválida e precisa ser revisada por um administrador.');
  const base = { packId: STARTER_PACK_ID as typeof STARTER_PACK_ID, definitionVersion: data['definitionVersion'], source: 'starter' as const, acquiredAt: data['acquiredAt'] };
  return opened ? { ...base, state: 'opened', openedAt: data['openedAt'] as Timestamp, revealedCards: validateItems(data['revealedCards'], true) as PackOpenedCard[] } :
    { ...base, state: 'sealed', openedAt: null };
}
export function validatePackAudit(profile: PlayerProfile, pack: PlayerPack, packInstanceId: string): void {
  if (!profile.starterGrantedAt || profile.starterPackInstanceId !== packInstanceId || packInstanceId !== STARTER_PACK_INSTANCE_ID ||
      profile.starterVersion !== pack.definitionVersion || !profile.starterGrantedAt.isEqual(pack.acquiredAt)) {
    fail('O pacote não corresponde ao registro de concessão deste jogador.');
  }
}
export function publishedSnapshot(cardId: string, quantity: number, data: Record<string, unknown> | null): PackOpenedCard {
  if (!data || data['status'] !== 'published') fail('O pacote contém uma carta que não está publicada. Ele permanece lacrado.');
  if (!validText(data['name'], 120) || !CARD_RARITIES.includes(data['rarity'] as CardRarity)) fail('Uma carta do pacote possui nome ou raridade inválida.');
  return { cardId, name: data['name'], rarity: data['rarity'] as CardRarity, quantity };
}
export function validateOwnedEntry(data: Record<string, unknown>, latest: Timestamp): {
  quantity: number; firstAcquiredAt: Timestamp; lastAcquiredAt: Timestamp;
} {
  if (!hasFields(data, ['quantity', 'firstAcquiredAt', 'lastAcquiredAt']) ||
      !validPositiveInteger(data['quantity'], PLAYER_COLLECTION_MAX_QUANTITY) ||
      !orderedDates(data['firstAcquiredAt'], data['lastAcquiredAt'], latest)) {
    fail('Uma entrada existente na coleção está inválida e precisa ser revisada por um administrador.');
  }
  return { quantity: data['quantity'], firstAcquiredAt: data['firstAcquiredAt'], lastAcquiredAt: data['lastAcquiredAt'] as Timestamp };
}
