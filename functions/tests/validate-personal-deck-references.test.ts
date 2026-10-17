import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameplayDeckCatalog, GameplayDeckEntry, GameplayDeckList, PersonalDeckDraft } from '../src/gameplay';
import {
  GameplayContractError, GameplayDeckValidationError, parsePersonalDeckDraft,
  validateGameplayDeck, validateGameplayDeckAgainstActiveCatalog,
} from '../src/gameplay';
import { PersonalDeckContentError, PersonalDeckDomainError } from '../src/decks/personal-deck-errors';
import { validatePersonalDeckDraftReferences } from '../src/decks/validate-personal-deck-references';

const historicalVersion = 'historical-v1';

function entry(cardId = 'card-a', revision = 3, quantity = 1): GameplayDeckEntry {
  return { cardId, revision, quantity };
}

function draft(entries: readonly GameplayDeckEntry[] = [entry()]): PersonalDeckDraft {
  return { name: 'Meu deck', rulesVersion: '0.1', contentVersion: historicalVersion, entries };
}

function catalog(
  entries: readonly GameplayDeckEntry[] = [entry()],
  eligible = true,
  contentVersion = historicalVersion,
): GameplayDeckCatalog {
  return {
    rulesVersion: '0.1', contentVersion,
    cards: entries.map(({ cardId, revision }) => ({
      definition: { kind: 'unit', cardId, revision, cost: 1, power: 2, maxLife: 3, guard: false },
      eligible,
    })),
  };
}

function fullEntries(): GameplayDeckEntry[] {
  return Array.from({ length: 12 }, (_, index) => entry(`card-${index}`, index + 1, 2));
}

function composition(value: PersonalDeckDraft): GameplayDeckList {
  return { rulesVersion: value.rulesVersion, contentVersion: value.contentVersion, entries: value.entries };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function contentFailure(reason: PersonalDeckContentError['reason']): (failure: unknown) => boolean {
  return failure => failure instanceof PersonalDeckContentError &&
    failure instanceof PersonalDeckDomainError && failure.code === 'personal-deck-content' && failure.reason === reason;
}

function deckFailure(reason: GameplayDeckValidationError['reason']): (failure: unknown) => boolean {
  return failure => failure instanceof GameplayDeckValidationError && failure.reason === reason;
}

test('historical references accept an empty draft and an empty matching catalog', () => {
  assert.deepEqual(validatePersonalDeckDraftReferences(draft([]), catalog([])), draft([]));
});

test('historical references accept a partial draft', () => {
  assert.deepEqual(validatePersonalDeckDraftReferences(draft(), catalog()), draft());
});

test('historical references accept a full 24-card draft', () => {
  const value = draft(fullEntries());
  assert.deepEqual(validatePersonalDeckDraftReferences(value, catalog(value.entries)), parsePersonalDeckDraft(value));
});

test('all different identities and pinned revisions must be recognized', () => {
  const value = draft([entry('card-z', 11, 2), entry('card-a', 3), entry('card-b', 7)]);
  assert.deepEqual(validatePersonalDeckDraftReferences(value, catalog(value.entries)), parsePersonalDeckDraft(value));
});

test('an unknown identity is a content error, without substituting a similar known identity', () => {
  const value = freezeDeep(draft([entry('card-a-missing', 3, 2)]));
  assert.throws(() => validatePersonalDeckDraftReferences(value, catalog()), contentFailure('unknown-card'));
  assert.deepEqual(value.entries, [entry('card-a-missing', 3, 2)]);
});

test('a different canonical revision is a content error and is never migrated', () => {
  const value = freezeDeep(draft([entry('card-a', 2, 2)]));
  assert.throws(() => validatePersonalDeckDraftReferences(value, catalog()), contentFailure('revision'));
  assert.deepEqual(value.entries, [entry('card-a', 2, 2)]);
});

test('additional catalog cards do not add or change draft entries', () => {
  const value = draft([entry('card-a', 3, 2)]);
  const result = validatePersonalDeckDraftReferences(value, catalog([entry('card-z', 99), entry()]));
  assert.deepEqual(result, value);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]!.quantity, 2);
});

test('an explicitly ineligible canonical card is still historically recognized', () => {
  assert.deepEqual(validatePersonalDeckDraftReferences(draft(), catalog([entry()], false)), draft());
});

test('recognition needs neither ownership nor editorial publication, preview or assets', () => {
  const value = draft();
  const trusted = catalog();
  assert.deepEqual(Object.keys(value).sort(), ['contentVersion', 'entries', 'name', 'rulesVersion']);
  assert.deepEqual(Object.keys(trusted.cards[0]!).sort(), ['definition', 'eligible']);
  assert.deepEqual(validatePersonalDeckDraftReferences(value, trusted), value);
});

test('historical contentVersion must match even if every reference exists unchanged', () => {
  const value = freezeDeep(draft());
  assert.throws(
    () => validatePersonalDeckDraftReferences(value, catalog([entry()], true, 'active-v2')),
    contentFailure('content-version'),
  );
  assert.equal(value.contentVersion, historicalVersion);
});

test('an empty draft still requires the exact historical contentVersion', () => {
  assert.throws(
    () => validatePersonalDeckDraftReferences(draft([]), catalog([], true, 'active-v2')),
    contentFailure('content-version'),
  );
});

test('an incompatible draft rulesVersion remains a structural contract error', () => {
  assert.throws(() => validatePersonalDeckDraftReferences({ ...draft(), rulesVersion: '0.2' }, catalog()), GameplayContractError);
});

test('an incompatible trusted catalog rulesVersion is a structural contract error', () => {
  const incompatible = { ...catalog(), rulesVersion: '0.2' } as unknown as GameplayDeckCatalog;
  assert.throws(() => validatePersonalDeckDraftReferences(draft(), incompatible), GameplayContractError);
});

test('a successful check preserves exact identity, revision, quantity and historical version', () => {
  const value = draft([entry('old-card', 37, 2), entry('another-card', 4)]);
  const result = validatePersonalDeckDraftReferences(value, catalog(value.entries));
  assert.deepEqual(result, parsePersonalDeckDraft(value));
  assert.deepEqual(result.entries.find(item => item.cardId === 'old-card'), entry('old-card', 37, 2));
  assert.equal(result.contentVersion, historicalVersion);
});

test('deeply frozen draft and catalog remain unchanged on success', () => {
  const value = freezeDeep({ ...draft([entry('card-z', 8), entry()]), name: '  Meu deck  ' });
  const trusted = freezeDeep(catalog(value.entries));
  const beforeValue = JSON.stringify(value);
  const beforeCatalog = JSON.stringify(trusted);
  const result = validatePersonalDeckDraftReferences(value, trusted);
  assert.equal(result.name, 'Meu deck');
  assert.equal(JSON.stringify(value), beforeValue);
  assert.equal(JSON.stringify(trusted), beforeCatalog);
});

test('returned draft and nested entries are detached from both inputs and later calls', () => {
  const rawEntry = { cardId: 'card-a', revision: 3, quantity: 1 };
  const value = { name: 'Meu deck', rulesVersion: '0.1', contentVersion: historicalVersion, entries: [rawEntry] };
  const trusted = catalog();
  const first = validatePersonalDeckDraftReferences(value, trusted);
  const second = validatePersonalDeckDraftReferences(value, trusted);
  assert.notStrictEqual(first, value);
  assert.notStrictEqual(first.entries, value.entries);
  assert.notStrictEqual(first.entries[0], rawEntry);
  assert.notStrictEqual(first.entries[0], trusted.cards[0]!.definition);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.entries[0], second.entries[0]);
  rawEntry.revision = 999;
  value.name = 'Mudou';
  assert.equal(first.name, 'Meu deck');
  assert.equal(first.entries[0]!.revision, 3);
});

test('duplicate normalization, ordering and name normalization are delegated to the existing draft parser', () => {
  const value = { ...draft([entry('card-z', 8), entry(), entry()]), name: '  Meu deck  ' };
  const result = validatePersonalDeckDraftReferences(value, catalog([entry(), entry('card-z', 8)]));
  assert.deepEqual(result, parsePersonalDeckDraft(value));
  assert.deepEqual(result.entries, [entry('card-a', 3, 2), entry('card-z', 8)]);
});

test('malformed draft intent keeps GameplayContractError rather than a content error', () => {
  for (const value of [null, { ...draft(), name: '' }, draft([entry('card-a', 3, 3)]), draft([entry(), entry('card-a', 4)])]) {
    assert.throws(() => validatePersonalDeckDraftReferences(value, catalog()), GameplayContractError);
  }
});

test('draft structure is parsed before inspecting the supplied catalog', () => {
  let catalogReads = 0;
  const trusted = new Proxy(catalog(), {
    ownKeys() { catalogReads++; throw new Error('Catalog must not be inspected yet'); },
  });
  assert.throws(() => validatePersonalDeckDraftReferences({ ...draft(), name: '' }, trusted), GameplayContractError);
  assert.equal(catalogReads, 0);
});

test('content error exposes only a stable reason and generic domain metadata', () => {
  const value = draft([entry('secret-identity-987', 654321)]);
  try {
    validatePersonalDeckDraftReferences(value, catalog());
    assert.fail('Expected content failure');
  } catch (failure) {
    assert.ok(failure instanceof PersonalDeckContentError);
    assert.ok(failure instanceof PersonalDeckDomainError);
    assert.equal(failure.code, 'personal-deck-content');
    assert.equal(failure.reason, 'unknown-card');
    assert.equal(failure.name, 'PersonalDeckContentError');
    assert.deepEqual(Object.keys(failure).sort(), ['code', 'name', 'reason']);
    assert.deepEqual(Reflect.ownKeys(failure).sort(), ['code', 'message', 'name', 'reason', 'stack']);
    for (const key of ['cardId', 'revision', 'catalog', 'deck', 'uid', 'UID', 'cause']) assert.equal(Object.hasOwn(failure, key), false);
    const diagnostic = `${failure.message}\n${JSON.stringify(failure)}`;
    assert.equal(diagnostic.includes('secret-identity-987'), false);
    assert.equal(diagnostic.includes('654321'), false);
    assert.equal(diagnostic.includes(historicalVersion), false);
  }
});

test('corrupted duplicate catalog identities are never resolved as an unknown card or silently deduplicated', () => {
  const corrupt = catalog([entry(), entry('card-a', 999)]);
  assert.throws(() => validatePersonalDeckDraftReferences(draft([entry('missing-card')]), corrupt), GameplayContractError);
});

test('a malformed profile in an unused catalog card is still a contract error before reference checking', () => {
  const valid = catalog();
  const corrupt = {
    ...valid,
    cards: [...valid.cards, { definition: { ...valid.cards[0]!.definition, cardId: 'unused-card', cost: -1 }, eligible: true }],
  } as unknown as GameplayDeckCatalog;
  assert.throws(() => validatePersonalDeckDraftReferences(draft([entry('missing-card')]), corrupt), GameplayContractError);
});

test('catalog eligibility must be a boolean even though false does not block historical recognition', () => {
  const valid = catalog();
  const corrupt = { ...valid, cards: [{ ...valid.cards[0]!, eligible: 'false' }] } as unknown as GameplayDeckCatalog;
  assert.throws(() => validatePersonalDeckDraftReferences(draft(), corrupt), GameplayContractError);
});

test('malformed catalog envelopes cannot become unknown-card diagnostics', () => {
  for (const corrupt of [null, { ...catalog(), cards: undefined }, { ...catalog(), unexpected: true }]) {
    assert.throws(
      () => validatePersonalDeckDraftReferences(draft([entry('missing-card')]), corrupt as unknown as GameplayDeckCatalog),
      GameplayContractError,
    );
  }
});

test('catalog property accessors are rejected without executing the getter', () => {
  let reads = 0;
  const corrupt = { ...catalog() };
  Object.defineProperty(corrupt, 'cards', {
    enumerable: true,
    get() { reads++; throw new Error('Accessor must not execute'); },
  });
  assert.throws(() => validatePersonalDeckDraftReferences(draft(), corrupt), GameplayContractError);
  assert.equal(reads, 0);
});

test('historical recognition grants no playability or canonical gameplay profile', () => {
  const result = validatePersonalDeckDraftReferences(draft(), catalog([entry()], false));
  assert.deepEqual(Object.keys(result).sort(), ['contentVersion', 'entries', 'name', 'rulesVersion']);
  assert.equal('kind' in result, false);
  assert.equal('isValid' in result, false);
  assert.equal('isPlayable' in result, false);
  assert.equal('definition' in result.entries[0]!, false);
});

test('Deck Rules continue to require exactly 24 cards while historical drafts may be partial', () => {
  const value = draft();
  const trusted = catalog();
  validatePersonalDeckDraftReferences(value, trusted);
  assert.throws(
    () => validateGameplayDeck(composition(value), { kind: 'owned', catalog: trusted, ownership: [] }),
    deckFailure('size'),
  );
});

test('a recognized full draft with an ineligible card remains inadmissible to Deck Rules', () => {
  const value = draft(fullEntries());
  const trusted = catalog(value.entries, false);
  validatePersonalDeckDraftReferences(value, trusted);
  assert.throws(
    () => validateGameplayDeck(composition(value), {
      kind: 'owned', catalog: trusted, ownership: value.entries.map(({ cardId, quantity }) => ({ cardId, quantity })),
    }),
    deckFailure('ineligible-card'),
  );
});

test('a recognized full draft does not bypass ownership in Deck Rules', () => {
  const value = draft(fullEntries());
  const trusted = catalog(value.entries);
  validatePersonalDeckDraftReferences(value, trusted);
  assert.throws(
    () => validateGameplayDeck(composition(value), { kind: 'owned', catalog: trusted, ownership: [] }),
    deckFailure('ownership'),
  );
});

test('active compatibility still adapts provenance to active content without changing pinned references', () => {
  const value = freezeDeep(draft(fullEntries()));
  const saved = composition(value);
  const active = catalog([...value.entries, entry('new-card', 1)], true, 'active-v2');
  const context = {
    kind: 'owned' as const, catalog: active,
    ownership: value.entries.map(({ cardId, quantity }) => ({ cardId, quantity })),
  };
  assert.throws(() => validatePersonalDeckDraftReferences(value, active), contentFailure('content-version'));
  assert.throws(() => validateGameplayDeck(saved, context), deckFailure('content-version'));
  const result = validateGameplayDeckAgainstActiveCatalog(saved, context);
  assert.equal(result.contentVersion, 'active-v2');
  assert.deepEqual(result.entries.map(({ definition, quantity }) => entry(definition.cardId, definition.revision, quantity)),
    parsePersonalDeckDraft(value).entries);
  assert.equal(value.contentVersion, historicalVersion);
});

test('active compatibility still rejects changed revisions and never substitutes them', () => {
  const value = freezeDeep(draft(fullEntries()));
  const changed = value.entries.map((item, index) => index === 0 ? { ...item, revision: item.revision + 1 } : item);
  const active = catalog(changed, true, 'active-v2');
  assert.throws(
    () => validateGameplayDeckAgainstActiveCatalog(composition(value), {
      kind: 'owned', catalog: active, ownership: value.entries.map(({ cardId, quantity }) => ({ cardId, quantity })),
    }),
    deckFailure('revision'),
  );
  assert.deepEqual(value.entries, fullEntries());
});
