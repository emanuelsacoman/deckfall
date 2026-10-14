import {
  authenticatedUid, BootstrapStore, fail, isRecord, PlayerBootstrapError, PlayerRequest, publishedSnapshot,
  STARTER_PACK_INSTANCE_ID, STARTER_PACK_PATH, validateDefinition, validatePack, validatePackAudit, validatePlayer, validateUser, validateVersion
} from './pack-domain';
export type { BootstrapStore, BootstrapTransaction, PlayerProfile } from './pack-domain';
export { PlayerBootstrapError } from './pack-domain';

export type InitializePlayerRequest = PlayerRequest;
export interface InitializePlayerResult {
  initialized: true;
  alreadyInitialized: boolean;
  starterPackGranted: boolean;
  starterPackInstanceId: string;
}

export async function initializePlayerOperation(request: InitializePlayerRequest, store: BootstrapStore): Promise<InitializePlayerResult> {
  const uid = authenticatedUid(request);
  if (request.data != null && (!isRecord(request.data) || Object.keys(request.data).length !== 0)) {
    throw new PlayerBootstrapError('invalid-argument', 'initializePlayer não aceita parâmetros.');
  }
  return store.runTransaction(async transaction => {
    const playerPath = `players/${uid}`;
    const packPath = `users/${uid}/packs/${STARTER_PACK_INSTANCE_ID}`;
    const [user, player, existingPack] = await Promise.all([
      transaction.get(`users/${uid}`), transaction.get(playerPath), transaction.get(packPath)
    ]);
    const latest = store.currentTimestamp();
    validateUser(user);
    const profile = player ? validatePlayer(player, latest) : null;
    if (profile?.starterGrantedAt) {
      if (!existingPack) fail('O Starter Pack registrado não existe. Não há reconcessão automática.');
      validatePackAudit(profile, validatePack(existingPack, latest), STARTER_PACK_INSTANCE_ID);
      return { initialized: true, alreadyInitialized: true, starterPackGranted: false, starterPackInstanceId: STARTER_PACK_INSTANCE_ID };
    }
    if (existingPack) fail('Já existe um Starter Pack sem um registro de concessão válido.');
    const definitionData = await transaction.get(STARTER_PACK_PATH);
    const definition = validateDefinition(definitionData, store.currentTimestamp());
    if (!definition.active) fail('O Starter Pack está desativado para novos jogadores.');
    const versionData = await transaction.get(`${STARTER_PACK_PATH}/versions/${definition.currentVersion}`);
    const version = validateVersion(versionData, definition.currentVersion, store.currentTimestamp());
    await Promise.all(version.cards.map(async item => {
      publishedSnapshot(item.cardId, item.quantity, await transaction.get(`cards/${item.cardId}`));
    }));

    // Bootstrap grants a sealed instance only. It never reads or writes collection.
    const now = store.serverTimestamp();
    transaction.set(packPath, {
      packId: 'starter', definitionVersion: version.version, source: 'starter', state: 'sealed', acquiredAt: now, openedAt: null
    });
    transaction.set(playerPath, {
      createdAt: profile?.createdAt ?? now, updatedAt: now, starterGrantedAt: now,
      starterVersion: version.version, starterPackInstanceId: STARTER_PACK_INSTANCE_ID
    });
    return { initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: STARTER_PACK_INSTANCE_ID };
  });
}
