import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze } from './state-fixtures.mjs';

const {
  GameplayContractError, GameplayDeckValidationError,
  validateGameplayDeck, validateGameplayDeckAgainstActiveCatalog,
} = gameplay;

function makeDeck() {
  return {
    rulesVersion: '0.1', contentVersion: 'compatibility-v1',
    entries: Array.from({ length: 12 }, (_, index) => ({ cardId: `card-${index}`, revision: 1, quantity: 2 })),
  };
}

function makeCatalog(contentVersion = 'compatibility-v2', length = 12) {
  return {
    rulesVersion: '0.1', contentVersion,
    cards: Array.from({ length }, (_, index) => ({
      definition: { kind: 'unit', cardId: `card-${index}`, revision: 1, cost: 1, power: 2, maxLife: 3, guard: false },
      eligible: true,
    })),
  };
}

function ownedContext(catalog = makeCatalog()) {
  return {
    kind: 'owned', catalog,
    ownership: Array.from({ length: 16 }, (_, index) => ({ cardId: `card-${index}`, quantity: 2 })),
  };
}

function composition(validated) {
  return validated.entries.map(entry => ({
    cardId: entry.definition.cardId, revision: entry.definition.revision, quantity: entry.quantity,
  })).sort((a, b) => a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0);
}

function sortedEntries(deck) {
  return [...deck.entries].sort((a, b) => a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0);
}

function businessRejection(operation, reason) {
  assert.throws(operation, error => {
    assert.ok(error instanceof GameplayDeckValidationError);
    assert.equal(error.code, 'invalid-gameplay-deck');
    assert.equal(error.reason, reason);
    return true;
  });
}

test('admits v1 against additive v2 without adding cards or changing saved references', () => {
  const deck = makeDeck();
  const context = ownedContext(makeCatalog('compatibility-v2', 16));
  const validated = validateGameplayDeckAgainstActiveCatalog(deck, context);
  assert.equal(validated.kind, 'owned');
  assert.equal(validated.contentVersion, 'compatibility-v2');
  assert.deepEqual(composition(validated), sortedEntries(deck));
  assert.equal(deck.contentVersion, 'compatibility-v1');
  assert.equal(validated.entries.some(entry => entry.definition.cardId === 'card-12'), false);
});

test('admits a contentVersion change when every used identity and revision stays accepted', () => {
  const deck = makeDeck();
  const context = ownedContext();
  assert.notEqual(deck.contentVersion, context.catalog.contentVersion);
  const result = validateGameplayDeckAgainstActiveCatalog(deck, context);
  assert.equal(result.rulesVersion, deck.rulesVersion);
  assert.equal(result.contentVersion, context.catalog.contentVersion);
  assert.deepEqual(composition(result), sortedEntries(deck));
});

test('rejects a used identity removed from the active catalog without silently removing it', () => {
  const deck = makeDeck();
  const context = ownedContext();
  context.catalog.cards.shift();
  const before = structuredClone(deck);
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, context), 'unknown-card');
  assert.deepEqual(deck, before);
});

test('rejects a different active revision of the same identity without upgrading the saved revision', () => {
  const deck = makeDeck();
  const context = ownedContext();
  deck.entries[0].revision = 2;
  context.catalog.cards[0].definition.revision = 3;
  const before = structuredClone({ deck, context });
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, context), 'revision');
  assert.deepEqual({ deck, context }, before);
});

test('rejects an existing used identity and revision when it becomes ineligible', () => {
  const context = ownedContext();
  context.catalog.cards[0].eligible = false;
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(makeDeck(), context), 'ineligible-card');
});

test('changes, removals and eligibility of unused catalog cards do not affect admission', () => {
  const deck = makeDeck();
  const context = ownedContext(makeCatalog('compatibility-v2', 16));
  const expected = validateGameplayDeckAgainstActiveCatalog(deck, context);
  context.catalog.cards[12].definition = {
    kind: 'action', cardId: 'card-12', revision: 7, cost: 5, effect: { kind: 'draw', amount: 1 },
  };
  context.catalog.cards[13].eligible = false;
  context.catalog.cards.splice(14, 2);
  assert.deepEqual(validateGameplayDeckAgainstActiveCatalog(deck, context), expected);
});

test('ownership remains enforced by Deck Rules for absent or insufficient quantities', () => {
  for (const quantity of [0, 1]) {
    const context = ownedContext();
    context.ownership[0].quantity = quantity;
    businessRejection(() => validateGameplayDeckAgainstActiveCatalog(makeDeck(), context), 'ownership');
  }
  const absent = ownedContext();
  absent.ownership.shift();
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(makeDeck(), absent), 'ownership');
});

test('more than two copies remains invalid even when total size and ownership allow it', () => {
  const deck = makeDeck();
  deck.entries[0].quantity = 3;
  deck.entries[1].quantity = 1;
  const context = ownedContext();
  context.ownership[0].quantity = 3;
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, context), 'copies');
});

test('incomplete, oversized and empty decks remain invalid for admission', () => {
  const short = makeDeck(); short.entries[0].quantity = 1;
  const long = makeDeck(); long.entries.push({ cardId: 'card-12', revision: 1, quantity: 1 });
  const empty = { ...makeDeck(), entries: [] };
  for (const deck of [short, long, empty]) {
    businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, ownedContext()), 'size');
  }
});

test('training-reference cannot bypass personal ownership through the compatibility helper', () => {
  const deck = makeDeck();
  const context = {
    kind: 'training-reference', catalog: makeCatalog('compatibility-v1'),
    referenceId: 'trusted-reference', referenceDeck: structuredClone(deck),
  };
  assert.equal(validateGameplayDeck(deck, context).kind, 'training-reference');
  assert.throws(() => validateGameplayDeckAgainstActiveCatalog(deck, context), GameplayContractError);
});

test('rejects incompatible saved or active rulesVersion rather than overwriting it', () => {
  const foreignDeck = makeDeck(); foreignDeck.rulesVersion = '0.2';
  const foreignContext = ownedContext(); foreignContext.catalog.rulesVersion = '0.2';
  assert.throws(() => validateGameplayDeckAgainstActiveCatalog(foreignDeck, ownedContext()), GameplayContractError);
  assert.throws(() => validateGameplayDeckAgainstActiveCatalog(makeDeck(), foreignContext), GameplayContractError);
  assert.equal(foreignDeck.rulesVersion, '0.2');
});

test('frozen saved deck, entries, catalog and ownership stay unchanged and the result has no input aliases', () => {
  const deck = makeDeck();
  const context = ownedContext();
  context.catalog.cards[0].definition = {
    kind: 'action', cardId: 'card-0', revision: 1, cost: 1, effect: { kind: 'draw', amount: 1 },
  };
  const before = structuredClone({ deck, context });
  deepFreeze(deck); deepFreeze(context);
  const validated = validateGameplayDeckAgainstActiveCatalog(deck, context);
  assert.deepEqual({ deck, context }, before);
  assert.deepEqual(composition(validated), sortedEntries(deck));
  assert.notStrictEqual(validated.entries, deck.entries);
  for (const entry of validated.entries) {
    const saved = deck.entries.find(candidate => candidate.cardId === entry.definition.cardId);
    const canonical = context.catalog.cards.find(candidate => candidate.definition.cardId === entry.definition.cardId);
    assert.notStrictEqual(entry, saved);
    assert.notStrictEqual(entry, canonical);
    assert.notStrictEqual(entry.definition, canonical.definition);
  }
  const action = validated.entries.find(entry => entry.definition.kind === 'action');
  assert.notStrictEqual(action.definition.effect, context.catalog.cards[0].definition.effect);
  action.definition.effect.amount = 2;
  action.quantity = 1;
  assert.deepEqual({ deck, context }, before);
  assert.deepEqual(Object.keys(validated).sort(), ['contentVersion', 'entries', 'kind', 'rulesVersion']);
});

test('the original validator keeps strict content equality and its owned and training results', () => {
  const deck = makeDeck();
  const active = ownedContext();
  businessRejection(() => validateGameplayDeck(deck, active), 'content-version');
  const currentDeck = { ...deck, contentVersion: active.catalog.contentVersion };
  const direct = validateGameplayDeck(currentDeck, active);
  assert.deepEqual(validateGameplayDeckAgainstActiveCatalog(deck, active), direct);
  const training = {
    kind: 'training-reference', catalog: active.catalog,
    referenceId: 'trusted-reference', referenceDeck: structuredClone(currentDeck),
  };
  const reference = validateGameplayDeck(currentDeck, training);
  assert.equal(reference.kind, 'training-reference');
  assert.equal(reference.referenceId, 'trusted-reference');
  assert.deepEqual(composition(reference), composition(direct));
});

test('matching contentVersion grants no exception to composition or ownership rules', () => {
  const deck = makeDeck();
  const context = ownedContext(makeCatalog(deck.contentVersion));
  context.ownership = [];
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, context), 'ownership');
  deck.entries.pop();
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, context), 'size');
});

test('the original saved envelope must be valid before replacing only contentVersion in memory', () => {
  for (const mutate of [
    deck => { delete deck.contentVersion; },
    deck => { deck.contentVersion = ''; },
    deck => { deck.contentVersion = 2; },
    deck => { deck.contentVersion = 'invalid/content'; },
    deck => { deck.entries[0].revision = '1'; },
    deck => { deck.entries[0].quantity = 0; },
  ]) {
    const deck = makeDeck(); mutate(deck);
    assert.throws(() => validateGameplayDeckAgainstActiveCatalog(deck, ownedContext()), GameplayContractError);
  }
});

test('forged ownership, eligibility, profiles and extra metadata in saved input are rejected without sanitizing', () => {
  for (const mutate of [
    deck => { deck.ownership = [{ cardId: 'card-0', quantity: 99 }]; },
    deck => { deck.kind = 'owned'; },
    deck => { deck.uid = 'different-player'; },
    deck => { deck.entries[0].eligible = true; },
    deck => { deck.entries[0].definition = { kind: 'unit', cardId: 'card-0', revision: 1, cost: 0 }; },
    deck => { deck.entries[0].ownedQuantity = 99; },
  ]) {
    const deck = makeDeck(); mutate(deck);
    assert.throws(() => validateGameplayDeckAgainstActiveCatalog(deck, ownedContext()), GameplayContractError);
  }
});

test('malformed and mixed trusted contexts are rejected without accepting bypass flags', () => {
  for (const context of [null, undefined, [], {}, ...[
    context => { context.kind = 'admin-bypass'; },
    context => { delete context.ownership; },
    context => { context.referenceId = 'cannot-mix-training'; },
    context => { context.bypassOwnership = true; },
    context => { context.catalog.contentVersion = ''; },
    context => { context.catalog.cards[0].eligible = 'true'; },
    context => { context.catalog.cards.push(structuredClone(context.catalog.cards[0])); },
    context => { context.ownership.push({ ...context.ownership[0] }); },
  ].map(mutate => { const context = ownedContext(); mutate(context); return context; })]) {
    assert.throws(() => validateGameplayDeckAgainstActiveCatalog(makeDeck(), context), GameplayContractError);
  }
});

test('getters in saved input or trusted context are rejected without executing them', () => {
  for (const location of ['saved-version', 'saved-entry', 'context-kind', 'context-catalog', 'catalog-version', 'ownership-quantity']) {
    const deck = makeDeck();
    const context = ownedContext();
    let invoked = false;
    const [target, key, value] = {
      'saved-version': [deck, 'contentVersion', deck.contentVersion],
      'saved-entry': [deck.entries[0], 'revision', 1],
      'context-kind': [context, 'kind', 'owned'],
      'context-catalog': [context, 'catalog', context.catalog],
      'catalog-version': [context.catalog, 'contentVersion', context.catalog.contentVersion],
      'ownership-quantity': [context.ownership[0], 'quantity', 2],
    }[location];
    Object.defineProperty(target, key, { enumerable: true, get() { invoked = true; return value; } });
    assert.throws(() => validateGameplayDeckAgainstActiveCatalog(deck, context), GameplayContractError, location);
    assert.equal(invoked, false, location);
  }
});

test('normalization of repeated rows and ordering is exactly the existing Deck Rules behavior', () => {
  const deck = makeDeck();
  deck.entries = deck.entries.flatMap(entry => [{ ...entry, quantity: 1 }, { ...entry, quantity: 1 }]).reverse();
  const before = structuredClone(deck);
  const context = ownedContext();
  const expected = validateGameplayDeck({ ...deck, contentVersion: context.catalog.contentVersion }, context);
  assert.deepEqual(validateGameplayDeckAgainstActiveCatalog(deck, context), expected);
  assert.deepEqual(deck, before);
});

test('failed admission preserves frozen saved intent and trusted inputs as well', () => {
  const deck = makeDeck();
  const context = ownedContext();
  context.ownership[0].quantity = 1;
  const before = structuredClone({ deck, context });
  deepFreeze(deck); deepFreeze(context);
  businessRejection(() => validateGameplayDeckAgainstActiveCatalog(deck, context), 'ownership');
  assert.deepEqual({ deck, context }, before);
});
