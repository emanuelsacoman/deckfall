import { contractRecord, GameplayContractError } from './contract-validation';
import { parseGameplayDeckList, validateGameplayDeck } from './decks';
import type { GameplayDeckValidationContext, GameplayValidatedDeck } from './decks';

/**
 * Checks the saved composition's exact references against the caller's trusted active catalog.
 * The caller supplies real ownership and active content; this does not authenticate, fetch or persist.
 */
export function validateGameplayDeckAgainstActiveCatalog(
  value: unknown,
  trustedContext: Extract<GameplayDeckValidationContext, { readonly kind: 'owned' }>,
): GameplayValidatedDeck {
  const saved = parseGameplayDeckList(value);
  const context = contractRecord(trustedContext, ['kind', 'catalog', 'ownership']);
  if (context['kind'] !== 'owned') throw new GameplayContractError();
  // Inspect data properties safely before reading the version; Deck Rules validates the full context.
  const catalog = contractRecord(context['catalog'], ['rulesVersion', 'contentVersion', 'cards']);
  return validateGameplayDeck({
    rulesVersion: saved.rulesVersion,
    contentVersion: catalog['contentVersion'],
    entries: saved.entries,
  }, trustedContext);
}
