/** Approved Game Design v0.1. No editor defaults or inventory limits are reused. */
export const GAMEPLAY_RULES_VERSION = '0.1' as const;

export const GAMEPLAY_RULES = Object.freeze({
  version: GAMEPLAY_RULES_VERSION,
  participants: 2,
  leaderLife: 20,
  deckSize: 24,
  maxCopies: 2,
  initialHand: 4,
  maxHand: 8,
  drawPerTurn: 1,
  maxUnits: 5,
  energyPerOwnTurn: 1,
  maxEnergy: 8,
  minCardCost: 1,
  maxCardCost: 8,
  mulligans: 1,
  firstPlayerSkipsFirstDraw: true,
} as const);

export const GAMEPLAY_SEATS = Object.freeze(['p1', 'p2'] as const);
export type GameplaySeat = typeof GAMEPLAY_SEATS[number];
export type GameplayRulesVersion = typeof GAMEPLAY_RULES_VERSION;
