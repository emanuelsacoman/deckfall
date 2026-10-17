import { contractArray, contractRecord, GameplayContractError } from './contract-validation';
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

/** Normalizes a partial personal composition without consulting a catalog or ownership. */
export function parsePersonalDeckDraft(value: unknown): PersonalDeckDraft {
  const draft = contractRecord(value, ['name', 'rulesVersion', 'contentVersion', 'entries']);
  if (typeof draft['name'] !== 'string') throw new GameplayContractError();
  const name = draft['name'].trim();
  if (!name.length || name.length > PERSONAL_DECK_LIMITS.maxNameLength) throw new GameplayContractError();
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
