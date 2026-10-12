import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Card, CardOperationError } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { CardListComponent } from './card-list.component';
import { CardPreviewService } from '../../../../../model/services/tools/card-preview.service';

describe('CardListComponent', () => {
  let fixture: ComponentFixture<CardListComponent>;
  let component: CardListComponent;
  let cards: jasmine.SpyObj<CardService>;
  let storage: jasmine.SpyObj<CardStorageService>;
  let previews: jasmine.SpyObj<CardPreviewService>;
  const card: Card = {
    id: 'card-1', name: 'Dragão', slug: 'dragao', description: '', rarity: 'epic', status: 'draft',
    attributes: [], setId: null, art: null, createdAt: null, updatedAt: null
  };

  beforeEach(async () => {
    cards = jasmine.createSpyObj<CardService>('CardService', ['list', 'delete']);
    storage = jasmine.createSpyObj<CardStorageService>('CardStorageService', ['getArtUrl']);
    previews = jasmine.createSpyObj<CardPreviewService>('CardPreviewService', ['render']);
    previews.render.and.resolveTo(new Blob([], { type: 'image/png' }));
    cards.list.and.resolveTo([card]);
    cards.delete.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [CardListComponent],
      providers: [
        provideRouter([]),
        { provide: CardService, useValue: cards },
        { provide: CardStorageService, useValue: storage },
        { provide: CardPreviewService, useValue: previews }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(CardListComponent);
    component = fixture.componentInstance;
  });

  it('requires confirmation and retains the row when artifact cleanup fails', async () => {
    await component.load();
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    await component.deleteCard(card);
    expect(cards.delete).not.toHaveBeenCalled();
    confirm.and.returnValue(true);
    cards.delete.and.rejectWith(new CardOperationError('A arte não pôde ser removida; tente novamente.', card.id));
    await component.deleteCard(card);
    expect(component.cards()).toEqual([card]);
    expect(component.error()).toContain('arte');
    cards.delete.and.resolveTo();
    await component.deleteCard(card);
    expect(component.cards()).toEqual([]);
    expect(component.feedback()).toContain('excluída');
  });

  it('allows retry after loading fails', async () => {
    cards.list.and.rejectWith(new Error('Sem acesso ao catálogo.'));
    await component.load();
    expect(component.loading()).toBeFalse();
    expect(component.error()).toBe('Sem acesso ao catálogo.');
    cards.list.and.resolveTo([card]);
    await component.load();
    expect(component.error()).toBe('');
    expect(component.cards()).toEqual([card]);
  });

  it('revokes an image URL when its pending response belongs to an obsolete list', async () => {
    const withArt: Card = { ...card, art: {
      storagePath: 'cards/card-1/art/one.png', fileName: 'one.png', contentType: 'image/png', size: 3
    } };
    let resolveImage!: (url: string) => void;
    cards.list.and.resolveTo([withArt]);
    storage.getArtUrl.and.returnValue(new Promise(resolve => { resolveImage = resolve; }));
    const revokeUrl = spyOn(URL, 'revokeObjectURL');
    await component.load();
    cards.list.and.resolveTo([]);
    await component.load();
    resolveImage('blob:stale');
    await fixture.whenStable();
    expect(revokeUrl).toHaveBeenCalledWith('blob:stale');
    expect(component.artUrls()).toEqual({});
  });

  it('offers the current table and an independent full-card gallery without querying Firestore again', async () => {
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(component.displayMode()).toBe('list');
    expect(page.querySelector('table')).not.toBeNull();
    expect(page.querySelector('app-card-preview')).toBeNull();
    expect(previews.render).not.toHaveBeenCalled();
    const galleryButton = Array.from(page.querySelectorAll<HTMLButtonElement>('.display-switch button')).find(button => button.textContent?.includes('Cartas inteiras'))!;
    galleryButton.click(); fixture.detectChanges();
    expect(galleryButton.getAttribute('aria-pressed')).toBe('true');
    expect(page.querySelector('table')).toBeNull();
    expect(page.querySelectorAll('app-card-preview').length).toBe(1);
    expect(page.querySelector('.gallery-open')?.getAttribute('href')).toBe('/admin/cartas/editar/card-1');
    expect(page.querySelector('.gallery-open')?.getAttribute('aria-label')).toBe('Editar Dragão');
    component.setDisplayMode('list'); fixture.detectChanges();
    expect(page.querySelector('table')).not.toBeNull();
    expect(page.querySelector('app-card-preview')).toBeNull();
    expect(cards.list).toHaveBeenCalledTimes(1);
  });

  it('retains the display choice during refresh and keeps empty/error states usable in either mode', async () => {
    component.setDisplayMode('cards');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    await component.load(); fixture.detectChanges();
    expect(component.displayMode()).toBe('cards');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-card-preview')).not.toBeNull();
    cards.list.and.resolveTo([]); await component.load(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhuma carta criada');
    cards.list.and.rejectWith(new Error('Sem acesso')); await component.load(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Recarregar lista');
    component.setDisplayMode('list'); fixture.detectChanges();
    expect(component.error()).toBe('Sem acesso');
  });

  it('does not load table artwork in gallery mode and discards table requests after switching modes', async () => {
    const withArt: Card = { ...card, art: { storagePath: 'cards/card-1/art/one.png', fileName: 'one.png', contentType: 'image/png', size: 3 } };
    cards.list.and.resolveTo([withArt]);
    component.setDisplayMode('cards'); await component.load();
    expect(storage.getArtUrl).not.toHaveBeenCalled();
    let finish!: (url: string) => void;
    storage.getArtUrl.and.returnValue(new Promise(resolve => { finish = resolve; }));
    component.setDisplayMode('list');
    expect(storage.getArtUrl).toHaveBeenCalledTimes(1);
    const revoked = spyOn(URL, 'revokeObjectURL');
    component.setDisplayMode('cards'); finish('blob:obsolete-table-image'); await fixture.whenStable();
    expect(revoked).toHaveBeenCalledWith('blob:obsolete-table-image');
    expect(component.artUrls()).toEqual({});
  });

  it('ignores an outdated document list when two reload requests overlap', async () => {
    let first!: (result: Card[]) => void;
    cards.list.and.returnValues(new Promise(resolve => { first = resolve; }), Promise.resolve([{ ...card, name: 'Atualizada' }]));
    const pending = component.load(); await component.load();
    first([card]); await pending;
    expect(component.cards()[0].name).toBe('Atualizada');
  });
});
