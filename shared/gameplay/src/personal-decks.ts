import { contractArray, contractIdentifier, contractInteger, contractRecord, GameplayContractError } from './contract-validation';
import { parseGameplayDeckList } from './decks';
import type { GameplayDeckEntry, GameplayDeckList } from './decks';
import { GAMEPLAY_RULES } from './rules';

/** Revisable v0.1 limits. Account quota and future document bytes are not enforced by this parser. */
export const PERSONAL_DECK_LIMITS = Object.freeze({
  maxDecks: 20,
  maxNameLength: 80,
  maxCards: GAMEPLAY_RULES.deckSize,
  maxCopies: GAMEPLAY_RULES.maxCopies,
  maxDocumentBytes: 16 * 1024,
});

/** Player intent only: no persistence metadata, catalog recognition or authority to play. */
export interface PersonalDeckDraft extends GameplayDeckList {
  readonly name: string;
}

/** Serializable resource projection, not a Firestore document or proof of trusted provenance. */
export interface PersonalDeckResource {
  readonly id: string;
  readonly version: number;
  readonly draft: PersonalDeckDraft;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PersonalDeckCreateRequest {
  readonly deckId: string;
  readonly draft: PersonalDeckDraft;
}

/** expectedVersion is the document version read by the client, never the desired new version. */
export interface PersonalDeckUpdateRequest {
  readonly deckId: string;
  readonly expectedVersion: number;
  readonly draft: PersonalDeckDraft;
}

/** Renaming never requires a client composition or an available historical catalog. */
export interface PersonalDeckRenameRequest {
  readonly deckId: string;
  readonly expectedVersion: number;
  readonly name: string;
}

export interface PersonalDeckDeleteRequest {
  readonly deckId: string;
  readonly expectedVersion: number;
}

/** The future backend reads the source intent, including its name; the client supplies no copy metadata. */
export interface PersonalDeckDuplicateRequest {
  readonly sourceDeckId: string;
  readonly expectedSourceVersion: number;
  readonly newDeckId: string;
}

function personalDeckName(value: unknown): string {
  if (typeof value !== 'string') throw new GameplayContractError();
  const name = value.trim();
  if (!name.length || name.length > PERSONAL_DECK_LIMITS.maxNameLength) throw new GameplayContractError();
  return name;
}

/** Canonical UTC, millisecond precision, years 0001–9999. Date is local validation only. */
function personalDeckTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      value.startsWith('0000-')) throw new GameplayContractError();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new GameplayContractError();
  return value;
}

/** Normalizes a partial personal composition without consulting a catalog or ownership. */
export function parsePersonalDeckDraft(value: unknown): PersonalDeckDraft {
  const draft = contractRecord(value, ['name', 'rulesVersion', 'contentVersion', 'entries']);
  const name = personalDeckName(draft['name']);
  const rawEntries = contractArray(draft['entries']);
  // Every row needs at least one card, so more rows cannot produce a legal partial total.
  if (rawEntries.length > PERSONAL_DECK_LIMITS.maxCards) throw new GameplayContractError();
  const composition = parseGameplayDeckList({
    rulesVersion: draft['rulesVersion'], contentVersion: draft['contentVersion'], entries: rawEntries,
  });

  const quantities = new Map<string, GameplayDeckEntry>();
  let total = 0;
  for (const entry of composition.entries) {
    if (entry.quantity > PERSONAL_DECK_LIMITS.maxCopies || entry.quantity > PERSONAL_DECK_LIMITS.maxCards - total) {
      throw new GameplayContractError();
    }
    const previous = quantities.get(entry.cardId);
    if (previous && previous.revision !== entry.revision) throw new GameplayContractError();
    const quantity = (previous?.quantity ?? 0) + entry.quantity;
    if (quantity > PERSONAL_DECK_LIMITS.maxCopies) throw new GameplayContractError();
    quantities.set(entry.cardId, { ...entry, quantity });
    total += entry.quantity;
  }

  return {
    name, rulesVersion: composition.rulesVersion, contentVersion: composition.contentVersion,
    // Canonical composition order only, never match draw order.
    entries: [...quantities.values()].sort((a, b) => a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0),
  };
}

/** Parses a resource projection without authenticating its source or reading persisted state. */
export function parsePersonalDeckResource(value: unknown): PersonalDeckResource {
  const resource = contractRecord(value, ['id', 'version', 'draft', 'createdAt', 'updatedAt']);
  const createdAt = personalDeckTimestamp(resource['createdAt']);
  const updatedAt = personalDeckTimestamp(resource['updatedAt']);
  if (createdAt > updatedAt) throw new GameplayContractError();
  return {
    id: contractIdentifier(resource['id']), version: contractInteger(resource['version'], 1),
    draft: parsePersonalDeckDraft(resource['draft']), createdAt, updatedAt,
  };
}

/** Validates client choices only; assigning version 1 and timestamps belongs to the future backend. */
export function parsePersonalDeckCreateRequest(value: unknown): PersonalDeckCreateRequest {
  const request = contractRecord(value, ['deckId', 'draft']);
  return { deckId: contractIdentifier(request['deckId']), draft: parsePersonalDeckDraft(request['draft']) };
}

export function parsePersonalDeckUpdateRequest(value: unknown): PersonalDeckUpdateRequest {
  const request = contractRecord(value, ['deckId', 'expectedVersion', 'draft']);
  return {
    deckId: contractIdentifier(request['deckId']), expectedVersion: contractInteger(request['expectedVersion'], 1),
    draft: parsePersonalDeckDraft(request['draft']),
  };
}

export function parsePersonalDeckRenameRequest(value: unknown): PersonalDeckRenameRequest {
  const request = contractRecord(value, ['deckId', 'expectedVersion', 'name']);
  return {
    deckId: contractIdentifier(request['deckId']), expectedVersion: contractInteger(request['expectedVersion'], 1),
    name: personalDeckName(request['name']),
  };
}

export function parsePersonalDeckDeleteRequest(value: unknown): PersonalDeckDeleteRequest {
  const request = contractRecord(value, ['deckId', 'expectedVersion']);
  return { deckId: contractIdentifier(request['deckId']), expectedVersion: contractInteger(request['expectedVersion'], 1) };
}

export function parsePersonalDeckDuplicateRequest(value: unknown): PersonalDeckDuplicateRequest {
  const request = contractRecord(value, ['sourceDeckId', 'expectedSourceVersion', 'newDeckId']);
  const sourceDeckId = contractIdentifier(request['sourceDeckId']);
  const newDeckId = contractIdentifier(request['newDeckId']);
  if (sourceDeckId === newDeckId) throw new GameplayContractError();
  return { sourceDeckId, expectedSourceVersion: contractInteger(request['expectedSourceVersion'], 1), newDeckId };
}
