import assert from 'node:assert/strict';
import { test } from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze, makeMatchFixture, makeMulliganFixture, putUnitOnField } from './state-fixtures.mjs';

const { assertGameplayMatchState, GameplayContractError } = gameplay;

function rejects(change, make = makeMatchFixture) {
  const match = make();
  change(match);
  assert.throws(() => assertGameplayMatchState(match), GameplayContractError);
}

test('validates frozen snapshots without normalizing or mutating state', () => {
  const match = deepFreeze(makeMatchFixture());
  const before = JSON.stringify(match);
  assert.equal(assertGameplayMatchState(match), undefined);
  assert.equal(JSON.stringify(match), before);
});

test('accepts partial and completed private mulligan checkpoints without resolving them', () => {
  const match = makeMulliganFixture();
  match.participants.p1.mulligan = { confirmed: true, selectedInstanceIds: [match.participants.p1.hand[0].instanceId] };
  assertGameplayMatchState(match);
  match.participants.p2.mulligan = { confirmed: true, selectedInstanceIds: match.participants.p2.hand.map(card => card.instanceId) };
  assertGameplayMatchState(deepFreeze(match));
});

test('requires exact match, participant, resource, random and instance envelopes', () => {
  for (const mutate of [
    match => { match.uid = 'unexpected'; },
    match => { delete match.random; },
    match => { match.participants.p3 = structuredClone(match.participants.p2); },
    match => { match.participants.p1.uid = 'unexpected'; },
    match => { match.participants.p1.energy.balance = 1; },
    match => { match.random.publicSeed = true; },
    match => { match.participants.p1.hand[0].ownerUid = 'unexpected'; },
  ]) rejects(mutate);
});

test('rejects unsupported versions, invalid identifiers, actors and phases', () => {
  for (const mutate of [
    match => { match.rulesVersion = '0.2'; },
    match => { match.matchId = ''; },
    match => { match.contentVersion = ''; },
    match => { match.phase = 'reaction'; },
    match => { match.activeSeat = null; },
    match => { match.activeSeat = 'other'; },
    match => { match.revision = -1; },
    match => { match.revision = Number.MAX_SAFE_INTEGER + 1; },
  ]) rejects(mutate);
});

test('validates energy, leader life, counters and opaque random state as safe integers', () => {
  for (const mutate of [
    match => { match.participants.p1.energy.current = 2; },
    match => { match.participants.p1.energy.current = -1; },
    match => { match.participants.p1.energy.maximum = 9; },
    match => { match.participants.p1.energy.maximum = 1.5; },
    match => { match.participants.p1.life = 21; },
    match => { match.participants.p1.life = NaN; },
    match => { match.participants.p1.ownTurn = -1; },
    match => { match.participants.p1.fatigue = Infinity; },
    match => { match.random.algorithmVersion = 0; },
    match => { match.random.seed = '   '; },
    match => { match.random.draws = -1; },
    match => { match.random.state = [0.5]; },
    match => { match.random.state = [Number.MIN_SAFE_INTEGER - 1]; },
  ]) rejects(mutate);
  const opaque = makeMatchFixture();
  opaque.random.state = [];
  opaque.random.seed = 'any nonempty opaque seed / + =';
  assertGameplayMatchState(opaque);
});

test('conserves exactly 24 globally unique instances per participant without validating deck composition', () => {
  rejects(match => { match.participants.p1.deck.pop(); });
  rejects(match => { match.participants.p1.deck.push(structuredClone(match.participants.p1.hand[0])); });
  rejects(match => { match.participants.p1.deck[0].instanceId = match.participants.p1.hand[0].instanceId; });
  rejects(match => { match.participants.p2.deck[0].instanceId = match.participants.p1.deck[0].instanceId; });
  const sameIdentity = makeMatchFixture();
  for (const participant of Object.values(sameIdentity.participants)) {
    for (const card of [...participant.deck, ...participant.hand]) {
      card.definition = structuredClone(sameIdentity.participants.p1.hand[0].definition);
    }
  }
  assertGameplayMatchState(sameIdentity);
});

test('requires one complete canonical profile and revision per identity across both participants', () => {
  for (const mutate of [
    match => { match.participants.p2.hand[0].definition.revision = 2; },
    match => { match.participants.p2.hand[0].definition.cost = 2; },
    match => { match.participants.p2.hand[0].definition.power = 3; },
    match => { match.participants.p2.hand[0].definition.guard = true; },
    match => { match.participants.p2.hand[0].definition.maxLife = 4; },
    match => { match.participants.p2.hand[0].definition = { kind: 'action', cardId: 'unit-0', revision: 1, cost: 1, effect: { kind: 'draw', amount: 1 } }; },
  ]) rejects(mutate);
});

test('supports hand limit and persistent unit wounds without evaluating attack legality', () => {
  const match = makeMatchFixture();
  const player = match.participants.p1;
  player.hand.push(...player.deck.splice(0, 4));
  assertGameplayMatchState(match);
  rejects(value => { value.participants.p1.hand.push(...value.participants.p1.deck.splice(0, 5)); });
  const unit = putUnitOnField(match);
  unit.life = 1;
  unit.readyToAttack = true;
  assertGameplayMatchState(match);
});

test('requires unique field slots, living units and valid field envelopes', () => {
  for (const mutate of [
    match => { putUnitOnField(match).slot = 5; },
    match => { putUnitOnField(match).slot = -1; },
    match => { putUnitOnField(match).life = 0; },
    match => { putUnitOnField(match).life = 4; },
    match => { putUnitOnField(match).readyToAttack = 1; },
    match => { putUnitOnField(match).definition = { kind: 'action', cardId: 'action-field', revision: 1, cost: 1, effect: { kind: 'draw', amount: 1 } }; },
    match => { putUnitOnField(match); putUnitOnField(match); },
  ]) rejects(mutate);
  rejects(match => {
    const player = match.participants.p1;
    player.hand.push(...player.deck.splice(0, 2));
    for (let index = 0; index < 6; index++) putUnitOnField(match, 'p1', index);
  });
  const full = makeMatchFixture();
  full.participants.p1.hand.push(full.participants.p1.deck.shift());
  for (let index = 0; index < 5; index++) putUnitOnField(full, 'p1', index);
  assertGameplayMatchState(full);
});

test('mulligan selections must be unique, bounded and owned; pending choices must be empty', () => {
  for (const mutate of [
    match => { match.participants.p1.mulligan.selectedInstanceIds = ['missing']; },
    match => { match.participants.p1.mulligan.selectedInstanceIds = [match.participants.p2.hand[0].instanceId]; },
    match => { const id = match.participants.p1.hand[0].instanceId; match.participants.p1.mulligan.selectedInstanceIds = [id, id]; },
    match => { match.participants.p1.mulligan.selectedInstanceIds = [...match.participants.p1.hand, match.participants.p1.deck[0]].map(card => card.instanceId); },
    match => { match.participants.p1.mulligan = { confirmed: false, selectedInstanceIds: [] }; },
  ]) rejects(mutate);
  rejects(match => {
    match.participants.p1.mulligan.selectedInstanceIds = [match.participants.p1.hand[0].instanceId];
  }, makeMulliganFixture);
  const match = makeMatchFixture();
  match.participants.p1.mulligan.selectedInstanceIds = [match.participants.p1.deck[0].instanceId];
  assertGameplayMatchState(match);
});

test('initial mulligan requires opening resources and selected cards still in the hand', () => {
  for (const mutate of [
    match => { match.activeSeat = 'p1'; },
    match => { match.result = { kind: 'victory', winner: 'p1', reason: 'concession' }; },
    match => { match.participants.p1.life = 19; },
    match => { match.participants.p1.ownTurn = 1; },
    match => { match.participants.p1.energy = { current: 1, maximum: 1 }; },
    match => { match.participants.p1.fatigue = 1; },
    match => { match.participants.p1.discard.push(match.participants.p1.hand.pop()); },
    match => { match.participants.p1.mulligan = { confirmed: true, selectedInstanceIds: [match.participants.p1.deck[0].instanceId] }; },
  ]) rejects(mutate, makeMulliganFixture);
});

test('finished life results match leader lives and require completed opening', () => {
  const victory = makeMatchFixture();
  victory.phase = 'finished'; victory.activeSeat = null;
  victory.participants.p2.life = -2;
  victory.result = { kind: 'victory', winner: 'p1', reason: 'life' };
  assertGameplayMatchState(victory);
  const draw = structuredClone(victory);
  draw.participants.p1.life = 0;
  draw.result = { kind: 'draw', reason: 'simultaneous-life' };
  assertGameplayMatchState(draw);
  for (const mutate of [
    match => { match.participants.p2.life = 0; },
    match => { match.result = { kind: 'victory', winner: 'p1', reason: 'life' }; },
    match => { match.phase = 'finished'; match.activeSeat = null; match.result = null; },
    match => { match.phase = 'finished'; match.activeSeat = null; match.result = { kind: 'draw', winner: 'p1', reason: 'simultaneous-life' }; },
  ]) rejects(mutate);
  victory.participants.p2.mulligan = { confirmed: false, selectedInstanceIds: [] };
  assert.throws(() => assertGameplayMatchState(victory), GameplayContractError);
  draw.participants.p1.life = 1;
  assert.throws(() => assertGameplayMatchState(draw), GameplayContractError);
});

test('permits an early concession without inventing turn, fatigue or mulligan transitions', () => {
  const match = makeMulliganFixture();
  match.phase = 'finished'; match.activeSeat = null;
  match.result = { kind: 'victory', winner: 'p2', reason: 'concession' };
  assertGameplayMatchState(match);
  match.participants.p1.ownTurn = 1;
  assert.throws(() => assertGameplayMatchState(match), GameplayContractError);
  const started = makeMatchFixture();
  started.phase = 'finished'; started.activeSeat = null;
  started.result = { kind: 'victory', winner: 'p2', reason: 'concession' };
  assertGameplayMatchState(started);
  started.participants.p1.life = 0;
  assert.throws(() => assertGameplayMatchState(started), GameplayContractError);
});
