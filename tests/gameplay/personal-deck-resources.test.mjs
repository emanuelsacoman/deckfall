import assert from 'node:assert/strict';
import test from 'node:test';
import gameplay from '../../shared/gameplay/lib/index.js';
import { deepFreeze } from './state-fixtures.mjs';

const {
  GameplayContractError, GameplayDeckValidationError, parsePersonalDeckDraft,
  parsePersonalDeckResource, parsePersonalDeckCreateRequest, parsePersonalDeckUpdateRequest,
  parsePersonalDeckRenameRequest, parsePersonalDeckDeleteRequest, parsePersonalDeckDuplicateRequest,
  validateGameplayDeck, validateGameplayDeckAgainstActiveCatalog,
} = gameplay;

function makeDraft() {
  return {
    name: ' Draft ', rulesVersion: '0.1', contentVersion: 'unavailable-historical-v1',
    entries: [
      { cardId: 'z', revision: 7, quantity: 1 },
      { cardId: 'a', revision: 2, quantity: 1 },
      { cardId: 'z', revision: 7, quantity: 1 },
    ],
  };
}

function makeResource() {
  return {
    id: 'opaque-personal-deck', version: 11, draft: makeDraft(),
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:01:00.001Z',
  };
}

const cases = [
  { name: 'resource', parse: parsePersonalDeckResource, make: makeResource },
  { name: 'create', parse: parsePersonalDeckCreateRequest, make: () => ({ deckId: 'deck-new', draft: makeDraft() }) },
  {
    name: 'update', parse: parsePersonalDeckUpdateRequest,
    make: () => ({ deckId: 'deck-existing', expectedVersion: 11, draft: makeDraft() }),
  },
  {
    name: 'rename', parse: parsePersonalDeckRenameRequest,
    make: () => ({ deckId: 'deck-existing', expectedVersion: 11, name: ' Renamed ' }),
  },
  { name: 'delete', parse: parsePersonalDeckDeleteRequest, make: () => ({ deckId: 'deck-existing', expectedVersion: 11 }) },
  {
    name: 'duplicate', parse: parsePersonalDeckDuplicateRequest,
    make: () => ({ sourceDeckId: 'deck-existing', expectedSourceVersion: 11, newDeckId: 'deck-copy' }),
  },
];

function rejects(parse, value) {
  assert.throws(() => parse(value), error => {
    assert.ok(error instanceof GameplayContractError);
    assert.equal(error.code, 'invalid-gameplay-contract');
    assert.equal(error.message, new GameplayContractError().message);
    assert.equal(Object.hasOwn(error, 'reason'), false);
    return true;
  });
}

function identifierFields(value) {
  return Object.keys(value).filter(key => ['id', 'deckId', 'sourceDeckId', 'newDeckId'].includes(key));
}

test('a personal resource returns only identity, document version, draft and neutral timestamps', () => {
  const input = makeResource();
  const result = parsePersonalDeckResource(input);
  assert.deepEqual(result, { ...input, draft: parsePersonalDeckDraft(input.draft) });
  assert.deepEqual(Object.keys(result).sort(), ['createdAt', 'draft', 'id', 'updatedAt', 'version']);
  assert.equal(typeof result.createdAt, 'string');
  assert.equal(typeof result.updatedAt, 'string');
});

test('resource, create and update compose the existing draft normalization', () => {
  for (const { name, parse, make } of cases.filter(item => Object.hasOwn(item.make(), 'draft'))) {
    const input = make();
    const result = parse(input);
    assert.deepEqual(result.draft, parsePersonalDeckDraft(input.draft), name);
    assert.equal(result.draft.name, 'Draft', name);
    assert.deepEqual(result.draft.entries, [
      { cardId: 'a', revision: 2, quantity: 1 }, { cardId: 'z', revision: 7, quantity: 2 },
    ], name);
    assert.equal(result.draft.contentVersion, 'unavailable-historical-v1', name);
  }
});

test('every required envelope field is mandatory for each resource or mutation', () => {
  for (const { parse, make } of cases) {
    for (const key of Object.keys(make())) {
      const input = make();
      delete input[key];
      rejects(parse, input);
    }
  }
});

test('all deck identity fields reuse the ASCII identifier boundary without generating or slugging IDs', () => {
  for (const { parse, make } of cases) {
    for (const key of identifierFields(make())) {
      for (const value of ['-', '_', 'A0_z-9', 'x'.repeat(128)]) {
        assert.equal(parse({ ...make(), [key]: value })[key], value);
      }
      for (const value of ['', 'x'.repeat(129), 'deck/name', ' deck ', 'nome com espaço', 'á', 1, null, undefined]) {
        rejects(parse, { ...make(), [key]: value });
      }
    }
  }
});

test('document and expected versions must be positive safe integers without coercion', () => {
  for (const { parse, make } of cases) {
    for (const key of ['version', 'expectedVersion', 'expectedSourceVersion'].filter(key => Object.hasOwn(make(), key))) {
      for (const value of [1, 17, Number.MAX_SAFE_INTEGER]) {
        assert.equal(parse({ ...make(), [key]: value })[key], value);
      }
      for (const value of [0, -0, -1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, null, undefined]) {
        rejects(parse, { ...make(), [key]: value });
      }
    }
  }
});

test('resource parsing preserves the supplied document version instead of assigning or incrementing it', () => {
  for (const version of [1, 2, Number.MAX_SAFE_INTEGER]) {
    const input = { ...makeResource(), version };
    assert.equal(parsePersonalDeckResource(input).version, version);
    assert.equal(input.version, version);
  }
});

test('canonical UTC timestamps preserve milliseconds and real calendar dates across supported years', () => {
  for (const timestamp of [
    '0001-01-01T00:00:00.000Z', '1900-02-28T23:59:59.999Z', '2000-02-29T00:00:00.000Z',
    '2024-02-29T12:34:56.789Z', '9999-12-31T23:59:59.999Z',
  ]) {
    const result = parsePersonalDeckResource({ ...makeResource(), createdAt: timestamp, updatedAt: timestamp });
    assert.equal(result.createdAt, timestamp);
    assert.equal(result.updatedAt, timestamp);
  }
});

test('noncanonical timestamps, unsupported years and mutable or backend-specific timestamp values reject', () => {
  for (const timestamp of [
    '', '2026-10-17', '2026-10-17T10:00:00Z', '2026-10-17T10:00:00.00Z',
    '2026-10-17T10:00:00.0000Z', '2026-10-17T10:00:00.000z', '2026-10-17 10:00:00.000Z',
    '2026-10-17T10:00:00.000+00:00', '2026-10-17T07:00:00.000-03:00',
    ' 2026-10-17T10:00:00.000Z ', '0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z',
    '10000-01-01T00:00:00.000Z', new Date('2026-10-17T10:00:00.000Z'),
    { seconds: 1, nanoseconds: 0 }, new String('2026-10-17T10:00:00.000Z'), 1, null, undefined,
  ]) {
    for (const key of ['createdAt', 'updatedAt']) rejects(parsePersonalDeckResource, { ...makeResource(), [key]: timestamp });
  }
});

test('calendar overflow, invalid leap days and out-of-range clock components reject rather than normalize', () => {
  for (const timestamp of [
    '1900-02-29T00:00:00.000Z', '2023-02-29T00:00:00.000Z', '2026-02-30T00:00:00.000Z',
    '2026-04-31T00:00:00.000Z', '2026-00-01T00:00:00.000Z', '2026-13-01T00:00:00.000Z',
    '2026-01-00T00:00:00.000Z', '2026-01-32T00:00:00.000Z', '2026-10-17T24:00:00.000Z',
    '2026-10-17T10:60:00.000Z', '2026-10-17T10:00:60.000Z',
  ]) {
    rejects(parsePersonalDeckResource, { ...makeResource(), createdAt: timestamp, updatedAt: timestamp });
  }
});

test('createdAt must not follow updatedAt while equality and increasing milliseconds are accepted', () => {
  const input = makeResource();
  rejects(parsePersonalDeckResource, { ...input, createdAt: input.updatedAt, updatedAt: input.createdAt });
  rejects(parsePersonalDeckResource, {
    ...input, createdAt: '2026-10-17T10:00:00.001Z', updatedAt: '2026-10-17T10:00:00.000Z',
  });
  assert.equal(parsePersonalDeckResource({ ...input, updatedAt: input.createdAt }).updatedAt, input.createdAt);
  assert.equal(parsePersonalDeckResource({
    ...input, updatedAt: '2026-10-17T10:00:00.001Z',
  }).updatedAt, '2026-10-17T10:00:00.001Z');
});

test('a create request contains only the chosen deck identity and normalized draft', () => {
  const input = { deckId: 'deck-new', draft: makeDraft() };
  assert.deepEqual(parsePersonalDeckCreateRequest(input), { deckId: input.deckId, draft: parsePersonalDeckDraft(input.draft) });
});

test('an update carries the version read by the client without proposing a new document version', () => {
  const input = { deckId: 'deck-existing', expectedVersion: 11, draft: makeDraft() };
  assert.deepEqual(parsePersonalDeckUpdateRequest(input), { ...input, draft: parsePersonalDeckDraft(input.draft) });
  rejects(parsePersonalDeckUpdateRequest, { ...input, version: 12 });
  rejects(parsePersonalDeckUpdateRequest, { ...input, newVersion: 12 });
});

test('rename is a minimal name-only mutation independent of a draft or historical catalog', () => {
  assert.deepEqual(parsePersonalDeckRenameRequest({ deckId: 'unknown-deck', expectedVersion: 3, name: ' Renamed ' }), {
    deckId: 'unknown-deck', expectedVersion: 3, name: 'Renamed',
  });
  for (const key of ['draft', 'entries', 'rulesVersion', 'contentVersion', 'catalog', 'definition']) {
    rejects(parsePersonalDeckRenameRequest, { deckId: 'deck-existing', expectedVersion: 3, name: 'Name', [key]: makeDraft() });
  }
});

test('rename uses the same trim, internal content and eighty UTF-16-unit boundary as a draft', () => {
  for (const name of [' X ', '\t Deck  A \n', 'Guardião e\u0301', '🃏'.repeat(40), ` ${'x'.repeat(80)} `]) {
    const result = parsePersonalDeckRenameRequest({ deckId: 'deck', expectedVersion: 1, name });
    assert.equal(result.name, parsePersonalDeckDraft({ ...makeDraft(), name }).name);
  }
  for (const name of ['', ' \t\n', 'x'.repeat(81), '🃏'.repeat(41), 1, null, undefined, new String('name')]) {
    rejects(parsePersonalDeckRenameRequest, { deckId: 'deck', expectedVersion: 1, name });
  }
});

test('delete accepts only a deck identity and expected document version', () => {
  const input = { deckId: 'deck-delete', expectedVersion: 5 };
  assert.deepEqual(parsePersonalDeckDeleteRequest(input), input);
  for (const key of ['draft', 'createdAt', 'updatedAt', 'uid', 'ownerUid', 'name']) {
    rejects(parsePersonalDeckDeleteRequest, { ...input, [key]: makeDraft() });
  }
});

test('duplicate identifies only the trusted source version and a distinct new identity', () => {
  const input = { sourceDeckId: 'source-deck', expectedSourceVersion: 5, newDeckId: 'copy-deck' };
  assert.deepEqual(parsePersonalDeckDuplicateRequest(input), input);
  rejects(parsePersonalDeckDuplicateRequest, { ...input, newDeckId: input.sourceDeckId });
  // Identifiers are opaque and case-sensitive, so these identities are distinct.
  assert.equal(parsePersonalDeckDuplicateRequest({ ...input, sourceDeckId: 'Deck', newDeckId: 'deck' }).newDeckId, 'deck');
  for (const key of ['name', 'draft', 'version', 'createdAt', 'updatedAt', 'expectedVersion']) {
    rejects(parsePersonalDeckDuplicateRequest, { ...input, [key]: makeDraft() });
  }
});

test('root whitelists reject forged ownership, authority, new versions and persistence metadata', () => {
  const fields = [
    'id', 'deckId', 'sourceDeckId', 'newDeckId', 'revision', 'rulesVersion', 'contentVersion',
    'uid', 'ownerUid', 'newVersion', 'version', 'expectedVersion', 'expectedSourceVersion',
    'createdAt', 'updatedAt', 'isValid', 'isPlayable', 'ownership', 'catalog', 'definition',
    'bypass', 'admin', 'eligible', 'training', 'kind', 'draft', 'name', 'extra',
  ];
  for (const { parse, make } of cases) {
    for (const key of fields.filter(key => !Object.hasOwn(make(), key))) {
      rejects(parse, { ...make(), [key]: true });
    }
  }
});

test('containing a draft never permits forged metadata or canonical card content inside it', () => {
  for (const { parse, make } of cases.filter(item => Object.hasOwn(item.make(), 'draft'))) {
    for (const key of ['uid', 'ownerUid', 'version', 'expectedVersion', 'createdAt', 'updatedAt', 'catalog', 'ownership', 'isPlayable']) {
      const input = make();
      input.draft[key] = true;
      rejects(parse, input);
    }
    for (const key of ['definition', 'eligible', 'ownership', 'version', 'uid']) {
      const input = make();
      input.draft.entries[0][key] = true;
      rejects(parse, input);
    }
  }
});

test('resource and requests reject invalid nested compositions instead of repairing or migrating them', () => {
  for (const { parse, make } of cases.filter(item => Object.hasOwn(item.make(), 'draft'))) {
    for (const mutate of [
      draft => { draft.entries[2].revision = 8; },
      draft => { draft.entries[2].quantity = 2; },
      draft => { draft.rulesVersion = '0.2'; },
      draft => { draft.contentVersion = 'invalid/content'; },
      draft => { draft.name = ' '; },
      draft => { draft.entries = Array.from({ length: 25 }, (_, index) => ({ cardId: `card-${index}`, revision: 1, quantity: 1 })); },
    ]) {
      const input = make();
      mutate(input.draft);
      const before = structuredClone(input);
      rejects(parse, input);
      assert.deepEqual(input, before);
    }
  }
});

test('malformed or inherited envelopes cannot masquerade as a resource or mutation request', () => {
  for (const { parse, make } of cases) {
    for (const value of [null, undefined, [], 'request', 1, true, new Date(), new Map()]) rejects(parse, value);
    rejects(parse, Object.assign(Object.create({ ownerUid: 'forged' }), make()));
  }
});

test('root accessors are rejected without executing any supplied getter', () => {
  for (const { parse, make } of cases) {
    for (const key of [...Object.keys(make()), 'ownerUid']) {
      const input = make();
      let invoked = false;
      Object.defineProperty(input, key, { enumerable: true, get() { invoked = true; return 'forged'; } });
      rejects(parse, input);
      assert.equal(invoked, false, key);
    }
  }
});

test('nested draft, entry and array accessors reject without executing their getters', () => {
  for (const { parse, make } of cases.filter(item => Object.hasOwn(item.make(), 'draft'))) {
    for (const location of ['name', 'rulesVersion', 'contentVersion', 'entries', 'cardId', 'revision', 'quantity', 'array-entry']) {
      const input = make();
      const target = location === 'array-entry' ? input.draft.entries :
        ['cardId', 'revision', 'quantity'].includes(location) ? input.draft.entries[0] : input.draft;
      const key = location === 'array-entry' ? '0' : location;
      let invoked = false;
      Object.defineProperty(target, key, { enumerable: true, get() { invoked = true; return 'forged'; } });
      rejects(parse, input);
      assert.equal(invoked, false, location);
    }
  }
});

test('symbols and hidden properties cannot bypass resource or request whitelists', () => {
  for (const { parse, make } of cases) {
    const symbolic = make();
    symbolic[Symbol('ownerUid')] = 'forged';
    rejects(parse, symbolic);
    const hidden = make();
    Object.defineProperty(hidden, 'ownerUid', { value: 'forged', enumerable: false });
    rejects(parse, hidden);
    const hiddenRequired = make();
    const key = Object.keys(hiddenRequired)[0];
    Object.defineProperty(hiddenRequired, key, { value: hiddenRequired[key], enumerable: false });
    rejects(parse, hiddenRequired);
  }
});

test('nested symbols and decorated, sparse or subclassed arrays reject through the composed draft parser', () => {
  for (const { parse, make } of cases.filter(item => Object.hasOwn(item.make(), 'draft'))) {
    for (const location of ['draft', 'entry', 'array']) {
      const input = make();
      const target = location === 'draft' ? input.draft : location === 'entry' ? input.draft.entries[0] : input.draft.entries;
      target[Symbol('authority')] = true;
      rejects(parse, input);
    }
    const decorated = make();
    decorated.draft.entries.ownership = true;
    rejects(parse, decorated);
    const sparse = make();
    delete sparse.draft.entries[0];
    rejects(parse, sparse);
    const subclass = make();
    subclass.draft.entries = new (class Entries extends Array {})();
    rejects(parse, subclass);
  }
});

test('deeply frozen resources and requests remain untouched during parsing', () => {
  for (const { name, parse, make } of cases) {
    const input = make();
    const before = structuredClone(input);
    deepFreeze(input);
    const result = parse(input);
    assert.deepEqual(input, before, name);
    assert.notStrictEqual(result, input, name);
    if (Object.hasOwn(result, 'draft')) {
      assert.equal(result.draft.name, 'Draft', name);
      assert.equal(result.draft.entries.length, 2, name);
      assert.notStrictEqual(result.draft, input.draft, name);
    }
  }
});

test('resource and draft-bearing requests return detached envelopes, drafts, arrays and entries', () => {
  for (const { name, parse, make } of cases.filter(item => Object.hasOwn(item.make(), 'draft'))) {
    const input = make();
    const before = structuredClone(input);
    const result = parse(input);
    assert.notStrictEqual(result, input, name);
    assert.notStrictEqual(result.draft, input.draft, name);
    assert.notStrictEqual(result.draft.entries, input.draft.entries, name);
    assert.ok(result.draft.entries.every(entry => !input.draft.entries.includes(entry)), name);
    result.draft.name = 'Result changed';
    result.draft.entries[0].revision = 99;
    result.draft.entries.push({ cardId: 'result-only', revision: 1, quantity: 1 });
    assert.deepEqual(input, before, name);
    input.draft.entries[0].cardId = 'input-only';
    input.draft.entries[1].revision = 100;
    assert.equal(result.draft.entries.some(entry => entry.cardId === 'input-only'), false, name);
    assert.equal(result.draft.entries[0].revision, 99, name);
  }
});

test('each parser is idempotent while every parse allocates a fresh result', () => {
  for (const { name, parse, make } of cases) {
    const first = parse(make());
    const second = parse(first);
    assert.deepEqual(second, first, name);
    assert.notStrictEqual(second, first, name);
    if (Object.hasOwn(first, 'draft')) {
      assert.notStrictEqual(second.draft, first.draft, name);
      assert.notStrictEqual(second.draft.entries, first.draft.entries, name);
      assert.notStrictEqual(second.draft.entries[0], first.draft.entries[0], name);
    }
  }
});

test('deck document version, card revision, rules version and content provenance remain independent', () => {
  const resource = parsePersonalDeckResource(makeResource());
  assert.equal(resource.version, 11);
  assert.equal(resource.draft.rulesVersion, '0.1');
  assert.equal(resource.draft.contentVersion, 'unavailable-historical-v1');
  assert.deepEqual(resource.draft.entries.map(entry => entry.revision), [2, 7]);
  const request = parsePersonalDeckUpdateRequest({ deckId: resource.id, expectedVersion: 23, draft: resource.draft });
  assert.equal(request.expectedVersion, 23);
  assert.deepEqual(request.draft, resource.draft);
  assert.equal(resource.version, 11);
  assert.equal(Object.hasOwn(request, 'version'), false);
  assert.equal(Object.hasOwn(resource, 'expectedVersion'), false);
});

test('structural parsers do not decide ownership, admission, actual version conflicts, quota or no-op status', () => {
  const update = { deckId: 'never-saved', expectedVersion: 999, draft: makeDraft() };
  assert.deepEqual(parsePersonalDeckUpdateRequest(update), parsePersonalDeckUpdateRequest(update));
  assert.equal(parsePersonalDeckDeleteRequest({ deckId: 'never-saved', expectedVersion: 999 }).expectedVersion, 999);
  assert.equal(parsePersonalDeckDuplicateRequest({
    sourceDeckId: 'never-saved', expectedSourceVersion: 999, newDeckId: 'never-checked-copy',
  }).expectedSourceVersion, 999);
  assert.equal(Array.from({ length: 21 }, (_, index) => parsePersonalDeckCreateRequest({
    deckId: `chosen-${index}`, draft: makeDraft(),
  })).length, 21);
  const empty = { ...makeDraft(), entries: [] };
  assert.deepEqual(parsePersonalDeckResource({ ...makeResource(), draft: empty }).draft.entries, []);
});

test('existing drafts, strict Deck Rules and active-catalog compatibility preserve their separate guarantees', () => {
  const draft = parsePersonalDeckDraft({
    name: ' Complete ', rulesVersion: '0.1', contentVersion: 'historical-v1',
    entries: Array.from({ length: 12 }, (_, index) => ({ cardId: `card-${index}`, revision: 4, quantity: 2 })),
  });
  const { rulesVersion, contentVersion, entries } = draft;
  const composition = { rulesVersion, contentVersion, entries };
  const context = {
    kind: 'owned',
    catalog: {
      rulesVersion: '0.1', contentVersion: 'active-v2',
      cards: entries.map(entry => ({
        definition: { kind: 'unit', cardId: entry.cardId, revision: 4, cost: 1, power: 2, maxLife: 3, guard: false },
        eligible: true,
      })),
    },
    ownership: entries.map(entry => ({ cardId: entry.cardId, quantity: 2 })),
  };
  assert.throws(() => validateGameplayDeck(composition, context), error =>
    error instanceof GameplayDeckValidationError && error.reason === 'content-version');
  const admitted = validateGameplayDeckAgainstActiveCatalog(composition, context);
  assert.equal(admitted.contentVersion, 'active-v2');
  assert.equal(admitted.kind, 'owned');
  assert.equal(admitted.entries.reduce((sum, entry) => sum + entry.quantity, 0), 24);
  assert.equal(draft.contentVersion, 'historical-v1');
  const partial = { ...composition, entries: entries.slice(1) };
  assert.equal(parsePersonalDeckDraft({ ...draft, entries: partial.entries }).entries.length, 11);
  assert.throws(() => validateGameplayDeckAgainstActiveCatalog(partial, context), error =>
    error instanceof GameplayDeckValidationError && error.reason === 'size');
  context.ownership = [];
  assert.throws(() => validateGameplayDeckAgainstActiveCatalog(composition, context), error =>
    error instanceof GameplayDeckValidationError && error.reason === 'ownership');
});
