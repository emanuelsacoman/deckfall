import { GameplayContractError, PERSONAL_DECK_LIMITS, parsePersonalDeckResource } from '../gameplay';
import type { PersonalDeckResource } from '../gameplay';
import { hasFields, isRecord, PlayerBootstrapError, validateUser } from '../pack-domain';
import type { PlayerRequest } from '../pack-domain';
import { personalDeckId, personalDeckOwnerUid } from './personal-deck-identifiers';
import type { PersonalDeckStore } from './personal-deck-store';

/** A caller projects this from an already authenticated context, never from client data.
 * This type and these operations do not verify Firebase credentials or make a forged object trusted.
 */
export interface PersonalDeckReadContext {
  readonly auth?: Readonly<NonNullable<PlayerRequest['auth']>> | null;
}

/** Trusted users/{uid} lookup only; no arbitrary paths, writes or Firebase implementation here. */
export interface PersonalDeckProfileReader {
  get(uid: string): Promise<Readonly<Record<string, unknown>> | null>;
}

export interface GetOwnPersonalDeckRequest { readonly deckId: string; }
export type ListOwnPersonalDecksRequest = Readonly<Record<string, never>>;

function dataRecord(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!isRecord(value) || !hasFields(value, required, optional) || Object.getOwnPropertySymbols(value).length ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(field => field.get || field.set || !field.enumerable)) {
    throw new GameplayContractError();
  }
  return value;
}

function trustedUid(context: PersonalDeckReadContext): string {
  if (context === null || context === undefined) throw new PlayerBootstrapError('unauthenticated', 'Entre em uma conta para continuar.');
  try {
    const projected = dataRecord(context, [], ['auth']);
    if (projected['auth'] === null || projected['auth'] === undefined) {
      throw new PlayerBootstrapError('unauthenticated', 'Entre em uma conta para continuar.');
    }
    return personalDeckOwnerUid(dataRecord(projected['auth'], ['uid'])['uid']);
  } catch (error: unknown) {
    if (error instanceof GameplayContractError) {
      throw new PlayerBootstrapError('permission-denied', 'A identidade autenticada não possui um UID válido.');
    }
    throw error;
  }
}

async function authorize(uid: string, profiles: PersonalDeckProfileReader): Promise<void> {
  const profile = await profiles.get(uid);
  // Reuse the existing account policy without invoking accessors or trusting inherited roles.
  const fields = isRecord(profile) ? Object.getOwnPropertyDescriptors(profile) : {};
  const role = fields['role'];
  const roleId = fields['roleId'];
  validateUser(role && roleId && role.enumerable && roleId.enumerable && 'value' in role && 'value' in roleId
    ? { role: role.value, roleId: roleId.value } : null);
}

/** Internal own read only. Firebase Auth verification remains the trusted caller's responsibility. */
export async function getOwnPersonalDeck(
  context: PersonalDeckReadContext, request: unknown, store: PersonalDeckStore, profiles: PersonalDeckProfileReader,
): Promise<PersonalDeckResource | null> {
  const uid = trustedUid(context);
  const deckId = personalDeckId(dataRecord(request, ['deckId'])['deckId']);
  await authorize(uid, profiles);
  return store.runTransaction(uid, async transaction => {
    const value = await transaction.get(deckId);
    if (value === null) return null;
    const resource = parsePersonalDeckResource(value);
    if (resource.id !== deckId) throw new GameplayContractError();
    return resource;
  });
}

/** Internal bounded own list; no catalog lookup, admission, writes or administrative exception. */
export async function listOwnPersonalDecks(
  context: PersonalDeckReadContext, request: unknown, store: PersonalDeckStore, profiles: PersonalDeckProfileReader,
): Promise<readonly PersonalDeckResource[]> {
  const uid = trustedUid(context);
  dataRecord(request, []);
  await authorize(uid, profiles);
  return store.runTransaction(uid, async transaction => {
    const values = await transaction.list(PERSONAL_DECK_LIMITS.maxDecks);
    if (!Array.isArray(values) || values.length > PERSONAL_DECK_LIMITS.maxDecks ||
        Object.keys(values).length !== values.length) throw new GameplayContractError();
    const seen = new Set<string>();
    const resources: PersonalDeckResource[] = [];
    for (let index = 0; index < values.length; index++) {
      if (!Object.hasOwn(values, index)) throw new GameplayContractError();
      const resource = parsePersonalDeckResource(values[index]);
      if (seen.has(resource.id)) throw new GameplayContractError();
      seen.add(resource.id);
      resources.push(resource);
    }
    return resources.sort((left, right) => left.updatedAt === right.updatedAt
      ? left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      : left.updatedAt > right.updatedAt ? -1 : 1);
  });
}
