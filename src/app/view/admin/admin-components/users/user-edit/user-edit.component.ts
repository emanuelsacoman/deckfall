import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { UserFormComponent } from '../user-form/user-form.component';

@Component({
  selector: 'app-user-edit',
  standalone: true,
  imports: [UserFormComponent],
  template: '<app-user-form mode="edit" [uid]="uid()" />'
})
export class UserEditComponent {
  private readonly route = inject(ActivatedRoute);
  readonly uid = toSignal(this.route.paramMap.pipe(map(params => params.get('uid'))), {
    initialValue: this.route.snapshot.paramMap.get('uid')
  });
}
