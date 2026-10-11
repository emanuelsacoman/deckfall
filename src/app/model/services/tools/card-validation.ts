import {
  CARD_LIMITS, CARD_RARITIES, CARD_STATUSES, CardAttribute, CardInput, CardRarity, CardStatus
} from '../../interfaces/Cards/card';
import { isCanvasColor, validateCardCanvas, validateCardDocumentSize } from './card-canvas-validation';

export function validateCardInput(value: unknown): CardInput {
  validateCardDocumentSize(value);
  const input = record(value, 'dados da carta');
  const allowed = ['name', 'description', 'rarity', 'status', 'attributes', 'setId', 'type', 'subtype', 'templateId', 'canvas'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Campo desconhecido nos dados da carta.');
  const name = boundedText(input['name'], 'nome', CARD_LIMITS.name).trim();
  const description = boundedText(input['description'], 'descrição', CARD_LIMITS.description).trim();
  if (!name) throw new Error(`Informe um nome com até ${CARD_LIMITS.name} caracteres.`);
  const rarity = input['rarity'];
  const status = input['status'];
  if (!CARD_RARITIES.some(item => item === rarity) || !CARD_STATUSES.some(item => item === status)) {
    throw new Error('Selecione uma raridade e um status válidos.');
  }
  const setId = optionalText(input['setId'], 'identificador da coleção', 128);
  const result: CardInput = {
    name, description, rarity: rarity as CardRarity, status: status as CardStatus,
    attributes: validateCardAttributes(input['attributes']), setId: setId ?? null
  };
  for (const key of ['type', 'subtype', 'templateId'] as const) {
    if (input[key] !== undefined) {
      const field = optionalText(input[key], key, key === 'templateId' ? 128 : 80);
      if (key === 'templateId' && field !== null && field !== undefined) validateCardId(field);
      result[key] = field ?? null;
    }
  }
  if (input['canvas'] !== undefined) result.canvas = validateCardCanvas(input['canvas']);
  validateCardDocumentSize(result);
  return result;
}

export function validateCardAttributes(value: unknown): CardAttribute[] {
  if (!Array.isArray(value) || value.length > CARD_LIMITS.attributes) throw new Error(`A carta permite até ${CARD_LIMITS.attributes} atributos.`);
  const keys = new Set<string>();
  const ids = new Set<string>();
  return (value as unknown[]).map(item => {
    const data = record(item, 'atributo');
    if (Object.keys(data).some(key => !['id', 'key', 'label', 'value', 'min', 'max', 'icon', 'color'].includes(key))) throw new Error('Campo desconhecido no atributo.');
    const key = typeof data['key'] === 'string' ? data['key'].trim() : '';
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(key)) throw new Error('Use chaves de atributo iniciadas por letra minúscula, com letras, números, hífen ou sublinhado.');
    if (keys.has(key)) throw new Error(`A chave de atributo "${key}" está repetida.`);
    keys.add(key);
    const label = boundedText(data['label'], 'rótulo do atributo', CARD_LIMITS.attributeLabel).trim();
    if (!label) throw new Error(`O rótulo de cada atributo deve ter de 1 a ${CARD_LIMITS.attributeLabel} caracteres.`);
    const min = data['min'] === undefined ? 0 : rangeNumber(data['min']);
    const max = data['max'] === undefined ? 100 : rangeNumber(data['max']);
    if (min >= max) throw new Error('O mínimo do atributo deve ser menor que o máximo.');
    const number = data['value'];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
      throw new Error(min === 0 && max === 100 ? 'Os valores dos atributos devem estar entre 0 e 100.' : `O valor do atributo "${label}" deve estar entre ${min} e ${max}.`);
    }
    const result: CardAttribute = { key, label, value: number };
    if (data['min'] !== undefined) result.min = min;
    if (data['max'] !== undefined) result.max = max;
    if (data['id'] !== undefined) {
      const identifier = boundedText(data['id'], 'ID do atributo', 128);
      validateCardId(identifier);
      if (ids.has(identifier)) throw new Error('IDs de atributo repetidos.');
      ids.add(identifier);
      result.id = identifier;
    }
    if (data['icon'] !== undefined) result.icon = boundedText(data['icon'], 'ícone do atributo', 32);
    if (data['color'] !== undefined) {
      if (!isCanvasColor(data['color'])) throw new Error('Cor do atributo inválida.');
      result.color = data['color'];
    }
    return result;
  });
}

export function cardSlug(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, CARD_LIMITS.name)
    .replace(/^-|-$/g, '') || 'carta';
}

export function validateCardId(id: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error('Identificador de carta inválido.');
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Formato inválido: ${label}.`);
  return value as Record<string, unknown>;
}
function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Texto inválido: ${label} (máximo ${max} caracteres).`);
  return value;
}
function optionalText(value: unknown, label: string, max: number): string | null | undefined {
  if (value === undefined || value === null) return value;
  const result = boundedText(value, label, max).trim();
  if (!result) throw new Error(`O ${label} deve ter de 1 a ${max} caracteres.`);
  return result;
}
function rangeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -1_000_000 || value > 1_000_000) {
    throw new Error('Os limites dos atributos devem ser números entre -1000000 e 1000000.');
  }
  return value;
}
