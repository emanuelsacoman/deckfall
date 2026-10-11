import {
  CARD_LIMITS, CARD_RARITIES, CARD_STATUSES, CardInput
} from '../../interfaces/Cards/card';

export function validateCardInput(input: CardInput): CardInput {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > CARD_LIMITS.name) {
    throw new Error(`Informe um nome com até ${CARD_LIMITS.name} caracteres.`);
  }
  if (description.length > CARD_LIMITS.description) {
    throw new Error(`A descrição deve ter até ${CARD_LIMITS.description} caracteres.`);
  }
  if (!CARD_RARITIES.includes(input.rarity) || !CARD_STATUSES.includes(input.status)) {
    throw new Error('Selecione uma raridade e um status válidos.');
  }
  if (input.attributes.length > CARD_LIMITS.attributes) {
    throw new Error(`A carta permite até ${CARD_LIMITS.attributes} atributos.`);
  }
  const attributes = input.attributes.map(attribute => ({
    key: attribute.key.trim(), label: attribute.label.trim(), value: attribute.value
  }));
  const keys = new Set<string>();
  for (const attribute of attributes) {
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(attribute.key)) {
      throw new Error('Use chaves de atributo iniciadas por letra minúscula, com letras, números, hífen ou sublinhado.');
    }
    if (keys.has(attribute.key)) {
      throw new Error(`A chave de atributo "${attribute.key}" está repetida.`);
    }
    keys.add(attribute.key);
    if (!attribute.label || attribute.label.length > CARD_LIMITS.attributeLabel) {
      throw new Error(`O rótulo de cada atributo deve ter de 1 a ${CARD_LIMITS.attributeLabel} caracteres.`);
    }
    if (!Number.isFinite(attribute.value) || attribute.value < 0 || attribute.value > 100) {
      throw new Error('Os valores dos atributos devem estar entre 0 e 100.');
    }
  }
  const setId = input.setId?.trim() ?? null;
  if (setId !== null && (!setId || setId.length > 128)) {
    throw new Error('O identificador da coleção deve ter de 1 a 128 caracteres.');
  }
  return { ...input, name, description, attributes, setId };
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
