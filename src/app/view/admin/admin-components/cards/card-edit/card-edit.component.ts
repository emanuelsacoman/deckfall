import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { CardFormComponent } from '../card-form/card-form.component';

@Component({
  selector: 'app-card-edit',
  standalone: true,
  imports: [CardFormComponent],
  template: '<app-card-form mode="edit" [cardId]="cardId()" />'
})
export class CardEditComponent {
  private readonly route = inject(ActivatedRoute);
  readonly cardId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id')
  });
}
