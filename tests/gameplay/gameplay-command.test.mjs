import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { makeMulliganFixture } from './state-fixtures.mjs';

const { GAMEPLAY_RULES, GAMEPLAY_SEATS, GameplayContractError, parseGameplayCommandRequest, parseGameplayCardDefinition } = gameplay;
const request = command => ({ matchId: 'match-1', commandId: 'command-1', expectedRevision: 0, command });
const unit = () => ({ kind: 'unit', cardId: 'unit-1', revision: 1, cost: 1, power: 0, maxLife: 2, guard: false });

test('approved rules are frozen and independent of editor defaults', () => {
  assert.deepEqual([GAMEPLAY_RULES.leaderLife, GAMEPLAY_RULES.deckSize, GAMEPLAY_RULES.maxCopies,
    GAMEPLAY_RULES.initialHand, GAMEPLAY_RULES.maxHand, GAMEPLAY_RULES.maxUnits, GAMEPLAY_RULES.maxEnergy], [20, 24, 2, 4, 8, 5, 8]);
  assert.equal(GAMEPLAY_RULES.firstPlayerSkipsFirstDraw, true);
  assert.throws(() => { GAMEPLAY_RULES.leaderLife = 99; }, TypeError);
  assert.throws(() => GAMEPLAY_SEATS.push('p3'), TypeError);
});

test('parses all intent forms without authorizing or executing them', () => {
  for (const command of [
    { type: 'play-card', instanceId: 'card-1' },
    { type: 'play-card', instanceId: 'card-1', target: { kind: 'leader', seat: 'p2' } },
    { type: 'attack', attackerInstanceId: 'unit-1', target: { kind: 'unit', instanceId: 'unit-2' } },
    { type: 'attack', attackerInstanceId: 'unit-1', target: { kind: 'leader', seat: 'p2' } },
    { type: 'end-turn' }, { type: 'concede' },
    { type: 'mulligan', instanceIds: [] }, { type: 'mulligan', instanceIds: ['a', 'b', 'c', 'd'] },
  ]) assert.deepEqual(parseGameplayCommandRequest(request(command)), request(command));
});

test('rejects client authority injected at envelope, command and target boundaries', () => {
  for (const key of ['uid', 'seat', 'damage', 'cost', 'power', 'seed', 'state', 'winner', 'result']) {
    assert.throws(() => parseGameplayCommandRequest({ ...request({ type: 'end-turn' }), [key]: 'injected' }), GameplayContractError);
    assert.throws(() => parseGameplayCommandRequest(request({ type: 'end-turn', [key]: 'injected' })), GameplayContractError);
    assert.throws(() => parseGameplayCommandRequest(request({ type: 'attack', attackerInstanceId: 'unit', target: { kind: 'leader', seat: 'p2', [key]: 'injected' } })), GameplayContractError);
  }
});

test('rejects unknown, incomplete or mixed intent and target shapes', () => {
  for (const command of [
    null, [], {}, { type: 'grant-card' }, { type: 'attack', attackerInstanceId: 'unit' },
    { type: 'play-card', instanceId: 'card', target: undefined },
    { type: 'play-card', instanceId: 'card', attackerInstanceId: 'unit' },
    { type: 'end-turn', target: { kind: 'leader', seat: 'p1' } },
    { type: 'attack', attackerInstanceId: 'unit', target: { kind: 'leader', seat: 'p3' } },
    { type: 'attack', attackerInstanceId: 'unit', target: { kind: 'unit', instanceId: 'other', seat: 'p2' } },
  ]) assert.throws(() => parseGameplayCommandRequest(request(command)), GameplayContractError);
});

test('validates safe revisions and bounded opaque identifiers', () => {
  for (const expectedRevision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null]) {
    assert.throws(() => parseGameplayCommandRequest({ ...request({ type: 'end-turn' }), expectedRevision }), GameplayContractError);
  }
  for (const matchId of ['', 'a'.repeat(129), '../other', 'other/player', 'id with space', 1]) {
    assert.throws(() => parseGameplayCommandRequest({ ...request({ type: 'end-turn' }), matchId }), GameplayContractError);
  }
  assert.equal(parseGameplayCommandRequest({ ...request({ type: 'end-turn' }), expectedRevision: Number.MAX_SAFE_INTEGER }).expectedRevision, Number.MAX_SAFE_INTEGER);
});

test('mulligan envelope rejects duplicates, excess, sparse arrays and executable getters', () => {
  for (const instanceIds of [['a', 'a'], ['a', 'b', 'c', 'd', 'e'], [1], new Array(1), 'a']) {
    assert.throws(() => parseGameplayCommandRequest(request({ type: 'mulligan', instanceIds })), GameplayContractError);
  }
  let invoked = false;
  const instanceIds = ['a'];
  Object.defineProperty(instanceIds, '0', { enumerable: true, get() { invoked = true; return 'a'; } });
  assert.throws(() => parseGameplayCommandRequest(request({ type: 'mulligan', instanceIds })), GameplayContractError);
  assert.equal(invoked, false);
});

test('named array properties cannot disguise missing mulligan indices in requests or snapshots', () => {
  for (const key of ['extra', '01']) {
    const ids = new Array(1);
    ids[key] = 'p1-card-0';
    assert.throws(() => parseGameplayCommandRequest(request({ type: 'mulligan', instanceIds: ids })), GameplayContractError);
    const snapshot = makeMulliganFixture();
    snapshot.participants.p1.mulligan = { confirmed: true, selectedInstanceIds: ids };
    assert.throws(() => gameplay.assertGameplayMatchState(snapshot), GameplayContractError);
  }
});

test('rejects non-JSON records without evaluating accessors or leaking payloads in errors', () => {
  let invoked = false;
  const input = request({ type: 'end-turn' });
  Object.defineProperty(input, 'matchId', { enumerable: true, get() { invoked = true; return 'secret'; } });
  assert.throws(() => parseGameplayCommandRequest(input), GameplayContractError);
  assert.equal(invoked, false);
  for (const invalid of [new Date(), Object.create({ command: 'inherited' }), JSON.parse('{"__proto__":{},"matchId":"m"}')]) {
    assert.throws(() => parseGameplayCommandRequest(invalid), GameplayContractError);
  }
  assert.throws(() => parseGameplayCommandRequest({ ...request({ type: 'end-turn' }), seed: 'hidden-secret' }), error => {
    assert.equal(error.message.includes('hidden-secret'), false);
    assert.equal(error.code, 'invalid-gameplay-contract');
    return true;
  });
});

test('parsing allocates independent nested command values and leaves input unchanged', () => {
  const original = request({ type: 'attack', attackerInstanceId: 'unit', target: { kind: 'leader', seat: 'p2' } });
  const before = structuredClone(original);
  const parsed = parseGameplayCommandRequest(original);
  parsed.command.target.seat = 'p1';
  assert.deepEqual(original, before);
});

test('unit definitions use only canonical battle data and accept zero power', () => {
  assert.deepEqual(parseGameplayCardDefinition(unit()), unit());
  for (const override of [{ cost: 0 }, { cost: 9 }, { power: -1 }, { maxLife: 0 }, { guard: 1 }, { revision: 0 },
    { power: 0.5 }, { maxLife: Infinity }, { speed: 3 }, { magic: 4 }, { canvas: {} }, { rarity: 'legendary' }]) {
    assert.throws(() => parseGameplayCardDefinition({ ...unit(), ...override }), GameplayContractError);
  }
});

test('action descriptors recognize the approved vocabulary without running effects', () => {
  for (const kind of ['damage', 'heal', 'draw']) {
    const definition = { kind: 'action', cardId: 'action', revision: 1, cost: 8, effect: { kind, amount: 1 } };
    assert.deepEqual(parseGameplayCardDefinition(definition), definition);
  }
  for (const effect of [{ kind: 'grant-coin', amount: 1 }, { kind: 'draw', amount: 0 },
    { kind: 'draw', amount: 1, script: 'arbitrary text' }, { kind: 'draw', amount: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parseGameplayCardDefinition({ kind: 'action', cardId: 'a', revision: 1, cost: 1, effect }), GameplayContractError);
  }
});
