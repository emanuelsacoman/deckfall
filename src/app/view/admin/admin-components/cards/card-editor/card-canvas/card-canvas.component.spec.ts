import { TestBed } from '@angular/core/testing';
import Konva from 'konva';
import { CardEditorDocument } from '../../../../../../model/interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData, fantasyBasicCanvas } from '../../../../../../model/services/tools/card-canvas-factory';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { CardCanvasView, CardKonvaRenderer, CardRendererEvents } from '../../../../../../model/services/tools/card-konva-renderer';
import { CardCanvasComponent } from './card-canvas.component';

describe('Card canvas with real Konva rendering', () => {
  let host: HTMLDivElement;
  let renderer: CardKonvaRenderer;
  let events: jasmine.SpyObj<CardRendererEvents>;
  let document: CardEditorDocument;
  const view: CardCanvasView = { zoom: 0.5, grid: true, snap: false, mode: 'design', busy: false, selectedId: null };

  beforeEach(() => {
    host = window.document.createElement('div');
    host.style.cssText = 'width:500px;height:500px';
    window.document.body.appendChild(host);
    events = jasmine.createSpyObj<CardRendererEvents>('events', ['select', 'change', 'zoom', 'error']);
    renderer = new CardKonvaRenderer(host, events);
    const data = defaultCardData();
    const canvas = fantasyBasicCanvas(data);
    document = { data, canvas: { ...canvas, width: 160, height: 200, elements: [],
      background: { kind: 'solid', color: '#ff0000', color2: '#ff0000', angle: 0, assetId: null } } };
  });

  afterEach(() => { renderer.destroy(); host.remove(); });

  async function transparentPng(): Promise<Blob> {
    const source = window.document.createElement('canvas'); source.width = 16; source.height = 16;
    const context = source.getContext('2d')!;
    context.fillStyle = '#0000ff'; context.globalAlpha = 0.5; context.fillRect(4, 4, 4, 8);
    context.globalAlpha = 1; context.fillRect(8, 4, 4, 8);
    return new Promise<Blob>((resolve, reject) => source.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('Could not create PNG fixture')), 'image/png'));
  }

  async function decodePng(blob: Blob): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(blob);
    const canvas = window.document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
    return canvas;
  }

  function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
    return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
  }

  function liveContent(currentRenderer: CardKonvaRenderer, currentDocument: CardEditorDocument): HTMLCanvasElement {
    const content = currentRenderer.stage.findOne<Konva.Group>('.card-content')!;
    return content.toCanvas({ x: content.x(), y: content.y(), width: currentDocument.canvas.width,
      height: currentDocument.canvas.height, pixelRatio: 1 });
  }

  it('reveals lower layers through PNG transparency and contain margins for images and artwork', async () => {
    const file = await transparentPng(), url = URL.createObjectURL(file);
    try {
      for (const preset of ['image', 'artwork'] as const) {
        const below = createCanvasElement('rect', document.data);
        Object.assign(below, { x: 20, y: 20, width: 64, height: 96 });
        if (below.type !== 'rect') throw new Error('Expected rectangle');
        below.properties.fill = '#00ff00'; below.properties.cornerRadius = 0;
        const image = createCanvasElement(preset, document.data);
        if (image.type !== 'image' && image.type !== 'artwork') throw new Error('Expected image element');
        Object.assign(image, { x: 20, y: 20, width: 64, height: 96 });
        image.properties.assetId = 'transparent'; image.properties.fit = 'contain'; image.properties.mask = 'none';
        document.canvas.elements = [below, image];
        document.canvas.assets = [{ id: 'transparent', storagePath: null, fileName: 'transparent.png', contentType: 'image/png', size: file.size }];
        renderer.render(document, { ...view, zoom: 1, grid: false }, { transparent: url });
        const exported = await decodePng(await renderer.exportImage({ format: 'png', pixelRatio: 1 }));
        for (const output of [liveContent(renderer, document), exported]) {
          expect(pixel(output, 0, 0)).withContext(preset).toEqual([255, 0, 0, 255]);
          expect(pixel(output, 52, 24)).withContext(`${preset}: contain margin`).toEqual([0, 255, 0, 255]);
          expect(pixel(output, 26, 42)).withContext(`${preset}: transparent PNG margin`).toEqual([0, 255, 0, 255]);
          expect(pixel(output, 42, 66)).withContext(`${preset}: half-transparent PNG`).toEqual([0, 127, 128, 255]);
          expect(pixel(output, 62, 66)).withContext(`${preset}: opaque PNG`).toEqual([0, 0, 255, 255]);
        }
      }
      expect(events.error).not.toHaveBeenCalled();
    } finally { URL.revokeObjectURL(url); }
  });

  it('preserves PNG alpha in live rendering and export with image filters and a transparent card background', async () => {
    const currentRenderer = renderer, currentDocument = document, currentEvents = events;
    const file = await transparentPng(), url = URL.createObjectURL(file);
    currentDocument.canvas.background.color = 'transparent';
    try {
      for (const preset of ['image', 'artwork'] as const) {
        const image = createCanvasElement(preset, currentDocument.data);
        if (image.type !== 'image' && image.type !== 'artwork') throw new Error('Expected image element');
        Object.assign(image, { x: 20, y: 20, width: 64, height: 64 });
        image.properties.assetId = 'transparent'; image.properties.fit = 'fill';
        currentDocument.canvas.elements = [image];
        currentDocument.canvas.assets = [{ id: 'transparent', storagePath: null, fileName: 'transparent.png', contentType: 'image/png', size: file.size }];
        for (const { filter, pixelRatio } of [
          { filter: 'none', pixelRatio: 1 }, { filter: 'grayscale', pixelRatio: 2 }, { filter: 'sepia', pixelRatio: 4 }
        ] as const) {
          image.properties.filter = filter;
          currentRenderer.render(currentDocument, { ...view, zoom: 1, grid: false }, { transparent: url });
          const output = await decodePng(await currentRenderer.exportImage({ format: 'png', pixelRatio }));
          expect(output.width).toBe(160 * pixelRatio); expect(output.height).toBe(200 * pixelRatio);
          expect(pixel(output, 26 * pixelRatio, 50 * pixelRatio)[3]).withContext(`${preset}/${filter}: transparent`).toBe(0);
          expect(pixel(output, 42 * pixelRatio, 50 * pixelRatio)[3]).withContext(`${preset}/${filter}: semi-transparent`).toBe(128);
          expect(pixel(output, 62 * pixelRatio, 50 * pixelRatio)[3]).withContext(`${preset}/${filter}: opaque`).toBe(255);
          expect(pixel(output, 0, 0)).withContext(`${preset}/${filter}: card background`).toEqual([0, 0, 0, 0]);
          const live = liveContent(currentRenderer, currentDocument);
          expect(pixel(live, 26, 50)[3]).withContext(`${preset}/${filter}: live transparent`).toBe(0);
          expect(pixel(live, 42, 50)[3]).withContext(`${preset}/${filter}: live semi-transparent`).toBe(128);
          expect(pixel(live, 62, 50)[3]).withContext(`${preset}/${filter}: live opaque`).toBe(255);
        }
      }
      expect(currentEvents.error).not.toHaveBeenCalled();
    } finally { URL.revokeObjectURL(url); }
  });

  it('exports exact document dimensions at different pixel ratios without grid or selection', async () => {
    const element = createCanvasElement('rect', document.data);
    Object.assign(element, { x: 20, y: 20, width: 50, height: 50 });
    element.properties.fill = '#00ff00'; element.properties.strokeWidth = 0;
    document.canvas.elements = [element];
    const original = JSON.stringify(document);
    renderer.render(document, { ...view, selectedId: element.id }, {});
    const stage = renderer.stage;
    const first = await renderer.exportImage({ format: 'png', pixelRatio: 1 });
    const bitmap = await createImageBitmap(first);
    expect(bitmap.width).toBe(160); expect(bitmap.height).toBe(200);
    const pixels = window.document.createElement('canvas'); pixels.width = 160; pixels.height = 200;
    const context = pixels.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(Array.from(context.getImageData(40, 40, 1, 1).data)).toEqual([0, 255, 0, 255]);
    bitmap.close();
    for (const pixelRatio of [2, 4] as const) {
      renderer.render(document, { ...view, zoom: 1.5, mode: 'preview' }, {});
      const image = await createImageBitmap(await renderer.exportImage({ format: 'png', pixelRatio }));
      expect(image.width).toBe(160 * pixelRatio); expect(image.height).toBe(200 * pixelRatio); image.close();
    }
    expect(renderer.stage).toBe(stage);
    expect(JSON.stringify(document)).toBe(original);
  });

  it('normalizes Transformer scale into persisted geometry and resets it', () => {
    const element = createCanvasElement('rect', document.data);
    Object.assign(element, { x: 10, y: 15, width: 30, height: 40 });
    document.canvas.elements = [element];
    renderer.render(document, view, {});
    const group = renderer.stage.findOne<Konva.Group>(`#${element.id}`)!;
    group.scale({ x: 2, y: 3 }); group.rotation(400); group.fire('transformend');
    expect(events.change).toHaveBeenCalledWith(element.id, { x: 10, y: 15, width: 60, height: 120, rotation: 40 });
    expect(group.scaleX()).toBe(1); expect(group.scaleY()).toBe(1);
  });

  it('reuses nodes, renders safe data bindings and blocks locked or busy interactions', () => {
    const element = createCanvasElement('text', document.data);
    if (element.type !== 'text') throw new Error('Expected text');
    element.properties.binding = 'name';
    document.canvas.elements = [element];
    renderer.render(document, view, {});
    const group = renderer.stage.findOne<Konva.Group>(`#${element.id}`)!;
    document.data.name = 'Updated name';
    renderer.render(document, view, {});
    expect(renderer.stage.findOne(`#${element.id}`)).toBe(group);
    expect(group.findOne<Konva.Text>('Text')!.text()).toBe('Updated name');
    element.locked = true;
    renderer.render(document, { ...view, selectedId: element.id }, {});
    group.fire('click');
    expect(events.select).not.toHaveBeenCalled();
    expect(group.draggable()).toBeFalse();
    expect(renderer.stage.findOne<Konva.Transformer>('Transformer')!.nodes().length).toBe(0);
    element.locked = false;
    renderer.render(document, { ...view, busy: true }, {});
    group.fire('dragend');
    expect(events.change).not.toHaveBeenCalled();
  });

  it('refuses incomplete assets and export resolutions above the pixel budget', async () => {
    const element = createCanvasElement('image', document.data);
    if (element.type !== 'image') throw new Error('Expected image');
    element.properties.assetId = 'missing';
    document.canvas.elements = [element];
    document.canvas.assets = [{ id: 'missing', storagePath: null, fileName: 'missing.png', contentType: 'image/png', size: 10 }];
    renderer.render(document, view, {});
    await expectAsync(renderer.exportImage({ format: 'png', pixelRatio: 1 })).toBeRejected();
    expect(events.error).not.toHaveBeenCalled();
    document.canvas.elements = []; document.canvas.assets = [];
    document.canvas.width = 2048; document.canvas.height = 2048;
    renderer.render(document, { ...view, zoom: 0.1, grid: false }, {});
    await expectAsync(renderer.exportImage({ format: 'png', pixelRatio: 4 })).toBeRejectedWithError(/32 milhões/);
  });

  it('loads an authenticated Blob asset and exports its decoded image as JPEG', async () => {
    const source = window.document.createElement('canvas'); source.width = 8; source.height = 8;
    const context = source.getContext('2d')!; context.fillStyle = '#0000ff'; context.fillRect(0, 0, 8, 8);
    const file = await new Promise<Blob>(resolve => source.toBlob(blob => resolve(blob!), 'image/png'));
    const url = URL.createObjectURL(file);
    try {
      const element = createCanvasElement('image', document.data);
      if (element.type !== 'image') throw new Error('Expected image');
      Object.assign(element, { x: 0, y: 0, width: 160, height: 200 });
      element.properties.assetId = 'image'; element.properties.mask = 'none'; element.properties.filter = 'grayscale';
      document.canvas.elements = [element];
      document.canvas.assets = [{ id: 'image', storagePath: null, fileName: 'image.png', contentType: 'image/png', size: file.size }];
      renderer.render(document, view, { image: url });
      let result: Blob | null = null;
      for (let attempt = 0; attempt < 30 && !result; attempt++) {
        try { result = await renderer.exportImage({ format: 'jpeg', pixelRatio: 1 }); }
        catch { await new Promise<void>(resolve => setTimeout(resolve, 10)); }
      }
      expect(result).not.toBeNull(); expect(result!.type).toBe('image/jpeg');
      const bitmap = await createImageBitmap(result!);
      expect(bitmap.width).toBe(160); expect(bitmap.height).toBe(200); bitmap.close();
      expect(events.error).not.toHaveBeenCalled();
    } finally { URL.revokeObjectURL(url); }
  });

  it('updates an art-bound image and its exported pixels when the primary artwork changes', async () => {
    const createSource = async (color: string): Promise<Blob> => {
      const canvas = window.document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
      const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 8, 8);
      return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    };
    const first = await createSource('#0000ff'), second = await createSource('#00ff00');
    const urls = { first: URL.createObjectURL(first), second: URL.createObjectURL(second) };
    try {
      const artwork = createCanvasElement('artwork', document.data);
      const bound = createCanvasElement('image', document.data);
      if (artwork.type !== 'artwork' || bound.type !== 'image') throw new Error('Expected image elements');
      Object.assign(artwork, { x: 0, y: 0, width: 8, height: 8 });
      Object.assign(bound, { x: 20, y: 20, width: 100, height: 100 });
      artwork.properties.assetId = 'first'; artwork.properties.mask = 'none';
      bound.properties.assetId = null; bound.properties.binding = 'art'; bound.properties.mask = 'none';
      document.canvas.elements = [artwork, bound];
      document.canvas.assets = [
        { id: 'first', storagePath: null, fileName: 'first.png', contentType: 'image/png', size: first.size },
        { id: 'second', storagePath: null, fileName: 'second.png', contentType: 'image/png', size: second.size }
      ];
      const exportedPixel = async (): Promise<number[]> => {
        const bitmap = await createImageBitmap(await renderer.exportImage({ format: 'png', pixelRatio: 1 }));
        const canvas = window.document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
        return Array.from(context.getImageData(70, 70, 1, 1).data);
      };
      renderer.render(document, view, urls);
      expect(await exportedPixel()).toEqual([0, 0, 255, 255]);
      const group = renderer.stage.findOne<Konva.Group>(`#${bound.id}`)!;
      expect(group.findOne<Konva.Image>('Image')!.image()).not.toBeUndefined();
      artwork.properties.assetId = 'second';
      renderer.render(document, view, urls);
      expect(await exportedPixel()).toEqual([0, 255, 0, 255]);
      expect(renderer.stage.findOne(`#${bound.id}`)).toBe(group);
      expect(bound.properties.assetId).toBeNull();
      expect(events.error).not.toHaveBeenCalled();
    } finally { URL.revokeObjectURL(urls.first); URL.revokeObjectURL(urls.second); }
  });
});

describe('CardCanvasComponent lifecycle', () => {
  it('creates a real canvas and releases its stage on destruction', async () => {
    await TestBed.configureTestingModule({ imports: [CardCanvasComponent], providers: [CardEditorStateService] }).compileComponents();
    const fixture = TestBed.createComponent(CardCanvasComponent);
    fixture.detectChanges(); TestBed.flushEffects(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('canvas')).not.toBeNull();
    const bitmap = await createImageBitmap(await fixture.componentInstance.exportImage({ format: 'png', pixelRatio: 1 }));
    expect(bitmap.width).toBe(744); expect(bitmap.height).toBe(1039); bitmap.close();
    fixture.destroy();
    expect(host.querySelector('canvas')).toBeNull();
  });
});
