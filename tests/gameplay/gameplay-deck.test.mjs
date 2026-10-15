import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze } from './state-fixtures.mjs';

const { GameplayContractError, GameplayDeckValidationError, parseGameplayDeckList, validateGameplayDeck } = gameplay;

function makeDeck() {
  return {
    rulesVersion: '0.1', contentVersion: 'deck-test-v1',
    entries: Array.from({ length: 12 }, (_, index) => ({ cardId: `card-${index}`, revision: 1, quantity: 2 })),
  };
}

function makeCatalog() {
  return {
    rulesVersion: '0.1', contentVersion: 'deck-test-v1',
    cards: Array.from({ length: 16 }, (_, index) => ({
      definition: { kind: 'unit', cardId: `card-${index}`, revision: 1, cost: 1, power: 2, maxLife: 3, guard: false },
      eligible: true,
    })),
  };
}

function ownedContext() {
  return {
    kind: 'owned', catalog: makeCatalog(),
    ownership: Array.from({ length: 16 }, (_, index) => ({ cardId: `card-${index}`, quantity: 2 })),
  };
}

function referenceContext() {
  return { kind: 'training-reference', catalog: makeCatalog(), referenceId: 'reference-default', referenceDeck: makeDeck() };
}

function composition(deck) {
  return deck.entries.map(entry => [entry.definition.cardId, entry.definition.revision, entry.quantity]);
}

function businessRejection(operation, reason) {
  assert.throws(operation, error => {
    assert.ok(error instanceof GameplayDeckValidationError);
    assert.equal(error.code, 'invalid-gameplay-deck');
    assert.equal(error.reason, reason);
    return true;
  });
}

test('validates an owned deck using trusted profiles without creating instances or changing input', () => {
  const deck = deepFreeze(makeDeck());
  const context = deepFreeze(ownedContext());
  const before = structuredClone({ deck, context });
  const validated = validateGameplayDeck(deck, context);
  assert.equal(validated.kind, 'owned');
  assert.equal(validated.rulesVersion, '0.1');
  assert.equal(validated.contentVersion, deck.contentVersion);
  assert.equal(validated.entries.reduce((total, entry) => total + entry.quantity, 0), 24);
  assert.equal('referenceId' in validated, false);
  assert.deepEqual(Object.keys(validated).sort(), ['contentVersion', 'entries', 'kind', 'rulesVersion']);
  for (const entry of validated.entries) {
    const trusted = context.catalog.cards.find(card => card.definition.cardId === entry.definition.cardId);
    assert.deepEqual(entry.definition, trusted.definition);
    assert.notStrictEqual(entry.definition, trusted.definition);
  }
  assert.deepEqual({ deck, context }, before);
});

test('shape parsing is strict, detached and independent of composition size', () => {
  const deck = makeDeck();
  deck.entries = deck.entries.slice(0, 1);
  const parsed = parseGameplayDeckList(deepFreeze(deck));
  assert.deepEqual(parsed, deck);
  assert.notStrictEqual(parsed.entries, deck.entries);
  assert.notStrictEqual(parsed.entries[0], deck.entries[0]);
  businessRejection(() => validateGameplayDeck(deck, ownedContext()), 'size');
  for (const change of [
    value => { value.rulesVersion = '0.2'; },
    value => { value.contentVersion = ''; },
    value => { value.uid = 'injected'; },
    value => { value.ownership = []; },
    value => { value.kind = 'training-reference'; },
    value => { value.entries[0].eligible = true; },
    value => { value.entries[0].cost = 0; },
    value => { value.entries[0].definition = {}; },
    value => { value.entries[0].cardId = '../other'; },
    value => { value.entries[0].revision = 0; },
  ]) {
    const invalid = makeDeck(); change(invalid);
    assert.throws(() => parseGameplayDeckList(invalid), GameplayContractError);
  }
});

test('entry quantities require positive safe integers and JSON arrays without hidden executable data', () => {
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null]) {
    const deck = makeDeck(); deck.entries[0].quantity = quantity;
    assert.throws(() => parseGameplayDeckList(deck), GameplayContractError);
  }
  for (const entries of [new Array(1), Object.assign(new Array(1), { extra: 'compensated-hole' }), {}, null]) {
    assert.throws(() => parseGameplayDeckList({ ...makeDeck(), entries }), GameplayContractError);
  }
  let invoked = false;
  const deck = makeDeck();
  Object.defineProperty(deck.entries[0], 'quantity', { enumerable: true, get() { invoked = true; return 2; } });
  assert.throws(() => parseGameplayDeckList(deck), GameplayContractError);
  assert.equal(invoked, false);
});

test('requires exactly 24 cards and rejects huge totals before unsafe addition', () => {
  const short = makeDeck(); short.entries[0].quantity = 1;
  businessRejection(() => validateGameplayDeck(short, ownedContext()), 'size');
  const long = makeDeck(); long.entries.push({ cardId: 'card-12', revision: 1, quantity: 1 });
  businessRejection(() => validateGameplayDeck(long, ownedContext()), 'size');
  const huge = makeDeck(); huge.entries[0].quantity = Number.MAX_SAFE_INTEGER;
  businessRejection(() => validateGameplayDeck(huge, ownedContext()), 'size');
  businessRejection(() => validateGameplayDeck({ ...makeDeck(), entries: [] }, ownedContext()), 'size');
});

test('aggregates repeated rows by canonical identity and produces deterministic ASCII ordering', () => {
  const split = makeDeck();
  split.entries = split.entries.flatMap(entry => [{ ...entry, quantity: 1 }, { ...entry, quantity: 1 }]).reverse();
  const actual = validateGameplayDeck(split, ownedContext());
  assert.deepEqual(composition(actual), composition(validateGameplayDeck(makeDeck(), ownedContext())));
  const ids = actual.entries.map(entry => entry.definition.cardId);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(actual.entries.length, 12);
  assert.ok(actual.entries.every(entry => entry.quantity === 2));
  const thirdCopy = makeDeck();
  thirdCopy.entries[0].quantity = 3; thirdCopy.entries[1].quantity = 1;
  businessRejection(() => validateGameplayDeck(thirdCopy, ownedContext()), 'copies');
  const splitThird = makeDeck();
  splitThird.entries[1].quantity = 1;
  splitThird.entries.push({ ...splitThird.entries[0], quantity: 1 });
  businessRejection(() => validateGameplayDeck(splitThird, ownedContext()), 'copies');
});

test('allows single copies and mixed quantities rather than requiring exactly two of every identity', () => {
  const context = ownedContext();
  const prototype = context.catalog.cards[0].definition;
  context.catalog.cards = Array.from({ length: 24 }, (_, index) => ({
    definition: { ...prototype, cardId: `singleton-${index}` }, eligible: true,
  }));
  context.ownership = context.catalog.cards.map(card => ({ cardId: card.definition.cardId, quantity: 1 }));
  const deck = { ...makeDeck(), entries: context.ownership.map(entry => ({ ...entry, revision: 1 })) };
  assert.equal(validateGameplayDeck(deck, context).entries.length, 24);

  const mixed = makeDeck();
  mixed.entries = Array.from({ length: 14 }, (_, index) => ({
    cardId: `card-${index}`, revision: 1, quantity: index < 10 ? 2 : 1,
  }));
  assert.equal(validateGameplayDeck(mixed, ownedContext()).entries.length, 14);
});

test('pins a single revision per identity and requires matching trusted content', () => {
  const wrongRevision = makeDeck(); wrongRevision.entries[0].revision = 2;
  businessRejection(() => validateGameplayDeck(wrongRevision, ownedContext()), 'revision');
  const mixed = makeDeck();
  mixed.entries[0].quantity = 1;
  mixed.entries.push({ cardId: mixed.entries[0].cardId, revision: 2, quantity: 1 });
  businessRejection(() => validateGameplayDeck(mixed, ownedContext()), 'revision');
  const wrongContent = makeDeck(); wrongContent.contentVersion = 'different-content';
  businessRejection(() => validateGameplayDeck(wrongContent, ownedContext()), 'content-version');
});

test('requires every selected canonical identity to exist and be eligible in the trusted catalogue', () => {
  for (const cardId of ['unknown-secret-card', '__proto__', 'constructor']) {
    const unknown = makeDeck(); unknown.entries[0].cardId = cardId;
    businessRejection(() => validateGameplayDeck(unknown, ownedContext()), 'unknown-card');
  }
  for (const context of [ownedContext(), referenceContext()]) {
    context.catalog.cards[0].eligible = false;
    businessRejection(() => validateGameplayDeck(makeDeck(), context), 'ineligible-card');
  }
  for (const cardId of ['__proto__', 'constructor']) {
    const deck = makeDeck(); const context = ownedContext();
    deck.entries[0].cardId = cardId;
    context.catalog.cards[0].definition.cardId = cardId;
    context.ownership[0].cardId = cardId;
    assert.equal(validateGameplayDeck(deck, context).entries.some(entry => entry.definition.cardId === cardId), true);
  }
});

test('owned context checks absolute quantities without revision-specific balances or inventory mutation', () => {
  for (const quantity of [0, 1]) {
    const context = ownedContext(); context.ownership[0].quantity = quantity;
    businessRejection(() => validateGameplayDeck(makeDeck(), context), 'ownership');
  }
  const absent = ownedContext(); absent.ownership.shift();
  businessRejection(() => validateGameplayDeck(makeDeck(), absent), 'ownership');
  const context = ownedContext();
  context.catalog.cards[0].definition.revision = 5;
  context.ownership[0].quantity = Number.MAX_SAFE_INTEGER;
  const deck = makeDeck(); deck.entries[0].revision = 5;
  const before = structuredClone(context);
  assert.equal(validateGameplayDeck(deck, deepFreeze(context)).kind, 'owned');
  assert.deepEqual(context, before);
});

test('rejects malformed trusted context, ambiguous catalogues and duplicate inventory identities', () => {
  for (const mutate of [
    context => { context.kind = 'admin-bypass'; },
    context => { context.uid = 'untrusted'; },
    context => { context.referenceId = 'cannot-mix-modes'; },
    context => { delete context.ownership; },
    context => { context.catalog.cards[0].eligible = 'true'; },
    context => { context.catalog.cards[0].definition.effect = { kind: 'draw', amount: 1 }; },
    context => { context.catalog.cards.push(structuredClone(context.catalog.cards[0])); },
    context => { context.catalog.cards.push({ ...structuredClone(context.catalog.cards[0]), definition: { ...context.catalog.cards[0].definition, revision: 2 } }); },
    context => { context.ownership.push({ ...context.ownership[0] }); },
    context => { context.ownership[0].quantity = -1; },
    context => { context.ownership[0].quantity = Number.MAX_SAFE_INTEGER + 1; },
    context => { context.ownership[0].revision = 1; },
  ]) {
    const context = ownedContext(); mutate(context);
    assert.throws(() => validateGameplayDeck(makeDeck(), context), GameplayContractError);
  }
});

test('composition adds no minimum unit/action split, rarity, faction or curve restrictions', () => {
  for (const kind of ['unit', 'action']) {
    const context = ownedContext();
    for (const card of context.catalog.cards) {
      if (kind === 'unit') card.definition = { ...card.definition, power: 0, cost: 8 };
      else card.definition = { kind: 'action', cardId: card.definition.cardId, revision: 1, cost: 8, effect: { kind: 'heal', amount: 3 } };
    }
    const result = validateGameplayDeck(makeDeck(), context);
    assert.equal(result.entries.length, 12);
    assert.ok(result.entries.every(entry => entry.definition.kind === kind));
  }
});

test('training accepts only the exact trusted reference multiset, independently of owned quantities', () => {
  const deck = makeDeck();
  deck.entries = deck.entries.flatMap(entry => [{ ...entry, quantity: 1 }, { ...entry, quantity: 1 }]).reverse();
  const context = deepFreeze(referenceContext());
  const before = structuredClone({ deck, context });
  const result = validateGameplayDeck(deepFreeze(deck), context);
  assert.equal(result.kind, 'training-reference');
  assert.equal(result.referenceId, context.referenceId);
  assert.deepEqual(composition(result), composition(validateGameplayDeck(makeDeck(), ownedContext())));
  assert.deepEqual({ deck, context }, before);
  const custom = makeDeck(); custom.entries[0].cardId = 'card-12';
  businessRejection(() => validateGameplayDeck(custom, referenceContext()), 'reference-mismatch');
  const changedReference = referenceContext();
  changedReference.referenceDeck.entries[0].cardId = 'card-12';
  businessRejection(() => validateGameplayDeck(makeDeck(), changedReference), 'reference-mismatch');
});

test('training mode does not grant a boolean bypass or excuse invalid references', () => {
  for (const context of [
    { kind: 'training-reference', catalog: makeCatalog(), referenceId: 'reference-default', bypassOwnership: true },
    { ...referenceContext(), ownership: [] },
    { ...referenceContext(), referenceId: '' },
  ]) assert.throws(() => validateGameplayDeck(makeDeck(), context), GameplayContractError);
  const badReference = referenceContext();
  badReference.referenceDeck.entries[0].quantity = 1;
  businessRejection(() => validateGameplayDeck(makeDeck(), badReference), 'size');
  const unknownReference = referenceContext();
  unknownReference.referenceDeck.entries[0].cardId = 'unknown-reference';
  businessRejection(() => validateGameplayDeck(makeDeck(), unknownReference), 'unknown-card');
});

test('rejections preserve all inputs and reveal only a safe business reason', () => {
  const deck = makeDeck(); deck.entries[0].cardId = 'hidden-secret-card';
  const context = ownedContext();
  const before = structuredClone({ deck, context });
  deepFreeze(deck); deepFreeze(context);
  assert.throws(() => validateGameplayDeck(deck, context), error => {
    assert.ok(error instanceof GameplayDeckValidationError);
    assert.equal(error.reason, 'unknown-card');
    assert.equal(error.message.includes('hidden-secret-card'), false);
    assert.equal('deck' in error, false);
    assert.equal('ownership' in error, false);
    return true;
  });
  assert.deepEqual({ deck, context }, before);
});
