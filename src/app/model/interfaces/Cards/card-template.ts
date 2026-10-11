import { Timestamp } from '@angular/fire/firestore';
import type { CardAttribute } from './card';
import type { CardCanvasData } from './card-canvas';

export interface CardTemplateInput {
  name: string;
  canvas: CardCanvasData;
  attributes: CardAttribute[];
}
export interface CardTemplate extends CardTemplateInput {
  id: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}
