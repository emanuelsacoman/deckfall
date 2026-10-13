import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { UserFormComponent } from '../user-form/user-form.component';
import { UserCollectionComponent } from '../user-collection/user-collection.component';
import { UserProfile } from '../../../../../model/interfaces/Users/user-profile';

@Component({
  selector: 'app-user-edit',
  standalone: true,
  imports: [UserFormComponent, UserCollectionComponent],
  template: `<app-user-form mode="edit" [uid]="uid()" (profileLoaded)="loadedProfile.set($event)" />
    @if (foundProfile(); as profile) { <app-user-collection [uid]="profile.uid" /> }`
})
export class UserEditComponent {
  private readonly route = inject(ActivatedRoute);
  readonly uid = toSignal(this.route.paramMap.pipe(map(params => params.get('uid'))), {
    initialValue: this.route.snapshot.paramMap.get('uid')
  });
  readonly loadedProfile = signal<UserProfile | null>(null);
  readonly foundProfile = computed(() => this.loadedProfile()?.uid === this.uid() ? this.loadedProfile() : null);
}
