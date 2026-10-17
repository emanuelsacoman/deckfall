import { TestBed } from '@angular/core/testing';
import { EditorColorFieldComponent } from './editor-color-field.component';

describe('EditorColorFieldComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [EditorColorFieldComponent] }));

  function setup(value: string) {
    const fixture = TestBed.createComponent(EditorColorFieldComponent);
    fixture.componentRef.setInput('label', 'Preenchimento');
    fixture.componentRef.setInput('value', value);
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe(color => emitted.push(color));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="text"]')!;
    return { fixture, component: fixture.componentInstance, text, emitted };
  }

  function type(text: HTMLInputElement, value: string): void {
    text.value = value;
    text.dispatchEvent(new Event('input'));
  }

  it('preserves RGB, alpha, named, transparent and empty strings on mount and untouched blur', () => {
    for (const value of ['rgb(12, 34, 56)', 'rgba(12, 34, 56, 0.25)', '#abcd', 'green', 'transparent', '']) {
      const { fixture, text, emitted } = setup(value);
      expect(text.value).withContext(value).toBe(value);
      text.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(emitted).withContext(value).toEqual([]);
      expect(fixture.componentInstance.value).toBe(value);
      fixture.destroy();
    }
  });

  it('buffers text locally and emits one valid commit on Enter or blur', () => {
    const { fixture, text, emitted } = setup('#112233');
    type(text, '#AbC'); fixture.detectChanges();
    expect(emitted).toEqual([]);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    text.dispatchEvent(enter); text.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(enter.defaultPrevented).toBeTrue();
    expect(emitted).toEqual(['#AbC']);
  });

  it('shows an accessible local error and retains the last committed swatch for invalid text', () => {
    const { fixture, component, text, emitted } = setup('#112233');
    type(text, '#not-a-color'); text.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(emitted).toEqual([]);
    expect(component.swatchColor).toBe('#112233');
    expect(text.getAttribute('aria-invalid')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    type(text, 'rgba(1, 2, 3, 0.5)'); text.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(emitted).toEqual(['rgba(1, 2, 3, 0.5)']);
    expect(component.error).toBe('');
  });

  it('uses a keyboard-focusable native picker and commits only after an explicit picker choice', () => {
    const { fixture, component, emitted } = setup('rgba(1, 2, 3, 0.5)');
    const picker = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="color"]')!;
    expect(picker.getAttribute('aria-label')).toContain('Preenchimento');
    expect(picker.tabIndex).toBe(0);
    expect(component.swatchColor).toBe('rgba(1, 2, 3, 0.5)');
    expect(emitted).toEqual([]);
    picker.value = '#aabbcc'; picker.dispatchEvent(new Event('input')); picker.dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['#aabbcc']);
  });

  it('offers explicit clear/transparency and bounds valid deduplicated palette choices', () => {
    const { fixture, component, emitted } = setup('red');
    fixture.componentRef.setInput('palette', ['white', '#fff', 'invalid', ...Array.from({ length: 16 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`)]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.palette-color').length).toBe(12);
    component.choose(''); component.choose('transparent');
    expect(emitted).toEqual(['', 'transparent']);
    fixture.componentRef.setInput('allowEmpty', false); fixture.componentRef.setInput('allowTransparent', false);
    fixture.detectChanges(); component.choose(''); component.choose('transparent');
    expect(emitted).toEqual(['', 'transparent']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.color-options button').length).toBe(0);
  });

  it('ignores disabled interactions and synchronizes external values without emitting', () => {
    const { fixture, component, text, emitted } = setup('#112233');
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    type(text, 'red'); component.choose('red'); component.commit();
    expect(emitted).toEqual([]);
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input')).every(input => input.disabled)).toBeTrue();
    fixture.componentRef.setInput('value', 'blue'); fixture.detectChanges();
    expect(text.value).toBe('blue');
    expect(emitted).toEqual([]);
  });

  it('discards a local invalid draft when another layer has the same persisted color', () => {
    const { fixture, component, text, emitted } = setup('#112233');
    fixture.componentRef.setInput('contextKey', 'layer-a'); fixture.detectChanges();
    type(text, 'not-a-color'); text.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(component.error).not.toBe('');
    fixture.componentRef.setInput('contextKey', 'layer-b'); fixture.detectChanges();
    expect(text.value).toBe('#112233'); expect(component.error).toBe(''); expect(emitted).toEqual([]);
  });

  it('restores the visible color text on Escape even before a draft change-detection pass', () => {
    const { fixture, text, emitted } = setup('rgba(1, 2, 3, 0.5)');
    type(text, 'not-a-color');
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); fixture.detectChanges();
    expect(text.value).toBe('rgba(1, 2, 3, 0.5)');
    text.dispatchEvent(new Event('blur'));
    expect(emitted).toEqual([]);
  });
});
