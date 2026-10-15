import type {
  GameplayCardDefinition, GameplayCommand, GameplayCommandRequest, GameplayTarget,
} from './contracts';
import { GAMEPLAY_RULES } from './rules';

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

/** Format and numeric envelope only, without balance or effect interpretation. */
export function parseGameplayCardDefinition(value: unknown): GameplayCardDefinition {
  const common = contractRecord(value, ['kind', 'cardId', 'revision', 'cost'], ['power', 'maxLife', 'guard', 'effect']);
  const cardId = contractIdentifier(common['cardId']);
  const revision = contractInteger(common['revision'], 1);
  const cost = contractInteger(common['cost'], GAMEPLAY_RULES.minCardCost, GAMEPLAY_RULES.maxCardCost);
  if (common['kind'] === 'unit') {
    const unit = contractRecord(value, ['kind', 'cardId', 'revision', 'cost', 'power', 'maxLife', 'guard']);
    return {
      kind: 'unit', cardId, revision, cost,
      power: contractInteger(unit['power'], 0),
      maxLife: contractInteger(unit['maxLife'], 1),
      guard: contractBoolean(unit['guard']),
    };
  }
  if (common['kind'] === 'action') {
    const action = contractRecord(value, ['kind', 'cardId', 'revision', 'cost', 'effect']);
    const effect = contractRecord(action['effect'], ['kind', 'amount']);
    const kind = effect['kind'];
    if (kind !== 'damage' && kind !== 'heal' && kind !== 'draw') throw new GameplayContractError();
    return { kind: 'action', cardId, revision, cost, effect: { kind, amount: contractInteger(effect['amount'], 1) } };
  }
  throw new GameplayContractError();
}

function parseTarget(value: unknown): GameplayTarget {
  const common = contractRecord(value, ['kind'], ['seat', 'instanceId']);
  if (common['kind'] === 'leader') {
    const target = contractRecord(value, ['kind', 'seat']);
    if (target['seat'] !== 'p1' && target['seat'] !== 'p2') throw new GameplayContractError();
    return { kind: 'leader', seat: target['seat'] };
  }
  if (common['kind'] === 'unit') {
    const target = contractRecord(value, ['kind', 'instanceId']);
    return { kind: 'unit', instanceId: contractIdentifier(target['instanceId']) };
  }
  throw new GameplayContractError();
}

function parseCommand(value: unknown): GameplayCommand {
  const common = contractRecord(value, ['type'], ['instanceId', 'target', 'attackerInstanceId', 'instanceIds']);
  switch (common['type']) {
    case 'play-card': {
      const command = contractRecord(value, ['type', 'instanceId'], ['target']);
      const instanceId = contractIdentifier(command['instanceId']);
      return Object.prototype.hasOwnProperty.call(command, 'target')
        ? { type: 'play-card', instanceId, target: parseTarget(command['target']) }
        : { type: 'play-card', instanceId };
    }
    case 'attack': {
      const command = contractRecord(value, ['type', 'attackerInstanceId', 'target']);
      return { type: 'attack', attackerInstanceId: contractIdentifier(command['attackerInstanceId']), target: parseTarget(command['target']) };
    }
    case 'mulligan': {
      const command = contractRecord(value, ['type', 'instanceIds']);
      const instanceIds = contractArray(command['instanceIds']).map(contractIdentifier);
      if (instanceIds.length > GAMEPLAY_RULES.initialHand || new Set(instanceIds).size !== instanceIds.length) {
        throw new GameplayContractError();
      }
      return { type: 'mulligan', instanceIds };
    }
    case 'end-turn':
    case 'concede':
      contractRecord(value, ['type']);
      return { type: common['type'] };
    default:
      throw new GameplayContractError();
  }
}

/** Does not authenticate, authorize, apply a command or determine game legality. */
export function parseGameplayCommandRequest(value: unknown): GameplayCommandRequest {
  const request = contractRecord(value, ['matchId', 'commandId', 'expectedRevision', 'command']);
  return {
    matchId: contractIdentifier(request['matchId']),
    commandId: contractIdentifier(request['commandId']),
    expectedRevision: contractInteger(request['expectedRevision'], 0),
    command: parseCommand(request['command']),
  };
}
