export type PersonalDeckDomainErrorCode =
  | 'personal-deck-conflict'
  | 'personal-deck-not-found'
  | 'personal-deck-already-exists'
  | 'personal-deck-capacity-exceeded';

/** Expected domain failures carry no identities, versions, cause, database paths or internal stack. */
export abstract class PersonalDeckDomainError extends Error {
  protected constructor(readonly code: PersonalDeckDomainErrorCode) {
    super('Não foi possível concluir a operação de deck pessoal.');
    delete this.stack;
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
