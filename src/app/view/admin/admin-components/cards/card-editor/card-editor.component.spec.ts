import { TestBed } from '@angular/core/testing';
import { Navigation, provideRouter, Router } from '@angular/router';
import { Card, CardOperationError } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardTemplateService } from '../../../../../model/services/cruds/cards/card-template.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { CardEditorComponent } from './card-editor.component';
import { defaultCardData, fantasyBasicCanvas } from '../../../../../model/services/tools/card-canvas-factory';

describe('Editor — criação, reabertura e uploads', () => {
  let cards: jasmine.SpyObj<CardService>;
  let templates: jasmine.SpyObj<CardTemplateService>;
  let stored: Card | null;
  let storage: jasmine.SpyObj<CardStorageService>;

  beforeEach(async () => {
    stored = null;
    cards = jasmine.createSpyObj<CardService>('CardService', ['getById', 'create', 'update', 'delete']);
    templates = jasmine.createSpyObj<CardTemplateService>('CardTemplateService', ['list', 'create']);
    storage = jasmine.createSpyObj<CardStorageService>('Storage', ['validateImage', 'getAssetBlob', 'isOwnedAsset']);
    storage.isOwnedAsset.and.callFake((owner, path) => path.startsWith(`cards/${owner.id}/`));
    cards.create.and.callFake(async input => {
      stored = { ...structuredClone(input), id: 'new-card', slug: 'nova-carta', art: null, createdAt: null, updatedAt: null };
      if (stored.canvas) for (const asset of stored.canvas.assets) asset.storagePath = `cards/new-card/assets/${asset.id}.png`;
      return { id: 'new-card', warnings: [] };
    });
    cards.getById.and.callFake(async () => stored);
    templates.list.and.resolveTo([]);
    templates.create.and.resolveTo({ id: 'template-1', warnings: [] });
    await TestBed.configureTestingModule({ imports: [CardEditorComponent], providers: [
      provideRouter([]), { provide: CardService, useValue: cards },
      { provide: CardTemplateService, useValue: templates },
      { provide: CardStorageService, useValue: storage }
    ] }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  it('salva o modelo estruturado e reconstrói a mesma geometria em outra instância', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.state.addElement('circle'); const id = editor.state.selectedIds()[0];
    editor.state.patchElement(id, { x: 185, y: 300, rotation: 17, width: 200, height: 180 });
    const artwork = editor.state.canvas().elements.find(element => element.type === 'artwork')!;
    if (artwork.type !== 'artwork') throw new Error('Expected artwork');
    editor.state.updateElement({ ...artwork, properties: { ...artwork.properties, flipX: true,
      brightness: 0.1, contrast: 18, saturation: 0.25, hue: 40, borderStyle: 'dashed' } });
    await editor.save();
    const saved = cards.create.calls.mostRecent().args[0];
    expect(saved.canvas?.elements.find(element => element.id === id)?.rotation).toBe(17);
    expect(JSON.stringify(saved)).not.toContain('className');
    fixture.destroy();
    const reopened = TestBed.createComponent(CardEditorComponent);
    reopened.componentRef.setInput('mode', 'edit'); reopened.componentRef.setInput('cardId', 'new-card');
    reopened.detectChanges(); await reopened.whenStable(); reopened.detectChanges();
    expect(reopened.componentInstance.state.canvas()).toEqual(saved.canvas!);
    expect(reopened.componentInstance.state.data().name).toBe('Nova carta');
    reopened.destroy();
  });

  it('preserva o aviso de preview após criar e navegar para edição, permitindo reparar ao salvar novamente', async () => {
    const warning = 'A carta foi salva, mas a representação publicada não pôde ser sincronizada. Código: storage/unauthorized.';
    cards.create.and.callFake(async input => {
      stored = { ...structuredClone(input), id: 'new-card', slug: 'nova-carta', art: null, createdAt: null, updatedAt: null };
      return { id: 'new-card', warnings: [warning] };
    });
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    await fixture.componentInstance.save();
    const router = TestBed.inject(Router);
    const navigation = (router.navigate as jasmine.Spy).calls.mostRecent().args[1];
    expect(navigation.state.cardFeedback.warnings).toEqual([warning]);
    fixture.destroy();
    spyOn(router, 'getCurrentNavigation').and.returnValue({ extras: { state: navigation.state } } as Navigation);
    const reopened = TestBed.createComponent(CardEditorComponent);
    reopened.componentRef.setInput('mode', 'edit'); reopened.componentRef.setInput('cardId', 'new-card');
    reopened.detectChanges(); await reopened.whenStable(); reopened.detectChanges();
    expect(reopened.componentInstance.warnings()).toEqual([warning]);
    expect((reopened.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('storage/unauthorized');
    cards.update.and.resolveTo({ id: 'new-card', warnings: [] });
    await reopened.componentInstance.save();
    expect(cards.create).toHaveBeenCalledTimes(1);
    expect(cards.update).toHaveBeenCalledTimes(1);
    expect(reopened.componentInstance.warnings()).toEqual([]);
    reopened.destroy();
  });

  it('mostra somente o painel do modo ativo sem desmontar os campos de dados', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const data = host.querySelector<HTMLElement>('app-card-data')!;
    const properties = host.querySelector<HTMLElement>('app-card-properties')!;
    expect(getComputedStyle(data).display).toBe('none');
    expect(getComputedStyle(properties).display).not.toBe('none');

    fixture.componentInstance.state.setMode('data'); fixture.detectChanges();
    expect(host.querySelector('app-card-data')).toBe(data);
    expect(getComputedStyle(data).display).not.toBe('none');
    expect(getComputedStyle(properties).display).toBe('none');

    fixture.componentInstance.state.setMode('preview'); fixture.detectChanges();
    expect(host.querySelector('app-card-data')).toBe(data);
    expect(getComputedStyle(host.querySelector('.editor-right')!).display).toBe('none');
    const viewport = host.querySelector<HTMLElement>('.canvas-viewport')!;
    viewport.focus();
    expect(document.activeElement).toBe(viewport);
    fixture.destroy();
  });

  it('mantém o binário fora do documento e transmite uploads por IDs estáveis', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    const editor = fixture.componentInstance;
    const bitmap = document.createElement('canvas'); bitmap.width = 4; bitmap.height = 4;
    bitmap.getContext('2d')!.fillRect(0, 0, 4, 4);
    const blob = await new Promise<Blob>(resolve => bitmap.toBlob(value => resolve(value!), 'image/png'));
    const file = new File([blob], 'arte.png', { type: 'image/png' });
    const artwork = editor.state.canvas().elements.find(element => element.type === 'artwork')!;
    if (artwork.type !== 'artwork') throw new Error('Expected artwork');
    editor.state.updateElement({ ...artwork, properties: { ...artwork.properties, fill: '#e8d7b0' } });
    await editor.selectAsset({ elementId: artwork.id, file });
    const applied = editor.state.canvas().elements.find(element => element.id === artwork.id)!;
    expect(applied.properties.fill).toBe('transparent');
    await editor.save();
    const [input, legacyFile, pending] = cards.create.calls.mostRecent().args;
    expect(legacyFile).toBeUndefined(); expect(pending?.[0].file).toBe(file);
    expect(input.canvas?.assets[0].id).toBe(pending?.[0].id);
    expect(input.canvas?.elements.find(element => element.id === artwork.id)?.properties.fill).toBe('transparent');
    expect(JSON.stringify(input)).not.toContain('blob:'); expect(JSON.stringify(input)).not.toContain('base64');
    fixture.destroy();
  });

  it('preserva o ID recuperável e bloqueia uma segunda criação após falha parcial', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    cards.create.and.rejectWith(new CardOperationError('Confira o documento e os arquivos.', 'reserved-card'));
    await fixture.componentInstance.save(); await fixture.componentInstance.save();
    expect(fixture.componentInstance.recoveryId()).toBe('reserved-card');
    expect(cards.create).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('usa o mesmo canvas para salvar um template reutilizável', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.templateName = 'Warrior';
    await fixture.componentInstance.saveTemplate();
    const input = templates.create.calls.mostRecent().args[0];
    expect(input.name).toBe('Warrior'); expect(input.canvas).toEqual(fixture.componentInstance.state.canvas());
    expect(input.attributes).toEqual(fixture.componentInstance.state.data().attributes);
    fixture.destroy();
  });

  it('não cria outra carta quando o documento solicitado para edição não existe', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'edit'); fixture.componentRef.setInput('cardId', 'missing');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.loadError()).toContain('não encontrada');
    await fixture.componentInstance.save();
    expect(cards.create).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-card-canvas')).toBeNull();
    fixture.destroy();
  });

  function savedWithImage(): Card {
    const data = { ...defaultCardData(), name: 'Carta existente' };
    const canvas = fantasyBasicCanvas(data);
    canvas.assets = [{ id: 'saved-art', storagePath: 'cards/saved-card/assets/art.png', fileName: 'art.png', contentType: 'image/png', size: 16 }];
    const artwork = canvas.elements.find(element => element.type === 'artwork')!;
    if (artwork.type !== 'artwork') throw new Error('Expected artwork');
    artwork.properties.assetId = 'saved-art';
    return { ...data, canvas, id: 'saved-card', slug: 'carta-existente', art: null, createdAt: null, updatedAt: null };
  }

  it('abre os dados e o canvas antes de um download de imagem terminar', async () => {
    stored = savedWithImage();
    let finish!: (blob: Blob) => void;
    storage.getAssetBlob.and.returnValue(new Promise<Blob>(resolve => { finish = resolve; }));
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'edit'); fixture.componentRef.setInput('cardId', 'saved-card');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(fixture.componentInstance.original()?.id).toBe('saved-card');
    expect(fixture.componentInstance.state.data().name).toBe('Carta existente');
    expect(fixture.componentInstance.error()).toBe('');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-card-canvas')).not.toBeNull();
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    fixture.destroy(); finish(new Blob(['ignored'], { type: 'image/png' }));
  });

  it('permite salvar dados mantendo referências próprias mesmo com imagens bloqueadas por CORS', async () => {
    stored = savedWithImage();
    storage.getAssetBlob.and.rejectWith(new Error('Download bloqueado por CORS.'));
    cards.update.and.callFake(async (_original, input) => {
      stored = { ...stored!, ...structuredClone(input) };
      return { id: 'saved-card', warnings: [] };
    });
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'edit'); fixture.componentRef.setInput('cardId', 'saved-card');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const editor = fixture.componentInstance;
    expect(editor.loadError()).toBe('');
    expect(editor.assets.downloadErrors()[0].message).toContain('CORS');
    editor.state.updateData({ ...editor.state.data(), name: 'Nome editado' });
    fixture.detectChanges(); await fixture.whenStable();
    await editor.save(); fixture.detectChanges(); await fixture.whenStable();
    expect(cards.update).toHaveBeenCalledTimes(1);
    const [_original, input, _legacy, pending] = cards.update.calls.mostRecent().args;
    expect(input.name).toBe('Nome editado');
    expect(input.canvas?.assets[0].storagePath).toBe('cards/saved-card/assets/art.png');
    expect(pending).toEqual([]);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    expect(editor.feedback()).toContain('Carta salva');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tentar carregar imagens novamente');
    fixture.destroy();
  });

  it('repete downloads somente por solicitação e conserva alterações feitas durante a falha', async () => {
    stored = savedWithImage();
    storage.getAssetBlob.and.rejectWith(new Error('Download bloqueado por CORS.'));
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'edit'); fixture.componentRef.setInput('cardId', 'saved-card');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const editor = fixture.componentInstance;
    editor.state.updateData({ ...editor.state.data(), name: 'Alteração pendente' });
    fixture.detectChanges(); await fixture.whenStable();
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    await editor.retryImages(); fixture.detectChanges(); await fixture.whenStable();
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
    expect(editor.state.data().name).toBe('Alteração pendente');
    expect(editor.state.dirty()).toBeTrue();
    expect(editor.retryingImages()).toBeFalse();
    fixture.destroy();
  });
});
