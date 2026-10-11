import { Component, ViewChild, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { CardEditorComponent } from '../card-editor/card-editor.component';

@Component({
  selector: 'app-card-edit',
  standalone: true,
  imports: [CardEditorComponent],
  template: '<app-card-editor mode="edit" [cardId]="cardId()" />'
})
export class CardEditComponent {
  @ViewChild(CardEditorComponent) private editor?: CardEditorComponent;
  private readonly route = inject(ActivatedRoute);
  readonly cardId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id')
  });
  canLeave(): boolean { return this.editor?.canLeave() ?? true; }
}
