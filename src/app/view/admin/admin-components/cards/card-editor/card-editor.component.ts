import { Component, HostListener, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Card, CardDataInput, CardInput, CardOperationError } from '../../../../../model/interfaces/Cards/card';
import {
  CARD_CANVAS_CONFIG, CardCanvasAsset, CardCanvasElement, CardEditorAction,
  CardEditorDocument, EditorAssetSelection, EditorExportOptions
} from '../../../../../model/interfaces/Cards/card-canvas';
import { CardTemplate } from '../../../../../model/interfaces/Cards/card-template';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardTemplateService } from '../../../../../model/services/cruds/cards/card-template.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { defaultCardData, fantasyBasicCanvas, newEditorId, normalizeEditorAttributes } from '../../../../../model/services/tools/card-canvas-factory';
import { validateCardInput } from '../../../../../model/services/tools/card-validation';
import { CardEditorStateService } from '../../../../../model/services/tools/card-editor-state.service';
import { CardEditorAssetsService } from '../../../../../model/services/tools/card-editor-assets.service';
import { CardLocalDraftService } from '../../../../../model/services/tools/card-local-draft.service';
import { savedCardDocument } from '../../../../../model/services/tools/card-saved-document';
import { CardCanvasComponent } from './card-canvas/card-canvas.component';
import { CardToolbarComponent } from './card-toolbar/card-toolbar.component';
import { CardLayersComponent } from './card-layers/card-layers.component';
import { CardPropertiesComponent } from './card-properties/card-properties.component';
import { ElementLibraryComponent } from './element-library/element-library.component';
import { CardDataComponent } from './card-data/card-data.component';

@Component({
  selector: 'app-card-editor', standalone: true,
  imports: [FormsModule, RouterLink, CardCanvasComponent, CardToolbarComponent, CardLayersComponent,
    CardPropertiesComponent, ElementLibraryComponent, CardDataComponent],
  providers: [CardEditorStateService, CardEditorAssetsService],
  templateUrl: './card-editor.component.html', styleUrl: './card-editor.component.css'
})
export class CardEditorComponent implements OnChanges, OnDestroy {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() cardId: string | null = null;
  @ViewChild(CardCanvasComponent) private canvasView?: CardCanvasComponent;
  readonly state = inject(CardEditorStateService);
  readonly assets = inject(CardEditorAssetsService);
  private readonly cards = inject(CardService);
  private readonly templates = inject(CardTemplateService);
  private readonly storage = inject(CardStorageService);
  private readonly drafts = inject(CardLocalDraftService);
  private readonly router = inject(Router);
  private version = 0;
  private destroyed = false;
  private allowLeave = false;
  private localSavedSignature = '';
  private clipboard: { element: CardCanvasElement; assets: CardCanvasAsset[] } | null = null;
  readonly original = signal<Card | null>(null);
  readonly loading = signal(false);
  readonly retryingImages = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly feedback = signal('');
  readonly warnings = signal<string[]>([]);
  readonly recoveryId = signal<string | null>(null);
  readonly dataValid = signal(true);
  readonly modal = signal<'save-template' | 'load-template' | null>(null);
  readonly templateList = signal<CardTemplate[]>([]);
  readonly templateError = signal('');
  templateName = '';

  constructor() {
    effect(() => {
      const canvas = this.state.canvas();
      untracked(() => {
        void this.assets.ensure(canvas).catch(error => {
          if (!this.destroyed && this.state.canvas() === canvas && !this.assets.downloadErrors().length) this.error.set(this.message(error));
        });
      });
    }, { allowSignalWrites: true });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] || changes['cardId']) void this.loadCard();
  }

  async loadCard(): Promise<void> {
    const version = ++this.version;
    this.assets.reset(); this.localSavedSignature = ''; this.allowLeave = false; this.clipboard = null;
    this.loading.set(true); this.retryingImages.set(false); this.dataValid.set(true); this.loadError.set(''); this.error.set(''); this.feedback.set(''); this.recoveryId.set(null); this.original.set(null);
    const fresh = defaultCardData(); this.state.load({ data: fresh, canvas: fantasyBasicCanvas(fresh) });
    try {
      if (this.mode === 'edit') {
        if (!this.cardId) throw new Error('O endereço não contém o ID da carta.');
        const card = await this.cards.getById(this.cardId);
        if (!card) throw new Error('Carta não encontrada.');
        if (!this.isCurrent(version)) return;
        const document = this.documentFromCard(card);
        this.original.set(card); this.state.load(document); this.assets.markPersisted(document.canvas);
        // The asset effect downloads images independently; the document can be edited immediately.
      } else {
        const navigationState: unknown = this.router.getCurrentNavigation()?.extras.state ?? history.state;
        if (navigationState && typeof navigationState === 'object' && 'loadLocalDraft' in navigationState && navigationState.loadLocalDraft === true) {
          await this.loadLocal(false);
        }
      }
    } catch (error: unknown) {
      if (this.isCurrent(version)) this.loadError.set(this.message(error));
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  async retryImages(): Promise<void> {
    if (this.retryingImages() || this.loading() || this.state.busy()) return;
    const version = this.version;
    const canvas = this.state.canvas();
    this.retryingImages.set(true);
    this.assets.retryFailed();
    try { await this.assets.ensure(canvas); }
    catch (error: unknown) {
      if (this.isCurrent(version) && this.state.canvas() === canvas && !this.assets.downloadErrors().length) this.error.set(this.message(error));
    } finally { if (this.isCurrent(version)) this.retryingImages.set(false); }
  }

  async handleAction(action: CardEditorAction): Promise<void> {
    this.error.set('');
    try { switch (action) {
      case 'save': await this.save(); break;
      case 'save-template': this.templateName = `${this.state.data().name} — template`; this.modal.set('save-template'); break;
      case 'load-template': this.modal.set('load-template'); await this.listTemplates(); break;
      case 'duplicate-card': await this.duplicateCard(); break;
      case 'delete-card': await this.deleteCard(); break;
      case 'save-local': await this.saveLocal(); break;
      case 'load-local': await this.loadLocal(); break;
      case 'download-json': this.download(new Blob([JSON.stringify(this.validInput(), null, 2)], { type: 'application/json' }), 'carta.json'); break;
      case 'import-json': document.getElementById('editor-json-file')?.click(); break;
      case 'export': break;
    } } catch (error: unknown) { this.error.set(this.message(error)); }
  }

  async selectAsset(selection: EditorAssetSelection): Promise<void> {
    try {
      this.storage.validateImage(selection.file);
      const asset: CardCanvasAsset = { id: newEditorId(), storagePath: null, fileName: selection.file.name,
        contentType: selection.file.type, size: selection.file.size };
      const next = structuredClone(this.state.document());
      next.canvas.assets.push(asset);
      if (selection.elementId) {
        const element = next.canvas.elements.find(item => item.id === selection.elementId);
        if (!element || (element.type !== 'image' && element.type !== 'artwork')) throw new Error('Selecione uma camada de imagem para aplicar o arquivo.');
        element.properties.assetId = asset.id;
        if (selection.file.type === 'image/png') element.properties.fill = 'transparent';
      } else {
        next.canvas.background.assetId = asset.id;
        if (next.canvas.background.kind !== 'texture') next.canvas.background.kind = 'image';
      }
      const references = new Set<string>();
      if (next.canvas.background.assetId) references.add(next.canvas.background.assetId);
      for (const element of next.canvas.elements) {
        if ((element.type === 'image' || element.type === 'artwork') && element.properties.assetId) references.add(element.properties.assetId);
      }
      next.canvas.assets = next.canvas.assets.filter(item => references.has(item.id));
      if (next.canvas.assets.length > CARD_CANVAS_CONFIG.maxAssets) throw new Error('O limite de imagens da carta foi atingido.');
      this.assets.register(asset, selection.file);
      this.state.setDocument(next); this.error.set('');
    } catch (error: unknown) { this.error.set(this.message(error)); }
  }

  async save(): Promise<void> {
    if (this.state.busy() || !this.dataValid() || this.recoveryId() || this.loadError() || (this.mode === 'edit' && !this.original())) return;
    this.state.busy.set(true);
    try {
      const input = this.validInput();
      const original = this.original();
      let pending = this.assets.pending(this.state.canvas());
      const needsFile = (): boolean => input.canvas?.assets.some(asset => !pending.some(file => file.id === asset.id)
        && !(original && asset.storagePath && this.storage.isOwnedAsset({ kind: 'card', id: original.id }, asset.storagePath))) ?? false;
      if (needsFile()) {
        try { await this.assets.ensure(this.state.canvas()); }
        catch (error: unknown) {
          pending = this.assets.pending(this.state.canvas());
          if (needsFile()) throw error;
        }
        pending = this.assets.pending(this.state.canvas());
      }
      const result = original ? await this.cards.update(original, input, undefined, pending)
        : await this.cards.create(input, undefined, pending);
      this.warnings.set(result.warnings);
      // Record the ID before re-reading so a lost read cannot create a duplicate on retry.
      this.recoveryId.set(result.id);
      const saved = await this.cards.getById(result.id);
      if (!saved) throw new Error('A gravação foi concluída, mas a carta não pôde ser relida. Confira o ID antes de repetir.');
      this.original.set(saved);
      const document = this.documentFromCard(saved);
      this.state.acceptPersisted(document); this.assets.markPersisted(document.canvas);
      this.recoveryId.set(null); this.feedback.set('Carta salva no Firebase.');
      if (!original) { this.allowLeave = true; await this.router.navigate(['/admin/cartas/editar', result.id]); }
    } catch (error: unknown) {
      this.error.set(this.message(error));
      if (error instanceof CardOperationError && error.cardId) this.recoveryId.set(error.cardId);
    } finally { this.state.busy.set(false); }
  }

  async saveTemplate(): Promise<void> {
    if (this.state.busy()) return;
    this.state.busy.set(true);
    try {
      const input = this.validInput();
      const files = await this.assets.snapshotFiles(this.state.canvas());
      const result = await this.templates.create({ name: this.templateName.trim(), canvas: input.canvas!, attributes: input.attributes }, files);
      this.warnings.set(result.warnings); this.feedback.set('Template salvo no Firebase.'); this.modal.set(null);
    } catch (error: unknown) { this.templateError.set(this.message(error)); }
    finally { this.state.busy.set(false); }
  }

  async listTemplates(): Promise<void> {
    this.templateError.set('');
    try { this.templateList.set(await this.templates.list()); }
    catch (error: unknown) { this.templateError.set(this.message(error)); }
  }

  async applyTemplate(template: CardTemplate | null): Promise<void> {
    if (!window.confirm('Aplicar este template e substituir o design atual? Os dados da carta podem ser ajustados depois.')) return;
    this.state.busy.set(true);
    try {
      const data: CardDataInput = { ...this.state.data(), templateId: template?.id ?? null,
        attributes: template ? normalizeEditorAttributes(template.attributes) : this.state.data().attributes };
      const canvas = template ? structuredClone(template.canvas) : fantasyBasicCanvas(data);
      this.state.setDocument({ data, canvas }); this.state.select(null); this.state.requestFit(); this.modal.set(null);
      await this.assets.ensure(canvas);
    } catch (error: unknown) { this.templateError.set(this.message(error)); }
    finally { this.state.busy.set(false); }
  }

  async exportImage(options: EditorExportOptions): Promise<void> {
    if (!this.canvasView || this.state.busy()) return;
    this.state.busy.set(true);
    try {
      await this.assets.ensure(this.state.canvas());
      this.canvasView.assetUrls = this.assets.urls();
      const blob = await this.canvasView.exportImage(options);
      this.download(blob, `${this.state.data().name || 'carta'}.${options.format === 'jpeg' ? 'jpg' : 'png'}`);
      this.feedback.set('Imagem exportada com as dimensões reais da carta.');
    } catch (error: unknown) { this.error.set(this.message(error)); }
    finally { this.state.busy.set(false); }
  }

  async importJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    try {
      if (file.size > CARD_CANVAS_CONFIG.maxBytes) throw new Error('O JSON ultrapassa o limite de 128 KiB.');
      const value = validateCardInput(JSON.parse(await file.text()) as unknown);
      if (!value.canvas) throw new Error('O arquivo não contém um canvas do editor.');
      if (!window.confirm('Importar este documento e substituir o trabalho atual?')) return;
      this.state.setDocument({ data: this.dataFromInput(value), canvas: value.canvas });
      await this.assets.ensure(value.canvas);
      this.feedback.set('Documento importado. Imagens não incluídas no JSON precisam ser reenviadas ou acessíveis no Storage.');
    } catch (error: unknown) { this.error.set(this.message(error)); }
  }

  async saveLocal(): Promise<void> {
    try {
      this.validInput();
      const document = structuredClone(this.state.document());
      await this.drafts.save(this.localKey(), document, await this.assets.snapshotFiles(document.canvas));
      this.localSavedSignature = JSON.stringify(document);
      this.feedback.set('Rascunho e imagens salvos neste navegador. O Firebase não foi alterado.');
    } catch (error: unknown) { this.error.set(this.message(error)); }
  }

  async loadLocal(confirm = true): Promise<void> {
    try {
      const draft = await this.drafts.load(this.localKey());
      if (!draft) throw new Error('Nenhum rascunho local foi salvo para esta carta.');
      if (confirm && !window.confirm('Substituir o trabalho atual pelo rascunho salvo neste navegador?')) return;
      const validated = validateCardInput({ ...draft.document.data, canvas: draft.document.canvas });
      const document = { data: this.dataFromInput(validated), canvas: validated.canvas! };
      this.assets.restore(draft.files, document.canvas);
      this.state.setDocument(document); this.localSavedSignature = JSON.stringify(document); this.state.requestFit();
      this.feedback.set(`Rascunho local carregado (${new Date(draft.savedAt).toLocaleString('pt-BR')}).`);
    } catch (error: unknown) { this.error.set(this.message(error)); }
  }

  async duplicateCard(): Promise<void> {
    try {
      const document = structuredClone(this.state.document());
      document.data.name = `${document.data.name} (cópia)`.slice(0, 120); document.data.status = 'draft';
      const files = await this.assets.snapshotFiles(document.canvas);
      await this.drafts.save('new', document, files);
      this.allowLeave = true;
      if (this.mode === 'create') {
        this.original.set(null); this.recoveryId.set(null); this.assets.restore(files, document.canvas);
        this.state.load(document); this.state.setDocument(document); this.feedback.set('Cópia preparada. Salve para criar outra carta.');
      } else await this.router.navigate(['/admin/cartas/criar'], { state: { loadLocalDraft: true } });
    } catch (error: unknown) { this.error.set(this.message(error)); }
  }

  async deleteCard(): Promise<void> {
    const original = this.original();
    if (!original || !window.confirm(`Excluir “${original.name}” e seus arquivos? Esta ação não pode ser desfeita.`)) return;
    this.state.busy.set(true);
    try { await this.cards.delete(original); this.allowLeave = true; await this.router.navigate(['/admin/cartas/lista']); }
    catch (error: unknown) { this.error.set(this.message(error)); }
    finally { this.state.busy.set(false); }
  }

  canLeave(): boolean { return this.allowLeave || (!this.state.busy() && (!this.hasUnsavedChanges() || window.confirm('Há alterações sem salvar. Sair do editor?'))); }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.busy() || this.hasUnsavedChanges()) event.preventDefault();
  }
  @HostListener('document:keydown', ['$event']) keydown(event: KeyboardEvent): void {
    const target = event.target;
    if (this.state.busy() || this.modal() || this.state.mode() !== 'design' ||
        (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.state.redo() : this.state.undo(); }
    else if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); this.state.redo(); }
    else if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); this.state.duplicate(); }
    else if (command && event.key.toLowerCase() === 'c' && this.state.selectedElement()) {
      event.preventDefault(); const element = this.state.selectedElement()!;
      const assetId = element.type === 'image' || element.type === 'artwork' ? element.properties.assetId : null;
      this.clipboard = { element: structuredClone(element), assets: structuredClone(this.state.canvas().assets.filter(asset => asset.id === assetId)) };
    }
    else if (command && event.key.toLowerCase() === 'v' && this.clipboard) {
      event.preventDefault();
      if (this.state.canvas().elements.length >= CARD_CANVAS_CONFIG.maxElements) return;
      const source = this.clipboard.element;
      const element = { ...structuredClone(source), id: newEditorId(), x: source.x + 20, y: source.y + 20, locked: false };
      const missing = this.clipboard.assets.filter(asset => !this.state.canvas().assets.some(existing => existing.id === asset.id));
      if (this.state.canvas().assets.length + missing.length > CARD_CANVAS_CONFIG.maxAssets) return;
      this.state.setDocument({ ...this.state.document(), canvas: { ...this.state.canvas(),
        elements: [...this.state.canvas().elements, element], assets: [...this.state.canvas().assets, ...missing] } }); this.state.select(element.id);
    } else if (event.key === 'Delete') { event.preventDefault(); this.state.remove(); }
    else if (event.key === 'Escape') this.state.select(null);
  }
  ngOnDestroy(): void { this.destroyed = true; ++this.version; }
  reloadAfterError(): void {
    if (!this.state.busy() && window.confirm('Recarregar a carta salva e substituir as alterações locais?')) void this.loadCard();
  }
  private localKey(): string { return this.original()?.id ?? 'new'; }
  private hasUnsavedChanges(): boolean { return !this.dataValid() || (this.state.dirty() && JSON.stringify(this.state.document()) !== this.localSavedSignature); }
  private isCurrent(version: number): boolean { return !this.destroyed && version === this.version; }
  private validInput(): CardInput {
    if (!this.dataValid()) throw new Error('Revise os campos de dados da carta antes de salvar.');
    return validateCardInput({ ...this.state.data(), canvas: this.state.canvas() });
  }
  private dataFromInput(input: CardInput): CardDataInput {
    return { name: input.name, description: input.description, rarity: input.rarity, status: input.status,
      attributes: input.attributes, setId: input.setId, type: input.type ?? null,
      subtype: input.subtype ?? null, templateId: input.templateId ?? null };
  }
  private documentFromCard(card: Card): CardEditorDocument {
    return savedCardDocument(card);
  }
  private message(error: unknown): string { return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'; }
  private download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
