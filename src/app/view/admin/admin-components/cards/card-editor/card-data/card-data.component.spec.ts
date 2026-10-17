import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { resolveCardBinding } from '../../../../../../model/services/tools/card-canvas-factory';
import { CardDataComponent } from './card-data.component';
import { EditorColorFieldComponent } from '../shared/editor-color-field/editor-color-field.component';

describe('CardDataComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [CardDataComponent], providers: [CardEditorStateService] }));

  it('updates attribute bindings in real time and retains stable IDs when keys are renamed', () => {
    const fixture = TestBed.createComponent(CardDataComponent);
    const state = TestBed.inject(CardEditorStateService);
    fixture.detectChanges();
    const row = fixture.componentInstance.attributes.at(0);
    const id = row.controls.id.value;
    row.controls.value.setValue(95);
    fixture.detectChanges();
    expect(resolveCardBinding('attributes.attack', state.data())).toBe('95');
    expect(fixture.componentInstance.attributes.at(0)).toBe(row);
    row.controls.key.setValue('strength');
    expect(state.data().attributes[0].id).toBe(id);
    expect(state.canvas().elements.some(element => element.type === 'attribute' && element.properties.attributeKey === 'strength')).toBeTrue();
    expect(resolveCardBinding('attributes.strength', state.data())).toBe('95');
  });

  it('blocks invalid ranges and preserves unfinished input when only canvas settings change', () => {
    const fixture = TestBed.createComponent(CardDataComponent);
    const state = TestBed.inject(CardEditorStateService);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const validity = spyOn(component.validityChanged, 'emit');
    const row = component.attributes.at(0);
    row.controls.max.setValue(0);
    expect(component.form.invalid).toBeTrue();
    expect(validity).toHaveBeenCalledWith(false);
    expect(state.data().attributes[0].max).toBe(100);
    state.updateCanvasSettings({ width: 800 });
    fixture.detectChanges();
    expect(row.controls.max.value).toBe(0);
    row.controls.max.setValue(500);
    row.controls.value.setValue(250.5);
    expect(state.data().attributes[0].value).toBe(250.5);
    expect(state.data().attributes[0].max).toBe(500);
  });

  it('reorders attributes without changing IDs or associations and reloads data on undo', () => {
    const fixture = TestBed.createComponent(CardDataComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.load({ ...state.document(), data: { ...state.data(), setId: 'set-1', templateId: 'template-1' } });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const original = component.attributes.getRawValue().map(attribute => attribute.id);
    component.moveAttribute(0, 1);
    expect(state.data().attributes.map(attribute => attribute.id)).toEqual([original[1], original[0], ...original.slice(2)]);
    expect(state.data().setId).toBe('set-1');
    expect(state.data().templateId).toBe('template-1');
    state.undo();
    fixture.detectChanges();
    expect(component.attributes.getRawValue().map(attribute => attribute.id)).toEqual(original);
  });

  it('commits attribute colors through the validated form and preserves other unfinished fields', () => {
    const fixture = TestBed.createComponent(CardDataComponent);
    const state = TestBed.inject(CardEditorStateService);
    // The state effect populates the FormArray; render its rows before querying their controls.
    fixture.detectChanges(); TestBed.flushEffects(); fixture.detectChanges();
    const component = fixture.componentInstance;
    const row = component.attributes.at(0);
    const colorField = fixture.debugElement.query(By.directive(EditorColorFieldComponent)).componentInstance as EditorColorFieldComponent;
    colorField.valueChange.emit('rgba(10, 20, 30, 0.5)');
    expect(row.controls.color.dirty).toBeTrue();
    expect(state.data().attributes[0].color).toBe('rgba(10, 20, 30, 0.5)');
    component.commitAttributeColor(0, 'not-a-color');
    expect(row.controls.color.invalid).toBeTrue();
    expect(state.data().attributes[0].color).toBe('rgba(10, 20, 30, 0.5)');
    component.commitAttributeColor(0, 'transparent');
    expect(state.data().attributes[0].color).toBe('transparent');
    row.controls.max.setValue(0);
    component.commitAttributeColor(0, '#aabbcc');
    fixture.detectChanges();
    expect(row.controls.max.value).toBe(0);
    expect(row.controls.color.value).toBe('#aabbcc');
    expect(state.data().attributes[0].color).toBe('transparent');
  });

  it('clears optional colors without adding persisted defaults and ignores commits while busy', () => {
    const fixture = TestBed.createComponent(CardDataComponent);
    const state = TestBed.inject(CardEditorStateService);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.commitAttributeColor(0, '#aabbcc');
    component.commitAttributeColor(0, '');
    expect('color' in state.data().attributes[0]).toBeFalse();
    const before = structuredClone(state.document());
    state.busy.set(true);
    component.commitAttributeColor(0, '#123456');
    component.chooseAttributeSymbol(0, '★');
    fixture.detectChanges();
    expect(state.document()).toEqual(before);
    const colorField = fixture.debugElement.query(By.directive(EditorColorFieldComponent)).componentInstance as EditorColorFieldComponent;
    expect(colorField.disabled).toBeTrue();
    expect((fixture.nativeElement.querySelector('.symbol-presets button') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('shows counters from current form values and keeps icon text and stable attribute bindings editable', () => {
    const fixture = TestBed.createComponent(CardDataComponent);
    const state = TestBed.inject(CardEditorStateService);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const row = component.attributes.at(0);
    const id = row.controls.id.value;
    component.form.controls.name.setValue('Lia');
    component.form.controls.description.setValue('Uma história.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#card-data-name-count').textContent).toContain('3/120');
    expect(fixture.nativeElement.querySelector('#card-data-description-count').textContent).toContain('13/5000');
    (fixture.nativeElement.querySelector('.symbol-presets button[data-symbol="★"]') as HTMLButtonElement).click();
    expect(state.data().attributes[0].icon).toBe('★');
    expect(row.controls.id.value).toBe(id);
    row.controls.icon.setValue('símbolo livre');
    row.controls.key.setValue('strength');
    expect(state.data().attributes[0].icon).toBe('símbolo livre');
    expect(state.data().attributes[0].id).toBe(id);
    expect(state.canvas().elements.some(element => element.type === 'attribute' && element.properties.attributeKey === 'strength')).toBeTrue();
    component.form.controls.description.setValue('x'.repeat(5001));
    fixture.detectChanges();
    expect(component.form.controls.description.invalid).toBeTrue();
    expect(fixture.nativeElement.querySelector('#card-data-description-count').textContent).toContain('5001/5000');
    expect(state.data().description).toBe('Uma história.');
  });
});
