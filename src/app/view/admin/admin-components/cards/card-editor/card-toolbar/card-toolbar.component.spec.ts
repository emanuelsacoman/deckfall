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

  function select(value: string): Event {
    const element = document.createElement('input'); element.value = value;
    return { target: element } as unknown as Event;
  }
});
