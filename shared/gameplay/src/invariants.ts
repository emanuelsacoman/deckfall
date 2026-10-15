import type { GameplayCardDefinition, GameplayMatchState } from './contracts';
import { GAMEPLAY_RULES, GAMEPLAY_RULES_VERSION, GAMEPLAY_SEATS, type GameplaySeat } from './rules';
import {
  contractArray, contractBoolean, contractIdentifier, contractInteger, contractRecord,
  GameplayContractError, parseGameplayCardDefinition,
} from './validation';

interface ParticipantSummary {
  readonly life: number;
  readonly ownTurn: number;
  readonly energyCurrent: number;
  readonly energyMaximum: number;
  readonly fatigue: number;
  readonly handIds: ReadonlySet<string>;
  readonly ownedIds: ReadonlySet<string>;
  readonly fieldCount: number;
  readonly discardCount: number;
  readonly mulliganConfirmed: boolean;
  readonly selectedIds: readonly string[];
}

interface InstanceRegistry {
  readonly ids: Set<string>;
  readonly definitions: Map<string, string>;
}

function invalid(_description: string): never {
  throw new GameplayContractError();
}

function seat(value: unknown): GameplaySeat {
  if (value !== 'p1' && value !== 'p2') invalid('Invalid gameplay seat.');
  return value;
}

function definitionSignature(definition: GameplayCardDefinition): string {
  return definition.kind === 'unit'
    ? JSON.stringify(['unit', definition.revision, definition.cost, definition.power, definition.maxLife, definition.guard])
    : JSON.stringify(['action', definition.revision, definition.cost, definition.effect.kind, definition.effect.amount]);
}

function registerInstance(
  value: unknown,
  registry: InstanceRegistry,
  ownedIds: Set<string>,
  field: boolean,
): { id: string; slot?: number } {
  const instance = contractRecord(value, field
    ? ['instanceId', 'definition', 'slot', 'life', 'readyToAttack']
    : ['instanceId', 'definition']);
  const id = contractIdentifier(instance['instanceId']);
  if (registry.ids.has(id)) invalid('A gameplay instance must occupy exactly one zone.');
  registry.ids.add(id);
  ownedIds.add(id);

  const definition = parseGameplayCardDefinition(instance['definition']);
  const signature = definitionSignature(definition);
  const existing = registry.definitions.get(definition.cardId);
  if (existing !== undefined && existing !== signature) {
    invalid('A canonical card identity must use one revision and definition in a match.');
  }
  registry.definitions.set(definition.cardId, signature);

  if (!field) return { id };
  if (definition.kind !== 'unit') invalid('Only units may occupy the field.');
  const slot = contractInteger(instance['slot'], 0, GAMEPLAY_RULES.maxUnits - 1);
  contractInteger(instance['life'], 1, definition.maxLife);
  contractBoolean(instance['readyToAttack']);
  return { id, slot };
}

function participant(value: unknown, registry: InstanceRegistry): ParticipantSummary {
  const data = contractRecord(value, [
    'life', 'ownTurn', 'energy', 'fatigue', 'deck', 'hand', 'field', 'discard', 'mulligan',
  ]);
  const life = contractInteger(data['life'], Number.MIN_SAFE_INTEGER, GAMEPLAY_RULES.leaderLife);
  const ownTurn = contractInteger(data['ownTurn'], 0);
  const fatigue = contractInteger(data['fatigue'], 0);
  const energy = contractRecord(data['energy'], ['current', 'maximum']);
  const energyMaximum = contractInteger(energy['maximum'], 0, GAMEPLAY_RULES.maxEnergy);
  const energyCurrent = contractInteger(energy['current'], 0, energyMaximum);
  const deck = contractArray(data['deck']);
  const hand = contractArray(data['hand']);
  const field = contractArray(data['field']);
  const discard = contractArray(data['discard']);
  if (hand.length > GAMEPLAY_RULES.maxHand) invalid('The gameplay hand exceeds its limit.');
  if (field.length > GAMEPLAY_RULES.maxUnits) invalid('The gameplay field exceeds its limit.');
  if (deck.length + hand.length + field.length + discard.length !== GAMEPLAY_RULES.deckSize) {
    invalid('A participant must conserve all gameplay instances between zones.');
  }

  const ownedIds = new Set<string>();
  const handIds = new Set<string>();
  const slots = new Set<number>();
  for (const item of deck) registerInstance(item, registry, ownedIds, false);
  for (const item of hand) handIds.add(registerInstance(item, registry, ownedIds, false).id);
  for (const item of discard) registerInstance(item, registry, ownedIds, false);
  for (const item of field) {
    const registered = registerInstance(item, registry, ownedIds, true);
    if (registered.slot === undefined || slots.has(registered.slot)) invalid('Field slots must be unique.');
    slots.add(registered.slot);
  }

  const mulligan = contractRecord(data['mulligan'], ['confirmed', 'selectedInstanceIds']);
  const mulliganConfirmed = contractBoolean(mulligan['confirmed']);
  const selectedIds = contractArray(mulligan['selectedInstanceIds']).map(contractIdentifier);
  if (selectedIds.length > GAMEPLAY_RULES.initialHand || new Set(selectedIds).size !== selectedIds.length) {
    invalid('Mulligan selections must be unique and fit the initial hand.');
  }
  if (!mulliganConfirmed && selectedIds.length !== 0) invalid('A pending mulligan has no confirmed selections.');
  if (selectedIds.some(id => !ownedIds.has(id))) invalid('Mulligan selections must belong to their participant.');

  return {
    life, ownTurn, energyCurrent, energyMaximum, fatigue, handIds, ownedIds,
    fieldCount: field.length, discardCount: discard.length, mulliganConfirmed, selectedIds,
  };
}

function openingParticipant(summary: ParticipantSummary): void {
  if (summary.life !== GAMEPLAY_RULES.leaderLife || summary.ownTurn !== 0 || summary.energyCurrent !== 0 ||
      summary.energyMaximum !== 0 || summary.fatigue !== 0 || summary.handIds.size !== GAMEPLAY_RULES.initialHand ||
      summary.fieldCount !== 0 || summary.discardCount !== 0) {
    invalid('An initial mulligan checkpoint must preserve the opening layout.');
  }
  if (summary.selectedIds.some(id => !summary.handIds.has(id))) {
    invalid('Initial mulligan selections must still be in the participant hand.');
  }
}

function randomState(value: unknown): void {
  const random = contractRecord(value, ['algorithmId', 'algorithmVersion', 'seed', 'state', 'draws']);
  contractIdentifier(random['algorithmId']);
  contractInteger(random['algorithmVersion'], 1);
  if (typeof random['seed'] !== 'string' || random['seed'].trim().length === 0) {
    invalid('A private random seed must be a nonempty string.');
  }
  for (const item of contractArray(random['state'])) contractInteger(item, Number.MIN_SAFE_INTEGER);
  contractInteger(random['draws'], 0);
}

/** Validates stable snapshot structure and invariants; never resolves a gameplay action. */
export function assertGameplayMatchState(value: unknown): asserts value is GameplayMatchState {
  const match = contractRecord(value, [
    'rulesVersion', 'contentVersion', 'matchId', 'revision', 'participants', 'random', 'phase', 'activeSeat', 'result',
  ]);
  if (match['rulesVersion'] !== GAMEPLAY_RULES_VERSION) invalid('Unsupported gameplay rules version.');
  contractIdentifier(match['contentVersion']);
  contractIdentifier(match['matchId']);
  contractInteger(match['revision'], 0);
  randomState(match['random']);
  const players = contractRecord(match['participants'], [...GAMEPLAY_SEATS]);
  const registry: InstanceRegistry = { ids: new Set(), definitions: new Map() };
  const participants: Record<GameplaySeat, ParticipantSummary> = {
    p1: participant(players['p1'], registry), p2: participant(players['p2'], registry),
  };
  const bothConfirmed = participants.p1.mulliganConfirmed && participants.p2.mulliganConfirmed;

  if (match['phase'] === 'mulligan') {
    if (match['activeSeat'] !== null || match['result'] !== null) invalid('Mulligan has no active seat or result.');
    openingParticipant(participants.p1);
    openingParticipant(participants.p2);
    return;
  }

  if (match['phase'] === 'finished') {
    if (match['activeSeat'] !== null) invalid('A finished match has no active seat.');
    const result = contractRecord(match['result'], ['kind', 'reason'], ['winner']);
    if (result['kind'] === 'victory') {
      const winner = seat(result['winner']);
      const loser = winner === 'p1' ? 'p2' : 'p1';
      if (result['reason'] === 'life') {
        if (participants[winner].life <= 0 || participants[loser].life > 0) invalid('Life victory must match leader lives.');
      } else if (result['reason'] === 'concession') {
        if (participants.p1.life <= 0 || participants.p2.life <= 0) invalid('Concession must precede a life result.');
        if (!bothConfirmed) {
          openingParticipant(participants.p1);
          openingParticipant(participants.p2);
          return;
        }
      } else invalid('Unsupported gameplay victory reason.');
    } else if (result['kind'] === 'draw') {
      if ('winner' in result || result['reason'] !== 'simultaneous-life' ||
          participants.p1.life > 0 || participants.p2.life > 0) invalid('A life draw requires both leaders defeated.');
    } else invalid('Unsupported gameplay result.');
    if (!bothConfirmed) invalid('Started matches require both mulligan confirmations.');
    return;
  }

  if (match['phase'] !== 'preparation' && match['phase'] !== 'draw' && match['phase'] !== 'main' && match['phase'] !== 'end') {
    invalid('Unsupported gameplay phase.');
  }
  seat(match['activeSeat']);
  if (match['result'] !== null || participants.p1.life <= 0 || participants.p2.life <= 0) {
    invalid('An ongoing match must have living leaders and no result.');
  }
  if (!bothConfirmed) invalid('Started matches require both mulligan confirmations.');
}
