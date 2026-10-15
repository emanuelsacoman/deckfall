import type { GameplayRulesVersion, GameplaySeat } from './rules';

export interface GameplayDefinitionIdentity {
  readonly cardId: string;
  readonly revision: number;
  readonly cost: number;
}

export interface GameplayUnitDefinition extends GameplayDefinitionIdentity {
  readonly kind: 'unit';
  readonly power: number;
  readonly maxLife: number;
  readonly guard: boolean;
}

/** Structural descriptors only; effect semantics/execution are a later milestone. */
export interface GameplayEffectDescriptor {
  readonly kind: 'damage' | 'heal' | 'draw';
  readonly amount: number;
}

export interface GameplayActionDefinition extends GameplayDefinitionIdentity {
  readonly kind: 'action';
  readonly effect: GameplayEffectDescriptor;
}

export type GameplayCardDefinition = GameplayUnitDefinition | GameplayActionDefinition;

export interface GameplayCardInstance {
  readonly instanceId: string;
  readonly definition: GameplayCardDefinition;
}

export type GameplayFieldSlot = 0 | 1 | 2 | 3 | 4;

export interface GameplayFieldUnit {
  readonly instanceId: string;
  readonly definition: GameplayUnitDefinition;
  readonly slot: GameplayFieldSlot;
  readonly life: number;
  readonly readyToAttack: boolean;
}

export interface GameplayEnergy {
  readonly current: number;
  readonly maximum: number;
}

export type GameplayMulligan =
  | { readonly confirmed: false; readonly selectedInstanceIds: readonly [] }
  | { readonly confirmed: true; readonly selectedInstanceIds: readonly string[] };

export interface GameplayParticipantState {
  readonly life: number;
  readonly ownTurn: number;
  readonly energy: GameplayEnergy;
  readonly fatigue: number;
  readonly deck: readonly GameplayCardInstance[];
  readonly hand: readonly GameplayCardInstance[];
  readonly field: readonly GameplayFieldUnit[];
  readonly discard: readonly GameplayCardInstance[];
  readonly mulligan: GameplayMulligan;
}

/** Private state. Algorithm selection and random generation are not implemented here. */
export interface GameplayRandomState {
  readonly algorithmId: string;
  readonly algorithmVersion: number;
  readonly seed: string;
  readonly state: readonly number[];
  readonly draws: number;
}

export type GameplayResult =
  | { readonly kind: 'victory'; readonly winner: GameplaySeat; readonly reason: 'life' | 'concession' }
  | { readonly kind: 'draw'; readonly reason: 'simultaneous-life' };

export type GameplayTurnPhase = 'preparation' | 'draw' | 'main' | 'end';
export type GameplayPhase = 'mulligan' | GameplayTurnPhase | 'finished';

interface GameplayMatchCommon {
  readonly rulesVersion: GameplayRulesVersion;
  readonly contentVersion: string;
  readonly matchId: string;
  readonly revision: number;
  readonly participants: Readonly<Record<GameplaySeat, GameplayParticipantState>>;
  readonly random: GameplayRandomState;
}

/** Serializable authoritative snapshot. Never send this object to a participant. */
export type GameplayMatchState = GameplayMatchCommon & (
  | { readonly phase: 'mulligan'; readonly activeSeat: null; readonly result: null }
  | { readonly phase: GameplayTurnPhase; readonly activeSeat: GameplaySeat; readonly result: null }
  | { readonly phase: 'finished'; readonly activeSeat: null; readonly result: GameplayResult }
);

export type GameplayTarget =
  | { readonly kind: 'leader'; readonly seat: GameplaySeat }
  | { readonly kind: 'unit'; readonly instanceId: string };

/** Intent only. The authenticated actor is supplied separately by trusted infrastructure. */
export type GameplayCommand =
  | { readonly type: 'play-card'; readonly instanceId: string; readonly target?: GameplayTarget }
  | { readonly type: 'attack'; readonly attackerInstanceId: string; readonly target: GameplayTarget }
  | { readonly type: 'end-turn' }
  | { readonly type: 'mulligan'; readonly instanceIds: readonly string[] }
  | { readonly type: 'concede' };

export interface GameplayCommandRequest {
  readonly matchId: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly command: GameplayCommand;
}

/** Created after authentication; it is not part of the client request. */
export interface GameplayActorContext {
  readonly seat: GameplaySeat;
}

export interface GameplayPublicParticipantView {
  readonly life: number;
  readonly ownTurn: number;
  readonly energy: GameplayEnergy;
  readonly fatigue: number;
  readonly deckCount: number;
  readonly handCount: number;
  readonly field: readonly GameplayFieldUnit[];
  readonly discard: readonly GameplayCardInstance[];
  /** Public only when both mulligans have been confirmed. */
  readonly mulliganReplaced: number | null;
}

export interface GameplaySelfView extends GameplayPublicParticipantView {
  readonly hand: readonly GameplayCardInstance[];
  readonly mulligan: GameplayMulligan;
}

/** Whitelisted participant projection, including after a match has finished. */
export interface GameplayParticipantView {
  readonly rulesVersion: GameplayRulesVersion;
  readonly contentVersion: string;
  readonly matchId: string;
  readonly revision: number;
  readonly viewerSeat: GameplaySeat;
  readonly phase: GameplayPhase;
  readonly activeSeat: GameplaySeat | null;
  readonly result: GameplayResult | null;
  readonly self: GameplaySelfView;
  readonly opponent: GameplayPublicParticipantView;
}
