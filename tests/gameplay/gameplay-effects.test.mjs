import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze, makeMatchFixture, makeMulliganFixture, putUnitOnField } from './state-fixtures.mjs';

const {
  GAMEPLAY_EFFECT_CATALOG, GameplayContractError, assertGameplayMatchState,
  parseGameplayEffect, validateGameplayEffectTarget, parseGameplayCardDefinition, projectGameplayParticipant,
} = gameplay;

const seats = ['p1', 'p2'];
const opposing = seat => seat === 'p1' ? 'p2' : 'p1';
const leader = seat => ({ kind: 'leader', seat });
const unit = instanceId => ({ kind: 'unit', instanceId });

function targetFixture() {
  const state = makeMatchFixture();
  for (const [index, seat] of seats.entries()) {
    const guard = putUnitOnField(state, seat, 0);
    guard.instanceId = `visible-guard-${index}`;
    guard.definition = { ...guard.definition, cardId: `guard-definition-${index}`, guard: true };
    const wounded = putUnitOnField(state, seat, 4);
    wounded.instanceId = `visible-unit-${index}`;
    wounded.life = 1;
    state.participants[seat].energy.current = 0;
  }
  assertGameplayMatchState(state);
  return state;
}

function contractRejection(operation) {
  assert.throws(operation, error => {
    assert.ok(error instanceof GameplayContractError);
    assert.equal(error.code, 'invalid-gameplay-contract');
    return true;
  });
}

test('effect catalogue contains only approved parameters and fixed targeting policies', () => {
  assert.deepEqual(GAMEPLAY_EFFECT_CATALOG, {
    damage: { amounts: [1, 3], targetPolicy: 'enemy-character' },
    heal: { amounts: [3], targetPolicy: 'ally-character' },
    draw: { amounts: [1, 2], targetPolicy: 'self-player' },
  });
  assert.ok(Object.isFrozen(GAMEPLAY_EFFECT_CATALOG));
  for (const entry of Object.values(GAMEPLAY_EFFECT_CATALOG)) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.amounts));
    assert.throws(() => entry.amounts.push(99), TypeError);
  }
  assert.throws(() => { GAMEPLAY_EFFECT_CATALOG.damage.amounts[0] = 2; }, TypeError);
  assert.throws(() => { GAMEPLAY_EFFECT_CATALOG.damage.targetPolicy = 'self-player'; }, TypeError);
  assert.throws(() => { GAMEPLAY_EFFECT_CATALOG.heal = { amounts: [1], targetPolicy: 'enemy-character' }; }, TypeError);
});

test('parses the five approved effect variants without changing frozen input', () => {
  for (const effect of [
    { kind: 'damage', amount: 1 }, { kind: 'damage', amount: 3 },
    { kind: 'heal', amount: 3 }, { kind: 'draw', amount: 1 }, { kind: 'draw', amount: 2 },
  ]) {
    const before = structuredClone(effect);
    assert.deepEqual(parseGameplayEffect(deepFreeze(effect)), before);
    assert.deepEqual(effect, before);
  }
});

test('approved action effects survive profile parsing, snapshot checks and private projection', () => {
  for (const effect of [
    { kind: 'damage', amount: 1 }, { kind: 'damage', amount: 3 },
    { kind: 'heal', amount: 3 }, { kind: 'draw', amount: 1 }, { kind: 'draw', amount: 2 },
  ]) {
    const state = makeMatchFixture();
    state.participants.p1.hand[0].definition = parseGameplayCardDefinition({
      kind: 'action', cardId: 'action-profile', revision: 1, cost: 2, effect,
    });
    assertGameplayMatchState(state);
    const view = projectGameplayParticipant(deepFreeze(state), 'p1');
    assert.deepEqual(view.self.hand[0].definition.effect, effect);
    assert.notEqual(view.self.hand[0].definition.effect, state.participants.p1.hand[0].definition.effect);
    assert.equal(JSON.stringify(view).includes(state.random.seed), false);
    assert.equal('hand' in view.opponent, false);
  }
});

test('unapproved action amounts cannot enter a canonical profile or authoritative snapshot', () => {
  for (const effect of [{ kind: 'damage', amount: 2 }, { kind: 'heal', amount: 1 }, { kind: 'draw', amount: 3 }]) {
    const definition = { kind: 'action', cardId: 'action-profile', revision: 1, cost: 2, effect };
    contractRejection(() => parseGameplayCardDefinition(definition));
    const state = makeMatchFixture();
    state.participants.p1.hand[0].definition = definition;
    contractRejection(() => assertGameplayMatchState(state));
  }
});

test('rejects unapproved, nonnumeric and nonfinite effect parameters', () => {
  for (const effect of [
    { kind: 'damage', amount: 2 }, { kind: 'damage', amount: 4 },
    { kind: 'heal', amount: 1 }, { kind: 'heal', amount: 2 }, { kind: 'heal', amount: 4 },
    { kind: 'draw', amount: 3 },
    ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined]
      .map(amount => ({ kind: 'damage', amount })),
  ]) contractRejection(() => parseGameplayEffect(effect));
});

test('effect parsing rejects scripts, triggers, mixed fields, unknown kinds and accessors', () => {
  for (const effect of [
    null, [], 'damage', {}, { kind: 'damage' },
    { kind: 'poison', amount: 1 }, { kind: 'guard', amount: 1 },
    { kind: 'damage', amount: 1, script: 'secret-script' },
    { kind: 'damage', amount: 1, trigger: 'on-death' },
    { kind: 'damage', amount: 1, duration: 2 },
    { kind: 'heal', amount: 3, targetPolicy: 'enemy-character' },
    { kind: 'draw', amount: 1, recipient: 'p2' },
    { kind: 'draw', amount: 1, effects: [{ kind: 'damage', amount: 1 }] },
    Object.create({ kind: 'damage', amount: 1 }),
  ]) contractRejection(() => parseGameplayEffect(effect));
  let invoked = false;
  const effect = { kind: 'damage' };
  Object.defineProperty(effect, 'amount', { enumerable: true, get() { invoked = true; return 1; } });
  contractRejection(() => parseGameplayEffect(effect));
  assert.equal(invoked, false);
});

test('damage targets living opposing leaders and units, ignoring all Guards', () => {
  const state = deepFreeze(targetFixture());
  for (const actor of seats) {
    const enemy = opposing(actor);
    const enemyUnits = state.participants[enemy].field;
    for (const amount of [1, 3]) {
      const effect = deepFreeze({ kind: 'damage', amount });
      assert.deepEqual(validateGameplayEffectTarget(state, actor, effect, deepFreeze(leader(enemy))), leader(enemy));
      for (const defender of enemyUnits) {
        assert.deepEqual(validateGameplayEffectTarget(state, actor, effect, deepFreeze(unit(defender.instanceId))), {
          kind: 'unit', seat: enemy, instanceId: defender.instanceId,
        });
      }
      contractRejection(() => validateGameplayEffectTarget(state, actor, effect, leader(actor)));
      for (const ally of state.participants[actor].field) {
        contractRejection(() => validateGameplayEffectTarget(state, actor, effect, unit(ally.instanceId)));
      }
    }
  }
});

test('healing accepts only living allies, including full-life leaders and Guard units', () => {
  const state = deepFreeze(targetFixture());
  const effect = deepFreeze({ kind: 'heal', amount: 3 });
  for (const actor of seats) {
    assert.deepEqual(validateGameplayEffectTarget(state, actor, effect, deepFreeze(leader(actor))), leader(actor));
    for (const ally of state.participants[actor].field) {
      assert.deepEqual(validateGameplayEffectTarget(state, actor, effect, deepFreeze(unit(ally.instanceId))), {
        kind: 'unit', seat: actor, instanceId: ally.instanceId,
      });
    }
    const enemy = opposing(actor);
    contractRejection(() => validateGameplayEffectTarget(state, actor, effect, leader(enemy)));
    for (const defender of state.participants[enemy].field) {
      contractRejection(() => validateGameplayEffectTarget(state, actor, effect, unit(defender.instanceId)));
    }
  }
});

test('draw always selects the actor and rejects every defined manual target', () => {
  const state = deepFreeze(targetFixture());
  for (const actor of seats) {
    for (const amount of [1, 2]) {
      const effect = deepFreeze({ kind: 'draw', amount });
      assert.deepEqual(validateGameplayEffectTarget(state, actor, effect), { kind: 'player', seat: actor });
      for (const target of [null, leader(actor), leader(opposing(actor)),
        unit(state.participants[actor].field[0].instanceId), {}, 'p2', { kind: 'player', seat: actor }]) {
        contractRejection(() => validateGameplayEffectTarget(state, actor, effect, target));
      }
    }
  }
});

test('character targets reject missing targets, wrong shapes, extra data and hidden or discarded instances', () => {
  const state = targetFixture();
  for (const player of Object.values(state.participants)) player.discard.push(player.hand.pop());
  assertGameplayMatchState(state);
  deepFreeze(state);
  for (const actor of seats) {
    for (const effect of [{ kind: 'damage', amount: 1 }, { kind: 'heal', amount: 3 }]) {
      const eligibleSeat = effect.kind === 'damage' ? opposing(actor) : actor;
      const player = state.participants[eligibleSeat];
      for (const target of [
        undefined, null, {}, { kind: 'player', seat: eligibleSeat },
        { kind: 'leader', seat: 'p3' }, { kind: 'unit', slot: 0 },
        { kind: 'unit', instanceId: player.field[0].instanceId, slot: 0 },
        { kind: 'leader', seat: eligibleSeat, damage: 20 },
        unit(player.hand[0].instanceId), unit(player.deck[0].instanceId), unit(player.discard[0].instanceId),
        unit('another-match-unit'),
      ]) contractRejection(() => validateGameplayEffectTarget(state, actor, effect, target));
    }
  }
});

test('defeated leaders are not damage or healing targets in valid terminal snapshots', () => {
  for (const defeated of seats) {
    const state = makeMatchFixture();
    state.participants[defeated].life = 0;
    state.phase = 'finished'; state.activeSeat = null;
    state.result = { kind: 'victory', winner: opposing(defeated), reason: 'life' };
    assertGameplayMatchState(state);
    deepFreeze(state);
    contractRejection(() => validateGameplayEffectTarget(state, opposing(defeated), { kind: 'damage', amount: 1 }, leader(defeated)));
    contractRejection(() => validateGameplayEffectTarget(state, defeated, { kind: 'heal', amount: 3 }, leader(defeated)));
  }
});

test('target validation rechecks runtime effects and rejects invalid actor seats with safe errors', () => {
  const state = deepFreeze(targetFixture());
  for (const effect of [{ kind: 'heal', amount: 1 }, { kind: 'damage', amount: 2 },
    { kind: 'draw', amount: 1, script: 'hidden-secret' }]) {
    contractRejection(() => validateGameplayEffectTarget(state, 'p1', effect, leader('p2')));
  }
  for (const actor of ['p3', 'account-uid', null, undefined]) {
    contractRejection(() => validateGameplayEffectTarget(state, actor, { kind: 'draw', amount: 1 }));
  }
  assert.throws(() => validateGameplayEffectTarget(state, 'p1', { kind: 'draw', amount: 1 }, unit('hidden-secret')), error => {
    assert.ok(error instanceof GameplayContractError);
    assert.equal(error.message.includes('hidden-secret'), false);
    assert.equal(error.message.includes(state.random.seed), false);
    return true;
  });
});

test('target validation does not authorize phases, active turns, payment or terminal actions', () => {
  const state = targetFixture();
  for (const phase of ['mulligan', 'finished']) {
    const checkpoint = phase === 'mulligan' ? makeMulliganFixture() : structuredClone(state);
    if (phase === 'finished') {
      checkpoint.phase = 'finished'; checkpoint.activeSeat = null;
      checkpoint.result = { kind: 'victory', winner: 'p1', reason: 'concession' };
    }
    assertGameplayMatchState(checkpoint);
    const before = structuredClone(checkpoint);
    deepFreeze(checkpoint);
    for (const actor of seats) {
      assert.deepEqual(validateGameplayEffectTarget(checkpoint, actor, { kind: 'damage', amount: 3 }, leader(opposing(actor))), leader(opposing(actor)));
      assert.deepEqual(validateGameplayEffectTarget(checkpoint, actor, { kind: 'draw', amount: 1 }), { kind: 'player', seat: actor });
    }
    assert.deepEqual(checkpoint, before);
  }
});

test('checking draw with full hand and empty deck does not burn cards, apply fatigue or finish the match', () => {
  for (const actor of seats) {
    const state = makeMatchFixture();
    const player = state.participants[actor];
    player.hand.push(...player.deck.splice(0, 4));
    player.discard.push(...player.deck.splice(0));
    player.life = 1; player.fatigue = 5; player.energy.current = 0;
    assertGameplayMatchState(state);
    const before = structuredClone(state);
    deepFreeze(state);
    assert.deepEqual(validateGameplayEffectTarget(state, actor, deepFreeze({ kind: 'draw', amount: 2 })), { kind: 'player', seat: actor });
    assert.deepEqual(state, before);
  }
});

test('frozen snapshots remain identical after successful and rejected effect target checks', () => {
  const state = targetFixture();
  const before = structuredClone(state);
  deepFreeze(state);
  for (const actor of seats) {
    validateGameplayEffectTarget(state, actor, deepFreeze({ kind: 'damage', amount: 3 }), deepFreeze(leader(opposing(actor))));
    validateGameplayEffectTarget(state, actor, deepFreeze({ kind: 'heal', amount: 3 }), deepFreeze(unit(state.participants[actor].field[1].instanceId)));
    contractRejection(() => validateGameplayEffectTarget(state, actor, deepFreeze({ kind: 'heal', amount: 3 }), deepFreeze(leader(opposing(actor)))));
  }
  assert.deepEqual(state, before);
});
