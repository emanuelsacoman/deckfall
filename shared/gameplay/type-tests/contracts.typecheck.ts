import type {
  GameplayCommand, GameplayCommandRequest, GameplayMatchState, GameplayParticipantView,
  GameplayTarget, GameplayUnitDefinition,
} from '../src';

declare const state: GameplayMatchState;
declare const view: GameplayParticipantView;

// @ts-expect-error An authoritative snapshot is readonly.
state.revision = 3;
// @ts-expect-error A participant view has no random state.
view.random;
// @ts-expect-error Opponent hand identities are not part of the projection.
view.opponent.hand;
// @ts-expect-error Even the viewer receives no ordered deck.
view.self.deck;
// @ts-expect-error Private mulligan identities are never exposed for the opponent.
view.opponent.mulligan;

// @ts-expect-error Authentication identity is not a command field.
const injectedActor: GameplayCommand = { type: 'end-turn', uid: 'member' };
// @ts-expect-error Attacks must specify a target.
const missingTarget: GameplayCommand = { type: 'attack', attackerInstanceId: 'unit-1' };
// @ts-expect-error Target data never includes client-selected damage.
const forgedTarget: GameplayTarget = { kind: 'leader', seat: 'p2', damage: 20 };
// @ts-expect-error A terminal state has no active participant and requires a result.
const wrongTerminal: GameplayMatchState = { ...state, phase: 'finished', activeSeat: 'p1', result: null };
// @ts-expect-error No visual canvas belongs to a gameplay definition.
const visualUnit: GameplayUnitDefinition = { kind: 'unit', cardId: 'unit', revision: 1, cost: 1, power: 1, maxLife: 2, guard: false, canvas: {} };

const request: GameplayCommandRequest = {
  matchId: 'match-1', commandId: 'command-1', expectedRevision: 0,
  command: { type: 'play-card', instanceId: 'card-1' },
};

void [injectedActor, missingTarget, forgedTarget, wrongTerminal, visualUnit, request];
