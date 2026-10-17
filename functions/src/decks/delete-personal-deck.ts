import { parsePersonalDeckDeleteRequest } from '../gameplay';
import { PersonalDeckConflictError, PersonalDeckNotFoundError } from './personal-deck-errors';
import type { PersonalDeckStore } from './personal-deck-store';

/** uid is already trusted by the caller; this domain operation neither authenticates nor exposes transport. */
export async function deletePersonalDeck(uid: string, request: unknown, store: PersonalDeckStore): Promise<void> {
  const { deckId, expectedVersion } = parsePersonalDeckDeleteRequest(request);
  await store.runTransaction(uid, async transaction => {
    const resource = await transaction.get(deckId);
    if (!resource) throw new PersonalDeckNotFoundError();
    if (resource.version !== expectedVersion) throw new PersonalDeckConflictError();
    transaction.delete(deckId);
  });
}
