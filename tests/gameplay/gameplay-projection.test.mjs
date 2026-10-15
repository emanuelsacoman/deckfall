import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze, makeMatchFixture, makeMulliganFixture, putUnitOnField } from './state-fixtures.mjs';

const { GameplayContractError, projectGameplayParticipant } = gameplay;

test('a participant sees own hand, public zones and counts, never ordered decks or opponent hand', () => {
  const state = makeMatchFixture();
  const ownUnit = putUnitOnField(state, 'p1', 0);
  const opposingUnit = putUnitOnField(state, 'p2', 1);
  const discarded = state.participants.p2.hand.pop();
  state.participants.p2.discard.push(discarded);
  const view = projectGameplayParticipant(state, 'p1');
  assert.equal(view.viewerSeat, 'p1');
  assert.deepEqual(view.self.hand, state.participants.p1.hand);
  assert.equal(view.self.deckCount, 20);
  assert.equal(view.opponent.handCount, 2);
  assert.deepEqual(view.self.field, [ownUnit]);
  assert.deepEqual(view.opponent.field, [opposingUnit]);
  assert.deepEqual(view.opponent.discard, [discarded]);
  assert.equal('hand' in view.opponent, false);
  assert.equal('deck' in view.self, false);
  assert.equal('deck' in view.opponent, false);
  assert.equal('participants' in view, false);
  assert.equal('random' in view, false);
});

test('switching viewer reverses private visibility without exposing either deck', () => {
  const state = makeMatchFixture();
  const p1 = projectGameplayParticipant(state, 'p1');
  const p2 = projectGameplayParticipant(state, 'p2');
  assert.deepEqual(p1.self.hand, state.participants.p1.hand);
  assert.deepEqual(p2.self.hand, state.participants.p2.hand);
  for (const view of [p1, p2]) {
    assert.equal('hand' in view.opponent, false);
    assert.equal('random' in view, false);
  }
  assert.throws(() => projectGameplayParticipant(state, 'p3'), GameplayContractError);
});

test('opponent mulligan identities stay private and quantities appear only after both confirm', () => {
  const state = makeMulliganFixture();
  state.participants.p1.mulligan = { confirmed: true, selectedInstanceIds: [state.participants.p1.hand[0].instanceId] };
  let view = projectGameplayParticipant(state, 'p1');
  assert.deepEqual(view.self.mulligan.selectedInstanceIds, state.participants.p1.mulligan.selectedInstanceIds);
  assert.equal(view.self.mulliganReplaced, null);
  assert.equal(view.opponent.mulliganReplaced, null);
  assert.equal('mulligan' in view.opponent, false);
  state.participants.p2.mulligan = { confirmed: true, selectedInstanceIds: state.participants.p2.hand.slice(0, 2).map(card => card.instanceId) };
  view = projectGameplayParticipant(state, 'p1');
  assert.equal(view.self.mulliganReplaced, 1);
  assert.equal(view.opponent.mulliganReplaced, 2);
  assert.equal('mulligan' in view.opponent, false);
  assert.equal(JSON.stringify(view).includes(state.participants.p2.hand[0].instanceId), false);
});

test('a finished match preserves hidden information, including seed and unplayed cards', () => {
  const state = makeMatchFixture();
  state.phase = 'finished';
  state.activeSeat = null;
  state.result = { kind: 'victory', winner: 'p1', reason: 'concession' };
  const serialized = JSON.stringify(projectGameplayParticipant(state, 'p1'));
  for (const hidden of [state.random.seed, state.participants.p2.hand[0].instanceId,
    state.participants.p2.deck[0].instanceId, state.participants.p1.deck[0].instanceId]) {
    assert.equal(serialized.includes(hidden), false);
  }
});

test('whitelist strips unexpected nested fields rather than spreading authoritative objects', () => {
  const state = makeMatchFixture();
  const unit = putUnitOnField(state, 'p2', 0);
  unit.privateState = 'hidden-unit-data';
  unit.definition.privateState = 'hidden-definition-data';
  state.participants.p1.hand[0].definition.extra = 'hidden-hand-metadata';
  state.participants.p2.energy.internal = 'hidden-energy-data';
  state.participants.p1.mulligan.internal = 'hidden-mulligan-data';
  state.phase = 'finished';
  state.activeSeat = null;
  state.result = { kind: 'victory', winner: 'p1', reason: 'concession', internal: 'hidden-result-data' };
  const serialized = JSON.stringify(projectGameplayParticipant(state, 'p1'));
  assert.equal(serialized.includes('hidden-'), false);
});

test('projection accepts frozen input and returns detached nested arrays and definitions', () => {
  const state = makeMatchFixture();
  putUnitOnField(state, 'p1', 0);
  const before = structuredClone(state);
  deepFreeze(state);
  const view = projectGameplayParticipant(state, 'p1');
  view.self.hand[0].definition.cost = 8;
  view.self.field[0].life = 1;
  view.self.energy.current = 0;
  view.self.mulligan.selectedInstanceIds.push('local-only');
  view.opponent.discard.push(view.self.hand[0]);
  assert.deepEqual(state, before);
});
