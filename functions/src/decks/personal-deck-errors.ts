export type PersonalDeckDomainErrorCode =
  | 'personal-deck-conflict'
  | 'personal-deck-not-found'
  | 'personal-deck-already-exists'
  | 'personal-deck-capacity-exceeded';

/** No contextual payload; the native stack remains available for internal diagnostics only. */
export abstract class PersonalDeckDomainError extends Error {
  protected constructor(readonly code: PersonalDeckDomainErrorCode) {
    super('Não foi possível concluir a operação de deck pessoal.');
  }
}

export class PersonalDeckConflictError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-conflict');
    this.name = 'PersonalDeckConflictError';
  }
}

export class PersonalDeckNotFoundError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-not-found');
    this.name = 'PersonalDeckNotFoundError';
  }
}

export class PersonalDeckAlreadyExistsError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-already-exists');
    this.name = 'PersonalDeckAlreadyExistsError';
  }
}

/** A future domain decision based on a transactional bounded read, not a database failure. */
export class PersonalDeckCapacityError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-capacity-exceeded');
    this.name = 'PersonalDeckCapacityError';
  }
}
