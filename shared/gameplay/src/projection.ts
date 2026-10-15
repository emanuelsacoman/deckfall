import type {
  GameplayCardDefinition, GameplayCardInstance, GameplayFieldUnit, GameplayMatchState,
  GameplayMulligan, GameplayParticipantState, GameplayParticipantView,
  GameplayPublicParticipantView, GameplayResult,
} from './contracts';
import type { GameplaySeat } from './rules';
import { GameplayContractError } from './validation';

function definitionView(definition: GameplayCardDefinition): GameplayCardDefinition {
  const { cardId, revision, cost } = definition;
  return definition.kind === 'unit'
    ? { kind: 'unit', cardId, revision, cost, power: definition.power, maxLife: definition.maxLife, guard: definition.guard }
    : { kind: 'action', cardId, revision, cost, effect: { kind: definition.effect.kind, amount: definition.effect.amount } };
}

function cardView(card: GameplayCardInstance): GameplayCardInstance {
  return { instanceId: card.instanceId, definition: definitionView(card.definition) };
}

function fieldView(unit: GameplayFieldUnit): GameplayFieldUnit {
  const definition = unit.definition;
  return {
    instanceId: unit.instanceId,
    definition: {
      kind: 'unit', cardId: definition.cardId, revision: definition.revision, cost: definition.cost,
      power: definition.power, maxLife: definition.maxLife, guard: definition.guard,
    },
    slot: unit.slot, life: unit.life, readyToAttack: unit.readyToAttack,
  };
}

function mulliganView(mulligan: GameplayMulligan): GameplayMulligan {
  return mulligan.confirmed
    ? { confirmed: true, selectedInstanceIds: [...mulligan.selectedInstanceIds] }
    : { confirmed: false, selectedInstanceIds: [] };
}

function publicView(player: GameplayParticipantState, bothConfirmed: boolean): GameplayPublicParticipantView {
  return {
    life: player.life, ownTurn: player.ownTurn,
    energy: { current: player.energy.current, maximum: player.energy.maximum },
    fatigue: player.fatigue, deckCount: player.deck.length, handCount: player.hand.length,
    field: player.field.map(fieldView), discard: player.discard.map(cardView),
    mulliganReplaced: bothConfirmed ? player.mulligan.selectedInstanceIds.length : null,
  };
}

function resultView(result: GameplayResult | null): GameplayResult | null {
  if (!result) return null;
  return result.kind === 'victory'
    ? { kind: 'victory', winner: result.winner, reason: result.reason }
    : { kind: 'draw', reason: 'simultaneous-life' };
}

/**
 * Explicit whitelist for a trusted, validated server snapshot. No identity lookup,
 * authorization, game execution or post-match hidden-information release occurs here.
 */
export function projectGameplayParticipant(state: GameplayMatchState, viewerSeat: GameplaySeat): GameplayParticipantView {
  if (viewerSeat !== 'p1' && viewerSeat !== 'p2') throw new GameplayContractError();
  const self = state.participants[viewerSeat];
  const opponent = state.participants[viewerSeat === 'p1' ? 'p2' : 'p1'];
  const bothConfirmed = self.mulligan.confirmed && opponent.mulligan.confirmed;
  return {
    rulesVersion: state.rulesVersion, contentVersion: state.contentVersion,
    matchId: state.matchId, revision: state.revision, viewerSeat,
    phase: state.phase, activeSeat: state.activeSeat, result: resultView(state.result),
    self: {
      ...publicView(self, bothConfirmed), hand: self.hand.map(cardView), mulligan: mulliganView(self.mulligan),
    },
    opponent: publicView(opponent, bothConfirmed),
  };
}
