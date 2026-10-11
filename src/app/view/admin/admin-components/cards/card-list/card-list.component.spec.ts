import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Card, CardOperationError } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { CardListComponent } from './card-list.component';

describe('CardListComponent', () => {
  let fixture: ComponentFixture<CardListComponent>;
  let component: CardListComponent;
  let cards: jasmine.SpyObj<CardService>;
  let storage: jasmine.SpyObj<CardStorageService>;
  const card: Card = {
    id: 'card-1', name: 'Dragão', slug: 'dragao', description: '', rarity: 'epic', status: 'draft',
    attributes: [], setId: null, art: null, createdAt: null, updatedAt: null
  };

  beforeEach(async () => {
    cards = jasmine.createSpyObj<CardService>('CardService', ['list', 'delete']);
    storage = jasmine.createSpyObj<CardStorageService>('CardStorageService', ['getArtUrl']);
    cards.list.and.resolveTo([card]);
    cards.delete.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [CardListComponent],
      providers: [
        provideRouter([]),
        { provide: CardService, useValue: cards },
        { provide: CardStorageService, useValue: storage }
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
});
