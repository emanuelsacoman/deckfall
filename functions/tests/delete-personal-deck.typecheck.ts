import { deletePersonalDeck } from '../src/decks/delete-personal-deck';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';

declare const trustedUid: string;
declare const request: unknown;
declare const store: PersonalDeckStore;

const result: Promise<void> = deletePersonalDeck(trustedUid, request, store);
// @ts-expect-error The trusted backend UID is a separate required argument.
deletePersonalDeck(request, store);
// @ts-expect-error An unknown client identity is not a trusted backend UID.
deletePersonalDeck(request, request, store);
// @ts-expect-error Persistence is injected through the store port.
deletePersonalDeck(trustedUid, request, {});
// @ts-expect-error Successful deletion does not expose the removed resource or a receipt.
const removedResource: Promise<{ id: string }> = deletePersonalDeck(trustedUid, request, store);

void [result, removedResource];
