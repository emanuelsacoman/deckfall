import { Timestamp } from '@angular/fire/firestore';
import { PackOpenedCard, PlayerPack } from '../../../model/interfaces/Packs/player-pack';

/** Test fixtures for the isolated UI; never imported by application components. */
export const testPackCards: PackOpenedCard[] = [
  { cardId: 'cardA', name: 'Primeira carta', rarity: 'rare', quantity: 2 },
  { cardId: 'cardB', name: 'Segunda carta', rarity: 'legendary', quantity: 1 },
];
export function testPlayerPack(opened = false): PlayerPack {
  return {
    id: 'starter', packId: 'starter', definitionVersion: 1, source: 'starter',
    state: opened ? 'opened' : 'sealed', acquiredAt: Timestamp.fromMillis(1000),
    openedAt: opened ? Timestamp.fromMillis(2000) : null,
    ...(opened ? { revealedCards: testPackCards } : {}),
  };
}
export function packUiDeferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}
