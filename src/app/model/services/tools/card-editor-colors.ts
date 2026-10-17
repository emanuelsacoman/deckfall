import type { CardEditorDocument } from '../../interfaces/Cards/card-canvas';
import { isCanvasColor } from './card-canvas-validation';

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
  blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00',
};
const ELEMENT_COLOR_KEYS = [
  'fill', 'stroke', 'shadowColor', 'gradientColor', 'trackColor', 'accentColor', 'gemColor',
] as const;

function channels(value: string): readonly [number, number, number, number] | null {
  if (!isCanvasColor(value) || value === '') return null;
  if (value === 'transparent') return [0, 0, 0, 0];
  const hex = NAMED_COLORS[value] ?? value;
  if (hex.startsWith('#')) {
    const digits = hex.slice(1);
    const expanded = digits.length <= 4 ? [...digits].map(char => char + char).join('') : digits;
    return [
      Number.parseInt(expanded.slice(0, 2), 16), Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16), expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    ];
  }
  const rgb = value.slice(value.indexOf('(') + 1, -1).split(',').map(Number);
  return [rgb[0], rgb[1], rgb[2], rgb[3] ?? 1];
}

/** Native color inputs represent opaque RGB only; this never changes the supplied string. */
export function colorPickerHex(value: string): string | null {
  const color = channels(value);
  if (!color || color[3] !== 1) return null;
  return `#${color.slice(0, 3).map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function colorIdentity(value: string): string {
  if (value === '') return 'empty';
  const rgba = channels(value);
  if (!rgba) return value;
  return rgba[3] === 0 ? 'transparent' : rgba.join(',');
}

/** Extracts a bounded palette, preserving the first spelling of equivalent colors. */
export function editorDocumentColors(document: CardEditorDocument, limit = 12): readonly string[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const maximum = Math.floor(limit);
  const found: string[] = [];
  const identities = new Set<string>();
  const collect = (value: unknown): void => {
    if (found.length >= maximum || !isCanvasColor(value)) return;
    const identity = colorIdentity(value);
    if (identities.has(identity)) return;
    identities.add(identity);
    found.push(value);
  };
  collect(document.canvas.background.color);
  collect(document.canvas.background.color2);
  for (const element of document.canvas.elements) {
    const properties = element.properties as unknown as Record<string, unknown>;
    for (const key of ELEMENT_COLOR_KEYS) collect(properties[key]);
  }
  for (const attribute of document.data.attributes) collect(attribute.color);
  return found;
}
