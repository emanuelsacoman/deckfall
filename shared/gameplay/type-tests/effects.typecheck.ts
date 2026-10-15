import {
  GAMEPLAY_EFFECT_CATALOG, parseGameplayEffect, validateGameplayEffectTarget,
} from '../src';
import type {
  GameplayEffect, GameplayEffectDestination, GameplayMatchState,
} from '../src';

declare const state: GameplayMatchState;
declare const effect: GameplayEffect;
declare const destination: GameplayEffectDestination;

const effects: readonly GameplayEffect[] = [
  { kind: 'damage', amount: 1 }, { kind: 'damage', amount: 3 },
  { kind: 'heal', amount: 3 }, { kind: 'draw', amount: 1 }, { kind: 'draw', amount: 2 },
];
const policy: 'enemy-character' = GAMEPLAY_EFFECT_CATALOG.damage.targetPolicy;
const parsed: GameplayEffect = parseGameplayEffect({ kind: 'heal', amount: 3 });
const recipient: GameplayEffectDestination = validateGameplayEffectTarget(state, 'p1', { kind: 'draw', amount: 1 });

if (effect.kind === 'heal') {
  const healing: 3 = effect.amount;
  void healing;
} else if (effect.kind === 'damage') {
  const damage: 1 | 3 = effect.amount;
  void damage;
} else {
  const drawing: 1 | 2 = effect.amount;
  void drawing;
}

if (destination.kind === 'unit') {
  const instanceId: string = destination.instanceId;
  const seat: 'p1' | 'p2' = destination.seat;
  void [instanceId, seat];
} else if (destination.kind === 'player') {
  // @ts-expect-error Automatic card draw has no target card instance.
  destination.instanceId;
}

// @ts-expect-error Damage two was not approved for v0.1.
const damageTwo: GameplayEffect = { kind: 'damage', amount: 2 };
// @ts-expect-error Healing is fixed at three in the approved catalogue.
const healOne: GameplayEffect = { kind: 'heal', amount: 1 };
// @ts-expect-error Healing does not accept arbitrary numeric parameters.
const healFour: GameplayEffect = { kind: 'heal', amount: 4 };
// @ts-expect-error Drawing three was not approved for v0.1.
const drawThree: GameplayEffect = { kind: 'draw', amount: 3 };
// @ts-expect-error Guard is a fixed unit characteristic, not an action effect.
const guardEffect: GameplayEffect = { kind: 'guard', amount: 1 };
// @ts-expect-error Free text is never an executable effect field.
const scriptEffect: GameplayEffect = { kind: 'damage', amount: 1, script: 'arbitrary text' };
// @ts-expect-error A client effect cannot select the draw recipient.
const selectedRecipient: GameplayEffect = { kind: 'draw', amount: 1, recipient: 'p2' };
// @ts-expect-error Catalogue parameters cannot be extended by a consumer.
GAMEPLAY_EFFECT_CATALOG.damage.amounts.push(2);
// @ts-expect-error Targeting policy is readonly.
GAMEPLAY_EFFECT_CATALOG.damage.targetPolicy = 'self-player';
// @ts-expect-error Unit destinations require an explicit instance identity.
const missingUnit: GameplayEffectDestination = { kind: 'unit', seat: 'p1' };
// @ts-expect-error Trusted actor context uses a battle seat, never an account UID.
validateGameplayEffectTarget(state, 'account-uid', { kind: 'draw', amount: 1 });

void [effects, policy, parsed, recipient, damageTwo, healOne, healFour, drawThree,
  guardEffect, scriptEffect, selectedRecipient, missingUnit];
