import {
  authenticatedUid, BootstrapStore, fail, hasFields, identifier, isRecord, PackOpenedCard, PlayerBootstrapError, PlayerRequest,
  PLAYER_COLLECTION_MAX_QUANTITY, publishedSnapshot, STARTER_PACK_PATH, validateDefinition, validateOwnedEntry,
  validatePack, validatePackAudit, validatePlayer, validateUser, validateVersion
} from './pack-domain';

export type OpenPackRequest = PlayerRequest;
export interface OpenPackResult { packInstanceId: string; alreadyOpened: boolean; revealedCards: PackOpenedCard[]; }

export async function openPackOperation(request: OpenPackRequest, store: BootstrapStore): Promise<OpenPackResult> {
  const uid = authenticatedUid(request);
  if (!isRecord(request.data) || !hasFields(request.data, ['packInstanceId']) ||
      typeof request.data['packInstanceId'] !== 'string' || !identifier.test(request.data['packInstanceId'])) {
    throw new PlayerBootstrapError('invalid-argument', 'openPack aceita somente um packInstanceId válido.');
  }
  const packInstanceId = request.data['packInstanceId'];
  return store.runTransaction(async transaction => {
    // The client cannot select a UID: even another user's instance ID resolves only inside this account.
    const packPath = `users/${uid}/packs/${packInstanceId}`;
    const [user, player, document] = await Promise.all([
      transaction.get(`users/${uid}`), transaction.get(`players/${uid}`), transaction.get(packPath)
    ]);
    const latest = store.currentTimestamp();
    validateUser(user);
    if (!player) fail('Prepare sua jornada antes de abrir um pacote.');
    const profile = validatePlayer(player, latest);
    if (!document) throw new PlayerBootstrapError('not-found', 'Este pacote não existe na sua conta.');
    const pack = validatePack(document, latest);
    validatePackAudit(profile, pack, packInstanceId);
    // Persisted history survives later definition/card removal and never grants again.
    if (pack.state === 'opened') return { packInstanceId, alreadyOpened: true, revealedCards: pack.revealedCards };

    // active/currentVersion control new grants only; opening always uses the pinned version.
    const definition = await transaction.get(STARTER_PACK_PATH);
    validateDefinition(definition, store.currentTimestamp());
    const versionData = await transaction.get(`${STARTER_PACK_PATH}/versions/${pack.definitionVersion}`);
    const version = validateVersion(versionData, pack.definitionVersion, store.currentTimestamp());
    const entries = await Promise.all(version.cards.map(async item => {
      const entryPath = `users/${uid}/collection/${item.cardId}`;
      const [card, existing] = await Promise.all([transaction.get(`cards/${item.cardId}`), transaction.get(entryPath)]);
      const snapshot = publishedSnapshot(item.cardId, item.quantity, card);
      const owned = existing ? validateOwnedEntry(existing, store.currentTimestamp()) : null;
      const quantity = (owned?.quantity ?? 0) + item.quantity;
      if (quantity > PLAYER_COLLECTION_MAX_QUANTITY) fail('A abertura ultrapassa o limite de quantidade de uma carta. O pacote permanece lacrado.');
      return { entryPath, quantity, firstAcquiredAt: owned?.firstAcquiredAt, snapshot };
    }));
    const revealedCards = entries.map(entry => entry.snapshot);
    // All reads/validation precede all writes; acquisition and open marker share one commit.
    const now = store.serverTimestamp();
    for (const entry of entries) transaction.set(entry.entryPath, {
      quantity: entry.quantity, firstAcquiredAt: entry.firstAcquiredAt ?? now, lastAcquiredAt: now
    });
    transaction.set(packPath, {
      packId: pack.packId, definitionVersion: pack.definitionVersion, source: pack.source, acquiredAt: pack.acquiredAt,
      state: 'opened', openedAt: now, revealedCards
    });
    return { packInstanceId, alreadyOpened: false, revealedCards };
  });
}
