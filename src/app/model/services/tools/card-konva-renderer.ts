import Konva from 'konva';
import { CARD_IMAGE_TYPES } from '../../interfaces/Cards/card';
import {
  CARD_CANVAS_CONFIG, CardCanvasData, CardCanvasElement, CardEditorDocument, EditorExportOptions, EditorMode
} from '../../interfaces/Cards/card-canvas';
import { drawElement, elementText, gradient } from './card-konva-elements';
import { exportCardContent } from './card-export.service';

export interface CardCanvasView {
  zoom: number; grid: boolean; snap: boolean; mode: EditorMode; busy: boolean; selectedId: string | null;
}
export interface ElementGeometry {
  x: number; y: number; width: number; height: number; rotation: number;
}
export interface CardRendererEvents {
  select(id: string | null): void;
  change(id: string, geometry: ElementGeometry): void;
  zoom(value: number): void;
  error(message: string): void;
}
interface ImageEntry {
  source: string; image: HTMLImageElement; status: 'loading' | 'ready' | 'error'; pixels: number; error: string;
  ready: Promise<void>; finish(): void;
}
interface ElementNode { group: Konva.Group; signature: string; }

function resolvedAssetId(element: CardCanvasElement, canvas: CardCanvasData): string | null {
  if (element.type !== 'image' && element.type !== 'artwork') return null;
  if (element.type === 'image' && element.properties.binding === 'art') {
    const primary = canvas.elements.find(item => item.type === 'artwork' && item.properties.assetId !== null);
    if (primary?.type === 'artwork') return primary.properties.assetId;
  }
  return element.properties.assetId;
}

export class CardKonvaRenderer {
  readonly stage: Konva.Stage;
  private readonly contentLayer = new Konva.Layer();
  private readonly overlay = new Konva.Layer();
  private readonly content = new Konva.Group({ name: 'card-content' });
  private readonly background = new Konva.Group({ name: 'card-background' });
  private readonly grid = new Konva.Group({ listening: false });
  private readonly guides = new Konva.Group({ listening: false });
  private readonly transformer = new Konva.Transformer({ flipEnabled: false, keepRatio: false, ignoreStroke: true,
    boundBoxFunc: (previous, next) => {
      const minimum = CARD_CANVAS_CONFIG.minElementSize * (this.view?.zoom ?? 1);
      return next.width < minimum || next.height < minimum ? previous : next;
    } });
  private readonly nodes = new Map<string, ElementNode>();
  private readonly images = new Map<string, ImageEntry>();
  private readonly reportedErrors = new Set<string>();
  private document?: CardEditorDocument;
  private view?: CardCanvasView;
  private urls: Record<string, string> = {};
  private destroyed = false;
  private backgroundSignature = '';
  private gridSignature = '';
  private activeGesture: string | null = null;

  constructor(private readonly container: HTMLDivElement, private readonly events: CardRendererEvents) {
    this.stage = new Konva.Stage({ container, width: 1, height: 1 });
    this.stage.add(this.contentLayer, this.overlay);
    this.contentLayer.add(this.content);
    this.content.add(this.background);
    this.overlay.add(this.grid, this.guides, this.transformer);
    this.stage.on('click.editor tap.editor', event => {
      if (!this.editable()) return;
      if (!event.target.findAncestor('.editor-element', true)) this.events.select(null);
    });
    this.stage.on('wheel.editor', (event: Konva.KonvaEventObject<WheelEvent>) => {
      if (!event.evt.ctrlKey || this.view?.busy) return;
      event.evt.preventDefault();
      this.events.zoom((this.view?.zoom ?? 1) * (event.evt.deltaY > 0 ? 0.9 : 1.1));
    });
  }

  render(document: CardEditorDocument, view: CardCanvasView, urls: Record<string, string>): void {
    if (this.destroyed) return;
    this.document = document; this.view = view; this.urls = urls;
    if (!this.editable() && this.activeGesture) {
      const group = this.nodes.get(this.activeGesture)?.group;
      this.activeGesture = null; group?.stopDrag(); this.transformer.stopTransform(); this.guides.destroyChildren();
    }
    this.updateImages(document.canvas);
    this.updateViewport();
    this.drawBackground(document.canvas);
    const ids = new Set(document.canvas.elements.map(element => element.id));
    for (const [id, node] of this.nodes) {
      if (!ids.has(id)) { node.group.destroy(); this.nodes.delete(id); }
    }
    document.canvas.elements.forEach((element, index) => {
      let node = this.nodes.get(element.id);
      if (!node) {
        node = { group: this.createGroup(element.id), signature: '' };
        this.nodes.set(element.id, node);
        this.content.add(node.group);
      }
      const group = node.group;
      const assetId = resolvedAssetId(element, document.canvas);
      const image = this.image(assetId);
      const derived = element.type === 'bar' || element.type === 'attribute'
        ? document.data.attributes.find(attribute => attribute.key === element.properties.attributeKey) : elementText(element, document.data);
      const signature = JSON.stringify([element, derived, assetId, image?.src ?? '', view.mode]);
      if (node.signature !== signature && this.activeGesture !== element.id) {
        drawElement(group, element, document.data, image);
        node.signature = signature;
      }
      if (this.activeGesture !== element.id) group.setAttrs({ x: element.x, y: element.y,
        width: element.width, height: element.height, rotation: element.rotation, scaleX: 1, scaleY: 1 });
      group.setAttrs({ opacity: element.opacity, visible: element.visible,
        listening: this.editable() && !element.locked, draggable: this.editable() && !element.locked });
      group.zIndex(index + 1);
      group.find('.editor-placeholder').forEach(placeholder => placeholder.visible(view.mode !== 'preview'));
    });
    this.updateGrid();
    const selected = view.selectedId ? document.canvas.elements.find(element => element.id === view.selectedId) : undefined;
    const selectedNode = selected ? this.nodes.get(selected.id)?.group : undefined;
    this.transformer.nodes(this.editable() && selected?.visible && !selected.locked && selectedNode ? [selectedNode] : []);
    this.transformer.visible(this.editable());
    this.transformer.moveToTop();
  }

  resize(): void {
    if (!this.destroyed && this.document && this.view) this.updateViewport();
  }

  fitZoom(): number {
    const canvas = this.document?.canvas;
    if (!canvas) return 0.5;
    const width = Math.max(100, this.container.clientWidth - 48);
    const height = Math.max(100, this.container.clientHeight - 48);
    return Math.min(2, Math.max(0.1, Math.min(width / canvas.width, height / canvas.height)));
  }

  async exportImage(options: EditorExportOptions): Promise<Blob> {
    if (!this.document || this.destroyed) throw new Error('O canvas ainda não está pronto.');
    if (this.activeGesture) throw new Error('Conclua o movimento antes de exportar.');
    const references = this.referencedAssets(this.document.canvas);
    for (const id of references) {
      const image = this.images.get(id);
      if (!image) throw new Error('Aguarde o carregamento de todas as imagens antes de exportar.');
      if (image.status === 'loading') await this.waitForImage(image);
      if (this.destroyed || this.images.get(id) !== image) throw new Error('As imagens mudaram durante a exportação. Tente novamente.');
      if (image.status === 'error') throw new Error(image.error);
    }
    return exportCardContent(this.content, this.document.canvas.width, this.document.canvas.height, options);
  }

  destroy(): void {
    this.destroyed = true;
    for (const entry of this.images.values()) this.releaseImage(entry);
    this.images.clear(); this.nodes.clear();
    this.stage.off('.editor'); this.stage.destroy();
  }

  private editable(): boolean { return this.view?.mode === 'design' && !this.view.busy; }

  private elementEditable(id: string): boolean {
    const element = this.document?.canvas.elements.find(item => item.id === id);
    return this.editable() && !!element?.visible && !element.locked;
  }

  private createGroup(id: string): Konva.Group {
    const group = new Konva.Group({ id, name: 'editor-element' });
    group.on('click.editor tap.editor', event => {
      if (!this.elementEditable(id)) return;
      event.cancelBubble = true; this.events.select(id);
    });
    group.on('dragstart.editor transformstart.editor', () => {
      if (!this.elementEditable(id)) { group.stopDrag(); this.transformer.stopTransform(); return; }
      this.activeGesture = id;
      this.events.select(id);
    });
    group.on('dragmove.editor', () => {
      if (!this.elementEditable(id)) return;
      this.applySnap(id, group);
    });
    group.on('dragend.editor transformend.editor', () => {
      const element = this.document?.canvas.elements.find(item => item.id === id);
      this.activeGesture = null; this.guides.destroyChildren();
      if (!element || !this.editable() || element.locked || !element.visible) {
        if (this.document && this.view) this.render(this.document, this.view, this.urls);
        return;
      }
      this.applySnap(id, group);
      const geometry = {
        x: Math.max(-8192, Math.min(8192, group.x())), y: Math.max(-8192, Math.min(8192, group.y())),
        rotation: ((group.rotation() + 180) % 360 + 360) % 360 - 180,
        width: Math.min(8192, Math.max(CARD_CANVAS_CONFIG.minElementSize, element.width * group.scaleX())),
        height: Math.min(8192, Math.max(CARD_CANVAS_CONFIG.minElementSize, element.height * group.scaleY()))
      };
      group.scale({ x: 1, y: 1 });
      this.guides.destroyChildren();
      this.events.change(id, geometry);
    });
    return group;
  }

  private updateViewport(): void {
    if (!this.document || !this.view) return;
    const canvas = this.document.canvas, zoom = this.view.zoom;
    const width = Math.max(this.container.clientWidth || 300, canvas.width * zoom + 48);
    const height = Math.max(this.container.clientHeight || 400, canvas.height * zoom + 48);
    this.stage.size({ width, height });
    const position = { x: (width - canvas.width * zoom) / 2, y: (height - canvas.height * zoom) / 2 };
    for (const group of [this.content, this.grid, this.guides]) {
      group.position(position); group.scale({ x: zoom, y: zoom });
    }
    this.content.setAttrs({ clipX: 0, clipY: 0, clipWidth: canvas.width, clipHeight: canvas.height });
    this.transformer.forceUpdate();
  }

  private drawBackground(canvas: CardCanvasData): void {
    const image = this.image(canvas.background.assetId);
    const signature = JSON.stringify([canvas.width, canvas.height, canvas.background, image?.src ?? '']);
    if (signature === this.backgroundSignature) return;
    this.backgroundSignature = signature;
    this.background.destroyChildren();
    const background = canvas.background;
    this.background.add(new Konva.Rect({ width: canvas.width, height: canvas.height, fill: background.color,
      ...(background.kind === 'gradient' ? gradient(canvas.width, canvas.height, background.angle, background.color, background.color2) : {}) }));
    if (image && background.kind === 'texture') {
      this.background.add(new Konva.Rect({ width: canvas.width, height: canvas.height,
        fillPatternImage: image, fillPatternRepeat: 'repeat' }));
    } else if (image && background.kind === 'image') {
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      this.background.add(new Konva.Image({ image, width: image.naturalWidth * scale, height: image.naturalHeight * scale,
        x: (canvas.width - image.naturalWidth * scale) / 2, y: (canvas.height - image.naturalHeight * scale) / 2 }));
    }
  }

  private updateGrid(): void {
    if (!this.document || !this.view) return;
    const canvas = this.document.canvas;
    this.grid.visible(this.view.grid && this.view.mode === 'design');
    const signature = `${canvas.width}:${canvas.height}`;
    if (signature === this.gridSignature) return;
    this.gridSignature = signature; this.grid.destroyChildren();
    for (let x = 0; x <= canvas.width; x += CARD_CANVAS_CONFIG.gridSize) {
      this.grid.add(new Konva.Line({ points: [x, 0, x, canvas.height], stroke: '#9dacbf', strokeWidth: 0.5, opacity: 0.35 }));
    }
    for (let y = 0; y <= canvas.height; y += CARD_CANVAS_CONFIG.gridSize) {
      this.grid.add(new Konva.Line({ points: [0, y, canvas.width, y], stroke: '#9dacbf', strokeWidth: 0.5, opacity: 0.35 }));
    }
  }

  private applySnap(id: string, group: Konva.Group): void {
    this.guides.destroyChildren();
    if (!this.view?.snap || !this.document) return;
    const canvas = this.document.canvas;
    const element = canvas.elements.find(item => item.id === id);
    if (!element) return;
    const xs = [0, canvas.width / 2, canvas.width], ys = [0, canvas.height / 2, canvas.height];
    for (const other of canvas.elements) {
      if (other.id === id || !other.visible) continue;
      xs.push(other.x, other.x + other.width / 2, other.x + other.width);
      ys.push(other.y, other.y + other.height / 2, other.y + other.height);
    }
    const width = element.width * group.scaleX(), height = element.height * group.scaleY();
    const snap = (position: number, size: number, stops: number[]) => {
      const threshold = CARD_CANVAS_CONFIG.snapDistance / this.view!.zoom;
      const grid = Math.round(position / CARD_CANVAS_CONFIG.gridSize) * CARD_CANVAS_CONFIG.gridSize;
      let delta = Math.abs(grid - position) <= threshold ? grid - position : 0;
      let target: number | null = delta ? grid : null;
      let distance = delta ? Math.abs(delta) : Infinity;
      for (const stop of stops) for (const anchor of [position, position + size / 2, position + size]) {
        const difference = stop - anchor;
        if (Math.abs(difference) <= threshold && Math.abs(difference) < distance) {
          delta = difference; distance = Math.abs(difference); target = stop;
        }
      }
      return { position: position + delta, target };
    };
    const x = snap(group.x(), width, xs), y = snap(group.y(), height, ys);
    group.position({ x: x.position, y: y.position });
    if (x.target !== null) this.guides.add(new Konva.Line({ points: [x.target, 0, x.target, canvas.height], stroke: '#d24cb5', strokeWidth: 1, dash: [5, 4] }));
    if (y.target !== null) this.guides.add(new Konva.Line({ points: [0, y.target, canvas.width, y.target], stroke: '#d24cb5', strokeWidth: 1, dash: [5, 4] }));
  }

  private referencedAssets(canvas: CardCanvasData): Set<string> {
    const ids = new Set<string>();
    if ((canvas.background.kind === 'image' || canvas.background.kind === 'texture') && canvas.background.assetId) ids.add(canvas.background.assetId);
    for (const element of canvas.elements) {
      const id = resolvedAssetId(element, canvas);
      if (id) ids.add(id);
    }
    return ids;
  }

  private image(id: string | null): HTMLImageElement | undefined {
    const entry = id ? this.images.get(id) : undefined;
    return entry?.status === 'ready' ? entry.image : undefined;
  }

  private updateImages(canvas: CardCanvasData): void {
    const referenced = this.referencedAssets(canvas);
    for (const [id, entry] of this.images) {
      if (!referenced.has(id) || this.urls[id] !== entry.source) { this.releaseImage(entry); this.images.delete(id); }
    }
    for (const id of referenced) {
      if (this.images.has(id)) continue;
      const source = this.urls[id];
      const asset = canvas.assets.find(item => item.id === id);
      const image = new window.Image();
      let finish!: () => void;
      const ready = new Promise<void>(resolve => { finish = resolve; });
      const entry: ImageEntry = { source: source ?? '', image, status: 'loading', pixels: 0, error: '', ready, finish };
      this.images.set(id, entry);
      if (!source || !source.startsWith('blob:') || !asset || !CARD_IMAGE_TYPES.some(type => type === asset.contentType)) {
        this.imageFailure(id, entry, `A imagem ${asset?.fileName ?? id} ainda não está disponível para renderização.`);
        continue;
      }
      image.onload = () => {
        if (this.destroyed || this.images.get(id) !== entry) return;
        const pixels = image.naturalWidth * image.naturalHeight;
        const total = [...this.images.values()].reduce((sum, current) => sum + current.pixels, 0);
        if (!pixels || pixels > CARD_CANVAS_CONFIG.maxExportPixels || total + pixels > CARD_CANVAS_CONFIG.maxExportPixels) {
          this.imageFailure(id, entry, 'As imagens ultrapassam o limite de 32 milhões de pixels decodificados. Use imagens menores.');
          return;
        }
        entry.status = 'ready'; entry.pixels = pixels; entry.finish();
        if (this.document && this.view) this.render(this.document, this.view, this.urls);
      };
      image.onerror = () => this.imageFailure(id, entry, `Não foi possível carregar a imagem ${asset.fileName}. Reenvie o arquivo.`);
      image.src = source;
    }
  }

  private imageFailure(id: string, entry: ImageEntry, message: string): void {
    if (this.destroyed || this.images.get(id) !== entry) return;
    entry.status = 'error'; entry.error = message;
    entry.image.onload = null; entry.image.onerror = null; entry.image.src = ''; entry.finish();
    const key = `${id}:${entry.source}:${message}`;
    if (!this.reportedErrors.has(key)) { this.reportedErrors.add(key); this.events.error(message); }
  }

  private releaseImage(entry: ImageEntry): void {
    entry.image.onload = null; entry.image.onerror = null; entry.image.src = ''; entry.finish();
  }

  private async waitForImage(entry: ImageEntry): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([entry.ready, new Promise<void>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('O carregamento da imagem demorou demais. Tente novamente.')), 15_000);
      })]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}
