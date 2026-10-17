import { GameplayContractError, parsePersonalDeckRenameRequest, parsePersonalDeckResource } from '../gameplay';
import type { PersonalDeckResource } from '../gameplay';
import type { PersonalDeckClock } from './personal-deck-clock';
import {
  PersonalDeckClockError, PersonalDeckConflictError, PersonalDeckNotFoundError, PersonalDeckVersionExhaustedError,
} from './personal-deck-errors';
import type { PersonalDeckStore } from './personal-deck-store';

/** uid and clock are trusted backend dependencies; this operation does not authenticate or expose transport. */
export async function renamePersonalDeck(
  uid: string, request: unknown, store: PersonalDeckStore, clock: PersonalDeckClock,
): Promise<PersonalDeckResource> {
  const { deckId, expectedVersion, name } = parsePersonalDeckRenameRequest(request);
  let timestamp: string | undefined;
  let clockRead = false;

  return store.runTransaction(uid, async transaction => {
    const resource = await transaction.get(deckId);
    if (!resource) throw new PersonalDeckNotFoundError();
    if (resource.version !== expectedVersion) throw new PersonalDeckConflictError();
    if (resource.draft.name === name) return parsePersonalDeckResource(resource);
    if (resource.version === Number.MAX_SAFE_INTEGER) throw new PersonalDeckVersionExhaustedError();

    // Stable per logical call, including replays; never advance the clock to accommodate a retry.
    if (!clockRead) {
      clockRead = true;
      try { timestamp = clock.now(); } catch { throw new PersonalDeckClockError(); }
    }

    let updated: PersonalDeckResource;
    try {
      updated = parsePersonalDeckResource({
        ...resource, version: resource.version + 1, updatedAt: timestamp,
        draft: { ...resource.draft, name },
      });
    } catch (error: unknown) {
      if (error instanceof GameplayContractError) throw new PersonalDeckClockError();
      throw error;
    }
    if (updated.updatedAt < resource.updatedAt) throw new PersonalDeckClockError();

    // The caller must not retain aliases to the resource queued for persistence.
    const result = parsePersonalDeckResource(updated);
    transaction.replace(updated);
    return result;
  });
}
