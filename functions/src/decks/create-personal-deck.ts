import {
  GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckCreateRequest, parsePersonalDeckResource,
} from '../gameplay';
import type { PersonalDeckResource } from '../gameplay';
import type { PersonalDeckCatalogReader } from './personal-deck-catalog';
import type { PersonalDeckClock } from './personal-deck-clock';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckClockError, PersonalDeckContentUnavailableError,
} from './personal-deck-errors';
import type { PersonalDeckStore } from './personal-deck-store';
import { validatePersonalDeckDraftReferences } from './validate-personal-deck-references';

/** Trusted UID/dependencies only; the future adapter must enforce absence and capacity atomically. */
export async function createPersonalDeck(
  uid: string, request: unknown, store: PersonalDeckStore,
  catalogReader: PersonalDeckCatalogReader, clock: PersonalDeckClock,
): Promise<PersonalDeckResource> {
  const parsed = parsePersonalDeckCreateRequest(request);
  const catalog = await catalogReader.get(parsed.draft.contentVersion);
  if (catalog === null) throw new PersonalDeckContentUnavailableError();
  const draft = validatePersonalDeckDraftReferences(parsed.draft, catalog);
  let timestamp: string | undefined;
  let clockRead = false;

  return store.runTransaction(uid, async transaction => {
    const existing = await transaction.get(parsed.deckId);
    if (existing) throw new PersonalDeckAlreadyExistsError();
    const resources = await transaction.list(PERSONAL_DECK_LIMITS.maxDecks);
    if (resources.length >= PERSONAL_DECK_LIMITS.maxDecks) throw new PersonalDeckCapacityError();

    // Resolve lazily after absence/capacity, retaining one instant across callback replays.
    if (!clockRead) {
      clockRead = true;
      try { timestamp = clock.now(); } catch { throw new PersonalDeckClockError(); }
    }

    let created: PersonalDeckResource;
    try {
      created = parsePersonalDeckResource({
        id: parsed.deckId, version: 1, draft, createdAt: timestamp, updatedAt: timestamp,
      });
    } catch (error: unknown) {
      if (error instanceof GameplayContractError) throw new PersonalDeckClockError();
      throw error;
    }

    const result = parsePersonalDeckResource(created);
    transaction.create(created);
    return result;
  });
}
