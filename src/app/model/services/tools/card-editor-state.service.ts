import { computed, Injectable, signal } from '@angular/core';
import { CardDataInput } from '../../interfaces/Cards/card';
import {
  CARD_CANVAS_CONFIG, CardCanvasBackground, CardCanvasElement, CardEditorDocument, CardElementPreset, EditorMode
} from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData, fantasyBasicCanvas, newEditorId, normalizeEditorAttributes } from './card-canvas-factory';

type ElementPatch = Partial<Pick<CardCanvasElement, 'name' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity' | 'visible' | 'locked'>>;
const initialData = (): CardEditorDocument => {
  const data = defaultCardData();
  return { data, canvas: fantasyBasicCanvas(data) };
};

@Injectable()
export class CardEditorStateService {
  private readonly value = signal<CardEditorDocument>(initialData());
  private readonly past = signal<CardEditorDocument[]>([]);
  private readonly future = signal<CardEditorDocument[]>([]);
  private readonly saved = signal(JSON.stringify(this.value()));
  private group = '';
  private lastChange = 0;
  readonly document = this.value.asReadonly();
  readonly data = computed(() => this.document().data);
  readonly canvas = computed(() => this.document().canvas);
  readonly selectedIds = signal<string[]>([]);
  readonly selectedElement = computed(() => this.canvas().elements.find(element => element.id === this.selectedIds()[0]) ?? null);
  readonly mode = signal<EditorMode>('design');
  readonly zoom = signal(0.5);
  readonly grid = signal(false);
  readonly snap = signal(true);
  readonly fitRevision = signal(0);
  readonly busy = signal(false);
  readonly dirty = computed(() => JSON.stringify(this.document()) !== this.saved());
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  load(document: CardEditorDocument): void {
    this.value.set(structuredClone({ ...document, data: { ...document.data, attributes: normalizeEditorAttributes(document.data.attributes) } }));
    this.past.set([]); this.future.set([]); this.selectedIds.set([]); this.group = '';
    this.markSaved(); this.requestFit();
  }
  markSaved(): void { this.saved.set(JSON.stringify(this.document())); }
  acceptPersisted(document: CardEditorDocument): void {
    this.value.set(structuredClone(document)); this.markSaved();
  }
  setMode(mode: EditorMode): void { this.mode.set(mode); }
  setZoom(zoom: number): void { this.zoom.set(Math.min(2, Math.max(0.1, zoom))); }
  requestFit(): void { this.fitRevision.update(value => value + 1); }
  select(id: string | null): void { this.selectedIds.set(id ? [id] : []); }

  updateData(data: CardDataInput): void {
    const previous = this.data();
    const next = structuredClone(this.document());
    next.data = structuredClone(data);
    for (const oldAttribute of previous.attributes) {
      const renamed = data.attributes.find(attribute => attribute.id && attribute.id === oldAttribute.id && attribute.key !== oldAttribute.key);
      if (!renamed) continue;
      for (const element of next.canvas.elements) {
        if ((element.type === 'text' || element.type === 'icon') && element.properties.binding === `attributes.${oldAttribute.key}`) {
          element.properties.binding = `attributes.${renamed.key}`;
        }
        if ((element.type === 'attribute' || element.type === 'bar') && element.properties.attributeKey === oldAttribute.key) {
          element.properties.attributeKey = renamed.key;
        }
      }
    }
    this.commit(next, 'data');
  }
  updateCanvasSettings(settings: { width?: number; height?: number; background?: Partial<CardCanvasBackground> }): void {
    const next = structuredClone(this.document());
    if (settings.width !== undefined) next.canvas.width = settings.width;
    if (settings.height !== undefined) next.canvas.height = settings.height;
    if (settings.background) Object.assign(next.canvas.background, settings.background);
    this.commit(next, 'canvas-settings');
  }
  addElement(preset: CardElementPreset): void {
    if (this.canvas().elements.length >= CARD_CANVAS_CONFIG.maxElements) return;
    const element = createCanvasElement(preset, this.data(), this.canvas().elements.length);
    this.commit({ ...this.document(), canvas: { ...this.canvas(), elements: [...this.canvas().elements, element] } });
    this.select(element.id);
  }
  updateElement(element: CardCanvasElement, coalesce = true): void {
    this.commit({ ...this.document(), canvas: { ...this.canvas(), elements: this.canvas().elements.map(item => item.id === element.id ? structuredClone(element) : item) } }, coalesce ? `element:${element.id}` : '');
  }
  patchElement(id: string, patch: ElementPatch): void {
    const element = this.canvas().elements.find(item => item.id === id);
    if (element) this.updateElement({ ...element, ...patch }, false);
  }
  remove(id = this.selectedIds()[0]): void {
    if (!id || this.canvas().elements.find(item => item.id === id)?.locked) return;
    const elements = this.canvas().elements.filter(item => item.id !== id);
    const references = new Set<string>();
    if (this.canvas().background.assetId) references.add(this.canvas().background.assetId!);
    for (const element of elements) {
      if ((element.type === 'image' || element.type === 'artwork') && element.properties.assetId) references.add(element.properties.assetId);
    }
    this.commit({ ...this.document(), canvas: { ...this.canvas(), elements,
      assets: this.canvas().assets.filter(asset => references.has(asset.id)) } });
    this.select(null);
  }
  duplicate(id = this.selectedIds()[0]): void {
    const source = this.canvas().elements.find(element => element.id === id);
    if (!source || this.canvas().elements.length >= CARD_CANVAS_CONFIG.maxElements) return;
    const element = { ...structuredClone(source), id: newEditorId(), name: `${source.name} (cópia)`, x: source.x + 20, y: source.y + 20, locked: false };
    this.commit({ ...this.document(), canvas: { ...this.canvas(), elements: [...this.canvas().elements, element] } });
    this.select(element.id);
  }
  toggleVisible(id: string): void {
    const element = this.canvas().elements.find(item => item.id === id);
    if (element) this.patchElement(id, { visible: !element.visible });
  }
  toggleLocked(id: string): void {
    const element = this.canvas().elements.find(item => item.id === id);
    if (element) this.patchElement(id, { locked: !element.locked });
  }
  reorder(ids: string[]): void {
    if (ids.length !== this.canvas().elements.length || new Set(ids).size !== ids.length) return;
    const elements = ids.map(id => this.canvas().elements.find(element => element.id === id));
    if (elements.some(element => !element)) return;
    this.commit({ ...this.document(), canvas: { ...this.canvas(), elements: elements as CardCanvasElement[] } });
  }
  moveLayer(id: string, direction: 'up' | 'down' | 'top' | 'bottom'): void {
    const ids = this.canvas().elements.map(element => element.id);
    const index = ids.indexOf(id);
    if (index < 0) return;
    ids.splice(index, 1);
    const target = direction === 'top' ? ids.length : direction === 'bottom' ? 0 : direction === 'up' ? Math.min(ids.length, index + 1) : Math.max(0, index - 1);
    ids.splice(target, 0, id); this.reorder(ids);
  }
  setDocument(document: CardEditorDocument): void {
    this.commit({ ...document, data: { ...document.data, attributes: normalizeEditorAttributes(document.data.attributes) } });
  }
  undo(): void {
    const previous = this.past().at(-1); if (!previous) return;
    this.future.update(items => [...items, structuredClone(this.document())]);
    this.past.update(items => items.slice(0, -1)); this.value.set(previous); this.select(null); this.group = '';
  }
  redo(): void {
    const next = this.future().at(-1); if (!next) return;
    this.past.update(items => [...items, structuredClone(this.document())]);
    this.future.update(items => items.slice(0, -1)); this.value.set(next); this.select(null); this.group = '';
  }
  private commit(document: CardEditorDocument, group = ''): void {
    if (JSON.stringify(document) === JSON.stringify(this.document())) return;
    const now = Date.now();
    if (!group || this.group !== group || now - this.lastChange > 700) {
      this.past.update(items => [...items, structuredClone(this.document())].slice(-CARD_CANVAS_CONFIG.historyLimit));
    }
    this.group = group; this.lastChange = now; this.future.set([]); this.value.set(structuredClone(document));
  }
}
