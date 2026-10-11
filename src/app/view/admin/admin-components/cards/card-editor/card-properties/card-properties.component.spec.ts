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

  it('lets an existing image reveal the layers underneath and records the change in history', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('image');
    fixture.componentInstance.patchImage({ fill: '#ffffff' });
    const id = state.selectedIds()[0];
    fixture.detectChanges();
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(item => item.textContent?.includes('Usar fundo transparente'))!;
    expect(button.disabled).toBeFalse();
    button.click(); fixture.detectChanges();
    expect(fixture.componentInstance.imageElement()!.properties.fill).toBe('transparent');
    expect(button.disabled).toBeTrue();
    state.undo();
    expect(state.canvas().elements.find(element => element.id === id)!.properties.fill).toBe('#ffffff');
    state.select(id); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Fundo da imagem (opcional)');
  });

  it('applies image looks and restores effects without changing crop, mask, placement or transparency', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('image');
    const component = fixture.componentInstance;
    component.patchImage({ mask: 'ellipse', fit: 'contain', crop: { x: 0.2, y: 0, width: 0.8, height: 1 } });
    state.patchElement(state.selectedIds()[0], { x: 110, y: 125, rotation: 24 });
    const original = structuredClone(component.imageElement()!);
    component.flipImage('flipX'); component.flipImage('flipY');
    component.applyImageLook('vintage');
    fixture.detectChanges();
    expect(component.imageElement()!.properties).toEqual(jasmine.objectContaining({
      filter: 'sepia', brightness: 0.03, contrast: -12, saturation: -0.3, hue: 0, flipX: true, flipY: true,
      fill: 'transparent', mask: 'ellipse', fit: 'contain', crop: original.properties.crop
    }));
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="range"]').length).toBe(4);
    component.applyImageLook('original');
    expect(component.imageElement()!.properties.flipX).toBeTrue();
    component.resetImageEffects();
    const reset = component.imageElement()!;
    expect(reset.properties).toEqual(jasmine.objectContaining({ filter: 'none', brightness: 0, contrast: 0,
      saturation: 0, hue: 0, flipX: false, flipY: false, fill: 'transparent', mask: 'ellipse',
      crop: original.properties.crop, assetId: original.properties.assetId, binding: original.properties.binding }));
    expect({ x: reset.x, y: reset.y, rotation: reset.rotation, width: reset.width, height: reset.height })
      .toEqual({ x: original.x, y: original.y, rotation: original.rotation, width: original.width, height: original.height });
  });

  it('validates image tone controls and protects locked or busy image actions', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('image'); const component = fixture.componentInstance;
    component.imageNumber('brightness', input('0.2'), -1, 1);
    component.imageNumber('contrast', input('20'), -100, 100);
    component.imageNumber('hue', input('90'), -180, 180);
    component.imageNumber('saturation', input('0.5'), -1, 1);
    const expected = structuredClone(component.imageElement()!);
    component.imageNumber('brightness', input('2'), -1, 1);
    component.imageNumber('hue', input('181'), -180, 180);
    expect(component.imageElement()).toEqual(expected);
    expect(component.inputError()).toContain('180');
    state.toggleLocked(expected.id);
    const locked = structuredClone(component.imageElement()!);
    component.flipImage('flipX'); component.applyImageLook('vivid'); component.resetImageEffects();
    expect(component.imageElement()).toEqual(locked);
    state.toggleLocked(expected.id); state.busy.set(true);
    component.flipImage('flipY'); component.applyImageLook('monochrome'); component.resetImageEffects();
    expect(component.imageElement()).toEqual(expected);
  });

  it('keeps preset changes as one reversible command and exposes typed border and text options', () => {
    const fixture = TestBed.createComponent(CardPropertiesComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('image'); const id = state.selectedIds()[0];
    const original = structuredClone(state.selectedElement()!);
    fixture.componentInstance.applyImageLook('vivid');
    state.undo(); expect(state.canvas().elements.find(element => element.id === id)).toEqual(original);
    state.redo(); state.select(id);
    expect(fixture.componentInstance.imageElement()!.properties.contrast).toBe(18);
    fixture.componentInstance.setBorderStyle(input('dashed'));
    expect(state.selectedElement()!.properties.borderStyle).toBe('dashed');
    state.addElement('text');
    fixture.componentInstance.setVerticalAlign(input('bottom'));
    fixture.componentInstance.setTextDecoration(input('underline line-through'));
    fixture.detectChanges();
    expect(fixture.componentInstance.textElement()!.properties.verticalAlign).toBe('bottom');
    expect(fixture.componentInstance.textElement()!.properties.textDecoration).toBe('underline line-through');
    expect((fixture.nativeElement as HTMLElement).querySelector('.image-effects')).toBeNull();
  });

  function input(value: string): Event {
    const element = document.createElement('input'); element.value = value;
    return { target: element } as unknown as Event;
  }
});
