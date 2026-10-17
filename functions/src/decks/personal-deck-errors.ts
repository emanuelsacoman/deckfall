export type PersonalDeckDomainErrorCode =
  | 'personal-deck-conflict'
  | 'personal-deck-not-found'
  | 'personal-deck-already-exists'
  | 'personal-deck-capacity-exceeded'
  | 'personal-deck-version-exhausted'
  | 'personal-deck-invalid-time'
  | 'personal-deck-content'
  | 'personal-deck-content-unavailable';

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

/** A domain decision based on a transactional bounded read, not a database failure. */
export class PersonalDeckCapacityError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-capacity-exceeded');
    this.name = 'PersonalDeckCapacityError';
  }
}

export class PersonalDeckVersionExhaustedError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-version-exhausted');
    this.name = 'PersonalDeckVersionExhaustedError';
  }
}

/** Invalid or regressive trusted time is a backend failure, never a client contract error. */
export class PersonalDeckClockError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-invalid-time');
    this.name = 'PersonalDeckClockError';
  }
}

export type PersonalDeckContentReason = 'content-version' | 'unknown-card' | 'revision';

/** Historical reference mismatch only; no card identities, revisions or playability assertion. */
export class PersonalDeckContentError extends PersonalDeckDomainError {
  constructor(readonly reason: PersonalDeckContentReason) {
    super('personal-deck-content');
    this.name = 'PersonalDeckContentError';
  }
}

/** Missing historical content is distinct from a missing personal deck; no contextual payload. */
export class PersonalDeckContentUnavailableError extends PersonalDeckDomainError {
  constructor() {
    super('personal-deck-content-unavailable');
    this.name = 'PersonalDeckContentUnavailableError';
  }
}
