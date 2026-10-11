import type { CardDataInput, CardAttribute } from './card';

export const CARD_CANVAS_CONFIG = {
  version: 1, width: 744, height: 1039, minDimension: 160, maxDimension: 2048,
  maxElements: 64, maxAssets: 24, maxBytes: 128 * 1024, historyLimit: 80,
  gridSize: 20, snapDistance: 8, minElementSize: 8, maxExportPixels: 32_000_000,
  assetCacheBytes: 128 * 1024 * 1024
} as const;
export const CARD_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'] as const;
export const CARD_ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5] as const;
export type EditorMode = 'design' | 'data' | 'preview';
export type CardElementType = 'text' | 'image' | 'artwork' | 'rect' | 'circle' | 'line' | 'icon' | 'attribute' | 'bar';
export type CardBinding = 'name' | 'description' | 'rarity' | 'type' | 'subtype' | `attributes.${string}`;
export type FontStyle = 'normal' | 'bold' | 'italic' | 'bold italic';
export type BorderStyle = 'solid' | 'dashed' | 'dotted';
export type TextDecoration = 'none' | 'underline' | 'line-through' | 'underline line-through';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface CanvasStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderStyle?: BorderStyle;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}
export interface TextProperties extends CanvasStyle {
  text: string;
  binding: CardBinding | null;
  fontFamily: string;
  fontSize: number;
  fontStyle: FontStyle;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  textDecoration?: TextDecoration;
  verticalAlign?: VerticalAlign;
}
export interface ShapeProperties extends CanvasStyle {
  cornerRadius: number;
  fillMode: 'solid' | 'gradient';
  gradientColor: string;
  gradientAngle: number;
}
export interface ImageProperties extends CanvasStyle {
  assetId: string | null;
  binding: 'art' | null;
  fit: 'cover' | 'contain' | 'fill';
  crop: { x: number; y: number; width: number; height: number };
  zoom: number;
  offsetX: number;
  offsetY: number;
  mask: 'none' | 'rounded' | 'ellipse';
  cornerRadius: number;
  filter: 'none' | 'grayscale' | 'sepia';
  flipX?: boolean;
  flipY?: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
}
export interface AttributeProperties extends CanvasStyle {
  attributeKey: string;
  labelMode: 'label-value' | 'value' | 'label';
  suffix: string;
  showIcon: boolean;
  fontFamily: string;
  fontSize: number;
  fontStyle: FontStyle;
  align: 'left' | 'center' | 'right';
  textDecoration?: TextDecoration;
  verticalAlign?: VerticalAlign;
}
export interface BarProperties extends CanvasStyle {
  attributeKey: string;
  trackColor: string;
  showValue: boolean;
  cornerRadius: number;
  fontFamily: string;
  fontSize: number;
}
interface CanvasElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}
export type CardCanvasElement =
  | (CanvasElementBase & { type: 'text' | 'icon'; properties: TextProperties })
  | (CanvasElementBase & { type: 'rect' | 'circle' | 'line'; properties: ShapeProperties })
  | (CanvasElementBase & { type: 'image' | 'artwork'; properties: ImageProperties })
  | (CanvasElementBase & { type: 'attribute'; properties: AttributeProperties })
  | (CanvasElementBase & { type: 'bar'; properties: BarProperties });

export interface CardCanvasAsset {
  id: string;
  storagePath: string | null;
  fileName: string;
  contentType: string;
  size: number;
}
export interface CardCanvasBackground {
  kind: 'solid' | 'gradient' | 'image' | 'texture';
  color: string;
  color2: string;
  angle: number;
  assetId: string | null;
}
export interface CardCanvasData {
  version: 1;
  width: number;
  height: number;
  background: CardCanvasBackground;
  elements: CardCanvasElement[];
  assets: CardCanvasAsset[];
}
export interface CardEditorDocument {
  data: CardDataInput;
  canvas: CardCanvasData;
}
export interface PendingCardAsset {
  id: string;
  file: File;
}
export interface CardAssetOwner {
  kind: 'card' | 'template';
  id: string;
}
export type CardElementPreset = CardElementType | 'frame' | 'badge' | 'description';
export type CardEditorAction = 'save' | 'save-template' | 'load-template' | 'duplicate-card' | 'delete-card'
  | 'export' | 'save-local' | 'load-local' | 'download-json' | 'import-json';
export interface EditorAssetSelection { elementId: string | null; file: File; }
export interface EditorExportOptions { format: 'png' | 'jpeg'; pixelRatio: 1 | 2 | 4; }

export function attributeRange(attribute: CardAttribute): { min: number; max: number } {
  return { min: attribute.min ?? 0, max: attribute.max ?? 100 };
}
