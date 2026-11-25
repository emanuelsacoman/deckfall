import { GameplayContractError, parsePersonalDeckDeleteRequest } from '../gameplay';

/** Existing persistence boundary; Auth UIDs are not restricted to gameplay's ASCII identifiers. */
export function personalDeckOwnerUid(uid: unknown): string {
  if (typeof uid !== 'string' || !uid || uid.includes('/') || uid === '.' || uid === '..' ||
      /^__.*__$/.test(uid) || Buffer.byteLength(uid, 'utf8') > 1500 || Buffer.from(uid, 'utf8').toString('utf8') !== uid) {
    throw new GameplayContractError();
  }
  return uid;
}

export function personalDeckId(deckId: unknown): string {
  // Reuse the shared identifier parser without introducing another version or ID policy.
  const parsed = parsePersonalDeckDeleteRequest({ deckId, expectedVersion: 1 });
  if (/^__.*__$/.test(parsed.deckId)) throw new GameplayContractError();
  return parsed.deckId;
}
