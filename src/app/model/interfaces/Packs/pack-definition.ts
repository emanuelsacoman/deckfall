import { PackDefinition, PackDefinitionVersion, PACK_INSTANCE_ID_PATTERN, PACK_MAX_CARDS, PACK_MAX_VERSION } from './player-pack';

export const STARTER_PACK_ID = 'starter';
export const STARTER_PACK_NAME = 'StarterPack';
export const PACK_DEFINITION_LIMITS = {
  name: 120, description: 1000, cards: PACK_MAX_CARDS, quantity: 9999, version: PACK_MAX_VERSION
} as const;

/** The document ID is client metadata, never a field persisted in the definition. */
export interface PackDefinitionRecord extends PackDefinition { id: string; }
export type PackCardInput = PackDefinitionVersion['cards'][number];
export interface PackDefinitionMetadata { name: string; description: string; active: boolean; }
export interface PackDefinitionInput extends PackDefinitionMetadata {
  cards: PackCardInput[];
  isStarter?: boolean;
}

export function validatePackDefinitionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !PACK_INSTANCE_ID_PATTERN.test(value)) throw new Error('Identificador de pacote inválido.');
}

export function isReservedStarterName(value: string): boolean {
  return value.toLowerCase().replace(/[\s_-]/g, '') === 'starterpack';
}

export function validatePackDefinitionMetadata(value: unknown, starter: boolean): PackDefinitionMetadata {
  const data = packRecord(value, ['name', 'description', 'active']);
  const name = typeof data['name'] === 'string' ? data['name'].trim() : '';
  const description = typeof data['description'] === 'string' ? data['description'].trim() : null;
  if (!name || name.length > PACK_DEFINITION_LIMITS.name) throw new Error('Informe um nome de até 120 caracteres.');
  if (description === null || description.length > PACK_DEFINITION_LIMITS.description) throw new Error('A descrição permite até 1000 caracteres.');
  if (typeof data['active'] !== 'boolean') throw new Error('Informe se o pacote está ativo.');
  if (starter ? data['name'] !== STARTER_PACK_NAME : isReservedStarterName(name)) {
    throw new Error('O nome StarterPack é reservado ao pacote inicial dos jogadores.');
  }
  return { name, description, active: data['active'] };
}

export function validatePackCards(value: unknown): PackCardInput[] {
  if (!Array.isArray(value) || !value.length || value.length > PACK_DEFINITION_LIMITS.cards) {
    throw new Error('Selecione entre 1 e 25 cartas publicadas.');
  }
  const seen = new Set<string>();
  return value.map(item => {
    const data = packRecord(item, ['cardId', 'quantity']);
    validatePackDefinitionId(data['cardId']);
    const quantity = data['quantity'];
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > PACK_DEFINITION_LIMITS.quantity) {
      throw new Error('Informe uma quantidade inteira entre 1 e 9999 para cada carta.');
    }
    if (seen.has(data['cardId'])) throw new Error('Cada carta deve aparecer uma vez. Use a quantidade para definir as cópias.');
    seen.add(data['cardId']);
    return { cardId: data['cardId'], quantity };
  });
}

export function packRecord(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Dados de pacote inválidos.');
  const data = value as Record<string, unknown>;
  if (required.some(key => !Object.prototype.hasOwnProperty.call(data, key)) ||
      Object.keys(data).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('Campos de pacote inválidos.');
  return data;
}
