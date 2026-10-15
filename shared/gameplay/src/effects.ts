import type { GameplayMatchState, GameplayTarget } from './contracts';
import type { GameplaySeat } from './rules';
import { contractInteger, contractRecord, GameplayContractError } from './contract-validation';
import { parseGameplayTarget } from './targets';

/** Closed parameters from the approved v0.1 pool; changes require design/content review. */
export const GAMEPLAY_EFFECT_CATALOG = Object.freeze({
  damage: Object.freeze({ amounts: Object.freeze([1, 3] as const), targetPolicy: 'enemy-character' as const }),
  heal: Object.freeze({ amounts: Object.freeze([3] as const), targetPolicy: 'ally-character' as const }),
  draw: Object.freeze({ amounts: Object.freeze([1, 2] as const), targetPolicy: 'self-player' as const }),
});

export interface GameplayDamageEffect {
  readonly kind: 'damage';
  readonly amount: typeof GAMEPLAY_EFFECT_CATALOG.damage.amounts[number];
}

export interface GameplayHealEffect {
  readonly kind: 'heal';
  readonly amount: typeof GAMEPLAY_EFFECT_CATALOG.heal.amounts[number];
}

export interface GameplayDrawEffect {
  readonly kind: 'draw';
  readonly amount: typeof GAMEPLAY_EFFECT_CATALOG.draw.amounts[number];
}

export type GameplayEffect = GameplayDamageEffect | GameplayHealEffect | GameplayDrawEffect;

export type GameplayEffectDestination =
  | { readonly kind: 'leader'; readonly seat: GameplaySeat }
  | { readonly kind: 'unit'; readonly seat: GameplaySeat; readonly instanceId: string }
  | { readonly kind: 'player'; readonly seat: GameplaySeat };

function allowedAmount<T extends number>(amounts: readonly T[], value: number): value is T {
  return amounts.some(amount => amount === value);
}

/** Parses one approved effect descriptor; never evaluates text or executes an effect. */
export function parseGameplayEffect(value: unknown): GameplayEffect {
  const effect = contractRecord(value, ['kind', 'amount']);
  const amount = contractInteger(effect['amount'], 1);
  switch (effect['kind']) {
    case 'damage':
      if (!allowedAmount(GAMEPLAY_EFFECT_CATALOG.damage.amounts, amount)) throw new GameplayContractError();
      return { kind: 'damage', amount };
    case 'heal':
      if (!allowedAmount(GAMEPLAY_EFFECT_CATALOG.heal.amounts, amount)) throw new GameplayContractError();
      return { kind: 'heal', amount };
    case 'draw':
      if (!allowedAmount(GAMEPLAY_EFFECT_CATALOG.draw.amounts, amount)) throw new GameplayContractError();
      return { kind: 'draw', amount };
    default:
      throw new GameplayContractError();
  }
}

/**
 * Checks only an effect's destination. The caller supplies a previously validated
 * authoritative snapshot, authenticated seat and effect from the canonical card.
 * Does not check command phase/turn/cost, authorize a player or change any state.
 */
export function validateGameplayEffectTarget(
  state: GameplayMatchState, actorSeat: GameplaySeat, effect: GameplayEffect, target?: GameplayTarget,
): GameplayEffectDestination {
  if (actorSeat !== 'p1' && actorSeat !== 'p2') throw new GameplayContractError();
  const parsedEffect = parseGameplayEffect(effect);
  if (parsedEffect.kind === 'draw') {
    if (target !== undefined) throw new GameplayContractError();
    return { kind: 'player', seat: actorSeat };
  }
  const parsedTarget = parseGameplayTarget(target);
  const owner = GAMEPLAY_EFFECT_CATALOG[parsedEffect.kind].targetPolicy === 'enemy-character'
    ? (actorSeat === 'p1' ? 'p2' : 'p1') : actorSeat;
  if (parsedTarget.kind === 'leader') {
    if (parsedTarget.seat !== owner || !(state.participants[owner].life > 0)) throw new GameplayContractError();
    return { kind: 'leader', seat: owner };
  }
  const unit = state.participants[owner].field.find(item => item.instanceId === parsedTarget.instanceId);
  if (!unit || !(unit.life > 0)) throw new GameplayContractError();
  return { kind: 'unit', seat: owner, instanceId: unit.instanceId };
}
