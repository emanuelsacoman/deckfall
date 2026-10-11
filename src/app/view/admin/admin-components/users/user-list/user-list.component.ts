import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { USER_ROLE_LABELS, UserProfile, userProfileRole } from '../../../../../model/interfaces/Users/user-profile';
import { UserService } from '../../../../../model/services/cruds/users/user.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.css'
})
export class UserListComponent implements OnInit, OnDestroy {
  private readonly service = inject(UserService);
  private readonly router = inject(Router);
  private version = 0;
  private destroyed = false;
  readonly users = signal<UserProfile[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly feedback = signal('');

  ngOnInit(): void {
    const state: unknown = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    if (state && typeof state === 'object' && 'userFeedback' in state && typeof state.userFeedback === 'string') {
      this.feedback.set(state.userFeedback);
    }
    void this.load();
  }

  async load(): Promise<void> {
    const version = ++this.version;
    this.loading.set(true);
    this.error.set('');
    this.users.set([]);
    try {
      const users = await this.service.list();
      if (this.isCurrent(version)) this.users.set(users);
    } catch (error: unknown) {
      if (this.isCurrent(version)) this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar os perfis.');
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  roleLabel(profile: UserProfile): string {
    const role = userProfileRole(profile);
    return role ? USER_ROLE_LABELS[role] : 'Papel inconsistente';
  }

  updatedAt(profile: UserProfile): Date | null {
    return profile.updatedAt?.toDate() ?? null;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.version;
  }

  private isCurrent(version: number): boolean {
    return !this.destroyed && this.version === version;
  }
}
