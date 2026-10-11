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
});
