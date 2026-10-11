import { Component, ViewChild } from '@angular/core';
import { CardEditorComponent } from '../card-editor/card-editor.component';

@Component({
  selector: 'app-card-create',
  standalone: true,
  imports: [CardEditorComponent],
  template: '<app-card-editor mode="create" />'
})
export class CardCreateComponent {
  @ViewChild(CardEditorComponent) private editor?: CardEditorComponent;
  canLeave(): boolean { return this.editor?.canLeave() ?? true; }
}
