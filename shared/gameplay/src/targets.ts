import type { GameplayTarget } from './contracts';
import { contractIdentifier, contractRecord, GameplayContractError } from './contract-validation';

/** Shared shape parser; existence, side and effect-specific policies are checked separately. */
export function parseGameplayTarget(value: unknown): GameplayTarget {
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
