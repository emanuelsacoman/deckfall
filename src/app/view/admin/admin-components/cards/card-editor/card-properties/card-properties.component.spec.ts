import { TestBed } from '@angular/core/testing';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { renderText } from '../../../../../../model/services/tools/card-canvas-factory';
import { CardPropertiesComponent } from './card-properties.component';

describe('CardPropertiesComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [CardPropertiesComponent], providers: [CardEditorStateService] }));

  it('edits typed text properties and resolves selected data bindings immediately', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('text');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.textNumber('fontSize', input('42'), 6, 256);
    component.setBinding(input('name'));
    const text = component.textElement()!;
    expect(text.properties.fontSize).toBe(42);
    expect(renderText(text.properties.text, text.properties.binding, state.data())).toBe('Nova carta');
    state.updateData({ ...state.data(), name: 'Fênix' });
    expect(renderText(text.properties.text, text.properties.binding, state.data())).toBe('Fênix');
    component.textNumber('fontSize', input('500'), 6, 256);
    expect(component.textElement()!.properties.fontSize).toBe(42);
    expect(component.inputError()).toContain('256');
    state.addElement('rect');
    fixture.detectChanges();
    expect(component.textElement()).toBeNull();
    expect(component.shapeElement()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Vínculo com os dados');
  });

  it('validates normalized crop and updates image mask, fit and filter independently', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('image');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.setCrop('x', input('0.5'));
    expect(component.imageElement()!.properties.crop.x).toBe(0);
    component.setCrop('width', input('0.5'));
    component.setCrop('x', input('0.5'));
    component.setMask(input('ellipse'));
    component.setFit(input('contain'));
    component.setFilter(input('sepia'));
    expect(component.imageElement()!.properties).toEqual(jasmine.objectContaining({
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 }, mask: 'ellipse', fit: 'contain', filter: 'sepia'
    }));
  });

  it('does not edit locked or busy elements', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('text');
    const id = state.selectedElement()!.id;
    state.toggleLocked(id);
    const originalSize = fixture.componentInstance.textElement()!.properties.fontSize;
    fixture.componentInstance.patchText({ fontSize: 80 });
    expect(fixture.componentInstance.textElement()!.properties.fontSize).toBe(originalSize);
    state.toggleLocked(id);
    state.busy.set(true);
    fixture.componentInstance.patchText({ fontSize: 80 });
    expect(fixture.componentInstance.textElement()!.properties.fontSize).toBe(originalSize);
  });

  function input(value: string): Event {
    const element = document.createElement('input'); element.value = value;
    return { target: element } as unknown as Event;
  }
});
