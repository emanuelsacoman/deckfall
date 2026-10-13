import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Card } from '../../../../../model/interfaces/Cards/card';
import { PlayerOwnedCard } from '../../../../../model/interfaces/Collection/player-card-collection';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { PlayerCollectionService } from '../../../../../model/services/cruds/collection/player-collection.service';
import { defaultCardData } from '../../../../../model/services/tools/card-canvas-factory';
import { UserCollectionComponent } from './user-collection.component';

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe('UserCollectionComponent', () => {
  let fixture: ComponentFixture<UserCollectionComponent>;
  let component: UserCollectionComponent;
  let collection: jasmine.SpyObj<PlayerCollectionService>;
  let cards: jasmine.SpyObj<CardService>;
  const published: Card = { ...defaultCardData(), id: 'nyra', name: 'Nyra', status: 'published', rarity: 'legendary', slug: 'nyra', art: null, createdAt: null, updatedAt: null };
  const second: Card = { ...published, id: 'wolf', name: 'Lobo', rarity: 'common' };
  const owned: PlayerOwnedCard = { collection: { cardId: 'nyra', quantity: 2, firstAcquiredAt: null, lastAcquiredAt: null }, card: published };

  beforeEach(async () => {
    collection = jasmine.createSpyObj<PlayerCollectionService>('PlayerCollectionService', ['listForUser', 'setQuantity', 'remove']);
    collection.listForUser.and.resolveTo([owned]);
    collection.setQuantity.and.resolveTo(); collection.remove.and.resolveTo();
    cards = jasmine.createSpyObj<CardService>('CardService', ['list']);
    cards.list.and.resolveTo([published, second, { ...published, id: 'draft', name: 'Rascunho', status: 'draft' }, { ...published, id: 'archived', name: 'Arquivada', status: 'archived' }]);
    await TestBed.configureTestingModule({ imports: [UserCollectionComponent], providers: [
      { provide: PlayerCollectionService, useValue: collection }, { provide: CardService, useValue: cards }
    ] }).compileComponents();
    fixture = TestBed.createComponent(UserCollectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('uid', 'member');
  });

  async function settle(): Promise<void> { await fixture.whenStable(); fixture.detectChanges(); }
  async function load(): Promise<void> { fixture.detectChanges(); await settle(); }
  function page(): HTMLElement { return fixture.nativeElement; }
  function row(): HTMLTableRowElement { return page().querySelector<HTMLTableRowElement>('[data-card-id="nyra"]')!; }
  function setRowQuantity(quantity: number): void {
    const input = row().querySelector<HTMLInputElement>('input')!;
    input.value = String(quantity); input.dispatchEvent(new Event('input')); fixture.detectChanges();
  }
  function button(label: string, within: HTMLElement = page()): HTMLButtonElement {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === label)!;
  }

  it('carrega coleção do UID e mostra somente publicadas no select de concessão', async () => {
    await load();
    expect(collection.listForUser).toHaveBeenCalledOnceWith('member');
    expect(cards.list).toHaveBeenCalledTimes(1);
    expect(row().textContent).toContain('Nyra');
    expect(row().textContent).toContain('Lendária');
    expect(row().querySelector('input')!.value).toBe('2');
    const options = Array.from(page().querySelectorAll<HTMLOptionElement>('select option')).map(option => option.value);
    expect(options).toEqual(['', 'wolf', 'nyra']);
    expect(page().textContent).toContain('O valor substitui o total atual');
  });

  it('mostra loading, erro de leitura e retry', async () => {
    const pending = deferred<PlayerOwnedCard[]>(); collection.listForUser.and.returnValue(pending.promise);
    fixture.detectChanges(); expect(page().textContent).toContain('Carregando coleção');
    pending.resolve([]); await settle(); expect(page().textContent).toContain('Este usuário ainda não possui cartas');
    collection.listForUser.and.rejectWith(new Error('Sem acesso à coleção'));
    await component.loadCollection(); fixture.detectChanges();
    expect(page().querySelector('[role="alert"]')!.textContent).toContain('Sem acesso à coleção');
    collection.listForUser.and.resolveTo([owned]); button('Tentar novamente').click(); await settle();
    expect(row()).not.toBeNull();
  });

  it('concede carta publicada com quantidade total e sem somar ao total existente', async () => {
    await load();
    component.form.setValue({ cardId: 'wolf', quantity: 3 });
    collection.listForUser.and.resolveTo([owned, { collection: { cardId: 'wolf', quantity: 3, firstAcquiredAt: null, lastAcquiredAt: null }, card: second }]);
    page().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
    expect(collection.setQuantity).toHaveBeenCalledOnceWith('member', 'wolf', 3, null);
    expect(page().textContent).toContain('Quantidade total definida com sucesso');
    expect(page().querySelector('[data-card-id="wolf"] input')).not.toBeNull();
  });

  it('preenche total já possuído ao selecionar a mesma carta e envia a versão carregada', async () => {
    await load();
    const select = page().querySelector<HTMLSelectElement>('select')!;
    select.value = 'nyra'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(component.form.controls.quantity.value).toBe(2);
    component.form.controls.quantity.setValue(5); await component.defineQuantity();
    expect(collection.setQuantity).toHaveBeenCalledOnceWith('member', 'nyra', 5, owned.collection);
  });

  it('altera quantidade absoluta pelo item, recarrega e bloqueia submissões duplicadas', async () => {
    await load(); setRowQuantity(4);
    const pending = deferred<void>(); collection.setQuantity.and.returnValue(pending.promise);
    collection.listForUser.and.resolveTo([{ ...owned, collection: { ...owned.collection, quantity: 4 } }]);
    button('Salvar quantidade', row()).click(); fixture.detectChanges();
    void component.saveQuantity(owned);
    expect(collection.setQuantity).toHaveBeenCalledOnceWith('member', 'nyra', 4, owned.collection);
    expect(button('Remover', row()).disabled).toBeTrue();
    pending.resolve(); await settle();
    expect(row().querySelector('input')!.value).toBe('4');
    expect(collection.listForUser).toHaveBeenCalledTimes(2);
  });

  it('confirma remoção e respeita cancelamento sem excluir a carta global', async () => {
    await load(); const confirm = spyOn(window, 'confirm').and.returnValue(false);
    button('Remover', row()).click(); await settle();
    expect(confirm).toHaveBeenCalledWith('Remover Nyra da coleção deste usuário? Todas as cópias possuídas serão removidas.');
    expect(collection.remove).not.toHaveBeenCalled();
    confirm.and.returnValue(true); collection.listForUser.and.resolveTo([]);
    button('Remover', row()).click(); await settle();
    expect(collection.remove).toHaveBeenCalledOnceWith('member', 'nyra', owned.collection);
    expect(page().textContent).toContain('Carta removida da coleção deste usuário');
    expect(page().textContent).toContain('Este usuário ainda não possui cartas');
  });

  it('quantidade zero pede confirmação e usa remoção', async () => {
    await load(); setRowQuantity(0);
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    button('Salvar quantidade', row()).click(); await settle();
    expect(confirm).toHaveBeenCalled(); expect(collection.remove).not.toHaveBeenCalled();
    confirm.and.returnValue(true); await component.saveQuantity(owned);
    expect(collection.remove).toHaveBeenCalledOnceWith('member', 'nyra', owned.collection);
    expect(collection.setQuantity).not.toHaveBeenCalled();
  });

  it('zero na concessão remove apenas uma carta já possuída com confirmação', async () => {
    await load(); const confirm = spyOn(window, 'confirm').and.returnValue(true);
    component.form.setValue({ cardId: 'wolf', quantity: 0 }); await component.defineQuantity();
    expect(component.operationError()).toContain('ainda não pertence');
    expect(confirm).not.toHaveBeenCalled(); expect(collection.remove).not.toHaveBeenCalled();
    component.form.setValue({ cardId: 'nyra', quantity: 0 }); await component.defineQuantity();
    expect(confirm).toHaveBeenCalled();
    expect(collection.remove).toHaveBeenCalledOnceWith('member', 'nyra', owned.collection);
  });

  it('rejeita quantidade fracionária, negativa, vazia e acima do limite técnico', async () => {
    await load();
    for (const quantity of [1.5, -1, 10000, null]) {
      component.form.setValue({ cardId: 'nyra', quantity }); await component.defineQuantity();
      expect(component.form.invalid).toBeTrue();
    }
    setRowQuantity(1.5); button('Salvar quantidade', row()).click();
    expect(button('Salvar quantidade', row()).disabled).toBeTrue();
    expect(collection.setQuantity).not.toHaveBeenCalled();
    expect(collection.remove).not.toHaveBeenCalled();
  });

  it('recusa ID ausente da lista publicada mesmo com formulário alterado', async () => {
    await load(); component.form.setValue({ cardId: 'draft', quantity: 2 });
    await component.defineQuantity(); fixture.detectChanges();
    expect(collection.setQuantity).not.toHaveBeenCalled();
    expect(page().querySelector('[role="alert"]')!.textContent).toContain('Escolha uma carta publicada');
  });

  it('informa falha de alteração e permite recarregar a versão atual', async () => {
    await load(); setRowQuantity(4);
    collection.setQuantity.and.rejectWith(new Error('A coleção mudou em outra sessão. Recarregue.'));
    await component.saveQuantity(owned); fixture.detectChanges();
    expect(page().querySelector('[role="alert"]')!.textContent).toContain('outra sessão');
    expect(component.success()).toBe('');
    button('Recarregar coleção', page().querySelector<HTMLElement>('[role="alert"]')!).click(); await settle();
    expect(component.operationError()).toBe('');
    expect(row().querySelector('input')!.value).toBe('2');
  });

  it('informa falha de remoção sem fingir sucesso', async () => {
    await load(); spyOn(window, 'confirm').and.returnValue(true);
    collection.remove.and.rejectWith(new Error('Não foi possível remover a entrada'));
    await component.removeOwned(owned); fixture.detectChanges();
    expect(page().querySelector('[role="alert"]')!.textContent).toContain('Não foi possível remover');
    expect(component.success()).toBe('');
    expect(row()).not.toBeNull();
  });

  it('separa gravação concluída de falha ao recarregar a lista', async () => {
    await load(); setRowQuantity(4);
    collection.listForUser.and.rejectWith(new Error('Não foi possível atualizar a lista'));
    await component.saveQuantity(owned); fixture.detectChanges();
    expect(component.success()).toContain('atualizada com sucesso');
    expect(component.operationError()).toBe('');
    expect(component.loadError()).toContain('atualizar a lista');
  });

  it('permite remover carta indisponível com confirmação e sem exibir metadados', async () => {
    const unavailable: PlayerOwnedCard = { collection: { ...owned.collection, cardId: 'missing' }, card: null };
    collection.listForUser.and.resolveTo([unavailable]); await load();
    expect(page().textContent).toContain('Carta indisponível');
    expect(page().querySelector<HTMLTableRowElement>('[data-card-id="missing"]')!.querySelector('input')!.disabled).toBeTrue();
    spyOn(window, 'confirm').and.returnValue(true); await component.removeOwned(unavailable);
    expect(collection.remove).toHaveBeenCalledOnceWith('member', 'missing', unavailable.collection);
  });

  it('ignora leitura da rota anterior após mudar o UID', async () => {
    const first = deferred<PlayerOwnedCard[]>(), secondLoad = deferred<PlayerOwnedCard[]>();
    collection.listForUser.and.returnValues(first.promise, secondLoad.promise);
    fixture.detectChanges(); fixture.componentRef.setInput('uid', 'other'); fixture.detectChanges();
    secondLoad.resolve([]); await settle(); first.resolve([owned]); await settle();
    expect(component.entries()).toEqual([]);
    expect(page().querySelector('[data-card-id="nyra"]')).toBeNull();
    expect(collection.listForUser.calls.allArgs()).toEqual([['member'], ['other']]);
  });
});
