import Konva from 'konva';
import { CARD_ORNAMENT_MOTIFS, CardCanvasElement } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData } from './card-canvas-factory';
import { drawElement } from './card-konva-elements';
import { drawEmblem, drawFrame } from './card-ornament-renderer';
import { exportCardContent } from './card-export.service';

describe('Scalable vector card ornaments', () => {
  let group: Konva.Group;
  const data = defaultCardData();

  beforeEach(() => { group = new Konva.Group(); });
  afterEach(() => group.destroy());

  function frame(): Extract<CardCanvasElement, { type: 'frame' }> {
    const element = createCanvasElement('ornate-frame', data);
    if (element.type !== 'frame') throw new Error('Frame fixture missing.');
    Object.assign(element, { x: 0, y: 0, width: 200, height: 280 });
    Object.assign(element.properties, { borderWidth: 20, cornerRadius: 20, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
    return element;
  }

  function emblem(): Extract<CardCanvasElement, { type: 'emblem' }> {
    const element = createCanvasElement('emblem', data);
    if (element.type !== 'emblem') throw new Error('Emblem fixture missing.');
    Object.assign(element, { x: 0, y: 0, width: 100, height: 100 });
    Object.assign(element.properties, { shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
    return element;
  }

  function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
    return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
    return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
  }

  async function png(width: number, height: number, pixelRatio: 1 | 2 | 4): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(await exportCardContent(group, width, height, { format: 'png', pixelRatio }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
    return canvas;
  }

  it('keeps a genuinely transparent interior through cloning and PNG exports at 1×, 2× and 4×', async () => {
    const element = frame();
    for (const frameStyle of ['ornate', 'runic', 'minimal'] as const) {
      group.destroyChildren(); element.properties.frameStyle = frameStyle;
      drawElement(group, element, data);
      const live = group.toCanvas({ x: 0, y: 0, width: 200, height: 280, pixelRatio: 1 });
      for (const ratio of [1, 2, 4] as const) {
        const output = await png(200, 280, ratio);
        expect(output.width).toBe(200 * ratio); expect(output.height).toBe(280 * ratio);
        expect(pixel(output, 100 * ratio, 140 * ratio)[3]).withContext(`${frameStyle}/${ratio}`).toBe(0);
        expect(pixel(output, 70 * ratio, 10 * ratio)[3]).withContext(`${frameStyle}/${ratio}`).toBeGreaterThan(240);
        // Check the whole opening, including regions next to decorative corners.
        const inside = output.getContext('2d')!.getImageData(25 * ratio, 25 * ratio, 150 * ratio, 230 * ratio).data;
        expect(inside.every((value, index) => index % 4 !== 3 || value === 0)).withContext(`${frameStyle}/${ratio} cutout`).toBeTrue();
        if (ratio === 1) expect(pixels(output)).withContext(frameStyle).toEqual(pixels(live));
      }
    }
  });

  it('leaves underlying artwork visible instead of using compositing to erase the center', async () => {
    group.add(new Konva.Rect({ width: 200, height: 280, fill: '#143c77', listening: false }));
    drawFrame(group, frame());
    for (const ratio of [1, 4] as const) {
      const output = await png(200, 280, ratio);
      expect(pixel(output, 100 * ratio, 140 * ratio)).toEqual([20, 60, 119, 255]);
      expect(pixel(output, 80 * ratio, 10 * ratio)).not.toEqual([20, 60, 119, 255]);
    }
  });

  it('selects the frame on its border and reaches the underlying artwork through its opening', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const stage = new Konva.Stage({ container: host, width: 200, height: 280 });
    try {
      const layer = new Konva.Layer(); stage.add(layer);
      const artwork = new Konva.Rect({ name: 'underlying-art', width: 200, height: 280, fill: '#143c77' });
      layer.add(artwork);
      const frameGroup = new Konva.Group({ id: 'selectable-frame' });
      drawElement(frameGroup, frame(), data); layer.add(frameGroup); layer.draw();
      expect(stage.getIntersection({ x: 100, y: 140 })).toBe(artwork);
      expect(stage.getIntersection({ x: 70, y: 10 })?.getParent()).toBe(frameGroup);
      expect(stage.getIntersection({ x: 0, y: 0 })).toBe(artwork);
    } finally { stage.destroy(); host.remove(); }
  });

  it('reproduces the same seeded ornament pixels and changes engraved pixels when the seed changes', () => {
    const element = frame(); element.properties.detail = 12;
    drawFrame(group, element);
    const first = pixels(group.toCanvas({ x: 0, y: 0, width: 200, height: 280 }));
    group.destroyChildren(); drawFrame(group, structuredClone(element));
    expect(pixels(group.toCanvas({ x: 0, y: 0, width: 200, height: 280 })).every((value, index) => value === first[index])).toBeTrue();
    group.destroyChildren(); element.properties.seed += 17; drawFrame(group, element);
    const variation = pixels(group.toCanvas({ x: 0, y: 0, width: 200, height: 280 }));
    let changed = 0;
    for (let index = 0; index < first.length; index++) if (first[index] !== variation[index]) changed++;
    expect(changed).toBeGreaterThan(500);
  });

  it('renders twelve distinct vector motifs without text or external images, including every container', async () => {
    const element = emblem(); element.properties.container = 'plain';
    const images = new Set<string>();
    for (const kind of CARD_ORNAMENT_MOTIFS) {
      group.destroyChildren(); element.properties.motif = kind; drawElement(group, element, data);
      expect(group.find('Text').length).toBe(0); expect(group.find('Image').length).toBe(0);
      const output = await png(100, 100, 1);
      images.add(output.toDataURL());
      expect(pixels(output).some((value, index) => index % 4 === 3 && value > 0)).withContext(kind).toBeTrue();
      expect(pixel(output, 0, 0)[3]).toBe(0);
    }
    expect(images.size).toBe(CARD_ORNAMENT_MOTIFS.length);
    for (const container of ['medallion', 'shield', 'plain'] as const) {
      group.destroyChildren(); element.properties.container = container; drawEmblem(group, element);
      const live = pixels(group.toCanvas({ x: 0, y: 0, width: 100, height: 100 }));
      expect(pixels(await png(100, 100, 1)).every((value, index) => value === live[index])).withContext(container).toBeTrue();
    }
  });

  it('changes the enamel, metal and icon colors and removes the relief when requested', () => {
    const element = emblem();
    drawEmblem(group, element);
    const original = pixels(group.toCanvas({ x: 0, y: 0, width: 100, height: 100 }));
    group.destroyChildren(); Object.assign(element.properties, { gemColor: '#275dc4', accentColor: '#b7e9ff', fill: '#ced9e1', relief: 0 });
    drawEmblem(group, element);
    expect(pixels(group.toCanvas({ x: 0, y: 0, width: 100, height: 100 })).some((value, index) => value !== original[index])).toBeTrue();
    const motif = group.findOne<Konva.Path>('.ornament-motif')!;
    expect(motif.strokeWidth()).toBe(0); expect(motif.shadowBlur()).toBe(0);
  });

  it('bounds geometry and node counts for tiny, very wide, very tall and maximum-size frames', () => {
    const element = frame(); Object.assign(element.properties, { borderWidth: 128, cornerRadius: 4096, detail: 12 });
    const counts: number[] = [];
    for (const [width, height] of [[8, 8], [8192, 8], [8, 8192], [8192, 8192], [13, 31]]) {
      group.destroyChildren(); Object.assign(element, { width, height }); drawFrame(group, element);
      const rect = group.getClientRect();
      expect([rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)).toBeTrue();
      expect(rect.width).toBeLessThanOrEqual(width + 1); expect(rect.height).toBeLessThanOrEqual(height + 1);
      counts.push(group.find(() => true).length);
      // Inspect a bounded crop rather than allocating an 8192² backing canvas.
      const output = group.toCanvas({ x: Math.max(0, width / 2 - 128), y: width < 256 ? Math.max(0, height / 2 - 128) : 0,
        width: Math.min(width, 256), height: Math.min(height, 256), pixelRatio: 1 });
      expect(output.width).toBeGreaterThan(0); expect(output.height).toBeGreaterThan(0);
      expect(pixels(output).some((value, index) => index % 4 === 3 && value > 0)).toBeTrue();
    }
    expect(Math.max(...counts)).toBeLessThan(150);
  });

  it('preserves the original simple frame preset as a rect', () => {
    expect(createCanvasElement('frame', data).type).toBe('rect');
  });

  it('accepts empty colors as transparency in metallic and enamel gradients without breaking rendering or export', async () => {
    const colors = { fill: '', stroke: '', accentColor: '', gemColor: '' };
    for (const element of [frame(), emblem()]) {
      for (const key of Object.keys(colors)) {
        group.destroyChildren();
        const cleared = structuredClone(element);
        Object.assign(cleared.properties, { [key]: '' });
        drawElement(group, cleared, data);
        expect(() => group.toCanvas({ width: element.width, height: element.height })).withContext(`${element.type}/${key}`).not.toThrow();
        const output = await png(element.width, element.height, 1);
        expect(pixels(output).some((value, index) => index % 4 === 3 && value > 0)).withContext(`${element.type}/${key}`).toBeTrue();
      }
      group.destroyChildren(); Object.assign(element.properties, colors);
      drawElement(group, element, data);
      expect(() => group.toCanvas({ width: element.width, height: element.height })).withContext(`${element.type}/all empty`).not.toThrow();
      expect(pixels(await png(element.width, element.height, 1)).every((value, index) => index % 4 !== 3 || value === 0)).toBeTrue();
    }
  });
});
