import { CARD_RARITY_LABELS, CardAttribute, CardDataInput, DEFAULT_CARD_ATTRIBUTES } from '../../interfaces/Cards/card';
import {
  CARD_CANVAS_CONFIG, CardCanvasData, CardCanvasElement, CardElementPreset,
  CanvasStyle, ShapeProperties, TextProperties, CardBinding
} from '../../interfaces/Cards/card-canvas';

export const newEditorId = (): string => crypto.randomUUID();
export const defaultCanvasStyle = (): CanvasStyle => ({
  fill: '#e8d7b0', stroke: '#9a783e', strokeWidth: 0, shadowColor: '#000000',
  shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0
});
export const defaultTextProperties = (): TextProperties => ({
  ...defaultCanvasStyle(), text: 'Novo texto', binding: null, fontFamily: 'Georgia', fontSize: 32,
  fontStyle: 'normal', align: 'left', letterSpacing: 0, lineHeight: 1.2
});
const shapeProperties = (): ShapeProperties => ({
  ...defaultCanvasStyle(), cornerRadius: 12, fillMode: 'solid', gradientColor: '#59452a', gradientAngle: 90
});

export function defaultCardData(): CardDataInput {
  return {
    name: 'Nova carta', description: 'Descreva aqui a habilidade da carta.', rarity: 'common', status: 'draft',
    attributes: DEFAULT_CARD_ATTRIBUTES.map(attribute => ({ ...attribute, id: newEditorId(), min: 0, max: 100 })),
    setId: null, type: null, subtype: null, templateId: null
  };
}

export function createCanvasElement(preset: CardElementPreset, data: CardDataInput, index = 0): CardCanvasElement {
  const base = {
    id: newEditorId(), name: preset, x: 60 + (index % 6) * 12, y: 80 + (index % 6) * 12,
    width: 300, height: 80, rotation: 0, opacity: 1, visible: true, locked: false
  };
  switch (preset) {
    case 'ornate-frame':
      return { ...base, type: 'frame', name: 'Moldura ornamentada', x: 16, y: 16, width: 712, height: 1007,
        properties: { ...defaultCanvasStyle(), fill: '#35261d', stroke: '#b89558', strokeWidth: 2,
          frameStyle: 'ornate', motif: 'flame', borderWidth: 28, cornerRadius: 28, detail: 6, seed: 1,
          accentColor: '#ff9e35', gemColor: '#8e291b' } };
    case 'emblem':
      return { ...base, type: 'emblem', name: 'Emblema vetorial', width: 100, height: 100,
        properties: { ...defaultCanvasStyle(), fill: '#35261d', stroke: '#b89558', strokeWidth: 2,
          motif: 'flame', container: 'medallion', accentColor: '#ff9e35', gemColor: '#8e291b', relief: 0.75 } };
    case 'text': case 'icon': case 'description':
      return { ...base, type: preset === 'icon' ? 'icon' : 'text', name: preset === 'description' ? 'Descrição' : preset === 'icon' ? 'Ícone' : 'Texto',
        height: preset === 'description' ? 160 : 80,
        properties: { ...defaultTextProperties(), text: preset === 'icon' ? '★' : 'Novo texto',
          binding: preset === 'description' ? 'description' : null, fontSize: preset === 'icon' ? 60 : 32 } };
    case 'image': case 'artwork':
      return { ...base, type: preset, name: preset === 'artwork' ? 'Arte principal' : 'Imagem', width: 400, height: 400,
        properties: { ...defaultCanvasStyle(), fill: 'transparent', assetId: null, binding: preset === 'artwork' ? 'art' : null,
          fit: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 }, zoom: 1, offsetX: 0, offsetY: 0,
          mask: 'rounded', cornerRadius: 16, filter: 'none' } };
    case 'attribute':
      return { ...base, type: 'attribute', name: 'Atributo',
        properties: { ...defaultCanvasStyle(), attributeKey: data.attributes[0]?.key ?? '', labelMode: 'label-value',
          suffix: '%', showIcon: true, fontFamily: 'Arial', fontSize: 28, fontStyle: 'bold', align: 'left' } };
    case 'bar':
      return { ...base, type: 'bar', name: 'Barra de atributo', height: 44,
        properties: { ...defaultCanvasStyle(), attributeKey: data.attributes[0]?.key ?? '', trackColor: '#293448',
          showValue: true, cornerRadius: 10, fontFamily: 'Arial', fontSize: 24 } };
    default: {
      const type = preset === 'circle' ? 'circle' : preset === 'line' ? 'line' : 'rect';
      return { ...base, type, name: preset === 'frame' ? 'Moldura' : preset === 'badge' ? 'Badge' : type === 'rect' ? 'Retângulo' : type === 'circle' ? 'Círculo' : 'Linha',
        width: preset === 'badge' ? 150 : type === 'circle' ? 160 : 300,
        height: preset === 'badge' ? 60 : type === 'circle' ? 160 : type === 'line' ? 8 : 160,
        properties: { ...shapeProperties(), fill: preset === 'frame' || type === 'line' ? 'transparent' : '#9a783e',
          strokeWidth: preset === 'frame' ? 8 : type === 'line' ? 3 : 0 } };
    }
  }
}

export function fantasyBasicCanvas(data: CardDataInput): CardCanvasData {
  const frame = createCanvasElement('frame', data);
  Object.assign(frame, { x: 24, y: 24, width: 696, height: 991, name: 'Moldura', locked: false });
  const title = createCanvasElement('text', data);
  Object.assign(title, { x: 56, y: 56, width: 632, height: 68, name: 'Nome da carta' });
  if (title.type === 'text') Object.assign(title.properties, { binding: 'name', fontSize: 42, fontStyle: 'bold', align: 'center' });
  const art = createCanvasElement('artwork', data);
  Object.assign(art, { x: 56, y: 140, width: 632, height: 440 });
  const description = createCanvasElement('description', data);
  Object.assign(description, { x: 64, y: 760, width: 616, height: 150 });
  if (description.type === 'text') Object.assign(description.properties, { fontSize: 26, align: 'center' });
  const rarity = createCanvasElement('text', data);
  Object.assign(rarity, { x: 64, y: 936, width: 616, height: 44, name: 'Raridade' });
  if (rarity.type === 'text') Object.assign(rarity.properties, { binding: 'rarity', fontSize: 28, align: 'center', fontStyle: 'bold' });
  const attributes = data.attributes.slice(0, 8).map((attribute, index) => {
    const element = createCanvasElement('attribute', data);
    Object.assign(element, { x: 64 + (index % 2) * 316, y: 616 + Math.floor(index / 2) * 42, width: 292, height: 38, name: attribute.label });
    if (element.type === 'attribute') Object.assign(element.properties, { attributeKey: attribute.key, fontSize: 24 });
    return element;
  });
  return { version: 1, width: CARD_CANVAS_CONFIG.width, height: CARD_CANVAS_CONFIG.height,
    background: { kind: 'gradient', color: '#18243b', color2: '#493720', angle: 90, assetId: null },
    elements: [frame, art, title, ...attributes, description, rarity], assets: [] };
}

export function normalizeEditorAttributes(attributes: CardAttribute[]): CardAttribute[] {
  return attributes.map(attribute => ({ ...attribute, id: attribute.id ?? newEditorId() }));
}

export function resolveCardBinding(binding: string, data: CardDataInput): string {
  switch (binding) {
    case 'name': return data.name;
    case 'description': return data.description;
    case 'rarity': return CARD_RARITY_LABELS[data.rarity];
    case 'type': return data.type ?? '';
    case 'subtype': return data.subtype ?? '';
    default: {
      const match = /^attributes\.([a-z][a-z0-9_-]{0,39})$/.exec(binding);
      return match ? String(data.attributes.find(attribute => attribute.key === match[1])?.value ?? '—') : '—';
    }
  }
}
export function renderText(text: string, binding: CardBinding | null, data: CardDataInput): string {
  return binding ? resolveCardBinding(binding, data) : text.replace(/\{\{([^{}]+)\}\}/g, (_token, key: string) => resolveCardBinding(key.trim(), data));
}
