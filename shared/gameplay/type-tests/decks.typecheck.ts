import { parseGameplayDeckList, validateGameplayDeck } from '../src';
import type {
  GameplayDeckCatalog, GameplayDeckList, GameplayDeckValidationContext,
  GameplayDeckValidationReason, GameplayValidatedDeck,
} from '../src';

declare const catalog: GameplayDeckCatalog;
declare const result: GameplayValidatedDeck;

const deck: GameplayDeckList = {
  rulesVersion: '0.1', contentVersion: 'content-v1',
  entries: [{ cardId: 'card-1', revision: 1, quantity: 2 }],
};
const owned: GameplayDeckValidationContext = {
  kind: 'owned', catalog, ownership: [{ cardId: 'card-1', quantity: 2 }],
};
const training: GameplayDeckValidationContext = {
  kind: 'training-reference', catalog, referenceId: 'reference-1', referenceDeck: deck,
};
const parsed: GameplayDeckList = parseGameplayDeckList(deck);
const validated: GameplayValidatedDeck = validateGameplayDeck(deck, owned);
const reason: GameplayDeckValidationReason = 'ownership';

if (result.kind === 'training-reference') {
  const referenceId: string = result.referenceId;
  void referenceId;
} else {
  // @ts-expect-error An owned deck does not claim a trusted training reference.
  result.referenceId;
}

// @ts-expect-error Deck lists are immutable composition intents.
deck.entries.push({ cardId: 'card-2', revision: 1, quantity: 1 });
// @ts-expect-error Individual composition entries are immutable.
deck.entries[0]!.quantity = 1;
// @ts-expect-error The content ruleset must match the approved v0.1 literal.
const futureRules: GameplayDeckList = { ...deck, rulesVersion: '0.2' };
// @ts-expect-error Canonical revisions are mandatory for every selected identity.
const missingRevision: GameplayDeckList = { ...deck, entries: [{ cardId: 'card-1', quantity: 2 }] };
// @ts-expect-error Client composition does not carry a trusted card profile.
const forgedDefinition: GameplayDeckList = { ...deck, entries: [{ cardId: 'card-1', revision: 1, quantity: 2, definition: {} }] };
// @ts-expect-error Inventory authority is separate from a deck request.
const forgedInventory: GameplayDeckList = { ...deck, ownership: [] };
// @ts-expect-error Owned context requires explicitly supplied trusted inventory.
const missingOwnership: GameplayDeckValidationContext = { kind: 'owned', catalog };
// @ts-expect-error Training mode requires a complete trusted reference, not a boolean bypass.
const bypass: GameplayDeckValidationContext = { kind: 'training-reference', catalog, referenceId: 'reference-1', bypassOwnership: true };
// @ts-expect-error Owned and training-reference authorities are distinct contexts.
const mixedContext: GameplayDeckValidationContext = { kind: 'owned', catalog, ownership: [], referenceDeck: deck };
// @ts-expect-error Deck validation cannot mint inventory or battle instances.
validated.instances;
// @ts-expect-error Validated card definitions remain readonly.
validated.entries[0]!.definition.cost = 0;
// @ts-expect-error Business reasons remain a closed vocabulary.
const arbitraryReason: GameplayDeckValidationReason = 'grant-cards';

void [deck, owned, training, parsed, validated, reason, futureRules, missingRevision,
  forgedDefinition, forgedInventory, missingOwnership, bypass, mixedContext, arbitraryReason];
