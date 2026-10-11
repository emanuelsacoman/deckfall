import Konva from 'konva';

export const CARD_FILTER_CACHE_CONFIG = {
  maxPixels: 8_000_000,
  maxDimension: 4096
} as const;

export interface CardFilterFrame { width: number; height: number; }

/** Runtime bounds travel with an export clone; they are never part of the card model. */
export function imageFilterFrame(shape: Konva.Image): CardFilterFrame {
  const value: unknown = shape.getAttr('cardFilterFrame');
  if (typeof value === 'object' && value !== null && 'width' in value && 'height' in value &&
      typeof value.width === 'number' && typeof value.height === 'number' &&
      Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0) {
    return { width: value.width, height: value.height };
  }
  return { width: shape.width(), height: shape.height() };
}

/** Filter only pixels that can appear through the stationary image frame. */
export function cacheFilteredImage(shape: Konva.Image, frame: CardFilterFrame, requestedRatio: number, imageCount: number): void {
  const values = [shape.x(), shape.y(), shape.width(), shape.height(), frame.width, frame.height, requestedRatio, imageCount];
  if (values.some(value => !Number.isFinite(value)) || frame.width <= 0 || frame.height <= 0 || requestedRatio <= 0) {
    throw new Error('As dimensões do cache da imagem são inválidas.');
  }
  shape.setAttr('cardFilterFrame', { ...frame });
  const left = Math.max(0, -shape.x()), top = Math.max(0, -shape.y());
  const right = Math.min(shape.width(), frame.width - shape.x());
  const bottom = Math.min(shape.height(), frame.height - shape.y());
  if (right <= left || bottom <= top) { shape.clearCache(); return; }

  const x = Math.floor(left), y = Math.floor(top);
  let width = Math.ceil(right) - x, height = Math.ceil(bottom) - y;
  const budget = CARD_FILTER_CACHE_CONFIG.maxPixels / Math.max(1, Math.ceil(imageCount));
  const ratioFor = () => Math.min(requestedRatio,
    CARD_FILTER_CACHE_CONFIG.maxDimension / width,
    CARD_FILTER_CACHE_CONFIG.maxDimension / height,
    Math.sqrt(budget / (width * height)));
  let pixelRatio = ratioFor();
  // Canvas backing sizes are floored. Pad a narrow logical cache with transparent
  // space instead of allowing its shorter backing side to become zero pixels.
  for (let pass = 0; pass < 3; pass++) {
    width = Math.max(width, Math.ceil(1 / pixelRatio));
    height = Math.max(height, Math.ceil(1 / pixelRatio));
    pixelRatio = ratioFor();
  }
  shape.cache({ x, y, width, height, pixelRatio, hitCanvasPixelRatio: pixelRatio });
}
