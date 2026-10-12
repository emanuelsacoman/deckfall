import { Card } from '../../interfaces/Cards/card';
import { CardEditorDocument } from '../../interfaces/Cards/card-canvas';
import { fantasyBasicCanvas, normalizeEditorAttributes } from './card-canvas-factory';

/** Creates an independent editor document, including the existing legacy-card adaptation. */
export function savedCardDocument(card: Card): CardEditorDocument {
  const data = {
    name: card.name, description: card.description, rarity: card.rarity, status: card.status,
    attributes: normalizeEditorAttributes(card.attributes), setId: card.setId,
    type: card.type ?? null, subtype: card.subtype ?? null, templateId: card.templateId ?? null
  };
  const canvas = card.canvas ? structuredClone(card.canvas) : fantasyBasicCanvas(data);
  if (!card.canvas && card.art) {
    const asset = { ...card.art, id: 'legacy-art' };
    canvas.assets.push(asset);
    const artwork = canvas.elements.find(element => element.type === 'artwork');
    if (artwork?.type === 'artwork') artwork.properties.assetId = asset.id;
  }
  return { data, canvas };
}
