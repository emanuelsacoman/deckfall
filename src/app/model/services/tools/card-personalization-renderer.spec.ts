import Konva from 'konva';
import { CardCanvasElement, CardEditorDocument, ImageProperties } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';
import { CardCanvasView, CardKonvaRenderer, CardRendererEvents } from './card-konva-renderer';

describe('Personalização de cartas com pixels reais do Konva', () => {
  let host: HTMLDivElement;
  let renderer: CardKonvaRenderer;
  let editor: CardEditorDocument;
  let events: jasmine.SpyObj<CardRendererEvents>;
  const view: CardCanvasView = { zoom: 1, grid: false, snap: false, mode: 'preview', busy: false, selectedId: null };

  beforeEach(() => {
    host = document.createElement('div'); host.style.cssText = 'width:300px;height:300px';
    document.body.appendChild(host);
    events = jasmine.createSpyObj<CardRendererEvents>('events', ['select', 'change', 'zoom', 'error']);
    renderer = new CardKonvaRenderer(host, events);
    const data = defaultCardData();
    editor = { data, canvas: { ...fantasyBasicCanvas(data), width: 160, height: 200, elements: [],
      background: { kind: 'solid', color: 'transparent', color2: 'transparent', angle: 0, assetId: null } } };
  });

  afterEach(() => { renderer.destroy(); host.remove(); });

  function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
    return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
  }

  async function exported(pixelRatio: 1 | 2 | 4 = 1): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(await renderer.exportImage({ format: 'png', pixelRatio }));
    const output = document.createElement('canvas'); output.width = bitmap.width; output.height = bitmap.height;
    output.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
    return output;
  }

  function live(): HTMLCanvasElement {
    const content = renderer.stage.findOne<Konva.Group>('.card-content')!;
    return content.toCanvas({ x: content.x(), y: content.y(), width: editor.canvas.width, height: editor.canvas.height, pixelRatio: 1 });
  }

  async function png(draw: (context: CanvasRenderingContext2D) => void): Promise<Blob> {
    const source = document.createElement('canvas'); source.width = 16; source.height = 16;
    draw(source.getContext('2d')!);
    return new Promise<Blob>((resolve, reject) => source.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG fixture indisponível.')), 'image/png'));
  }

  function imageElement(type: 'image' | 'artwork', file: Blob): Extract<CardCanvasElement, { type: 'image' | 'artwork' }> {
    const element = createCanvasElement(type, editor.data);
    if (element.type !== 'image' && element.type !== 'artwork') throw new Error('Imagem ausente no fixture.');
    Object.assign(element, { x: 20, y: 20, width: 64, height: 64 });
    Object.assign(element.properties, { assetId: 'source', fit: 'fill', mask: 'none' });
    editor.canvas.assets = [{ id: 'source', storagePath: null, fileName: 'source.png', contentType: 'image/png', size: file.size }];
    editor.canvas.elements = [element];
    return element;
  }

  function inkRows(output: HTMLCanvasElement): number[] {
    const rows: number[] = [];
    const context = output.getContext('2d')!;
    for (let y = 0; y < output.height; y++) {
      const data = context.getImageData(0, y, output.width, 1).data;
      if (data.some((value, index) => index % 4 === 3 && value > 0)) rows.push(y);
    }
    return rows;
  }

  it('posiciona texto e atributos no topo ou base sem alterar seus dados nem geometria', async () => {
    for (const preset of ['text', 'attribute'] as const) {
      const element = createCanvasElement(preset, editor.data);
      if (element.type !== 'text' && element.type !== 'attribute') throw new Error('Texto ausente no fixture.');
      Object.assign(element, { x: 20, y: 20, width: 120, height: 90 });
      Object.assign(element.properties, { fontFamily: 'Arial', fontSize: 20, fill: '#000000', strokeWidth: 0, fontStyle: 'normal' });
      if (element.type === 'text') { element.properties.text = 'TEST'; element.properties.lineHeight = 1; }
      else if (element.type === 'attribute') { element.properties.labelMode = 'value'; element.properties.suffix = ''; element.properties.showIcon = false; }
      editor.canvas.elements = [element];
      const originalData = JSON.stringify(editor.data);
      element.properties.verticalAlign = 'top';
      renderer.render(editor, view, {});
      const topRows = inkRows(await exported());
      element.properties.verticalAlign = 'bottom';
      renderer.render(editor, view, {});
      const bottomRows = inkRows(await exported());
      expect(topRows.length).withContext(preset).toBeGreaterThan(0);
      expect(bottomRows[0] - topRows[0]).withContext(preset).toBeGreaterThan(60);
      expect(bottomRows.at(-1)!).withContext(preset).toBeLessThanOrEqual(110);
      expect(element.x).toBe(20); expect(element.y).toBe(20); expect(element.height).toBe(90);
      expect(JSON.stringify(editor.data)).toBe(originalData);
    }
  });

  it('exporta sublinhado e tachado visíveis e conserva o alinhamento antigo quando não configurado', async () => {
    const text = createCanvasElement('text', editor.data), attribute = createCanvasElement('attribute', editor.data);
    if (text.type !== 'text' || attribute.type !== 'attribute') throw new Error('Texto ausente no fixture.');
    Object.assign(text, { x: 20, y: 20, width: 120, height: 60 });
    Object.assign(text.properties, { text: 'TEST', fontFamily: 'Arial', fontSize: 24, fill: '#000000', lineHeight: 1 });
    editor.canvas.elements = [text, attribute];
    renderer.render(editor, view, {});
    expect(renderer.stage.findOne<Konva.Group>(`#${text.id}`)!.findOne<Konva.Text>('Text')!.verticalAlign()).toBe('top');
    expect(renderer.stage.findOne<Konva.Group>(`#${attribute.id}`)!.findOne<Konva.Text>('Text')!.verticalAlign()).toBe('middle');
    editor.canvas.elements = [text];
    const opaquePixels = (output: HTMLCanvasElement): number => output.getContext('2d')!.getImageData(0, 0, output.width, output.height)
      .data.filter((value, index) => index % 4 === 3 && value > 0).length;
    renderer.render(editor, view, {});
    const plain = opaquePixels(await exported());
    for (const decoration of ['underline', 'line-through', 'underline line-through'] as const) {
      text.properties.textDecoration = decoration;
      renderer.render(editor, view, {});
      expect(opaquePixels(await exported())).withContext(decoration).toBeGreaterThan(plain);
    }
  });

  it('desenha bordas tracejadas e pontilhadas com lacunas reais na visualização e exportação', async () => {
    const frame = createCanvasElement('frame', editor.data);
    if (frame.type !== 'rect') throw new Error('Moldura ausente no fixture.');
    Object.assign(frame, { x: 20, y: 40, width: 120, height: 100 });
    Object.assign(frame.properties, { fill: 'transparent', stroke: '#000000', strokeWidth: 4, cornerRadius: 0 });
    editor.canvas.elements = [frame];
    for (const borderStyle of ['solid', 'dashed', 'dotted'] as const) {
      frame.properties.borderStyle = borderStyle;
      renderer.render(editor, view, {});
      for (const output of [live(), await exported()]) {
        const alphas = Array.from({ length: 100 }, (_, index) => pixel(output, index + 30, 40)[3]);
        if (borderStyle === 'solid') expect(alphas.every(alpha => alpha === 255)).toBeTrue();
        else {
          expect(alphas.some(alpha => alpha === 0)).withContext(borderStyle).toBeTrue();
          expect(alphas.some(alpha => alpha > 200)).withContext(borderStyle).toBeTrue();
        }
        expect(pixel(output, 60, 80)[3]).toBe(0);
      }
    }
  });

  it('espelha apenas pixels de image e artwork dentro do frame, preservando áreas transparentes e alpha', async () => {
    const file = await png(context => {
      context.fillStyle = '#ff0000'; context.fillRect(0, 0, 8, 8);
      context.fillStyle = '#00ff00'; context.fillRect(8, 0, 8, 8);
      context.globalAlpha = 0.5; context.fillStyle = '#0000ff'; context.fillRect(0, 8, 8, 8);
    });
    const url = URL.createObjectURL(file);
    try {
      for (const type of ['image', 'artwork'] as const) {
        const element = imageElement(type, file);
        const originalGeometry = [element.x, element.y, element.width, element.height, element.rotation];
        const colors = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 128], [0, 0, 0, 0]];
        for (const { flipX, flipY, order } of [
          { flipX: false, flipY: false, order: [0, 1, 2, 3] },
          { flipX: true, flipY: false, order: [1, 0, 3, 2] },
          { flipX: false, flipY: true, order: [2, 3, 0, 1] },
          { flipX: true, flipY: true, order: [3, 2, 1, 0] }
        ]) {
          Object.assign(element.properties, { flipX, flipY });
          renderer.render(editor, view, { source: url });
          const before = JSON.stringify(editor);
          for (const output of [await exported(), live()]) {
            [[36, 36], [68, 36], [36, 68], [68, 68]].forEach(([x, y], index) =>
              expect(pixel(output, x, y)).withContext(`${type}/${flipX}/${flipY}/${index}`).toEqual(colors[order[index]]));
          }
          expect(JSON.stringify(editor)).toBe(before);
          expect([element.x, element.y, element.width, element.height, element.rotation]).toEqual(originalGeometry);
        }
      }
      expect(events.error).not.toHaveBeenCalled();
    } finally { URL.revokeObjectURL(url); }
  });

  it('mantém crop, máscaras e contorno fixos ao combinar espelhamento com filtro', async () => {
    const file = await png(context => { context.fillStyle = '#00ff00'; context.fillRect(8, 0, 8, 8); });
    const url = URL.createObjectURL(file);
    try {
      const element = imageElement('image', file);
      Object.assign(element.properties, { crop: { x: 0.5, y: 0, width: 0.5, height: 1 }, filter: 'sepia',
        flipX: true, flipY: true, stroke: '#000000', strokeWidth: 4, cornerRadius: 20 });
      for (const mask of ['rounded', 'ellipse'] as const) {
        element.properties.mask = mask;
        renderer.render(editor, view, { source: url });
        for (const output of [await exported(), live()]) {
          expect(pixel(output, 20, 20)[3]).withContext(mask).toBe(0);
          expect(pixel(output, 52, 20)).withContext(`${mask}: stationary border`).toEqual([0, 0, 0, 255]);
          expect(pixel(output, 52, 36)[3]).withContext(`${mask}: flipped alpha`).toBe(0);
          const colored = pixel(output, 52, 68);
          expect(colored[3]).withContext(`${mask}: cropped pixels`).toBe(255);
          expect(colored.slice(0, 3)).withContext(`${mask}: sepia`).not.toEqual([0, 255, 0]);
        }
      }
    } finally { URL.revokeObjectURL(url); }
  });

  it('aplica cada ajuste RGB sem modificar transparência e exporta as mesmas cores em 1×, 2× e 4×', async () => {
    const file = await png(context => {
      context.fillStyle = 'rgb(120,80,40)'; context.fillRect(0, 0, 8, 8);
      context.globalAlpha = 0.5; context.fillRect(8, 0, 8, 8);
    });
    const url = URL.createObjectURL(file);
    try {
      const element = imageElement('image', file);
      renderer.render(editor, view, { source: url });
      const original = await exported();
      const normal = pixel(original, 36, 36);
      const neutral: Pick<ImageProperties, 'brightness' | 'contrast' | 'saturation' | 'hue'> = { brightness: 0, contrast: 0, saturation: 0, hue: 0 };
      const adjustments = [{ brightness: 0.2 }, { contrast: 50 }, { saturation: 0.75 }, { hue: 90 },
        { brightness: -0.1, contrast: -20, saturation: -0.5, hue: -120, filter: 'sepia' }] as const;
      for (const [index, adjustment] of adjustments.entries()) {
        Object.assign(element.properties, neutral, { filter: 'none' }, adjustment);
        renderer.render(editor, view, { source: url });
        const liveOutput = live(), changed = pixel(liveOutput, 36, 36);
        expect(changed.slice(0, 3)).withContext(JSON.stringify(adjustment)).not.toEqual(normal.slice(0, 3));
        expect(changed[3]).toBe(255);
        expect(pixel(liveOutput, 68, 36)[3]).toBe(128);
        expect(pixel(liveOutput, 36, 68)).toEqual([0, 0, 0, 0]);
        const ratios: readonly (1 | 2 | 4)[] = index === adjustments.length - 1 ? [1, 2, 4] : [1];
        for (const ratio of ratios) {
          const output = await exported(ratio);
          expect(pixel(output, 36 * ratio, 36 * ratio)).withContext(`${JSON.stringify(adjustment)}/${ratio}`).toEqual(changed);
          expect(pixel(output, 68 * ratio, 36 * ratio)[3]).toBe(128);
          expect(pixel(output, 36 * ratio, 68 * ratio)).toEqual([0, 0, 0, 0]);
        }
      }
      Object.assign(element.properties, neutral, { filter: 'none' });
      renderer.render(editor, view, { source: url });
      expect(pixel(await exported(), 36, 36)).toEqual(normal);
      const shape = renderer.stage.findOne<Konva.Group>(`#${element.id}`)!.findOne<Konva.Image>('Image')!;
      expect(shape.isCached()).toBeFalse();
      expect(events.error).not.toHaveBeenCalled();
    } finally { URL.revokeObjectURL(url); }
  });
});
