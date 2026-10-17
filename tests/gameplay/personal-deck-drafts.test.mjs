import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze } from './state-fixtures.mjs';

const {
  GameplayContractError, GameplayDeckValidationError, PERSONAL_DECK_LIMITS,
  parsePersonalDeckDraft, validateGameplayDeck, validateGameplayDeckAgainstActiveCatalog,
} = gameplay;

function makeDraft(total = 0) {
  return {
    name: 'Personal draft', rulesVersion: '0.1', contentVersion: 'saved-v1',
    entries: Array.from({ length: total }, (_, index) => ({ cardId: `card-${index}`, revision: 1, quantity: 1 })),
  };
}

function deckList(draft) {
  const { rulesVersion, contentVersion, entries } = draft;
  return { rulesVersion, contentVersion, entries };
}

function ownedContext(contentVersion = 'saved-v1') {
  return {
    kind: 'owned',
    catalog: {
      rulesVersion: '0.1', contentVersion,
      cards: Array.from({ length: 24 }, (_, index) => ({
        definition: { kind: 'unit', cardId: `card-${index}`, revision: 1, cost: 1, power: 2, maxLife: 3, guard: false },
        eligible: true,
      })),
    },
    ownership: Array.from({ length: 24 }, (_, index) => ({ cardId: `card-${index}`, quantity: 1 })),
  };
}

function rejectsDraft(value) {
  assert.throws(() => parsePersonalDeckDraft(value), error => {
    assert.ok(error instanceof GameplayContractError);
    assert.equal(error.code, 'invalid-gameplay-contract');
    return true;
  });
}

function rejectsAdmission(operation, reason) {
  assert.throws(operation, error => {
    assert.ok(error instanceof GameplayDeckValidationError);
    assert.equal(error.reason, reason);
    return true;
  });
}

test('an empty personal draft is valid intent without claiming battle admission', () => {
  const result = parsePersonalDeckDraft(makeDraft());
  assert.deepEqual(result, makeDraft());
  assert.deepEqual(Object.keys(result).sort(), ['contentVersion', 'entries', 'name', 'rulesVersion']);
});

test('every partial total from one through twenty-three is accepted as a draft', () => {
  for (let total = 1; total < 24; total++) {
    const result = parsePersonalDeckDraft(makeDraft(total));
    assert.equal(result.entries.reduce((sum, entry) => sum + entry.quantity, 0), total);
  }
});

test('exactly twenty-four cards are accepted without requiring a catalog', () => {
  const result = parsePersonalDeckDraft(makeDraft(24));
  assert.equal(result.entries.length, 24);
  assert.equal(result.entries.reduce((sum, entry) => sum + entry.quantity, 0), 24);
});

test('twenty-five total cards are rejected whether declared separately or with quantity two', () => {
  rejectsDraft(makeDraft(25));
  const draft = makeDraft(24);
  draft.entries[0].quantity = 2;
  rejectsDraft(draft);
});

test('a row may declare exactly one or two copies', () => {
  for (const quantity of [1, 2]) {
    const draft = makeDraft(1);
    draft.entries[0].quantity = quantity;
    assert.equal(parsePersonalDeckDraft(draft).entries[0].quantity, quantity);
  }
});

test('zero, negative, fractional, numeric-string and oversized row quantities are rejected', () => {
  for (const quantity of [0, -1, 1.5, '1', '2', 3, Number.MAX_SAFE_INTEGER, NaN, Infinity, null, undefined]) {
    const draft = makeDraft(1);
    draft.entries[0].quantity = quantity;
    rejectsDraft(draft);
  }
});

test('repeated rows for the same identity and revision aggregate into a single entry', () => {
  const draft = makeDraft(1);
  draft.entries.push({ ...draft.entries[0] });
  assert.deepEqual(parsePersonalDeckDraft(draft).entries, [{ cardId: 'card-0', revision: 1, quantity: 2 }]);
});

test('an aggregate of three copies is rejected without truncating or changing the input', () => {
  for (const quantities of [[2, 1], [1, 1, 1]]) {
    const draft = makeDraft();
    draft.entries = quantities.map(quantity => ({ cardId: 'card-a', revision: 1, quantity }));
    const before = structuredClone(draft);
    rejectsDraft(draft);
    assert.deepEqual(draft, before);
  }
});

test('conflicting revisions of one identity are rejected without selecting either revision', () => {
  for (const revisions of [[1, 2], [2, 1]]) {
    const draft = makeDraft();
    draft.entries = revisions.map(revision => ({ cardId: 'card-a', revision, quantity: 1 }));
    const before = structuredClone(draft);
    rejectsDraft(draft);
    assert.deepEqual(draft, before);
  }
});

test('normalization uses deterministic ASCII identity ordering independent of input order', () => {
  const identities = ['a', '_', 'Z', '0', 'A', '-', 'a0'];
  const draft = makeDraft();
  draft.entries = identities.map(cardId => ({ cardId, revision: 1, quantity: 1 }));
  const forward = parsePersonalDeckDraft(draft);
  draft.entries.reverse();
  const backward = parsePersonalDeckDraft(draft);
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward.entries.map(entry => entry.cardId), ['-', '0', 'A', 'Z', '_', 'a', 'a0']);
});

test('names are trimmed while preserving valid internal content and one-character names', () => {
  for (const [name, expected] of [[' X ', 'X'], ['\t Deck  A \n', 'Deck  A'], [` ${'x'.repeat(80)} `, 'x'.repeat(80)]]) {
    assert.equal(parsePersonalDeckDraft({ ...makeDraft(), name }).name, expected);
  }
});

test('empty, whitespace-only and non-string names are rejected', () => {
  for (const name of ['', ' ', '\t\r\n', '\u00a0\u3000', null, undefined, 1, ['name'], new String('name')]) {
    rejectsDraft({ ...makeDraft(), name });
  }
});

test('a name of exactly eighty UTF-16 code units is accepted', () => {
  const name = 'x'.repeat(80);
  assert.equal(parsePersonalDeckDraft({ ...makeDraft(), name }).name, name);
});

test('a name of eighty-one UTF-16 code units is rejected after trim', () => {
  rejectsDraft({ ...makeDraft(), name: 'x'.repeat(81) });
  rejectsDraft({ ...makeDraft(), name: ` ${'x'.repeat(81)} ` });
});

test('Unicode names are preserved without slugging or Unicode normalization', () => {
  for (const name of ['Guardiões da Névoa — 火', 'Carta e\u0301', '🃏'.repeat(40)]) {
    assert.equal(parsePersonalDeckDraft({ ...makeDraft(), name: ` ${name} ` }).name, name);
  }
  rejectsDraft({ ...makeDraft(), name: '🃏'.repeat(41) });
});

test('repeated names remain valid and do not imply a uniqueness check', () => {
  const first = parsePersonalDeckDraft({ ...makeDraft(1), name: 'Repeated' });
  const second = parsePersonalDeckDraft({ ...makeDraft(2), name: 'Repeated' });
  assert.equal(first.name, second.name);
  assert.notDeepEqual(first.entries, second.entries);
});

test('rulesVersion accepts only the existing supported literal', () => {
  for (const rulesVersion of ['0.2', 'v0.1', ' 0.1 ', '', 0.1, null, undefined]) {
    rejectsDraft({ ...makeDraft(), rulesVersion });
  }
  assert.equal(parsePersonalDeckDraft(makeDraft()).rulesVersion, '0.1');
});

test('contentVersion retains valid provenance identifiers and rejects malformed identifiers', () => {
  for (const contentVersion of ['previous-catalog_v1', 'x'.repeat(128)]) {
    assert.equal(parsePersonalDeckDraft({ ...makeDraft(), contentVersion }).contentVersion, contentVersion);
  }
  for (const contentVersion of ['', 'x'.repeat(129), 'catalog/v1', 'catalog v1', 'á', 1, null, undefined]) {
    rejectsDraft({ ...makeDraft(), contentVersion });
  }
});

test('cardId uses the existing identifier boundary without asserting that the identity exists', () => {
  const draft = makeDraft(1);
  draft.entries[0].cardId = 'x'.repeat(128);
  assert.equal(parsePersonalDeckDraft(draft).entries[0].cardId, draft.entries[0].cardId);
  for (const cardId of ['', 'x'.repeat(129), 'cards/id', 'not an id', 'á', 1, null, undefined]) {
    rejectsDraft({ ...draft, entries: [{ ...draft.entries[0], cardId }] });
  }
});

test('revision is a positive safe integer and is preserved without canonical lookup', () => {
  const draft = makeDraft(1);
  draft.entries[0].revision = Number.MAX_SAFE_INTEGER;
  assert.equal(parsePersonalDeckDraft(draft).entries[0].revision, Number.MAX_SAFE_INTEGER);
  for (const revision of [0, -1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined]) {
    rejectsDraft({ ...draft, entries: [{ ...draft.entries[0], revision }] });
  }
});

test('all intent fields and all reference fields are required', () => {
  for (const key of ['name', 'rulesVersion', 'contentVersion', 'entries']) {
    const draft = makeDraft();
    delete draft[key];
    rejectsDraft(draft);
  }
  for (const key of ['cardId', 'revision', 'quantity']) {
    const draft = makeDraft(1);
    delete draft.entries[0][key];
    rejectsDraft(draft);
  }
});

test('unrecognized intent fields are rejected rather than silently sanitized', () => {
  for (const key of ['notes', 'slug', 'description', 'foo']) {
    rejectsDraft({ ...makeDraft(), [key]: 'unexpected' });
  }
});

test('authority and persistence fields cannot be forged in the draft envelope', () => {
  for (const key of [
    'uid', 'ownerUid', 'deckId', 'ownership', 'eligible', 'isValid', 'isPlayable', 'kind', 'training',
    'bypassOwnership', 'definition', 'definitions', 'catalog', 'profile', 'rarity', 'image', 'canvas',
    'version', 'expectedVersion', 'createdAt', 'updatedAt', 'selectedDeck', 'matchId',
  ]) {
    rejectsDraft({ ...makeDraft(1), [key]: true });
  }
});

test('entry-level authority, card display fields and persistence fields are rejected', () => {
  for (const key of ['definition', 'eligible', 'ownership', 'ownedQuantity', 'profile', 'name', 'image', 'canvas', 'uid', 'version']) {
    const draft = makeDraft(1);
    draft.entries[0][key] = true;
    rejectsDraft(draft);
  }
});

test('malformed envelope, entry and entries containers are rejected', () => {
  for (const value of [null, undefined, [], 'draft', 1, true, new Date()]) rejectsDraft(value);
  for (const entries of [null, undefined, {}, 'entries', 1, new Set()]) rejectsDraft({ ...makeDraft(), entries });
  for (const entry of [null, undefined, [], 'card', 1, new Date()]) rejectsDraft({ ...makeDraft(), entries: [entry] });
  const inherited = Object.assign(Object.create({ inherited: true }), makeDraft());
  rejectsDraft(inherited);
});

test('accessors in envelopes, references and arrays are rejected without executing them', () => {
  for (const location of ['name', 'rulesVersion', 'contentVersion', 'entries', 'cardId', 'revision', 'quantity', 'array-entry']) {
    const draft = makeDraft(1);
    const target = location === 'array-entry' ? draft.entries :
      ['cardId', 'revision', 'quantity'].includes(location) ? draft.entries[0] : draft;
    const key = location === 'array-entry' ? '0' : location;
    const value = target[key];
    let invoked = false;
    Object.defineProperty(target, key, { enumerable: true, get() { invoked = true; return value; } });
    rejectsDraft(draft);
    assert.equal(invoked, false, location);
  }
});

test('symbols, non-enumerable fields and decorated or sparse arrays cannot bypass strict input', () => {
  for (const location of ['draft', 'entry', 'array']) {
    const draft = makeDraft(1);
    const target = location === 'draft' ? draft : location === 'entry' ? draft.entries[0] : draft.entries;
    target[Symbol('authority')] = true;
    rejectsDraft(draft);
  }
  const hidden = makeDraft();
  Object.defineProperty(hidden, 'uid', { value: 'forged', enumerable: false });
  rejectsDraft(hidden);
  const decorated = makeDraft(1);
  decorated.entries.ownership = true;
  rejectsDraft(decorated);
  const sparse = makeDraft(2);
  delete sparse.entries[0];
  rejectsDraft(sparse);
  const subclass = makeDraft();
  subclass.entries = new (class Entries extends Array {})();
  rejectsDraft(subclass);
});

test('frozen input is unchanged by aggregation, sorting and name normalization', () => {
  const draft = {
    ...makeDraft(), name: ' Frozen ', entries: [
      { cardId: 'z', revision: 2, quantity: 1 },
      { cardId: 'a', revision: 1, quantity: 1 },
      { cardId: 'z', revision: 2, quantity: 1 },
    ],
  };
  const before = structuredClone(draft);
  deepFreeze(draft);
  assert.deepEqual(parsePersonalDeckDraft(draft), {
    name: 'Frozen', rulesVersion: '0.1', contentVersion: 'saved-v1', entries: [
      { cardId: 'a', revision: 1, quantity: 1 }, { cardId: 'z', revision: 2, quantity: 2 },
    ],
  });
  assert.deepEqual(draft, before);
});

test('the returned intent, array and entries are detached and later mutations cannot alias the input', () => {
  const draft = makeDraft(1);
  const before = structuredClone(draft);
  const result = parsePersonalDeckDraft(draft);
  assert.notStrictEqual(result, draft);
  assert.notStrictEqual(result.entries, draft.entries);
  assert.notStrictEqual(result.entries[0], draft.entries[0]);
  result.name = 'Changed result';
  result.entries[0].revision = 2;
  result.entries[0].quantity = 2;
  result.entries.push({ cardId: 'result-only', revision: 1, quantity: 1 });
  assert.deepEqual(draft, before);
  draft.entries[0].cardId = 'input-only';
  assert.equal(result.entries[0].cardId, 'card-0');
});

test('normalization is idempotent and a second parse returns another detached result', () => {
  const draft = makeDraft(1);
  draft.name = ' Draft ';
  draft.entries.push({ ...draft.entries[0] });
  const first = parsePersonalDeckDraft(draft);
  const second = parsePersonalDeckDraft(first);
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.entries, second.entries);
  assert.notStrictEqual(first.entries[0], second.entries[0]);
});

test('draft parsing requires no ownership, catalog, publication or eligibility and creates no such authority', () => {
  const result = parsePersonalDeckDraft({
    name: 'Unknown references', rulesVersion: '0.1', contentVersion: 'historical-unavailable-v1',
    entries: [{ cardId: 'never-published-or-owned', revision: 99, quantity: 2 }],
  });
  assert.deepEqual(result.entries, [{ cardId: 'never-published-or-owned', revision: 99, quantity: 2 }]);
  assert.deepEqual(Object.keys(result).sort(), ['contentVersion', 'entries', 'name', 'rulesVersion']);
  assert.deepEqual(Object.keys(result.entries[0]).sort(), ['cardId', 'quantity', 'revision']);
});

test('v0.1 limits are explicit and frozen without claiming per-account quota enforcement', () => {
  assert.deepEqual(PERSONAL_DECK_LIMITS, {
    maxDecks: 20, maxNameLength: 80, maxCards: 24, maxCopies: 2, maxDocumentBytes: 16 * 1024,
  });
  assert.equal(Object.isFrozen(PERSONAL_DECK_LIMITS), true);
  assert.throws(() => { PERSONAL_DECK_LIMITS.maxDecks = 21; }, TypeError);
  // Each call validates one intent; twenty-one independent calls cannot prove an account's quota.
  assert.equal(Array.from({ length: 21 }, () => parsePersonalDeckDraft(makeDraft())).length, 21);
});

test('the largest current normalized field envelope stays below sixteen KiB in real UTF-8 JSON', () => {
  const draft = {
    name: '\u0000'.repeat(80), rulesVersion: '0.1', contentVersion: 'v'.repeat(128),
    entries: Array.from({ length: 24 }, (_, index) => ({
      cardId: `card-${index}`.padEnd(128, 'x'), revision: Number.MAX_SAFE_INTEGER, quantity: 1,
    })),
  };
  const normalized = parsePersonalDeckDraft(draft);
  // JSON's six-byte escaped control characters are the worst name expansion per UTF-16 unit.
  assert.ok(Buffer.byteLength(JSON.stringify(normalized), 'utf8') < PERSONAL_DECK_LIMITS.maxDocumentBytes);
  assert.equal(normalized.entries.length, 24);
});

test('Deck Rules still rejects empty and partial compositions accepted by the draft parser', () => {
  for (const total of [0, 1, 23]) {
    const draft = parsePersonalDeckDraft(makeDraft(total));
    rejectsAdmission(() => validateGameplayDeck(deckList(draft), ownedContext()), 'size');
    rejectsAdmission(() => validateGameplayDeckAgainstActiveCatalog(deckList(draft), ownedContext('active-v2')), 'size');
  }
  const complete = parsePersonalDeckDraft(makeDraft(24));
  assert.equal(validateGameplayDeck(deckList(complete), ownedContext()).kind, 'owned');
});

test('the original validator retains content equality while compatibility preserves historical intent', () => {
  const draft = parsePersonalDeckDraft(makeDraft(24));
  const before = structuredClone(draft);
  const context = ownedContext('active-v2');
  rejectsAdmission(() => validateGameplayDeck(deckList(draft), context), 'content-version');
  const admitted = validateGameplayDeckAgainstActiveCatalog(deckList(draft), context);
  assert.equal(admitted.contentVersion, 'active-v2');
  assert.deepEqual(admitted.entries.map(entry => ({
    cardId: entry.definition.cardId, revision: entry.definition.revision, quantity: entry.quantity,
  })), draft.entries);
  assert.deepEqual(draft, before);
});

test('compatibility still checks trusted ownership, eligibility and exact revision after draft parsing', () => {
  const draft = deckList(parsePersonalDeckDraft(makeDraft(24)));
  for (const [reason, mutate] of [
    ['ownership', context => { context.ownership = []; }],
    ['ineligible-card', context => { context.catalog.cards[0].eligible = false; }],
    ['revision', context => { context.catalog.cards[0].definition.revision = 2; }],
    ['unknown-card', context => { context.catalog.cards.shift(); }],
  ]) {
    const context = ownedContext('active-v2');
    mutate(context);
    rejectsAdmission(() => validateGameplayDeckAgainstActiveCatalog(draft, context), reason);
  }
  const context = ownedContext('active-v2');
  assert.throws(() => validateGameplayDeckAgainstActiveCatalog(draft, {
    kind: 'training-reference', catalog: context.catalog, referenceId: 'training', referenceDeck: draft,
  }), GameplayContractError);
});
