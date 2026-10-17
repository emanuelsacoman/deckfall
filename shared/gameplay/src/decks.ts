import type { GameplayCardDefinition } from './contracts';
import type { GameplayRulesVersion } from './rules';
import { GAMEPLAY_RULES, GAMEPLAY_RULES_VERSION } from './rules';
import {
  contractArray, contractBoolean, contractIdentifier, contractInteger, contractRecord, GameplayContractError,
} from './contract-validation';
import { parseGameplayCardDefinition } from './validation';

/** Composition intent only: no ownership, eligibility or card profiles from the client. */
export interface GameplayDeckEntry {
  readonly cardId: string;
  readonly revision: number;
  readonly quantity: number;
}

export interface GameplayDeckList {
  readonly rulesVersion: GameplayRulesVersion;
  readonly contentVersion: string;
  readonly entries: readonly GameplayDeckEntry[];
}

/** One pinned revision/profile per canonical identity in this trusted content version. */
export interface GameplayDeckCatalog {
  readonly rulesVersion: GameplayRulesVersion;
  readonly contentVersion: string;
  readonly cards: readonly {
    readonly definition: GameplayCardDefinition;
    readonly eligible: boolean;
  }[];
}

export interface GameplayOwnedCardQuantity {
  readonly cardId: string;
  readonly quantity: number;
}

/** Derived by future trusted infrastructure, never accepted as part of a client request. */
export type GameplayDeckValidationContext =
  | {
    readonly kind: 'owned';
    readonly catalog: GameplayDeckCatalog;
    readonly ownership: readonly GameplayOwnedCardQuantity[];
  }
  | {
    readonly kind: 'training-reference';
    readonly catalog: GameplayDeckCatalog;
    readonly referenceId: string;
    readonly referenceDeck: GameplayDeckList;
  };

export interface GameplayValidatedDeckEntry {
  readonly definition: GameplayCardDefinition;
  readonly quantity: number;
}

interface GameplayValidatedDeckCommon {
  readonly rulesVersion: GameplayRulesVersion;
  readonly contentVersion: string;
  readonly entries: readonly GameplayValidatedDeckEntry[];
}

/** Detached, canonical composition. It is not an authorization receipt or a shuffled match deck. */
export type GameplayValidatedDeck = GameplayValidatedDeckCommon & (
  | { readonly kind: 'owned' }
  | { readonly kind: 'training-reference'; readonly referenceId: string }
);

export type GameplayDeckValidationReason =
  | 'size' | 'copies' | 'revision' | 'unknown-card' | 'ineligible-card'
  | 'ownership' | 'content-version' | 'reference-mismatch';

/** Business-rule diagnostic with no payload, collection or hidden-card details. */
export class GameplayDeckValidationError extends Error {
  readonly code = 'invalid-gameplay-deck';

  constructor(readonly reason: GameplayDeckValidationReason) {
    super('Composição de deck inválida.');
    this.name = 'GameplayDeckValidationError';
  }
}

/** Validates shape, not composition or authority. Repeated rows are handled by the validator. */
export function parseGameplayDeckList(value: unknown): GameplayDeckList {
  const deck = contractRecord(value, ['rulesVersion', 'contentVersion', 'entries']);
  if (deck['rulesVersion'] !== GAMEPLAY_RULES_VERSION) throw new GameplayContractError();
  return {
    rulesVersion: GAMEPLAY_RULES_VERSION,
    contentVersion: contractIdentifier(deck['contentVersion']),
    entries: contractArray(deck['entries']).map(value => {
      const entry = contractRecord(value, ['cardId', 'revision', 'quantity']);
      return {
        cardId: contractIdentifier(entry['cardId']),
        revision: contractInteger(entry['revision'], 1),
        quantity: contractInteger(entry['quantity'], 1),
      };
    }),
  };
}

/** Validates and detaches trusted canonical content; does not establish its provenance or activation. */
export function parseGameplayDeckCatalog(value: unknown): GameplayDeckCatalog {
  const catalog = contractRecord(value, ['rulesVersion', 'contentVersion', 'cards']);
  if (catalog['rulesVersion'] !== GAMEPLAY_RULES_VERSION) throw new GameplayContractError();
  const identities = new Set<string>();
  return {
    rulesVersion: GAMEPLAY_RULES_VERSION,
    contentVersion: contractIdentifier(catalog['contentVersion']),
    cards: contractArray(catalog['cards']).map(value => {
      const card = contractRecord(value, ['definition', 'eligible']);
      const definition = parseGameplayCardDefinition(card['definition']);
      if (identities.has(definition.cardId)) throw new GameplayContractError();
      identities.add(definition.cardId);
      return { definition, eligible: contractBoolean(card['eligible']) };
    }),
  };
}

function parseContext(value: GameplayDeckValidationContext): GameplayDeckValidationContext {
  const context = contractRecord(value, ['kind', 'catalog'], ['ownership', 'referenceId', 'referenceDeck']);
  const catalog = parseGameplayDeckCatalog(context['catalog']);
  if (context['kind'] === 'owned') {
    const owned = contractRecord(value, ['kind', 'catalog', 'ownership']);
    const identities = new Set<string>();
    const ownership = contractArray(owned['ownership']).map(value => {
      const entry = contractRecord(value, ['cardId', 'quantity']);
      const cardId = contractIdentifier(entry['cardId']);
      if (identities.has(cardId)) throw new GameplayContractError();
      identities.add(cardId);
      return { cardId, quantity: contractInteger(entry['quantity'], 0) };
    });
    return { kind: 'owned', catalog, ownership };
  }
  if (context['kind'] === 'training-reference') {
    const training = contractRecord(value, ['kind', 'catalog', 'referenceId', 'referenceDeck']);
    return {
      kind: 'training-reference', catalog,
      referenceId: contractIdentifier(training['referenceId']),
      referenceDeck: parseGameplayDeckList(training['referenceDeck']),
    };
  }
  throw new GameplayContractError();
}

function validateComposition(
  deck: GameplayDeckList, catalog: GameplayDeckCatalog,
): readonly GameplayValidatedDeckEntry[] {
  if (deck.contentVersion !== catalog.contentVersion) throw new GameplayDeckValidationError('content-version');
  const quantities = new Map<string, GameplayDeckEntry>();
  let total = 0;
  for (const entry of deck.entries) {
    // Compare before adding so arbitrarily large safe-integer quantities cannot overflow the sum.
    if (entry.quantity > GAMEPLAY_RULES.deckSize - total) throw new GameplayDeckValidationError('size');
    total += entry.quantity;
    const previous = quantities.get(entry.cardId);
    if (previous && previous.revision !== entry.revision) throw new GameplayDeckValidationError('revision');
    quantities.set(entry.cardId, {
      cardId: entry.cardId, revision: entry.revision, quantity: (previous?.quantity ?? 0) + entry.quantity,
    });
  }
  if (total !== GAMEPLAY_RULES.deckSize) throw new GameplayDeckValidationError('size');
  const cards = new Map(catalog.cards.map(card => [card.definition.cardId, card]));
  // ASCII lexical ordering is deterministic across runtimes/locales; no match order is implied.
  return [...quantities.values()].sort((a, b) => a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0)
    .map(entry => {
      if (entry.quantity > GAMEPLAY_RULES.maxCopies) throw new GameplayDeckValidationError('copies');
      const card = cards.get(entry.cardId);
      if (!card) throw new GameplayDeckValidationError('unknown-card');
      if (!card.eligible) throw new GameplayDeckValidationError('ineligible-card');
      if (card.definition.revision !== entry.revision) throw new GameplayDeckValidationError('revision');
      return { definition: card.definition, quantity: entry.quantity };
    });
}

/**
 * Pure validation against trusted content and either owned quantities or an exact training reference.
 * Does not authenticate, read/write inventory, save decks, create instances, shuffle or start matches.
 */
export function validateGameplayDeck(
  value: unknown, trustedContext: GameplayDeckValidationContext,
): GameplayValidatedDeck {
  const deck = parseGameplayDeckList(value);
  const context = parseContext(trustedContext);
  const entries = validateComposition(deck, context.catalog);
  const common: GameplayValidatedDeckCommon = {
    rulesVersion: GAMEPLAY_RULES_VERSION, contentVersion: context.catalog.contentVersion, entries,
  };
  if (context.kind === 'owned') {
    const ownership = new Map(context.ownership.map(entry => [entry.cardId, entry.quantity]));
    if (entries.some(entry => (ownership.get(entry.definition.cardId) ?? 0) < entry.quantity)) {
      throw new GameplayDeckValidationError('ownership');
    }
    return { ...common, kind: 'owned' };
  }
  const reference = validateComposition(context.referenceDeck, context.catalog);
  if (entries.length !== reference.length || entries.some((entry, index) => {
    const expected = reference[index];
    return !expected || entry.definition.cardId !== expected.definition.cardId ||
      entry.definition.revision !== expected.definition.revision || entry.quantity !== expected.quantity;
  })) throw new GameplayDeckValidationError('reference-mismatch');
  return { ...common, kind: 'training-reference', referenceId: context.referenceId };
}
