import Konva from 'konva';
import { cacheFilteredImage, CARD_FILTER_CACHE_CONFIG, imageFilterFrame } from './card-filter-cache';
import { exportCardContent } from './card-export.service';

describe('Bounded image filter cache', () => {
  it('clips a zoomed contain image to its frame without changing image geometry or crop', () => {
    const shape = new Konva.Image({ image: document.createElement('canvas'), x: -36_864, y: -36_864, width: 81_920, height: 81_920,
      crop: { x: 12, y: 20, width: 240, height: 160 } });
    const geometry = { x: shape.x(), y: shape.y(), width: shape.width(), height: shape.height(), crop: shape.crop() };
    const cache = spyOn(shape, 'cache').and.returnValue(shape);
    cacheFilteredImage(shape, { width: 8192, height: 8192 }, 4, 64);
    const options = cache.calls.mostRecent().args[0];
    if (!options?.width || !options.height || !options.pixelRatio) throw new Error('Cache options missing.');
    expect(options.x).toBe(36_864); expect(options.y).toBe(36_864);
    expect(options.width).toBe(8192); expect(options.height).toBe(8192);
    expect(Math.floor(options.width * options.pixelRatio) * Math.floor(options.height * options.pixelRatio) * 64)
      .toBeLessThanOrEqual(CARD_FILTER_CACHE_CONFIG.maxPixels);
    expect(Math.floor(options.width * options.pixelRatio)).toBeLessThanOrEqual(CARD_FILTER_CACHE_CONFIG.maxDimension);
    expect(options.hitCanvasPixelRatio).toBe(options.pixelRatio);
    expect({ x: shape.x(), y: shape.y(), width: shape.width(), height: shape.height(), crop: shape.crop() }).toEqual(geometry);
    shape.destroy();
  });

  it('keeps normal card artwork at the requested export density and carries its frame through cloning', () => {
    const shape = new Konva.Image({ image: document.createElement('canvas'), width: 632, height: 440 });
    const cache = spyOn(shape, 'cache').and.returnValue(shape);
    cacheFilteredImage(shape, { width: 632, height: 440 }, 4, 1);
    expect(cache).toHaveBeenCalledWith({ x: 0, y: 0, width: 632, height: 440, pixelRatio: 4, hitCanvasPixelRatio: 4 });
    const clone = shape.clone();
    expect(imageFilterFrame(clone)).toEqual({ width: 632, height: 440 });
    clone.destroy(); shape.destroy();
  });

  it('limits long caches and avoids zero-pixel backing dimensions after downsampling', () => {
    const shape = new Konva.Image({ image: document.createElement('canvas'), width: 0.5, height: 8192 });
    const cache = spyOn(shape, 'cache').and.returnValue(shape);
    cacheFilteredImage(shape, { width: 8192, height: 8192 }, 4, 64);
    const options = cache.calls.mostRecent().args[0];
    if (!options?.width || !options.height || !options.pixelRatio) throw new Error('Cache options missing.');
    expect(Math.floor(options.width * options.pixelRatio)).toBeGreaterThanOrEqual(1);
    expect(Math.floor(options.height * options.pixelRatio)).toBeLessThanOrEqual(CARD_FILTER_CACHE_CONFIG.maxDimension);
    expect(options.width * options.height * options.pixelRatio ** 2).toBeLessThanOrEqual(CARD_FILTER_CACHE_CONFIG.maxPixels / 64);
    shape.destroy();
  });

  it('releases previous caches when an image has no intersection with the frame', () => {
    const shape = new Konva.Image({ image: document.createElement('canvas'), x: 100, y: 100, width: 40, height: 40 });
    const cache = spyOn(shape, 'cache').and.returnValue(shape);
    const clear = spyOn(shape, 'clearCache').and.returnValue(shape);
    cacheFilteredImage(shape, { width: 80, height: 80 }, 1, 1);
    expect(cache).not.toHaveBeenCalled(); expect(clear).toHaveBeenCalled();
    shape.destroy();
  });

  it('rejects invalid dimensions before allocating a canvas and uses image dimensions when no runtime frame exists', () => {
    const shape = new Konva.Image({ image: document.createElement('canvas'), width: 100, height: 80 });
    const cache = spyOn(shape, 'cache').and.returnValue(shape);
    expect(imageFilterFrame(shape)).toEqual({ width: 100, height: 80 });
    expect(() => cacheFilteredImage(shape, { width: Infinity, height: 80 }, 1, 1)).toThrowError(/inválidas/);
    expect(() => cacheFilteredImage(shape, { width: 100, height: 80 }, 0, 1)).toThrowError(/inválidas/);
    expect(cache).not.toHaveBeenCalled();
    shape.destroy();
  });

  it('exports only caches for visible images and excludes hidden or transparent parents from the allocation count', async () => {
    const source = document.createElement('canvas'); source.width = source.height = 2;
    source.getContext('2d')?.fillRect(0, 0, 2, 2);
    const content = new Konva.Group();
    for (const group of [new Konva.Group(), new Konva.Group({ visible: false }), new Konva.Group({ opacity: 0 })]) {
      const image = new Konva.Image({ image: source, width: 32, height: 32, listening: false });
      image.filters([Konva.Filters.Grayscale]);
      image.setAttr('cardFilterFrame', { width: 32, height: 32 });
      group.add(image); content.add(group);
    }
    const cache = spyOn(Konva.Image.prototype, 'cache').and.callThrough();
    try {
      const output = await exportCardContent(content, 32, 32, { format: 'png', pixelRatio: 2 });
      expect(output.size).toBeGreaterThan(0);
      expect(cache).toHaveBeenCalledTimes(1);
      expect(cache).toHaveBeenCalledWith({ x: 0, y: 0, width: 32, height: 32, pixelRatio: 2, hitCanvasPixelRatio: 2 });
    } finally { content.destroy(); }
  });
});
