import { TestBed } from '@angular/core/testing';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { ElementLibraryComponent } from './element-library.component';

describe('ElementLibraryComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ElementLibraryComponent], providers: [CardEditorStateService] }));

  it('rejects SVG and emits a valid image with its newly created element ID', () => {
    const fixture = TestBed.createComponent(ElementLibraryComponent);
    const state = TestBed.inject(CardEditorStateService);
    const component = fixture.componentInstance;
    const emit = spyOn(component.assetSelected, 'emit');
    const count = state.canvas().elements.length;
    component.upload(upload(new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })));
    expect(component.imageError()).toContain('PNG');
    expect(state.canvas().elements.length).toBe(count);
    const file = new File(['png'], 'art.png', { type: 'image/png' });
    component.upload(upload(file));
    expect(state.selectedElement()!.type).toBe('image');
    expect(emit).toHaveBeenCalledOnceWith({ elementId: state.selectedElement()!.id, file });
  });

  it('previews a selected palette and applies it without replacing the design or gameplay', () => {
    const fixture = TestBed.createComponent(ElementLibraryComponent);
    const state = TestBed.inject(CardEditorStateService);
    state.addElement('ornate-frame');
    const original = structuredClone(state.document());
    fixture.detectChanges();
    const frost = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.theme-option')[1];
    frost.click(); fixture.detectChanges();
    expect(fixture.componentInstance.selectedTheme()).toBe('frost');
    expect(frost.getAttribute('aria-pressed')).toBe('true');
    expect(state.document()).toEqual(original);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.palette-action')!.click();
    expect(state.data()).toEqual(original.data);
    expect(state.canvas().assets).toEqual(original.canvas.assets);
    expect(state.canvas().elements.map(({ id, x, y, width, height, rotation }) => ({ id, x, y, width, height, rotation })))
      .toEqual(original.canvas.elements.map(({ id, x, y, width, height, rotation }) => ({ id, x, y, width, height, rotation })));
    expect(state.canvas().elements.find(element => element.type === 'frame')!.properties)
      .not.toEqual(original.canvas.elements.find(element => element.type === 'frame')!.properties);
    state.undo(); expect(state.document()).toEqual(original);
  });

  it('requires inline confirmation before replacing layers and preserves art assets and game data', () => {
    const fixture = TestBed.createComponent(ElementLibraryComponent);
    const state = TestBed.inject(CardEditorStateService);
    const document = structuredClone(state.document());
    document.data.name = 'Fênix'; document.data.description = 'Renasce das cinzas.';
    const art = document.canvas.elements.find(element => element.type === 'artwork')!;
    if (art.type === 'artwork') art.properties.assetId = 'phoenix-art';
    document.canvas.assets.push({ id: 'phoenix-art', storagePath: null, fileName: 'phoenix.png', contentType: 'image/png', size: 32 });
    state.load(document); const original = structuredClone(state.document());
    const apply = spyOn(state, 'applyOrnamentLayout').and.callThrough();
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.layout-action')!.click();
    fixture.detectChanges();
    expect(apply).not.toHaveBeenCalled();
    expect(state.document()).toEqual(original);
    expect((fixture.nativeElement as HTMLElement).querySelector('.layout-confirmation')!.textContent).toContain('Você pode desfazer');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.cancel-action')!.click();
    fixture.detectChanges(); expect(fixture.componentInstance.pendingLayout()).toBeFalse();
    expect(state.document()).toEqual(original);
    fixture.componentInstance.requestLayout(); fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.layout-confirmation .layout-action')!.click();
    expect(apply).toHaveBeenCalledOnceWith('ember');
    expect(state.data()).toEqual(original.data);
    expect(state.canvas().assets).toEqual(original.canvas.assets);
    const retained = state.canvas().elements.find(element => element.type === 'artwork')!;
    expect(retained.type === 'artwork' && retained.properties.assetId).toBe('phoenix-art');
    state.undo(); expect(state.document()).toEqual(original);
  });

  it('protects locked layers and busy or non-design editors from ornament actions', () => {
    const fixture = TestBed.createComponent(ElementLibraryComponent);
    const state = TestBed.inject(CardEditorStateService);
    const component = fixture.componentInstance;
    state.addElement('ornate-frame');
    state.toggleLocked(state.selectedElement()!.id);
    const original = structuredClone(state.document());
    component.requestLayout(); component.createLayout();
    expect(component.pendingLayout()).toBeFalse(); expect(state.document()).toEqual(original);
    const palette = spyOn(state, 'applyOrnamentTheme'); const layout = spyOn(state, 'applyOrnamentLayout');
    state.busy.set(true); component.chooseTheme('frost'); component.applyPalette(); component.requestLayout();
    expect(component.selectedTheme()).toBe('ember'); expect(palette).not.toHaveBeenCalled(); expect(layout).not.toHaveBeenCalled();
    state.busy.set(false); state.setMode('preview'); component.applyPalette(); component.requestLayout();
    expect(palette).not.toHaveBeenCalled(); expect(layout).not.toHaveBeenCalled();
  });

  function upload(file: File): Event {
    const input = document.createElement('input'); input.type = 'file';
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
    return { target: input } as unknown as Event;
  }
});
