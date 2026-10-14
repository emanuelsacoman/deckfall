import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';
import { Card } from '../../../../model/interfaces/Cards/card';
import { PackDefinitionRecord } from '../../../../model/interfaces/Packs/pack-definition';
import { PackDefinitionVersion } from '../../../../model/interfaces/Packs/player-pack';
import { CardService } from '../../../../model/services/cruds/cards/card.service';
import { PackDefinitionService } from '../../../../model/services/cruds/packs/pack-definition.service';
import { defaultCardData } from '../../../../model/services/tools/card-canvas-factory';
import { PackAdminComponent } from './pack-admin.component';

function pending<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe('Gerenciamento administrativo de pacotes', () => {
  let fixture: ComponentFixture<PackAdminComponent>;
  let component: PackAdminComponent;
  let service: jasmine.SpyObj<PackDefinitionService>;
  let cards: jasmine.SpyObj<CardService>;
  const published: Card = { ...defaultCardData(), id: 'cardA', name: 'Primeira carta', status: 'published', rarity: 'rare', slug: 'card-a', art: null, createdAt: null, updatedAt: null };
  const timestamp = Timestamp.fromMillis(1000);
  const starter: PackDefinitionRecord = { id: 'starter', name: 'StarterPack', description: 'Boas-vindas', active: true, currentVersion: 1, createdAt: timestamp, updatedAt: timestamp };
  const normal: PackDefinitionRecord = { ...starter, id: 'normal', name: 'Exploradores' };
  const firstVersion: PackDefinitionVersion = { version: 1, cards: [{ cardId: 'cardA', quantity: 2 }], createdAt: timestamp };

  beforeEach(async () => {
    service = jasmine.createSpyObj<PackDefinitionService>('PackDefinitionService', ['list', 'listVersions', 'create', 'createVersion', 'updateMetadata']);
    service.list.and.resolveTo([]);
    service.listVersions.and.resolveTo([firstVersion]);
    service.create.and.resolveTo('normal');
    service.createVersion.and.resolveTo(2);
    service.updateMetadata.and.resolveTo();
    cards = jasmine.createSpyObj<CardService>('CardService', ['list']);
    cards.list.and.resolveTo([published, { ...published, id: 'draft', status: 'draft' }, { ...published, id: 'archived', status: 'archived' }]);
    await TestBed.configureTestingModule({ imports: [PackAdminComponent], providers: [provideRouter([]),
      { provide: PackDefinitionService, useValue: service }, { provide: CardService, useValue: cards }
    ] }).compileComponents();
    fixture = TestBed.createComponent(PackAdminComponent);
    component = fixture.componentInstance;
  });

  async function load(): Promise<void> { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function page(): HTMLElement { return fixture.nativeElement; }
  function choose(id = 'cardA'): void { component.picker.setValue(id); component.addCard(); fixture.detectChanges(); }

  it('orienta a criação do StarterPack e o catálogo vazio sem inventar conteúdo', async () => {
    cards.list.and.resolveTo([]);
    await load();
    expect(page().textContent).toContain('Configure o StarterPack dos novos jogadores');
    expect(page().textContent).toContain('Nenhuma carta publicada disponível');
    expect(page().querySelector('a[href="/admin/cartas/criar"]')).not.toBeNull();
    expect(page().querySelector('a[href="/admin/cartas/lista"]')).not.toBeNull();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('oferece somente cartas publicadas no seletor', async () => {
    await load(); component.startCreate(); fixture.detectChanges();
    const options = Array.from(page().querySelectorAll<HTMLOptionElement>('select option')).map(option => option.value);
    expect(options).toEqual(['', 'cardA']);
    choose('draft'); expect(component.content.length).toBe(0);
  });

  it('cria o StarterPack dedicado com nome protegido e conteúdo escolhido pelo admin', async () => {
    await load(); await component.configureStarter(); fixture.detectChanges();
    expect(page().querySelector<HTMLInputElement>('#pack-name')!.readOnly).toBeTrue();
    expect(component.form.controls.name.value).toBe('StarterPack');
    choose(); component.content.at(0).controls.quantity.setValue(3);
    component.form.controls.name.setValue('Nome adulterado');
    service.create.and.resolveTo('starter'); service.list.and.resolveTo([starter]);
    await component.save(); fixture.detectChanges();
    expect(service.create).toHaveBeenCalledOnceWith({ name: 'StarterPack', description: '', active: true, isStarter: true, cards: [{ cardId: 'cardA', quantity: 3 }] });
    expect(component.feedback()).toContain('versão 1 criados');
    expect(component.selected()?.id).toBe('starter');
  });

  it('cria definição comum sem usar a identidade inicial', async () => {
    await load(); component.startCreate(); choose();
    component.form.setValue({ name: 'Exploradores', description: 'Um novo conjunto', active: false });
    await component.save();
    expect(service.create).toHaveBeenCalledOnceWith({ name: 'Exploradores', description: 'Um novo conjunto', active: false, isStarter: false, cards: [{ cardId: 'cardA', quantity: 1 }] });
  });

  it('recusa variações de StarterPack no fluxo de criação comum', async () => {
    await load(); component.startCreate(); choose();
    for (const name of ['StarterPack', 'starter pack', ' STARTER-PACK ', 'starter_pack']) {
      component.form.controls.name.setValue(name); await component.save();
      expect(component.operationError()).toContain('reservado');
    }
    expect(service.create).not.toHaveBeenCalled();
  });

  it('recusa conteúdo vazio e quantidades inválidas sem solicitar gravação', async () => {
    await load(); component.startCreate(); component.form.controls.name.setValue('Exploradores');
    await component.save(); expect(component.operationError()).toContain('Escolha entre');
    choose();
    for (const quantity of [0, -1, 1.5, 10000, null]) {
      component.content.at(0).controls.quantity.setValue(quantity); await component.save();
      expect(component.operationError()).toContain('quantidade inteira');
    }
    expect(service.create).not.toHaveBeenCalled();
  });

  it('impede duplicatas e IDs indisponíveis mesmo com valores adulterados', async () => {
    await load(); component.startCreate(); component.form.controls.name.setValue('Exploradores'); choose(); choose();
    expect(component.content.length).toBe(1);
    expect(component.operationError()).toContain('já está no pacote');
    component.content.at(0).controls.cardId.setValue('draft'); await component.save();
    expect(component.operationError()).toContain('somente cartas publicadas');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('mostra falha de leitura e recupera a lista pela nova tentativa', async () => {
    service.list.and.rejectWith(new Error('Leitura indisponível')); await load();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('Leitura indisponível');
    service.list.and.resolveTo([starter]); await component.load(); fixture.detectChanges();
    expect(component.loadError()).toBe('');
    expect(page().textContent).toContain('Pacote inicial dos jogadores');
  });

  it('reutiliza o StarterPack existente em vez de tentar criar outro', async () => {
    service.list.and.resolveTo([starter]); await load(); await component.configureStarter(); fixture.detectChanges();
    expect(component.mode()).toBe('edit');
    expect(service.listVersions).toHaveBeenCalledOnceWith('starter');
    expect(service.create).not.toHaveBeenCalled();
    expect(page().querySelector<HTMLInputElement>('#pack-name')!.readOnly).toBeTrue();
  });

  it('salva metadados sem alterar o conteúdo da versão atual', async () => {
    service.list.and.resolveTo([normal]); await load(); await component.select(normal);
    component.form.setValue({ name: 'Exploradores do Norte', description: 'Revisado', active: false });
    await component.save();
    expect(service.updateMetadata).toHaveBeenCalledOnceWith(normal, { name: 'Exploradores do Norte', description: 'Revisado', active: false });
    expect(service.createVersion).not.toHaveBeenCalled();
    expect(firstVersion.cards).toEqual([{ cardId: 'cardA', quantity: 2 }]);
  });

  it('mostra versões imutáveis e cria uma nova sem editar a versão carregada', async () => {
    service.list.and.resolveTo([starter]); await load(); await component.select(starter); fixture.detectChanges();
    expect(page().textContent).toContain('Versão 1 · Atual');
    expect(page().querySelector('.versions input[type="number"]')).toBeNull();
    component.beginVersion(); component.content.at(0).controls.quantity.setValue(4); fixture.detectChanges();
    expect(firstVersion.cards[0].quantity).toBe(2);
    await component.saveVersion();
    expect(service.createVersion).toHaveBeenCalledOnceWith('starter', [{ cardId: 'cardA', quantity: 4 }], 1);
    expect(service.updateMetadata).not.toHaveBeenCalled();
    expect(component.feedback()).toContain('versões anteriores foram preservadas');
  });

  it('não avança configuração cuja versão atual está ausente', async () => {
    service.list.and.resolveTo([starter]); service.listVersions.and.resolveTo([]);
    await load(); await component.select(starter); component.beginVersion(); fixture.detectChanges();
    expect(component.addingVersion()).toBeFalse();
    expect(page().textContent).toContain('A versão atual não foi encontrada');
    expect(service.createVersion).not.toHaveBeenCalled();
  });

  it('preserva alterações de informações antes de iniciar uma nova versão', async () => {
    service.list.and.resolveTo([normal]); await load(); await component.select(normal);
    component.form.controls.description.setValue('Alteração pendente'); component.form.markAsDirty();
    component.beginVersion();
    expect(component.addingVersion()).toBeFalse();
    expect(component.operationError()).toContain('Salve as informações');
    expect(component.form.controls.description.value).toBe('Alteração pendente');
  });

  it('preserva a nova versão em erro concorrente e oferece recarregar a configuração', async () => {
    service.list.and.resolveTo([starter]); await load(); await component.select(starter);
    component.beginVersion(); component.content.at(0).controls.quantity.setValue(4);
    service.createVersion.and.rejectWith(new Error('O pacote mudou em outra sessão. Recarregue antes de criar a versão.'));
    await component.saveVersion(); fixture.detectChanges();
    expect(service.createVersion).toHaveBeenCalledOnceWith('starter', [{ cardId: 'cardA', quantity: 4 }], 1);
    expect(component.addingVersion()).toBeTrue();
    expect(component.content.at(0).controls.quantity.value).toBe(4);
    expect(component.feedback()).toBe('');
    const alert = page().querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.textContent).toContain('outra sessão');
    expect(alert.querySelector('button')!.textContent).toContain('Recarregar dados');
    service.list.and.resolveTo([{ ...starter, currentVersion: 2 }]);
    alert.querySelector<HTMLButtonElement>('button')!.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.packs()[0].currentVersion).toBe(2);
    expect(component.addingVersion()).toBeFalse();
    expect(component.operationError()).toBe('');
  });

  it('recarrega versões após falha de consulta', async () => {
    service.listVersions.and.rejectWith(new Error('Versões indisponíveis')); await load(); await component.select(starter);
    expect(component.versionsError()).toContain('indisponíveis');
    service.listVersions.and.resolveTo([firstVersion]); await component.loadVersions();
    expect(component.versionsError()).toBe(''); expect(component.currentVersion()?.version).toBe(1);
  });

  it('bloqueia duplicação de submissão e preserva formulário em falha de gravação', async () => {
    await load(); component.startCreate(); component.form.controls.name.setValue('Exploradores'); choose();
    const result = pending<string>(); service.create.and.returnValue(result.promise);
    const save = component.save(); await component.save(); component.cancel();
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(component.mode()).toBe('create'); expect(component.saving()).toBeTrue();
    result.resolve('normal'); await save;
    service.create.and.rejectWith(new Error('A configuração mudou. Atualize.'));
    component.startCreate(); component.form.controls.name.setValue('Outro'); choose(); await component.save();
    expect(component.operationError()).toContain('configuração mudou');
    expect(component.feedback()).toBe(''); expect(component.content.length).toBe(1);
  });

  it('separa criação confirmada de falha posterior na atualização da lista', async () => {
    await load(); component.startCreate(); component.form.controls.name.setValue('Exploradores'); choose();
    service.list.and.rejectWith(new Error('Lista indisponível')); await component.save();
    expect(component.feedback()).toContain('criados'); expect(component.loadError()).toContain('Lista indisponível');
    expect(component.operationError()).toBe(''); expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('descarta versões de seleção anterior e leituras após destruição', async () => {
    await load();
    const old = pending<PackDefinitionVersion[]>(), next = pending<PackDefinitionVersion[]>();
    service.listVersions.and.returnValues(old.promise, next.promise);
    const first = component.select(starter), second = component.select(normal);
    next.resolve([{ ...firstVersion, version: 2 }]); await second;
    old.resolve([firstVersion]); await first;
    expect(component.selected()?.id).toBe('normal'); expect(component.versions()[0].version).toBe(2);
    const last = pending<PackDefinitionVersion[]>(); service.listVersions.and.returnValue(last.promise);
    const stale = component.loadVersions(); fixture.destroy(); last.resolve([firstVersion]); await stale;
    expect(component.versions()).toEqual([]);
  });
});
