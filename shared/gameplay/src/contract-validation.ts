/** Safe diagnostic: never include a command, identity, seed or hidden card in errors. */
export class GameplayContractError extends Error {
  readonly code = 'invalid-gameplay-contract';

  constructor() {
    super('Contrato de gameplay inválido.');
    this.name = 'GameplayContractError';
  }
}

export function contractRecord(
  value: unknown, required: readonly string[], optional: readonly string[] = [],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new GameplayContractError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.values(descriptors).some(item => item.get || item.set || !item.enumerable)) {
    throw new GameplayContractError();
  }
  const record = value as Record<string, unknown>;
  if (required.some(key => !Object.prototype.hasOwnProperty.call(record, key)) ||
      Object.getOwnPropertyNames(record).some(key => !required.includes(key) && !optional.includes(key))) {
    throw new GameplayContractError();
  }
  return record;
}

export function contractInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new GameplayContractError();
  }
  return value;
}

export function contractIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new GameplayContractError();
  return value;
}

export function contractArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length || Object.keys(value).length !== value.length ||
      Object.getOwnPropertyNames(value).length !== value.length + 1 ||
      Object.entries(Object.getOwnPropertyDescriptors(value)).some(([key, item]) => key !== 'length' &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length || !item.enumerable || item.get || item.set))) {
    throw new GameplayContractError();
  }
  return value as readonly unknown[];
}

export function contractBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new GameplayContractError();
  return value;
}
