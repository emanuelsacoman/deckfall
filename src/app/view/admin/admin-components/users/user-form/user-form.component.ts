import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject, signal } from '@angular/core';
import {
  AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  USER_LIMITS, USER_ROLES, USER_ROLE_LABELS, UserProfile, UserProfileInput, UserRole, userProfileRole
} from '../../../../../model/interfaces/Users/user-profile';
import { UserService } from '../../../../../model/services/cruds/users/user.service';

const trimmedLength = (limit: number): ValidatorFn => control =>
  typeof control.value === 'string' && control.value.trim().length <= limit ? null : { maxlength: true };

const validContactEmail: ValidatorFn = control => {
  const email = typeof control.value === 'string' ? control.value.trim() : '';
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : { email: true };
};

const validRole: ValidatorFn = control =>
  USER_ROLES.some(role => role === control.value) ? null : { role: true };

const validUid: ValidatorFn = control =>
  typeof control.value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(control.value.trim()) ? null : { uid: true };

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.css'
})
export class UserFormComponent implements OnChanges, OnDestroy {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() uid: string | null = null;
  @Output() readonly profileLoaded = new EventEmitter<UserProfile | null>();
  private readonly service = inject(UserService);
  private readonly router = inject(Router);
  private version = 0;
  private destroyed = false;

  readonly roles = USER_ROLES;
  readonly roleLabels = USER_ROLE_LABELS;
  readonly limits = USER_LIMITS;
  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly successMessage = signal('');
  readonly failedUid = signal<string | null>(null);
  readonly form = new FormGroup({
    uid: new FormControl('', { nonNullable: true, validators: [validUid] }),
    displayName: new FormControl('', { nonNullable: true, validators: [trimmedLength(USER_LIMITS.displayName)] }),
    contactEmail: new FormControl('', { nonNullable: true, validators: [trimmedLength(USER_LIMITS.contactEmail), validContactEmail] }),
    role: new FormControl<UserRole | null>('member', { validators: [Validators.required, validRole] })
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] || changes['uid']) void this.loadProfile();
  }

  async loadProfile(): Promise<void> {
    const version = ++this.version;
    this.profile.set(null);
    this.profileLoaded.emit(null);
    this.loadError.set('');
    this.saveError.set('');
    this.successMessage.set('');
    this.failedUid.set(null);
    if (this.mode === 'create') {
      this.resetForm();
      this.loading.set(false);
      return;
    }
    if (!this.uid) {
      this.loading.set(false);
      this.loadError.set('O endereço não contém o UID do usuário.');
      return;
    }
    this.loading.set(true);
    try {
      const profile = await this.service.getByUid(this.uid);
      if (!this.isCurrent(version)) return;
      if (!profile) {
        this.loadError.set('Perfil não encontrado. Confira o UID ou vincule a conta existente.');
        return;
      }
      this.profile.set(profile);
      this.profileLoaded.emit(profile);
      this.resetForm(profile);
    } catch (error: unknown) {
      if (this.isCurrent(version)) this.loadError.set(this.errorMessage(error, 'Não foi possível carregar o perfil.'));
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  inconsistentRole(): boolean {
    const profile = this.profile();
    return !!profile && userProfileRole(profile) === null;
  }

  invalid(control: AbstractControl): boolean {
    return control.invalid && (control.dirty || control.touched);
  }

  createdAt(profile: UserProfile): Date | null {
    return profile.createdAt?.toDate() ?? null;
  }

  updatedAt(profile: UserProfile): Date | null {
    return profile.updatedAt?.toDate() ?? null;
  }

  async save(): Promise<void> {
    if (this.loading() || this.saving() || this.loadError() || this.successMessage()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const original = this.profile();
    if (this.mode === 'edit' && !original) return;
    const value = this.form.getRawValue();
    const uid = original?.uid ?? value.uid.trim();
    const input: UserProfileInput = {
      displayName: value.displayName.trim(), contactEmail: value.contactEmail.trim(), role: value.role!
    };
    this.saveError.set('');
    this.failedUid.set(null);
    const originalRole = original ? userProfileRole(original) : null;
    if ((!original && input.role === 'admin') || (original && originalRole !== input.role)) {
      const action = input.role === 'admin' ? 'Conceder acesso administrativo' : 'Definir o papel de membro e remover qualquer acesso administrativo';
      const name = input.displayName || input.contactEmail || uid;
      if (!window.confirm(`${action} para ${name} (UID: ${uid})?`)) return;
    }
    const version = this.version;
    this.saving.set(true);
    try {
      if (original) await this.service.update(uid, input, original);
      else await this.service.create(uid, input);
      if (!this.isCurrent(version)) return;
      const message = original ? 'Perfil atualizado com sucesso.' : 'Perfil vinculado com sucesso.';
      this.successMessage.set(message);
      await this.router.navigate(['/admin/usuarios/lista'], { state: { userFeedback: message } });
    } catch (error: unknown) {
      if (!this.isCurrent(version)) return;
      if (this.successMessage()) {
        this.saveError.set('O perfil foi salvo. Use o link para voltar à lista.');
      } else {
        this.saveError.set(this.errorMessage(error, 'Não foi possível salvar o perfil.'));
        if (!original) this.failedUid.set(uid);
      }
    } finally {
      if (!this.destroyed) this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.version;
  }

  private resetForm(profile?: UserProfile): void {
    this.form.reset({
      uid: profile?.uid ?? '', displayName: profile?.displayName ?? '', contactEmail: profile?.contactEmail ?? '',
      role: profile ? userProfileRole(profile) : 'member'
    });
  }

  private isCurrent(version: number): boolean {
    return !this.destroyed && this.version === version;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
