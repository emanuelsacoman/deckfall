import { TestBed } from '@angular/core/testing';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { resolveCardBinding } from '../../../../../../model/services/tools/card-canvas-factory';
import { CardDataComponent } from './card-data.component';

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
});
