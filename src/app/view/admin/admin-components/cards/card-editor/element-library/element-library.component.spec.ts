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

  function upload(file: File): Event {
    const input = document.createElement('input'); input.type = 'file';
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
    return { target: input } as unknown as Event;
  }
});
