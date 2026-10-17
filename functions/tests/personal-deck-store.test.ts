import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckConflictError,
  PersonalDeckDomainError, PersonalDeckNotFoundError,
} from '../src/decks/personal-deck-errors';

const cases = [
  [PersonalDeckConflictError, 'personal-deck-conflict', 'PersonalDeckConflictError'],
  [PersonalDeckNotFoundError, 'personal-deck-not-found', 'PersonalDeckNotFoundError'],
  [PersonalDeckAlreadyExistsError, 'personal-deck-already-exists', 'PersonalDeckAlreadyExistsError'],
  [PersonalDeckCapacityError, 'personal-deck-capacity-exceeded', 'PersonalDeckCapacityError'],
] as const;

for (const [ErrorClass, code, name] of cases) {
  test(`${name} exposes its stable domain code`, () => {
    const error = new ErrorClass();
    assert.ok(error instanceof Error);
    assert.ok(error instanceof PersonalDeckDomainError);
    assert.ok(error instanceof ErrorClass);
    assert.equal(error.code, code);
    assert.equal(error.name, name);
  });
}

test('personal deck failures remain distinct from each other and invalid gameplay contracts', () => {
  const errors = cases.map(([ErrorClass]) => new ErrorClass());
  assert.equal(new Set(errors.map(error => error.code)).size, cases.length);
  for (const error of errors) {
    assert.notEqual(error.code, 'invalid-gameplay-contract');
    assert.notEqual(error.name, 'GameplayContractError');
  }
});

test('all personal deck domain failures have the same generic message without contextual payload', () => {
  for (const [ErrorClass] of cases) {
    const error = new ErrorClass();
    assert.equal(error.message, 'Não foi possível concluir a operação de deck pessoal.');
    assert.deepEqual(Object.getOwnPropertyNames(error).sort(), ['code', 'message', 'name']);
    assert.deepEqual(Object.getOwnPropertySymbols(error), []);
    assert.equal(error.cause, undefined);
    const serialized = JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(serialized).sort(), ['code', 'name']);
    assert.equal(serialized['code'], error.code);
    assert.equal(serialized['name'], error.name);
  }
});

test('personal deck domain errors expose no internal stack in memory or serialization', () => {
  for (const [ErrorClass] of cases) {
    const error = new ErrorClass();
    assert.equal(Object.hasOwn(error, 'stack'), false);
    assert.equal(error.stack, undefined);
    assert.equal(Object.hasOwn({ ...error }, 'stack'), false);
    assert.equal(JSON.stringify(error).includes('stack'), false);
  }
});
