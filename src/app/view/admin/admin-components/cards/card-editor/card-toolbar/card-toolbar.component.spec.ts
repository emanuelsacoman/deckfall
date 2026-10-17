import { TestBed } from '@angular/core/testing';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { CardToolbarComponent } from './card-toolbar.component';

describe('CardToolbarComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [CardToolbarComponent], providers: [CardEditorStateService] }));

  it('emits typed export resolution and changes viewport zoom without resizing the card', () => {
    const fixture = TestBed.createComponent(CardToolbarComponent);
    const state = TestBed.inject(CardEditorStateService);
    const component = fixture.componentInstance;
    const size = { width: state.canvas().width, height: state.canvas().height };
    const exported = spyOn(component.exportRequested, 'emit');
    component.changeFormat(select('jpeg')); component.changeRatio(select('4')); component.export();
    expect(exported).toHaveBeenCalledOnceWith({ format: 'jpeg', pixelRatio: 4 });
    component.changeZoom(select('1.5'));
    expect(state.zoom()).toBe(1.5);
    expect({ width: state.canvas().width, height: state.canvas().height }).toEqual(size);
  });

  it('steps between zoom stops around custom fit values, respects both limits and leaves document/history intact', () => {
    const fixture = TestBed.createComponent(CardToolbarComponent);
    const state = TestBed.inject(CardEditorStateService);
    const component = fixture.componentInstance;
    const before = structuredClone(state.document());
    state.setZoom(0.63);
    fixture.detectChanges();
    expect(component.customZoom()).toBeTrue();
    expect(fixture.nativeElement.querySelector('select[aria-label="Zoom do preview"]').textContent).toContain('63%');
    component.stepZoom(1); expect(state.zoom()).toBe(0.75);
    state.setZoom(0.63); component.stepZoom(-1); expect(state.zoom()).toBe(0.5);
    state.setZoom(0.25); component.stepZoom(-1); expect(state.zoom()).toBe(0.1);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('button[aria-label="Diminuir zoom"]') as HTMLButtonElement).disabled).toBeTrue();
    component.stepZoom(-1); expect(state.zoom()).toBe(0.1);
    state.setZoom(1.5); component.stepZoom(1); expect(state.zoom()).toBe(2);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('button[aria-label="Aumentar zoom"]') as HTMLButtonElement).disabled).toBeTrue();
    component.stepZoom(1); expect(state.zoom()).toBe(2);
    component.resetZoom(); expect(state.zoom()).toBe(1);
    const revision = state.fitRevision(); component.fit();
    expect(state.fitRevision()).toBe(revision + 1);
    component.changeZoom(select('NaN'));
    expect(state.zoom()).toBe(1);
    expect(state.document()).toEqual(before);
    expect(state.canUndo()).toBeFalse();
    expect(state.dirty()).toBeFalse();
  });

  it('blocks viewport and export changes while busy from either input or editor state', () => {
    const fixture = TestBed.createComponent(CardToolbarComponent);
    const state = TestBed.inject(CardEditorStateService);
    const component = fixture.componentInstance;
    const exported = spyOn(component.exportRequested, 'emit');
    for (const inputBusy of [true, false]) {
      component.busy = inputBusy; state.busy.set(!inputBusy);
      state.setZoom(0.5);
      const fitRevision = state.fitRevision();
      component.stepZoom(1); component.resetZoom(); component.fit(); component.changeZoom(select('1.5'));
      component.changeFormat(select('jpeg')); component.changeRatio(select('4')); component.export();
      component.toggleShortcuts();
      fixture.detectChanges();
      expect(state.zoom()).toBe(0.5);
      expect(state.fitRevision()).toBe(fitRevision);
      expect(component.format).toBe('png'); expect(component.pixelRatio).toBe(1);
      expect(exported).not.toHaveBeenCalled();
      expect(component.shortcutsOpen).toBeFalse();
      expect((fixture.nativeElement.querySelector('button[aria-label="Zoom de 100%"]') as HTMLButtonElement).disabled).toBeTrue();
      expect((fixture.nativeElement.querySelector('select[aria-label="Zoom do preview"]') as HTMLSelectElement).disabled).toBeTrue();
    }
  });

  it('opens keyboard help with focus, closes on Escape and restores the trigger without changing selection', () => {
    const fixture = TestBed.createComponent(CardToolbarComponent);
    const state = TestBed.inject(CardEditorStateService);
    const element = state.canvas().elements[0]; state.select(element.id);
    const before = structuredClone(state.document());
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    expect(dialog.textContent).toContain('Shift + Setas');
    expect(dialog.textContent).toContain('F2');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.dispatchEvent(escape); fixture.detectChanges();
    expect(escape.defaultPrevented).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(state.selectedElement()?.id).toBe(element.id);
    expect(state.document()).toEqual(before);
    expect(state.canUndo()).toBeFalse();
  });

  function select(value: string): Event {
    const element = document.createElement('input'); element.value = value;
    return { target: element } as unknown as Event;
  }
});
