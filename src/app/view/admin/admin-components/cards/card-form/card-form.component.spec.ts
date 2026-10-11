import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Card, CardOperationError, CARD_LIMITS } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { CardFormComponent } from './card-form.component';

describe('CardFormComponent', () => {
  let fixture: ComponentFixture<CardFormComponent>;
  let component: CardFormComponent;
  let cards: jasmine.SpyObj<CardService>;
  let storage: jasmine.SpyObj<CardStorageService>;
  let navigation: jasmine.Spy;
  const existing: Card = {
    id: 'card-1', name: 'Dragão', slug: 'dragao', description: 'Carta existente',
    rarity: 'epic', status: 'archived', attributes: [{ key: 'luck', label: 'Sorte', value: 12.5 }],
    setId: 'first-set', art: null, createdAt: null, updatedAt: null
  };

  beforeEach(async () => {
    cards = jasmine.createSpyObj<CardService>('CardService', ['getById', 'create', 'update']);
    storage = jasmine.createSpyObj<CardStorageService>('CardStorageService', ['validateImage', 'getArtUrl']);
    cards.create.and.resolveTo({ id: 'new-card', warnings: [] });
    cards.update.and.resolveTo({ id: existing.id, warnings: [] });
    cards.getById.and.resolveTo(existing);
    await TestBed.configureTestingModule({
      imports: [CardFormComponent],
      providers: [
        provideRouter([]),
        { provide: CardService, useValue: cards },
        { provide: CardStorageService, useValue: storage }
      ]
    }).compileComponents();
    navigation = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CardFormComponent);
    component = fixture.componentInstance;
  });

  it('starts with four attributes and prevents blank names, invalid options and out-of-range values', async () => {
    fixture.detectChanges();
    expect(component.attributes.controls.map(control => control.controls.key.value)).toEqual(['attack', 'defense', 'speed', 'magic']);
    component.form.controls.name.setValue('   ');
    await component.save();
    expect(cards.create).not.toHaveBeenCalled();
    component.form.controls.name.setValue('Fênix');
    component.form.controls.rarity.setValue('unknown' as 'common');
    expect(component.form.invalid).toBeTrue();
    component.form.controls.rarity.setValue('rare');
    const value = component.attributes.at(0).controls.value;
    for (const invalid of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      value.setValue(invalid);
      await component.save();
      expect(cards.create).not.toHaveBeenCalled();
    }
    value.setValue(92.5);
    await component.save();
    expect(cards.create).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      name: 'Fênix', rarity: 'rare', setId: null,
      attributes: jasmine.arrayContaining([{ key: 'attack', label: 'Ataque', value: 92.5 }])
    }), undefined);
  });

  it('rejects duplicate custom keys and respects the configured attribute limit', () => {
    fixture.detectChanges();
    component.addAttribute();
    component.attributes.at(4).setValue({ key: 'attack', label: 'Duplicado', value: 10 });
    expect(component.attributes.hasError('duplicateKeys')).toBeTrue();
    component.attributes.at(4).controls.key.setValue('critical-hit');
    expect(component.attributes.valid).toBeTrue();
    for (let index = 0; index < 20; index++) component.addAttribute();
    expect(component.attributes.length).toBe(CARD_LIMITS.attributes);
    component.removeAttribute(4);
    expect(component.attributes.length).toBe(CARD_LIMITS.attributes - 1);
  });

  it('loads persisted attributes and choices for editing and preserves setId on update', async () => {
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('cardId', existing.id);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.form.controls.name.value).toBe('Dragão');
    expect(component.form.controls.rarity.value).toBe('epic');
    expect(component.form.controls.status.value).toBe('archived');
    expect(component.attributes.getRawValue()).toEqual(existing.attributes);
    component.form.controls.name.setValue(' Dragão revisado ');
    await component.save();
    expect(cards.update).toHaveBeenCalledOnceWith(existing, jasmine.objectContaining({
      name: 'Dragão revisado', setId: 'first-set', attributes: existing.attributes
    }), undefined);
    expect(cards.create).not.toHaveBeenCalled();
    expect(navigation).toHaveBeenCalledWith(['/admin/cartas/lista'], {
      state: { cardFeedback: { message: 'Carta atualizada com sucesso.', warnings: [] } }
    });
  });

  it('blocks an invalid image and revokes replaced and destroyed local previews', async () => {
    fixture.detectChanges();
    component.form.controls.name.setValue('Fênix');
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#card-art')!;
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValues('blob:first', 'blob:second');
    const revokeUrl = spyOn(URL, 'revokeObjectURL');
    storage.validateImage.and.throwError('Imagem inválida.');
    chooseFile(input, new File(['bad'], 'bad.svg', { type: 'image/svg+xml' }));
    await component.save();
    expect(component.fileError()).toBe('Imagem inválida.');
    expect(cards.create).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    storage.validateImage.and.stub();
    chooseFile(input, new File(['first'], 'first.png', { type: 'image/png' }));
    expect(component.previewUrl()).toBe('blob:first');
    chooseFile(input, new File(['second'], 'second.webp', { type: 'image/webp' }));
    expect(revokeUrl).toHaveBeenCalledWith('blob:first');
    fixture.destroy();
    expect(revokeUrl).toHaveBeenCalledWith('blob:second');
  });

  it('shows recoverable partial creation and prevents creating a second document', async () => {
    fixture.detectChanges();
    component.form.controls.name.setValue('Fênix');
    cards.create.and.rejectWith(new CardOperationError('A arte falhou; verifique o documento.', 'reserved-card'));
    await component.save();
    fixture.detectChanges();
    expect(component.recoveryId()).toBe('reserved-card');
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href="/admin/cartas/editar/reserved-card"]');
    expect(link).not.toBeNull();
    await component.save();
    expect(cards.create).toHaveBeenCalledTimes(1);
    expect(navigation).not.toHaveBeenCalled();
  });

  it('keeps cleanup warnings in the navigation state after successful persistence', async () => {
    fixture.detectChanges();
    component.form.controls.name.setValue('Fênix');
    cards.create.and.resolveTo({ id: 'new-card', warnings: ['Limpeza pendente: cards/new-card/art/old.png'] });
    await component.save();
    expect(navigation).toHaveBeenCalledWith(['/admin/cartas/lista'], {
      state: { cardFeedback: {
        message: 'Carta criada com sucesso.', warnings: ['Limpeza pendente: cards/new-card/art/old.png']
      } }
    });
  });

  function chooseFile(input: HTMLInputElement, file: File): void {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  }
});
