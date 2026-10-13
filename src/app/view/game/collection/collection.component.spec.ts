import { Component, Input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthSession } from '../../../model/interfaces/Auth/auth-session';
import { Card, CardRarity } from '../../../model/interfaces/Cards/card';
import { PlayerOwnedCard } from '../../../model/interfaces/Collection/player-card-collection';
import { PlayerCollectionService } from '../../../model/services/cruds/collection/player-collection.service';
import { AuthService } from '../../../model/services/fire/auth.service';
import { defaultCardData } from '../../../model/services/tools/card-canvas-factory';
import { CollectionComponent } from './collection.component';
import { PlayerCardPreviewComponent } from './player-card-preview/player-card-preview.component';

@Component({ selector: 'app-player-card-preview', standalone: true, template: '<span class="preview-stub">{{ card.name }}</span>' })
class PreviewStubComponent { @Input({ required: true }) card!: Card; }

function owned(id: string, name: string, rarity: CardRarity, quantity: number, type?: string, subtype?: string): PlayerOwnedCard {
  return {
    collection: { cardId: id, quantity, firstAcquiredAt: null, lastAcquiredAt: null },
    card: { ...defaultCardData(), id, name, rarity, type, subtype, status: 'published', slug: id, art: null, createdAt: null, updatedAt: null }
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe('CollectionComponent', () => {
  let fixture: ComponentFixture<CollectionComponent>;
  let component: CollectionComponent;
  let service: jasmine.SpyObj<PlayerCollectionService>;
  const currentUser = signal<AuthSession | null>({ uid: 'member', email: null, displayName: '', role: 'member', roleId: 'member' });
  const cards = [owned('nyra', 'Nyra', 'legendary', 2, 'Personagem', 'Maga'), owned('wolf', 'Lobo', 'common', 3, 'Criatura'), owned('nyra-rare', 'Nyra aprendiz', 'rare', 1)];

  beforeEach(async () => {
    currentUser.set({ uid: 'member', email: null, displayName: '', role: 'member', roleId: 'member' });
    service = jasmine.createSpyObj<PlayerCollectionService>('PlayerCollectionService', ['listCurrentUser']);
    service.listCurrentUser.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [CollectionComponent],
      providers: [{ provide: PlayerCollectionService, useValue: service }, { provide: AuthService, useValue: { currentUser } }]
    }).overrideComponent(CollectionComponent, {
      remove: { imports: [PlayerCardPreviewComponent] }, add: { imports: [PreviewStubComponent] }
    }).compileComponents();
    fixture = TestBed.createComponent(CollectionComponent);
    component = fixture.componentInstance;
  });

  async function settle(): Promise<void> { await fixture.whenStable(); fixture.detectChanges(); }
  async function load(entries = cards): Promise<void> {
    service.listCurrentUser.and.resolveTo(entries);
    fixture.detectChanges();
    await settle();
  }
  function page(): HTMLElement { return fixture.nativeElement; }
  function displayed(): string[] { return Array.from(page().querySelectorAll('.owned-card-info h2')).map(item => item.textContent!.trim()); }
  function search(value: string): void {
    const input = page().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges();
  }
  function rarity(label: string): void {
    const button = Array.from(page().querySelectorAll<HTMLButtonElement>('.rarity-options button')).find(item => item.textContent!.trim() === label)!;
    button.click(); fixture.detectChanges();
  }

  it('mostra loading e bloqueia filtros enquanto a coleção é lida', async () => {
    const pending = deferred<PlayerOwnedCard[]>(); service.listCurrentUser.and.returnValue(pending.promise);
    fixture.detectChanges();
    expect(page().textContent).toContain('Carregando sua coleção');
    expect(page().querySelector<HTMLInputElement>('input')!.disabled).toBeTrue();
    expect(page().querySelector('fieldset')!.disabled).toBeTrue();
    expect(page().querySelector('.collection-counts')).toBeNull();
    pending.resolve([]); await settle();
    expect(component.loading()).toBeFalse();
  });

  it('exibe erro de leitura e recarrega pelo botão de retry', async () => {
    service.listCurrentUser.and.rejectWith(new Error('Leitura negada'));
    fixture.detectChanges(); await settle();
    const alert = page().querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.textContent).toContain('Não foi possível carregar sua coleção');
    service.listCurrentUser.and.resolveTo(cards);
    alert.querySelector<HTMLButtonElement>('button')!.click(); await settle();
    expect(service.listCurrentUser).toHaveBeenCalledTimes(2);
    expect(displayed()).toEqual(['Nyra', 'Lobo', 'Nyra aprendiz']);
  });

  it('mostra coleção vazia sem aquisição automática nem ações de concessão', async () => {
    await load([]);
    expect(page().textContent).toContain('Sua coleção está vazia.');
    expect(page().textContent).toContain('0 cartas diferentes');
    expect(page().querySelectorAll('.owned-card').length).toBe(0);
    const actions = Array.from(page().querySelectorAll('button')).map(button => button.textContent);
    expect(actions.some(text => /Adicionar|Obter|Starter/.test(text ?? ''))).toBeFalse();
  });

  it('exibe nome, raridade, quantidade e contadores reais independentes dos filtros', async () => {
    await load();
    expect(page().textContent).toContain('3 cartas diferentes');
    expect(page().textContent).toContain('6 cartas no total');
    const nyra = page().querySelector('[data-card-id="nyra"]')!;
    expect(nyra.textContent).toContain('Lendária');
    expect(nyra.textContent).toContain('x2');
    expect(nyra.querySelector('app-player-card-preview')).not.toBeNull();
    rarity('Lendária');
    expect(displayed()).toEqual(['Nyra']);
    expect(page().textContent).toContain('3 cartas diferentes');
    expect(page().textContent).toContain('6 cartas no total');
    expect(service.listCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('busca localmente nome, tipo e subtipo sem diferenciar maiúsculas e acentos', async () => {
    await load();
    search(' nyRA '); expect(displayed()).toEqual(['Nyra', 'Nyra aprendiz']);
    search('CRIATURA'); expect(displayed()).toEqual(['Lobo']);
    search('mága'); expect(displayed()).toEqual(['Nyra']);
    expect(service.listCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('combina pesquisa e raridade e permite limpar filtros sem nova consulta', async () => {
    await load();
    search('Nyra'); rarity('Rara'); expect(displayed()).toEqual(['Nyra aprendiz']);
    rarity('Épica'); expect(displayed()).toEqual([]);
    expect(page().textContent).toContain('Nenhuma carta encontrada');
    const clear = Array.from(page().querySelectorAll('button')).find(button => button.textContent!.trim() === 'Limpar filtros')!;
    clear.click(); fixture.detectChanges();
    expect(displayed().length).toBe(3);
    expect(page().querySelector<HTMLInputElement>('input')!.value).toBe('');
    expect(service.listCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('mantém disponíveis e informa indisponíveis sem expor IDs ou metadados protegidos', async () => {
    const unavailable: PlayerOwnedCard = { collection: { cardId: 'protected-id', quantity: 9, firstAcquiredAt: null, lastAcquiredAt: null }, card: null };
    await load([cards[0], unavailable]);
    expect(displayed()).toEqual(['Nyra']);
    expect(page().textContent).toContain('1 carta indisponível');
    expect(page().textContent).toContain('1 carta diferente');
    expect(page().textContent).toContain('11 cartas no total');
    expect(page().textContent).not.toContain('protected-id');
    expect(page().querySelector('[data-card-id="protected-id"]')).toBeNull();
  });

  it('distingue uma coleção só com cartas indisponíveis de uma coleção vazia', async () => {
    await load([{ collection: { cardId: 'deleted', quantity: 2, firstAcquiredAt: null, lastAcquiredAt: null }, card: null }]);
    expect(page().textContent).toContain('Nenhuma carta disponível para exibir');
    expect(page().textContent).not.toContain('Sua coleção está vazia.');
  });

  it('oferece atualização explícita da coleção preenchida', async () => {
    await load();
    service.listCurrentUser.and.resolveTo([cards[0]]);
    page().querySelector<HTMLButtonElement>('.refresh-collection')!.click(); await settle();
    expect(displayed()).toEqual(['Nyra']);
    expect(service.listCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('descarta respostas da conta anterior ao trocar o UID com requisição pendente', async () => {
    const first = deferred<PlayerOwnedCard[]>(), second = deferred<PlayerOwnedCard[]>();
    service.listCurrentUser.and.returnValues(first.promise, second.promise);
    fixture.detectChanges();
    currentUser.set({ uid: 'other-member', email: null, displayName: '', role: 'member', roleId: 'member' });
    fixture.detectChanges();
    second.resolve([cards[1]]); await settle();
    expect(displayed()).toEqual(['Lobo']);
    first.resolve([cards[0]]); await settle();
    expect(displayed()).toEqual(['Lobo']);
    expect(service.listCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('limpa cartas e filtros quando a sessão deixa de ser válida', async () => {
    await load(); search('Nyra'); rarity('Lendária');
    currentUser.set(null); fixture.detectChanges();
    expect(component.entries()).toEqual([]);
    expect(component.search()).toBe('');
    expect(component.rarity()).toBeNull();
    expect(displayed()).toEqual([]);
  });

  it('não aplica resposta de uma tela já destruída', async () => {
    const pending = deferred<PlayerOwnedCard[]>(); service.listCurrentUser.and.returnValue(pending.promise);
    fixture.detectChanges(); fixture.destroy();
    pending.resolve(cards); await Promise.resolve();
    expect(component.entries()).toEqual([]);
  });
});
