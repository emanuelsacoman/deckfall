import { Timestamp } from '@angular/fire/firestore';
import type { CardCanvasData } from './card-canvas';

export const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export const CARD_STATUSES = ['draft', 'published', 'archived'] as const;
export type CardRarity = typeof CARD_RARITIES[number];
export type CardStatus = typeof CARD_STATUSES[number];

export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  common: 'Comum', rare: 'Rara', epic: 'Épica', legendary: 'Lendária'
};
export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  draft: 'Rascunho', published: 'Publicada', archived: 'Arquivada'
};

export const CARD_LIMITS = {
  name: 120, description: 5000, attributes: 8, attributeKey: 40,
  attributeLabel: 60, imageBytes: 5 * 1024 * 1024
} as const;
export const CARD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface CardAttribute {
  id?: string;
  key: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  icon?: string;
  color?: string;
}

export interface CardArt {
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface CardDataInput {
  name: string;
  description: string;
  rarity: CardRarity;
  status: CardStatus;
  attributes: CardAttribute[];
  setId: string | null;
  type?: string | null;
  subtype?: string | null;
  templateId?: string | null;
}

export interface CardInput extends CardDataInput {
  canvas?: CardCanvasData;
}

export interface Card extends CardInput {
  id: string;
  slug: string;
  art: CardArt | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CardSaveResult {
  id: string;
  warnings: string[];
}

export class CardOperationError extends Error {
  constructor(message: string, readonly cardId?: string) {
    super(message);
    this.name = 'CardOperationError';
  }
}

export const DEFAULT_CARD_ATTRIBUTES: readonly CardAttribute[] = [
  { key: 'attack', label: 'Ataque', value: 0 },
  { key: 'defense', label: 'Defesa', value: 0 },
  { key: 'speed', label: 'Velocidade', value: 0 },
  { key: 'magic', label: 'Magia', value: 0 }
];
