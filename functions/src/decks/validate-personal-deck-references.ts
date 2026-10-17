import { parseGameplayDeckCatalog, parsePersonalDeckDraft } from '../gameplay';
import type { GameplayDeckCatalog, PersonalDeckDraft } from '../gameplay';
import { PersonalDeckContentError } from './personal-deck-errors';

/**
 * Recognizes a partial personal intent against its already resolved trusted historical catalog.
 * No I/O, ownership, editorial publication, eligibility decision or authority to play.
 */
export function validatePersonalDeckDraftReferences(
  value: unknown, trustedCatalog: GameplayDeckCatalog,
): PersonalDeckDraft {
  const draft = parsePersonalDeckDraft(value);
  // Reuse the existing deep parser: corrupt trusted content must never become unknown-card.
  // Both parsers require the same supported rulesVersion, without coercion or migration.
  const catalog = parseGameplayDeckCatalog(trustedCatalog);
  if (draft.contentVersion !== catalog.contentVersion) throw new PersonalDeckContentError('content-version');

  const definitions = new Map(catalog.cards.map(card => [card.definition.cardId, card.definition]));
  for (const entry of draft.entries) {
    const definition = definitions.get(entry.cardId);
    if (!definition) throw new PersonalDeckContentError('unknown-card');
    if (entry.revision !== definition.revision) throw new PersonalDeckContentError('revision');
  }
  return draft;
}
