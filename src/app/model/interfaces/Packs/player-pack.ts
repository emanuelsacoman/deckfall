import { Timestamp } from '@angular/fire/firestore';
import { CardRarity } from '../Cards/card';

export const PACK_MAX_CARDS = 25;
export const PACK_MAX_VERSION = 1_000_000;
export const PACK_INSTANCE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export interface PackDefinition {
  name: string;
  description: string;
  active: boolean;
  currentVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PackDefinitionVersion {
  version: number;
  cards: { cardId: string; quantity: number }[];
  createdAt: Timestamp;
}

/** A small persisted receipt; the card document remains the metadata source. */
export interface PackOpenedCard {
  cardId: string;
  name: string;
  rarity: CardRarity;
  quantity: number;
}

export interface PlayerPack {
  /** Client-only document ID; identity and ownership come from the path. */
  id: string;
  packId: string;
  definitionVersion: number;
  source: 'starter';
  state: 'sealed' | 'opened';
  acquiredAt: Timestamp;
  openedAt: Timestamp | null;
  /** Absent while sealed; only the trusted backend persists an opening result. */
  revealedCards?: PackOpenedCard[];
}

export interface PackOpenResult {
  packInstanceId: string;
  alreadyOpened: boolean;
  revealedCards: PackOpenedCard[];
}
