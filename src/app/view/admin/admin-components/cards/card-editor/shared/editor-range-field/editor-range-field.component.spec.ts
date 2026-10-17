import { TestBed } from '@angular/core/testing';
import { EditorRangeFieldComponent } from './editor-range-field.component';

describe('EditorRangeFieldComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [EditorRangeFieldComponent] }));

  function setup(inputs: Record<string, string | number | boolean> = {}) {
    const fixture = TestBed.createComponent(EditorRangeFieldComponent);
    for (const [name, value] of Object.entries({ label: 'Opacidade', min: 0, max: 1, step: .01, scale: 100, unit: '%', value: .75, ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    const emitted: number[] = [];
    fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));
    fixture.detectChanges();
    const number = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="number"]')!;
    const slider = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="range"]')!;
    return { fixture, component: fixture.componentInstance, number, slider, emitted };
  }

  function type(input: HTMLInputElement, value: string): void { input.value = value; input.dispatchEvent(new Event('input')); }

  it('displays scaled percent and model-unit slider bounds without rewriting on mount or blur', () => {
    const { fixture, number, slider, emitted } = setup();
    expect(number.value).toBe('75'); expect(number.min).toBe('0'); expect(number.max).toBe('100'); expect(number.step).toBe('1');
    expect(slider.value).toBe('0.75'); expect(slider.step).toBe('0.01');
    expect((fixture.nativeElement as HTMLElement).querySelector('output')?.textContent).toBe('75%');
    number.dispatchEvent(new Event('blur'));
    expect(emitted).toEqual([]);
  });

  it('buffers numeric edits then emits model units once on change/blur/Enter', () => {
    const { fixture, number, emitted } = setup();
    type(number, '37.5'); expect(emitted).toEqual([]);
    number.dispatchEvent(new Event('change')); number.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(emitted).toEqual([.375]);
    type(number, '50');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    number.dispatchEvent(enter); number.dispatchEvent(new Event('blur'));
    expect(enter.defaultPrevented).toBeTrue(); expect(emitted).toEqual([.375, .5]);
  });

  it('keeps signed percent offsets precise and converts slider input from model units', () => {
    const { number, slider, emitted } = setup({ label: 'Deslocamento', min: -1, max: 1, value: -.25 });
    expect(number.value).toBe('-25'); expect(number.min).toBe('-100');
    type(number, '-35'); number.dispatchEvent(new Event('blur'));
    slider.value = '-0.5'; slider.dispatchEvent(new Event('input'));
    expect(emitted).toEqual([-.35, -.5]);
  });

  it('rejects empty, nonfinite and out-of-range drafts without converting them to zero', () => {
    const { fixture, component, number, emitted } = setup();
    for (const value of ['', '-1', '101', 'NaN', 'Infinity', '1e999']) {
      type(number, value); fixture.detectChanges();
      number.dispatchEvent(new Event('blur')); fixture.detectChanges();
      expect(component.error).withContext(value).not.toBe('');
      expect(number.getAttribute('aria-invalid')).withContext(value).toBe('true');
    }
    expect(emitted).toEqual([]);
    expect(component.displayValue).toBe('75');
  });

  it('allows precise numeric values beyond the smaller slider viewport without quantizing to step', () => {
    const { fixture, component, number, slider, emitted } = setup({ min: 0, max: 8192, step: 1, scale: 1, unit: 'px', value: 1000, sliderMax: 500 });
    expect(number.value).toBe('1000'); expect(slider.value).toBe('500'); expect(emitted).toEqual([]);
    type(number, '1200.125'); number.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(emitted).toEqual([1200.125]);
    expect(component.displayValue).toBe('1200.125');
  });

  it('rejects fractional drafts for integer-only fields before committing a model value', () => {
    const { fixture, component, number, emitted } = setup({ min: 0, max: 12, step: 1, scale: 1, unit: '', value: 3, integerOnly: true });
    type(number, '3.5'); number.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(component.error).toContain('inteiro');
    expect(number.getAttribute('aria-invalid')).toBe('true');
    expect(component.displayValue).toBe('3'); expect(emitted).toEqual([]);
    number.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); fixture.detectChanges();
    expect(number.value).toBe('3');
    type(number, '4'); number.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(component.error).toBe(''); expect(component.displayValue).toBe('4'); expect(emitted).toEqual([4]);
  });

  it('protects disabled fields and invalid configurations without emitting a fallback', () => {
    const { fixture, component, number, slider, emitted } = setup();
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    type(number, '30'); slider.value = '0.3'; slider.dispatchEvent(new Event('input')); component.commit();
    expect(emitted).toEqual([]);
    expect(number.disabled).toBeTrue(); expect(slider.disabled).toBeTrue();
    fixture.componentRef.setInput('disabled', false); fixture.componentRef.setInput('scale', 0); fixture.detectChanges();
    expect(number.disabled).toBeTrue(); expect(slider.disabled).toBeTrue();
    component.slide({ target: { value: '0.5' } } as unknown as Event);
    expect(emitted).toEqual([]);
  });

  it('synchronizes an external model update and cancels a local draft without a commit', () => {
    const { fixture, number, emitted } = setup();
    type(number, '20');
    number.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); fixture.detectChanges();
    expect(number.value).toBe('75'); expect(emitted).toEqual([]);
    number.dispatchEvent(new Event('blur')); expect(emitted).toEqual([]);
    fixture.componentRef.setInput('value', .9); fixture.detectChanges();
    expect(number.value).toBe('90'); expect(emitted).toEqual([]);
  });

  it('discards local invalid input on a context change even if the model number is identical', () => {
    const { fixture, component, number, emitted } = setup();
    fixture.componentRef.setInput('contextKey', 'layer-a'); fixture.detectChanges();
    type(number, ''); number.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(component.error).not.toBe('');
    fixture.componentRef.setInput('contextKey', 'layer-b'); fixture.detectChanges();
    expect(number.value).toBe('75'); expect(component.error).toBe(''); expect(emitted).toEqual([]);
  });
});
