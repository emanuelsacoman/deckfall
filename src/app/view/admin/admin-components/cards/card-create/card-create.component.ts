import { Component } from '@angular/core';
import { CardFormComponent } from '../card-form/card-form.component';

@Component({
  selector: 'app-card-create',
  standalone: true,
  imports: [CardFormComponent],
  template: '<app-card-form mode="create" />'
})
export class CardCreateComponent {}
