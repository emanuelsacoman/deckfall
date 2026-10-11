import { Component } from '@angular/core';
import { UserFormComponent } from '../user-form/user-form.component';

@Component({
  selector: 'app-user-create',
  standalone: true,
  imports: [UserFormComponent],
  template: '<app-user-form mode="create" />'
})
export class UserCreateComponent {}
