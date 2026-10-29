import {
  GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckDuplicateRequest, parsePersonalDeckResource,
} from '../gameplay';
import type { PersonalDeckDraft, PersonalDeckResource } from '../gameplay';
import type { PersonalDeckCatalogReader } from './personal-deck-catalog';
import type { PersonalDeckClock } from './personal-deck-clock';
import {
  PersonalDeckAlreadyExistsError, PersonalDeckCapacityError, PersonalDeckClockError, PersonalDeckConflictError,
  PersonalDeckContentUnavailableError, PersonalDeckNotFoundError,
} from './personal-deck-errors';
import type { PersonalDeckStore } from './personal-deck-store';
import { validatePersonalDeckDraftReferences } from './validate-personal-deck-references';

/** Compare canonical intent, without reinterpreting gameplay or persistence timestamps. */
function sameDraft(left: PersonalDeckDraft, right: PersonalDeckDraft): boolean {
  return left.name === right.name && left.rulesVersion === right.rulesVersion &&
    left.contentVersion === right.contentVersion && left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const other = right.entries[index];
      return entry.cardId === other.cardId && entry.revision === other.revision && entry.quantity === other.quantity;
    });
}

/** Trusted UID/ports only; discovery and creation are separate transactions with no catalog I/O in callbacks. */
export async function duplicatePersonalDeck(
  uid: string, request: unknown, store: PersonalDeckStore,
  catalogReader: PersonalDeckCatalogReader, clock: PersonalDeckClock,
): Promise<PersonalDeckResource> {
  const parsed = parsePersonalDeckDuplicateRequest(request);
  const discovered = await store.runTransaction(uid, async transaction => {
    const source = await transaction.get(parsed.sourceDeckId);
    if (!source) throw new PersonalDeckNotFoundError();
    if (source.version !== parsed.expectedSourceVersion) throw new PersonalDeckConflictError();
    return parsePersonalDeckResource(source);
  });

  const catalog = await catalogReader.get(discovered.draft.contentVersion);
  if (catalog === null) throw new PersonalDeckContentUnavailableError();
  const draft = validatePersonalDeckDraftReferences(discovered.draft, catalog);
  let timestamp: string | undefined;
  let clockRead = false;

  return store.runTransaction(uid, async transaction => {
    const source = await transaction.get(parsed.sourceDeckId);
    if (!source) throw new PersonalDeckNotFoundError();
    if (source.version !== parsed.expectedSourceVersion) throw new PersonalDeckConflictError();
    const current = parsePersonalDeckResource(source);
    // A same-version anomaly must not copy intent different from the one checked against historical content.
    if (!sameDraft(current.draft, draft)) throw new PersonalDeckConflictError();

    const destination = await transaction.get(parsed.newDeckId);
    if (destination) throw new PersonalDeckAlreadyExistsError();
    const resources = await transaction.list(PERSONAL_DECK_LIMITS.maxDecks);
    if (resources.length >= PERSONAL_DECK_LIMITS.maxDecks) throw new PersonalDeckCapacityError();

    if (!clockRead) {
      clockRead = true;
      try { timestamp = clock.now(); } catch { throw new PersonalDeckClockError(); }
    }

    let created: PersonalDeckResource;
    try {
      created = parsePersonalDeckResource({
        id: parsed.newDeckId, version: 1, draft, createdAt: timestamp, updatedAt: timestamp,
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
