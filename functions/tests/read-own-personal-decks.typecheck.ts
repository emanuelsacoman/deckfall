import type { PersonalDeckResource } from '../src/gameplay';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import { getOwnPersonalDeck, listOwnPersonalDecks } from '../src/decks/read-own-personal-decks';
import type {
  GetOwnPersonalDeckRequest, ListOwnPersonalDecksRequest, PersonalDeckProfileReader, PersonalDeckReadContext,
} from '../src/decks/read-own-personal-decks';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const store: PersonalDeckStore;
declare const profiles: PersonalDeckProfileReader;
declare const context: PersonalDeckReadContext;
const getShape: Assert<Equal<Parameters<typeof getOwnPersonalDeck>,
  [PersonalDeckReadContext, unknown, PersonalDeckStore, PersonalDeckProfileReader]>> = true;
const listShape: Assert<Equal<Awaited<ReturnType<typeof listOwnPersonalDecks>>, readonly PersonalDeckResource[]>> = true;
const request: GetOwnPersonalDeckRequest = { deckId: 'saved' };
const listRequest: ListOwnPersonalDecksRequest = {};
const result: Promise<PersonalDeckResource | null> = getOwnPersonalDeck(context, request, store, profiles);
const listing = listOwnPersonalDecks(context, listRequest, store, profiles);
// @ts-expect-error A raw UID is not an authenticated-context projection.
getOwnPersonalDeck('alice', request, store, profiles);
// @ts-expect-error No cross-account ownership in the request contract.
const crossAccount: GetOwnPersonalDeckRequest = { deckId: 'saved', uid: 'bob' };
// @ts-expect-error List accepts no owner, filters or client-selected limit.
const crossList: ListOwnPersonalDecksRequest = { uid: 'bob' };
// @ts-expect-error Context cannot be constructed from a data/owner payload.
const payloadIdentity: PersonalDeckReadContext = { uid: 'alice' };
// @ts-expect-error Profile port has no write capability.
profiles.set('alice', {});
async function readonlyResults(): Promise<void> {
  const resources = await listing;
  // @ts-expect-error The list is readonly.
  resources.push(resources[0]);
  // @ts-expect-error Resource metadata remains readonly.
  resources[0].version = 4;
  // @ts-expect-error Nested saved entries remain readonly.
  resources[0].draft.entries[0].revision = 2;
}
void [getShape, listShape, result, readonlyResults, crossAccount, crossList, payloadIdentity];
