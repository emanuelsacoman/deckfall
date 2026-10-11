import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../model/services/fire/auth.service';

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
  readonly mode = signal<'login' | 'register'>('login');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', Validators.maxLength(120)],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  changeMode(mode: 'login' | 'register'): void {
    if (this.submitting()) return;
    this.mode.set(mode);
    this.error.set(null);
    this.form.controls.password.reset();
    this.form.controls.password.setValidators(mode === 'register'
      ? [Validators.required, Validators.minLength(6)] : Validators.required);
    this.form.controls.password.updateValueAndValidity();
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.submitting() || this.form.invalid) return;
    const { email, password, displayName } = this.form.getRawValue();
    await this.authenticate(() => this.mode() === 'register'
      ? this.auth.register(email, password, displayName) : this.auth.login(email, password));
  }

  async google(): Promise<void> {
    await this.authenticate(() => this.auth.loginWithGoogle());
  }

  async logout(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.logout();
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível sair.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async authenticate(action: () => Promise<void>): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await action();
      this.form.controls.password.reset();
      if (this.auth.isAdmin()) {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        await this.router.navigateByUrl(returnUrl?.startsWith('/admin/') ? returnUrl : '/admin/dashboard');
      }
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível autenticar.');
    } finally {
      this.submitting.set(false);
    }
  }
}
