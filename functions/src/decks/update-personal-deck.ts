import { GameplayContractError, parsePersonalDeckResource, parsePersonalDeckUpdateRequest } from '../gameplay';
import type { PersonalDeckDraft, PersonalDeckResource } from '../gameplay';
import type { PersonalDeckCatalogReader } from './personal-deck-catalog';
import type { PersonalDeckClock } from './personal-deck-clock';
import {
  PersonalDeckClockError, PersonalDeckConflictError, PersonalDeckContentUnavailableError,
  PersonalDeckNotFoundError, PersonalDeckVersionExhaustedError,
} from './personal-deck-errors';
import type { PersonalDeckStore } from './personal-deck-store';
import { validatePersonalDeckDraftReferences } from './validate-personal-deck-references';

/** Both drafts already have the canonical shape/order provided by their existing parsers. */
function sameDraft(left: PersonalDeckDraft, right: PersonalDeckDraft): boolean {
  return left.name === right.name && left.rulesVersion === right.rulesVersion &&
    left.contentVersion === right.contentVersion && left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const other = right.entries[index];
      return entry.cardId === other.cardId && entry.revision === other.revision && entry.quantity === other.quantity;
    });
}

/** Trusted UID/dependencies only; saves intent without authenticating or admitting a match. */
export async function updatePersonalDeck(
  uid: string, request: unknown, store: PersonalDeckStore,
  catalogReader: PersonalDeckCatalogReader, clock: PersonalDeckClock,
): Promise<PersonalDeckResource> {
  const parsed = parsePersonalDeckUpdateRequest(request);
  // Historical content is immutable: resolve/validate once before the personal-resource transaction.
  const catalog = await catalogReader.get(parsed.draft.contentVersion);
  if (catalog === null) throw new PersonalDeckContentUnavailableError();
  const draft = validatePersonalDeckDraftReferences(parsed.draft, catalog);
  let timestamp: string | undefined;
  let clockRead = false;

  return store.runTransaction(uid, async transaction => {
    const resource = await transaction.get(parsed.deckId);
    if (!resource) throw new PersonalDeckNotFoundError();
    if (resource.version !== parsed.expectedVersion) throw new PersonalDeckConflictError();
    if (sameDraft(draft, resource.draft)) return parsePersonalDeckResource(resource);
    if (resource.version === Number.MAX_SAFE_INTEGER) throw new PersonalDeckVersionExhaustedError();

    // Same policy as rename: at most one trusted instant per logical call, reused on replays.
    if (!clockRead) {
      clockRead = true;
      try { timestamp = clock.now(); } catch { throw new PersonalDeckClockError(); }
    }

    let updated: PersonalDeckResource;
    try {
      updated = parsePersonalDeckResource({
        ...resource, draft, version: resource.version + 1, updatedAt: timestamp,
      });
    } catch (error: unknown) {
      if (error instanceof GameplayContractError) throw new PersonalDeckClockError();
      throw error;
    }
    if (updated.updatedAt < resource.updatedAt) throw new PersonalDeckClockError();

    const result = parsePersonalDeckResource(updated);
    transaction.replace(updated);
    return result;
  });
}
