import { CardDataInput } from '../../interfaces/Cards/card';
import { CARD_CANVAS_CONFIG, CardCanvasData, CardCanvasElement, CardOrnamentMotif } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCanvasStyle, newEditorId } from './card-canvas-factory';

export type CardOrnamentThemeId = 'ember' | 'frost' | 'verdant' | 'arcane' | 'solar' | 'abyss';
export interface CardOrnamentTheme {
  id: CardOrnamentThemeId;
  label: string;
  fill: string;
  stroke: string;
  accentColor: string;
  gemColor: string;
  motif: CardOrnamentMotif;
}
export const CARD_ORNAMENT_THEMES: readonly CardOrnamentTheme[] = [
  { id: 'ember', label: 'Fogo ancestral', fill: '#35261d', stroke: '#b89558', accentColor: '#ffb347', gemColor: '#8e291b', motif: 'flame' },
  { id: 'frost', label: 'Cristal de gelo', fill: '#172b3a', stroke: '#a8cbd8', accentColor: '#8de8ff', gemColor: '#236887', motif: 'crystal' },
  { id: 'verdant', label: 'Bosque sagrado', fill: '#1b3024', stroke: '#b4a464', accentColor: '#a4df76', gemColor: '#276640', motif: 'leaf' },
  { id: 'arcane', label: 'Runas arcanas', fill: '#281e3f', stroke: '#ac94d3', accentColor: '#e0b8ff', gemColor: '#614298', motif: 'moon' },
  { id: 'solar', label: 'Ouro solar', fill: '#3d2d18', stroke: '#d5b36b', accentColor: '#ffe5a1', gemColor: '#a76a20', motif: 'sun' },
  { id: 'abyss', label: 'Relíquia sombria', fill: '#24232b', stroke: '#96929e', accentColor: '#d37c87', gemColor: '#581f35', motif: 'skull' }
];

export function ornamentTheme(id: CardOrnamentThemeId): CardOrnamentTheme {
  return CARD_ORNAMENT_THEMES.find(theme => theme.id === id) ?? CARD_ORNAMENT_THEMES[0];
}

export function themeOrnament(element: CardCanvasElement, theme: CardOrnamentTheme): CardCanvasElement {
  if (element.type !== 'frame' && element.type !== 'emblem') return element;
  const { fill, stroke, accentColor, gemColor } = theme;
  if (element.type === 'frame') return { ...element, properties: { ...element.properties, fill, stroke, accentColor, gemColor } };
  return { ...element, properties: { ...element.properties, fill, stroke, accentColor, gemColor } };
}

const attributeMotif = (key: string, fallback: CardOrnamentMotif): CardOrnamentMotif => {
  if (/^(attack|ataque|power|forca|strength)$/.test(key)) return 'sword';
  if (/^(health|life|hp|vida)$/.test(key)) return 'heart';
  if (/^(defense|defesa|armor)$/.test(key)) return 'shield';
  if (/^(speed|velocidade|energy|energia)$/.test(key)) return 'bolt';
  if (/^(magic|magia|mana|cost|custo)$/.test(key)) return 'crystal';
  return fallback;
};

/** Creates editable layers; binary artwork and gameplay stay outside ornamental styling. */
export function ornateFantasyCanvas(data: CardDataInput, themeId: CardOrnamentThemeId = 'ember', source?: CardCanvasData): CardCanvasData {
  const theme = ornamentTheme(themeId);
  const width = source?.width ?? CARD_CANVAS_CONFIG.width;
  const height = source?.height ?? CARD_CANVAS_CONFIG.height;
  const scale = Math.min(width / CARD_CANVAS_CONFIG.width, height / CARD_CANVAS_CONFIG.height);
  const elements: CardCanvasElement[] = [];
  const place = (element: CardCanvasElement, name: string, x: number, y: number, w: number, h: number): CardCanvasElement => {
    const left = Math.min(x * width, width - 8), top = Math.min(y * height, height - 8);
    Object.assign(element, { name, x: left, y: top, width: Math.max(8, Math.min(w * width, width - left)),
      height: Math.max(8, Math.min(h * height, height - top)) });
    return element;
  };
  const panel = (name: string, x: number, y: number, w: number, h: number, parchment = false): void => {
    const plate = place(createCanvasElement('rect', data), name, x, y, w, h);
    if (plate.type === 'rect') Object.assign(plate.properties, { fill: parchment ? '#eddbb6' : theme.fill,
      gradientColor: parchment ? '#c4a276' : theme.gemColor, fillMode: 'gradient', gradientAngle: 90,
      stroke: theme.stroke, strokeWidth: Math.max(1, 3 * scale), cornerRadius: 12 * scale,
      shadowBlur: 6 * scale, shadowOffsetY: 2 * scale });
    elements.push(plate);
    const trim = place(createCanvasElement('ornate-frame', data), `${name} · acabamento`, x, y, w, h);
    if (trim.type === 'frame') Object.assign(trim.properties, { fill: theme.fill, stroke: theme.stroke,
      accentColor: theme.accentColor, gemColor: theme.gemColor, motif: theme.motif,
      borderWidth: Math.max(2, 8 * scale), cornerRadius: 12 * scale, detail: 0, frameStyle: 'minimal' });
    elements.push(trim);
  };
  const rows = Math.ceil(Math.min(data.attributes.length, 8) / 2);
  const statsY = 0.948 - rows * 0.065;
  const descriptionY = statsY - 0.204;
  const sourceArt = source?.elements.find(element => element.type === 'artwork' && element.properties.assetId !== null)
    ?? source?.elements.find(element => element.type === 'image' && element.properties.binding === 'art' && element.properties.assetId !== null)
    ?? source?.elements.find(element => element.type === 'artwork');
  const art = place(sourceArt ? { ...structuredClone(sourceArt), id: newEditorId(), locked: false, rotation: 0, opacity: 1, visible: true }
    : createCanvasElement('artwork', data), 'Arte principal', 0.068, 0.14, 0.864, descriptionY - 0.154);
  if (art.type === 'image' || art.type === 'artwork') {
    // Keep original pixels, crop and effects; only the new composition's art window changes.
    art.type = 'artwork';
    Object.assign(art.properties, { mask: 'rounded', cornerRadius: 22 * scale });
  }
  elements.push(art);
  const artTrim = place(createCanvasElement('ornate-frame', data), 'Janela da arte', 0.061, 0.134, 0.878, descriptionY - 0.142);
  if (artTrim.type === 'frame') Object.assign(artTrim.properties, { fill: theme.fill, stroke: theme.stroke, accentColor: theme.accentColor,
    gemColor: theme.gemColor, motif: theme.motif, borderWidth: Math.max(2, 10 * scale), cornerRadius: 24 * scale, frameStyle: 'minimal', detail: 0 });
  elements.push(artTrim);
  panel('Placa do título', 0.065, 0.036, 0.87, 0.096);
  panel('Pergaminho da descrição', 0.071, descriptionY, 0.858, 0.19, true);
  const outer = place(createCanvasElement('ornate-frame', data), 'Moldura principal', 0.014, 0.01, 0.972, 0.98);
  if (outer.type === 'frame') Object.assign(outer.properties, { fill: theme.fill, stroke: theme.stroke, accentColor: theme.accentColor,
    gemColor: theme.gemColor, motif: theme.motif, borderWidth: Math.max(2, 28 * scale), cornerRadius: 30 * scale,
    frameStyle: themeId === 'arcane' || themeId === 'abyss' ? 'runic' : 'ornate' });
  elements.push(outer);
  const emblem = (name: string, x: number, y: number, size: number, motif: CardOrnamentMotif): void => {
    const element = createCanvasElement('emblem', data);
    const diameter = Math.max(8, Math.min(size * width, height * 0.1));
    Object.assign(element, { name, x: x * width, y: y * height, width: diameter, height: diameter });
    if (element.type === 'emblem') Object.assign(element.properties, { fill: theme.fill, stroke: theme.stroke,
      accentColor: theme.accentColor, gemColor: theme.gemColor, motif });
    elements.push(element);
  };
  emblem('Selo elemental', 0.026, 0.028, 0.128, theme.motif);
  emblem('Insigne de rareté', 0.846, 0.028, 0.128, 'star');
  const title = place(createCanvasElement('text', data), 'Nome da carta', 0.165, 0.045, 0.67, 0.072);
  if (title.type === 'text') Object.assign(title.properties, { binding: 'name', fill: '#ffe3a0', stroke: '#140d08',
    strokeWidth: Math.max(0.5, scale), fontSize: Math.max(6, 40 * scale), fontStyle: 'bold', align: 'center', verticalAlign: 'middle',
    shadowBlur: 3 * scale, shadowOffsetY: 2 * scale });
  elements.push(title);
  const description = place(createCanvasElement('description', data), 'Descrição vinculada', 0.105, descriptionY + 0.018, 0.79, 0.153);
  if (description.type === 'text') Object.assign(description.properties, { fill: '#261b13', fontSize: Math.max(6, 24 * scale), align: 'center', verticalAlign: 'middle', lineHeight: 1.12 });
  elements.push(description);
  data.attributes.slice(0, 8).forEach((attribute, index) => {
    const x = 0.072 + (index % 2) * 0.435, y = statsY + Math.floor(index / 2) * 0.065;
    panel(`${attribute.label} · placa`, x, y, 0.421, 0.056);
    const size = Math.min(0.066, 0.052 * height / width);
    emblem(`${attribute.label} · emblema`, x + 0.009, y + 0.002, size, attributeMotif(attribute.key, theme.motif));
    // Attribute values remain bound to gameplay. Decorative icons are independent vector layers.
    const text = place(createCanvasElement('attribute', data), `${attribute.label} · rótulo`, x + size + 0.018, y + 0.005, 0.245, 0.046);
    if (text.type === 'attribute') Object.assign(text.properties, { attributeKey: attribute.key, labelMode: 'label', suffix: '', showIcon: false,
      fill: '#ffe3a0', fontFamily: 'Georgia', fontSize: Math.max(6, 21 * scale), fontStyle: 'bold', verticalAlign: 'middle' });
    elements.push(text);
    const value = place(createCanvasElement('attribute', data), `${attribute.label} · valor`, x + 0.32, y + 0.004, 0.088, 0.047);
    if (value.type === 'attribute') Object.assign(value.properties, { ...defaultCanvasStyle(), fill: '#fff0c6', fontSize: Math.max(6, 29 * scale), fontFamily: 'Georgia',
      attributeKey: attribute.key, labelMode: 'value', suffix: '', showIcon: false, align: 'center', fontStyle: 'bold' });
    elements.push(value);
  });
  const rarity = place(createCanvasElement('text', data), 'Raridade vinculada', 0.3, 0.951, 0.4, 0.027);
  if (rarity.type === 'text') Object.assign(rarity.properties, { binding: 'rarity', fill: theme.accentColor,
    fontSize: Math.max(6, 17 * scale), fontStyle: 'bold', align: 'center', verticalAlign: 'middle', letterSpacing: scale });
  elements.push(rarity);
  return { version: 1, width, height, background: { kind: 'gradient', color: '#111016', color2: theme.fill, angle: 90, assetId: null },
    elements, assets: source ? structuredClone(source.assets) : [] };
}
