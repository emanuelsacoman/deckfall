import { TestBed } from '@angular/core/testing';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { createCanvasElement, defaultCardData } from '../../../../../../model/services/tools/card-canvas-factory';
import { CardLayersComponent } from './card-layers.component';

describe('CardLayersComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [CardLayersComponent], providers: [CardEditorStateService] }));

  it('shows front-to-back layers and translates drag order into the canvas array', () => {
    const fixture = TestBed.createComponent(CardLayersComponent);
    const state = TestBed.inject(CardEditorStateService);
    const data = defaultCardData();
    const elements = ['Fundo', 'Meio', 'Frente'].map(name => ({ ...createCanvasElement('rect', data), name }));
    state.load({ data, canvas: { ...state.canvas(), elements } });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.layers().map(layer => layer.name)).toEqual(['Frente', 'Meio', 'Fundo']);
    const drag = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
    component.dragStart(elements[0].id, drag);
    component.drop(elements[2].id, new DragEvent('drop'));
    expect(state.canvas().elements.map(layer => layer.name)).toEqual(['Meio', 'Frente', 'Fundo']);
    expect(component.layers().map(layer => layer.name)).toEqual(['Fundo', 'Frente', 'Meio']);
  });

  it('keeps locked layers from being deleted and exposes their selection', () => {
    const fixture = TestBed.createComponent(CardLayersComponent);
    const state = TestBed.inject(CardEditorStateService);
    const element = state.canvas().elements[0];
    state.select(element.id);
    state.toggleLocked(element.id);
    fixture.detectChanges();
    state.remove(element.id);
    expect(state.canvas().elements.some(layer => layer.id === element.id)).toBeTrue();
    const row = (fixture.nativeElement as HTMLElement).querySelector('.layer.selected');
    expect(row).not.toBeNull();
    expect(row?.querySelector<HTMLButtonElement>('.remove')?.disabled).toBeTrue();
  });

  it('renomeia pelo painel com Enter, mantém ID e permite desfazer', () => {
    const fixture = TestBed.createComponent(CardLayersComponent), component = fixture.componentInstance;
    const state = TestBed.inject(CardEditorStateService), element = state.canvas().elements[0];
    const before = structuredClone(state.document());
    component.beginRename(element.id); fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.rename-editor input')!;
    expect(document.activeElement).toBe(input);
    input.value = 'Janela da arte'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fixture.detectChanges();
    expect(state.canvas().elements[0].name).toBe('Janela da arte');
    expect(state.canvas().elements[0].id).toBe(element.id);
    expect(component.editingId()).toBeNull();
    state.undo(); expect(state.document()).toEqual(before);
    fixture.destroy();
  });

  it('cancela com Escape e recusa nomes longos, bloqueio e busy', () => {
    const fixture = TestBed.createComponent(CardLayersComponent), component = fixture.componentInstance;
    const state = TestBed.inject(CardEditorStateService), id = state.canvas().elements[0].id;
    const before = structuredClone(state.document());
    component.beginRename(id); component.renameDraft = 'x'.repeat(121); component.confirmRename();
    expect(component.renameError()).toContain('120'); expect(state.document()).toEqual(before);
    component.renameDraft = 'Outro nome';
    component.renameKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.editingId()).toBeNull(); expect(state.document()).toEqual(before);
    state.toggleLocked(id); expect(component.beginRename(id)).toBeFalse();
    state.toggleLocked(id); state.busy.set(true); expect(component.beginRename(id)).toBeFalse();
    fixture.destroy();
  });

  it('expõe tipo e estados oculto/bloqueado sem depender de ícones', () => {
    const fixture = TestBed.createComponent(CardLayersComponent), state = TestBed.inject(CardEditorStateService);
    const id = state.canvas().elements[0].id; state.select(id); state.toggleLocked(id); state.toggleVisible(id);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('.layer.selected')!;
    expect(row.textContent).toContain('Bloqueada'); expect(row.textContent).toContain('Oculta');
    expect(row.querySelector('.layer-name small')?.textContent).not.toBe('frame');
    fixture.destroy();
  });
});
