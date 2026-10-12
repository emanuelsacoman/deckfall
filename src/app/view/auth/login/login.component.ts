import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../model/services/fire/auth.service';
import { AuthSession, isAdminSession, isAuthenticatedSession } from '../../../model/interfaces/Auth/auth-session';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly mode = signal<'login' | 'register' | 'reset'>('login');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly hasValidProfile = computed(() => isAuthenticatedSession(this.auth.currentUser()));
  readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', Validators.maxLength(120)],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });
  readonly passwordForm = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmation: ['', Validators.required]
  }, { validators: matchingPasswords });

  constructor() {
    let accountUid = this.auth.currentUser()?.uid ?? null;
    effect(() => {
      const uid = this.auth.currentUser()?.uid ?? null;
      if (uid !== accountUid) {
        accountUid = uid;
        this.passwordForm.reset();
        this.form.controls.password.reset();
      }
    }, { allowSignalWrites: true });
    effect(() => {
      if (this.auth.completedSignInRedirect() && !this.submitting()) {
        this.auth.clearSignInRedirect();
        void this.navigateAfterSignIn();
      }
    }, { allowSignalWrites: true });
  }

  changeMode(mode: 'login' | 'register' | 'reset'): void {
    if (this.submitting()) return;
    this.mode.set(mode);
    this.error.set(null);
    this.message.set(null);
    this.form.controls.password.reset();
    this.form.controls.password.setValidators(mode === 'reset' ? [] : mode === 'register'
      ? [Validators.required, Validators.minLength(6)] : Validators.required);
    this.form.controls.password.updateValueAndValidity();
    this.form.controls.displayName.setValidators(mode === 'register' ? Validators.maxLength(120) : []);
    this.form.controls.displayName.updateValueAndValidity();
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.submitting() || this.form.invalid) return;
    const { email, password, displayName } = this.form.getRawValue();
    if (this.mode() === 'reset') {
      await this.resetPassword(email);
      return;
    }
    await this.authenticate(() => this.mode() === 'register'
      ? this.auth.register(email, password, displayName) : this.auth.login(email, password));
  }

  async google(): Promise<void> {
    await this.authenticate(() => this.auth.loginWithGoogle(), !this.auth.currentUser());
  }

  async addPassword(): Promise<void> {
    this.passwordForm.markAllAsTouched();
    if (this.submitting() || this.passwordForm.invalid) return;
    const password = this.passwordForm.controls.password.value;
    // Clear the fields before OAuth navigation; passwords never survive a redirect.
    this.passwordForm.reset();
    await this.authenticate(() => this.auth.addPassword(password), false);
    if (!this.error() && !this.auth.redirecting() && this.auth.passwordLinked()) {
      this.message.set('Acesso com e-mail e senha adicionado. Você pode entrar com os dois métodos na mesma conta.');
    }
  }

  async resetPassword(email = this.auth.currentUser()?.email ?? ''): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null); this.message.set(null);
    try {
      await this.auth.sendPasswordReset(email);
      this.message.set('Se houver uma conta para esse e-mail, você receberá um link para redefinir a senha. Confira também a pasta de spam.');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível solicitar a recuperação de senha.');
    } finally {
      this.submitting.set(false);
    }
  }

  async logout(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    this.message.set(null);
    this.passwordForm.reset();
    this.form.controls.password.reset();
    try {
      await this.auth.logout();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível sair.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async authenticate(action: () => Promise<void>, navigateAfterSignIn = true): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await action();
      this.form.controls.password.reset();
      if (navigateAfterSignIn && !this.auth.redirecting()) await this.navigateAfterSignIn();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível autenticar.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async navigateAfterSignIn(): Promise<void> {
    const user = this.auth.currentUser();
    if (!isAuthenticatedSession(user)) return;
    const returnUrl = this.validReturnUrl(user);
    await this.router.navigateByUrl(returnUrl ?? (isAdminSession(user) ? '/admin/dashboard' : '/game/home'));
  }

  private validReturnUrl(user: AuthSession): string | null {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//') || /[\\\u0000-\u0020]/.test(returnUrl)) return null;
    try {
      const tree = this.router.parseUrl(returnUrl);
      const primary = tree.root.children['primary'];
      if (!primary || Object.keys(tree.root.children).some(outlet => outlet !== 'primary') || Object.keys(primary.children).length) return null;
      const segments = primary.segments.map(segment => segment.path);
      if (segments.some(segment => segment === '.' || segment === '..' || /[\\/]/.test(segment))) return null;
      const path = segments.join('/').replace(/\/$/, '');
      const gamePath = /^game(?:\/(?:home|colecao|decks|jogar|perfil))?$/.test(path);
      const adminPath = /^admin(?:\/(?:dashboard|cartas(?:\/(?:lista|criar|editar\/[^/]+))?|usuarios(?:\/(?:lista|criar|editar\/[^/]+))?))?$/.test(path);
      return gamePath || (adminPath && isAdminSession(user)) ? returnUrl : null;
    } catch {
      return null;
    }
  }
}

function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmation')?.value
    ? null : { passwordMismatch: true };
}
