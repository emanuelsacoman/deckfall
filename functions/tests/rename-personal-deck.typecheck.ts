import type { GameplayContractError, PersonalDeckRenameRequest, PersonalDeckResource } from '../src/gameplay';
import type { PersonalDeckClock } from '../src/decks/personal-deck-clock';
import {
  PersonalDeckClockError, PersonalDeckDomainError, PersonalDeckVersionExhaustedError,
} from '../src/decks/personal-deck-errors';
import type { PersonalDeckDomainErrorCode } from '../src/decks/personal-deck-errors';
import type { PersonalDeckStore } from '../src/decks/personal-deck-store';
import { renamePersonalDeck } from '../src/decks/rename-personal-deck';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const trustedUid: string;
declare const request: unknown;
declare const store: PersonalDeckStore;
declare const clock: PersonalDeckClock;

const signature: Assert<Equal<typeof renamePersonalDeck,
  (uid: string, request: unknown, store: PersonalDeckStore, clock: PersonalDeckClock) => Promise<PersonalDeckResource>>> = true;
const clockKeys: Assert<Equal<keyof PersonalDeckClock, 'now'>> = true;
const clockShape: Assert<Equal<PersonalDeckClock['now'], () => string>> = true;
const trustedClock: PersonalDeckClock = { now: () => '2026-10-17T12:00:00.000Z' };
const result: Promise<PersonalDeckResource> = renamePersonalDeck(trustedUid, request, store, clock);
const renameRequest: PersonalDeckRenameRequest = { deckId: 'deck-one', expectedVersion: 1, name: 'Renamed' };

// @ts-expect-error The trusted UID remains a separate required backend argument.
renamePersonalDeck(request, store, clock);
// @ts-expect-error Client-controlled unknown identity cannot satisfy the trusted UID boundary.
renamePersonalDeck(request, request, store, clock);
// @ts-expect-error The store port is mandatory and cannot be replaced by a clock.
renamePersonalDeck(trustedUid, request, clock, clock);
// @ts-expect-error Trusted time is an explicit required dependency.
renamePersonalDeck(trustedUid, request, store);
// @ts-expect-error The clock must provide its now operation.
renamePersonalDeck(trustedUid, request, store, {});
// @ts-expect-error Date is not the serializable UTC string representation of the clock port.
const dateClock: PersonalDeckClock = { now: () => new Date() };
// @ts-expect-error Numeric epoch time is not the clock representation.
const numericClock: PersonalDeckClock = { now: () => 0 };
// @ts-expect-error The client rename contract never chooses trusted ownership.
const clientUid: PersonalDeckRenameRequest = { ...renameRequest, uid: trustedUid };
// @ts-expect-error Authoritative document version is distinct from expectedVersion.
const clientVersion: PersonalDeckRenameRequest = { ...renameRequest, version: 2 };
// @ts-expect-error A rename request carries no authoritative timestamp.
const clientTime: PersonalDeckRenameRequest = { ...renameRequest, updatedAt: trustedClock.now() };

async function readonlyResultBoundary(): Promise<void> {
  const renamed = await renamePersonalDeck(trustedUid, request, store, clock);
  // @ts-expect-error Authoritative metadata remains readonly in the returned projection.
  renamed.version = 2;
  // @ts-expect-error Nested intent remains readonly at the domain boundary.
  renamed.draft.name = 'Changed';
  // @ts-expect-error Card references retain the shared readonly composition contract.
  renamed.draft.entries.push({ cardId: 'card-one', revision: 1, quantity: 1 });
}

const versionExhausted = new PersonalDeckVersionExhaustedError();
const invalidTime = new PersonalDeckClockError();
const versionDomainError: PersonalDeckDomainError = versionExhausted;
const clockDomainError: PersonalDeckDomainError = invalidTime;
const expectedCodes: readonly PersonalDeckDomainErrorCode[] = [
  'personal-deck-version-exhausted', 'personal-deck-invalid-time',
];
const diagnosticStack: string | undefined = versionExhausted.stack;
// @ts-expect-error Domain failures remain distinct from malformed shared contracts.
const versionAsContract: GameplayContractError = versionExhausted;
// @ts-expect-error Clock failure also remains a domain error, not a client parser error.
const timeAsContract: GameplayContractError = invalidTime;
// @ts-expect-error No version payload or database context is accepted by the error constructor.
new PersonalDeckVersionExhaustedError({ currentVersion: Number.MAX_SAFE_INTEGER });
// @ts-expect-error Clock errors never accept or expose the thrown clock cause as a constructor payload.
new PersonalDeckClockError(new Error('clock details'));
// @ts-expect-error Stable domain codes remain readonly.
invalidTime.code = 'personal-deck-conflict';
// @ts-expect-error Clock failures add no contextual public payload.
invalidTime.uid;

void [signature, clockKeys, clockShape, trustedClock, result, renameRequest, dateClock, numericClock, clientUid,
  clientVersion, clientTime, readonlyResultBoundary, versionDomainError, clockDomainError, expectedCodes,
  diagnosticStack, versionAsContract, timeAsContract];
