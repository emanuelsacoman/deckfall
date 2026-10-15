function definition(index) {
  return { kind: 'unit', cardId: `unit-${Math.floor(index / 2)}`, revision: 1, cost: 1, power: 2, maxLife: 3, guard: false };
}

function participant(seat) {
  const cards = Array.from({ length: 24 }, (_, index) => ({ instanceId: `${seat}-card-${index}`, definition: definition(index) }));
  return {
    life: 20,
    ownTurn: seat === 'p1' ? 1 : 0,
    energy: { current: seat === 'p1' ? 1 : 0, maximum: seat === 'p1' ? 1 : 0 },
    fatigue: 0,
    deck: cards.slice(4),
    hand: cards.slice(0, 4),
    field: [],
    discard: [],
    mulligan: { confirmed: true, selectedInstanceIds: [] },
  };
}

/** Structurally valid main-phase snapshot; no battle transitions or deck validator are used. */
export function makeMatchFixture() {
  return {
    rulesVersion: '0.1',
    contentVersion: 'reference-v1',
    matchId: 'match-fixture',
    revision: 2,
    participants: { p1: participant('p1'), p2: participant('p2') },
    random: { algorithmId: 'opaque-test', algorithmVersion: 1, seed: 'private-seed', state: [-17, 0, 4294967295], draws: 48 },
    phase: 'main',
    activeSeat: 'p1',
    result: null,
  };
}

export function makeMulliganFixture() {
  const match = makeMatchFixture();
  match.phase = 'mulligan';
  match.activeSeat = null;
  for (const participant of Object.values(match.participants)) {
    participant.ownTurn = 0;
    participant.energy = { current: 0, maximum: 0 };
    participant.mulligan = { confirmed: false, selectedInstanceIds: [] };
  }
  return match;
}

export function putUnitOnField(match, seat = 'p1', slot = 0) {
  const participant = match.participants[seat];
  const card = participant.hand.shift();
  if (!card) throw new Error('Fixture has no hand card to place on the field.');
  const unit = { ...card, slot, life: card.definition.maxLife, readyToAttack: false };
  participant.field.push(unit);
  return unit;
}

export function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}
