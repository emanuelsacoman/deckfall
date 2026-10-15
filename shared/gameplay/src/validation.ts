import type {
  GameplayCardDefinition, GameplayCommand, GameplayCommandRequest,
} from './contracts';
import { GAMEPLAY_RULES } from './rules';

import {
  contractRecord, contractInteger, contractIdentifier, contractArray, contractBoolean, GameplayContractError,
} from './contract-validation';
import { parseGameplayEffect } from './effects';
import { parseGameplayTarget } from './targets';

export {
  contractRecord, contractInteger, contractIdentifier, contractArray, contractBoolean, GameplayContractError,
} from './contract-validation';

/** Parses profiles with approved effect parameters; never executes gameplay. */
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
    return { kind: 'action', cardId, revision, cost, effect: parseGameplayEffect(action['effect']) };
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
        ? { type: 'play-card', instanceId, target: parseGameplayTarget(command['target']) }
        : { type: 'play-card', instanceId };
    }
    case 'attack': {
      const command = contractRecord(value, ['type', 'attackerInstanceId', 'target']);
      return { type: 'attack', attackerInstanceId: contractIdentifier(command['attackerInstanceId']), target: parseGameplayTarget(command['target']) };
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
