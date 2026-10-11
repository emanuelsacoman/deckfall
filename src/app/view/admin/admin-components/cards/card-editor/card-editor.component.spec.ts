import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Card, CardOperationError } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardTemplateService } from '../../../../../model/services/cruds/cards/card-template.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { CardEditorComponent } from './card-editor.component';

describe('Editor — criação, reabertura e uploads', () => {
  let cards: jasmine.SpyObj<CardService>;
  let templates: jasmine.SpyObj<CardTemplateService>;
  let stored: Card | null;

  beforeEach(async () => {
    stored = null;
    cards = jasmine.createSpyObj<CardService>('CardService', ['getById', 'create', 'update', 'delete']);
    templates = jasmine.createSpyObj<CardTemplateService>('CardTemplateService', ['list', 'create']);
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
      { provide: CardStorageService, useValue: { validateImage: () => undefined } }
    ] }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  it('salva o modelo estruturado e reconstrói a mesma geometria em outra instância', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.state.addElement('circle'); const id = editor.state.selectedIds()[0];
    editor.state.patchElement(id, { x: 185, y: 300, rotation: 17, width: 200, height: 180 });
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

  it('mantém o binário fora do documento e transmite uploads por IDs estáveis', async () => {
    const fixture = TestBed.createComponent(CardEditorComponent);
    fixture.componentRef.setInput('mode', 'create'); fixture.detectChanges(); await fixture.whenStable();
    const editor = fixture.componentInstance;
    const bitmap = document.createElement('canvas'); bitmap.width = 4; bitmap.height = 4;
    bitmap.getContext('2d')!.fillRect(0, 0, 4, 4);
    const blob = await new Promise<Blob>(resolve => bitmap.toBlob(value => resolve(value!), 'image/png'));
    const file = new File([blob], 'arte.png', { type: 'image/png' });
    const artwork = editor.state.canvas().elements.find(element => element.type === 'artwork')!;
    await editor.selectAsset({ elementId: artwork.id, file });
    await editor.save();
    const [input, legacyFile, pending] = cards.create.calls.mostRecent().args;
    expect(legacyFile).toBeUndefined(); expect(pending?.[0].file).toBe(file);
    expect(input.canvas?.assets[0].id).toBe(pending?.[0].id);
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
});
