import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthSession } from '../../../model/interfaces/Auth/auth-session';
import { AuthService } from '../../../model/services/fire/auth.service';
import { LoginComponent } from './login.component';

describe('Login, registration and account access methods', () => {
  const currentUser = signal<AuthSession | null | undefined>(null);
  const isAdmin = signal(false);
  const sessionError = signal<string | null>(null);
  const redirecting = signal(false);
  const googleLinked = signal(false);
  const passwordLinked = signal(false);
  const completedSignInRedirect = signal(false);
  let returnUrl: string | null;
  let login: jasmine.Spy;
  let register: jasmine.Spy;
  let google: jasmine.Spy;
  let addPassword: jasmine.Spy;
  let sendPasswordReset: jasmine.Spy;

  beforeEach(async () => {
    currentUser.set(null); isAdmin.set(false); sessionError.set(null);
    redirecting.set(false); googleLinked.set(false); passwordLinked.set(false);
    completedSignInRedirect.set(false); returnUrl = null;
    login = jasmine.createSpy('login').and.resolveTo();
    register = jasmine.createSpy('register').and.resolveTo();
    google = jasmine.createSpy('google').and.resolveTo();
    addPassword = jasmine.createSpy('addPassword').and.resolveTo();
    sendPasswordReset = jasmine.createSpy('sendPasswordReset').and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: {
        snapshot: { get queryParamMap() { return convertToParamMap(returnUrl === null ? {} : { returnUrl }); } }
      } }, { provide: AuthService, useValue: {
        currentUser, isAdmin, sessionError, login, register, addPassword, sendPasswordReset,
        redirecting, googleError: signal(null), googleLinked, passwordLinked,
        completedSignInRedirect, clearSignInRedirect: () => completedSignInRedirect.set(false),
        loginWithGoogle: google, logout: jasmine.createSpy('logout').and.resolveTo()
      } }]
    }).compileComponents();
  });

  it('offers email login, registration and Google without Firebase calls during rendering', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('form')).not.toBeNull();
    expect(page.querySelector('input[type="email"]')).not.toBeNull();
    expect(page.querySelector('input[type="password"]')).not.toBeNull();
    expect(page.textContent).toContain('Registrar');
    expect(page.textContent).toContain('Continuar com Google');
    expect(page.textContent).toContain('Esqueci minha senha');
    expect(login).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(addPassword).not.toHaveBeenCalled();
  });

  it('validates the registration password before submitting', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.changeMode('register');
    component.form.patchValue({ email: 'name@example.test', password: '12345' });
    await component.submit();
    expect(register).not.toHaveBeenCalled();
    component.form.patchValue({ displayName: 'Name', password: '123456' });
    await component.submit();
    expect(register).toHaveBeenCalledWith('name@example.test', '123456', 'Name');
  });

  it('Google does not require a valid email/password form', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    expect(component.form.invalid).toBeTrue();
    await component.google();
    expect(google).toHaveBeenCalled();
  });

  it('shows a member identity and access to the player area without requiring admin', () => {
    currentUser.set({ uid: 'member-uid', email: 'member@example.test', displayName: null, role: 'member', roleId: 'member' });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('member-uid');
    expect(page.textContent).not.toContain('Permissão administrativa pendente');
    expect(page.textContent).not.toContain('Perfil indisponível');
    expect(page.querySelector('a[href="/game"]')).not.toBeNull();
    expect(page.textContent).toContain('Vincular Google a esta conta');
    expect(page.querySelector('a[href="/admin/dashboard"]')).toBeNull();
    expect(page.querySelector('form')).toBeNull();
  });

  it('switches to password recovery while keeping email and clearing password requirements', () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.form.patchValue({ email: 'member@example.test', password: 'do-not-retain' });
    component.changeMode('reset');
    expect(component.mode()).toBe('reset');
    expect(component.form.controls.email.value).toBe('member@example.test');
    expect(component.form.controls.password.value).toBe('');
    expect(component.form.controls.password.valid).toBeTrue();
    expect(component.form.valid).toBeTrue();
    component.changeMode('login');
    expect(component.form.controls.password.invalid).toBeTrue();
  });

  it('renders recovery with email and return controls without asking for a password', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.changeMode('reset');
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('input[type="email"]')).not.toBeNull();
    expect(page.querySelector('input[type="password"]')).toBeNull();
    expect(page.textContent).toContain('Enviar link de recuperação');
    expect(page.textContent).toContain('Voltar para entrar');
    expect(page.textContent).not.toContain('Continuar com Google');
  });

  it('requests recovery with email only without attempting authentication', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.changeMode('reset');
    component.form.controls.email.setValue('member@example.test');
    await component.submit();
    expect(sendPasswordReset).toHaveBeenCalledOnceWith('member@example.test');
    expect(login).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(google).not.toHaveBeenCalled();
    expect(addPassword).not.toHaveBeenCalled();
    expect(component.error()).toBeNull();
    expect(component.submitting()).toBeFalse();
    expect(component.message()).toContain('Se houver uma conta');
  });

  it('requires a valid email for password recovery', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.changeMode('reset');
    await component.submit();
    component.form.controls.email.setValue('invalid-address');
    await component.submit();
    expect(component.form.controls.email.touched).toBeTrue();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('does not block recovery with a stale invalid registration name', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.changeMode('register');
    component.form.patchValue({ email: 'member@example.test', displayName: 'x'.repeat(121) });
    expect(component.form.controls.displayName.invalid).toBeTrue();
    component.changeMode('reset');
    await component.submit();
    expect(sendPasswordReset).toHaveBeenCalledOnceWith('member@example.test');
  });

  it('reports a recovery failure without switching to another authentication operation', async () => {
    sendPasswordReset.and.rejectWith(new Error('Confira sua conexão.'));
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.changeMode('reset');
    component.form.controls.email.setValue('member@example.test');
    await component.submit();
    expect(component.error()).toBe('Confira sua conexão.');
    expect(component.message()).toBeNull();
    expect(component.submitting()).toBeFalse();
    expect(login).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('blocks duplicate recovery requests and mode changes while recovery is pending', async () => {
    let complete!: () => void;
    sendPasswordReset.and.returnValue(new Promise<void>(resolve => { complete = resolve; }));
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.changeMode('reset');
    component.form.controls.email.setValue('member@example.test');
    const pending = component.submit();
    expect(component.submitting()).toBeTrue();
    await component.submit();
    await component.google();
    component.changeMode('register');
    expect(component.mode()).toBe('reset');
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();
    complete();
    await pending;
    expect(component.submitting()).toBeFalse();
  });

  it('shows Google access and lets a Google-only member add a password to the same account', () => {
    currentUser.set({ uid: 'google-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com'], role: 'member', roleId: 'member' });
    googleLinked.set(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const providers = page.querySelectorAll('.provider-list li');
    expect(providers.length).toBe(2);
    expect(providers[0].classList.contains('linked')).toBeTrue();
    expect(providers[1].classList.contains('linked')).toBeFalse();
    expect(page.textContent).toContain('member@example.test');
    expect(page.textContent).toContain('google-uid');
    expect(page.textContent).toContain('mesmo UID e perfil');
    expect(page.querySelector('#new-password')).not.toBeNull();
    expect(page.querySelector('#confirm-password')).not.toBeNull();
    expect(page.querySelector('a[href="/admin/dashboard"]')).toBeNull();
  });

  it('shows both linked providers and recovery without displaying the add-password form', () => {
    currentUser.set({ uid: 'linked-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com', 'password'], role: 'member', roleId: 'member' });
    googleLinked.set(true); passwordLinked.set(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('.provider-list li.linked').length).toBe(2);
    expect(page.textContent).toContain('Redefinir minha senha por e-mail');
    expect(page.querySelector('#new-password')).toBeNull();
  });

  it('validates both new password length and confirmation before adding email access', async () => {
    currentUser.set({ uid: 'google-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com'], role: 'member', roleId: 'member' });
    googleLinked.set(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.passwordForm.setValue({ password: 'short', confirmation: 'short' });
    await component.addPassword();
    component.passwordForm.setValue({ password: 'new-password', confirmation: 'different-password' });
    await component.addPassword();
    expect(component.passwordForm.invalid).toBeTrue();
    expect(addPassword).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('clears both password fields before waiting for an account-link operation', async () => {
    currentUser.set({ uid: 'google-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com'], role: 'member', roleId: 'member' });
    googleLinked.set(true);
    let complete!: () => void;
    addPassword.and.returnValue(new Promise<void>(resolve => { complete = resolve; }));
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.passwordForm.setValue({ password: 'new-password', confirmation: 'new-password' });
    const pending = component.addPassword();
    expect(addPassword).toHaveBeenCalledOnceWith('new-password');
    expect(component.passwordForm.getRawValue()).toEqual({ password: '', confirmation: '' });
    expect(component.submitting()).toBeTrue();
    await component.addPassword();
    expect(addPassword).toHaveBeenCalledTimes(1);
    passwordLinked.set(true);
    complete();
    await pending;
    expect(component.submitting()).toBeFalse();
    expect(component.error()).toBeNull();
    expect(component.message()).toContain('dois métodos na mesma conta');
    expect(currentUser()?.uid).toBe('google-uid');
    expect(register).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('clears passwords on a failed link and keeps the current account identity', async () => {
    currentUser.set({ uid: 'google-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com'], role: 'member', roleId: 'member' });
    googleLinked.set(true);
    addPassword.and.rejectWith(new Error('Este método já pertence a outra conta.'));
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.passwordForm.setValue({ password: 'new-password', confirmation: 'new-password' });
    await component.addPassword();
    expect(component.error()).toBe('Este método já pertence a outra conta.');
    expect(component.passwordForm.getRawValue()).toEqual({ password: '', confirmation: '' });
    expect(currentUser()?.uid).toBe('google-uid');
    expect(passwordLinked()).toBeFalse();
    expect(component.message()).toBeNull();
  });

  it('clears typed passwords when an external session changes account or signs out', () => {
    currentUser.set({ uid: 'google-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com'], role: 'member', roleId: 'member' });
    googleLinked.set(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.passwordForm.setValue({ password: 'first-password', confirmation: 'first-password' });
    component.form.controls.password.setValue('first-login-password');

    currentUser.set({ uid: 'different-uid', email: 'another@example.test', displayName: null, providerIds: ['google.com'], role: 'member', roleId: 'member' });
    fixture.detectChanges();
    expect(component.passwordForm.getRawValue()).toEqual({ password: '', confirmation: '' });
    expect(component.form.controls.password.value).toBe('');

    component.passwordForm.setValue({ password: 'second-password', confirmation: 'second-password' });
    component.form.controls.password.setValue('second-login-password');
    currentUser.set(null);
    fixture.detectChanges();
    expect(component.passwordForm.getRawValue()).toEqual({ password: '', confirmation: '' });
    expect(component.form.controls.password.value).toBe('');
    expect(addPassword).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('clears passwords and does not report completed linking when Google redirects', async () => {
    currentUser.set({ uid: 'google-uid', email: 'member@example.test', displayName: null, providerIds: ['google.com'], role: 'admin', roleId: 'admin' });
    googleLinked.set(true); isAdmin.set(true);
    addPassword.and.callFake(async () => { redirecting.set(true); });
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.passwordForm.setValue({ password: 'new-password', confirmation: 'new-password' });
    await component.addPassword();
    expect(component.passwordForm.getRawValue()).toEqual({ password: '', confirmation: '' });
    expect(component.message()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses the signed account email for recovery without navigating or changing identity', async () => {
    currentUser.set({ uid: 'admin-uid', email: 'admin@example.test', displayName: null, providerIds: ['password'], role: 'admin', roleId: 'admin' });
    isAdmin.set(true); passwordLinked.set(true);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    await component.resetPassword();
    expect(sendPasswordReset).toHaveBeenCalledOnceWith('admin@example.test');
    expect(currentUser()?.uid).toBe('admin-uid');
    expect(currentUser()?.role).toBe('admin');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps an already signed admin on account management after Google linking', async () => {
    currentUser.set({ uid: 'admin-uid', email: 'admin@example.test', displayName: null, providerIds: ['password'], role: 'admin', roleId: 'admin' });
    isAdmin.set(true); passwordLinked.set(true);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    await component.google();
    expect(google).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still opens the admin dashboard after an unsigned user signs in as admin', async () => {
    login.and.callFake(async () => {
      currentUser.set({ uid: 'admin-uid', email: 'admin@example.test', displayName: null, providerIds: ['password'], role: 'admin', roleId: 'admin' });
      isAdmin.set(true); passwordLinked.set(true);
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.form.patchValue({ email: 'admin@example.test', password: 'password' });
    await component.submit();
    expect(navigate).toHaveBeenCalledOnceWith('/admin/dashboard');
  });

  it('opens the player home after member login or registration without returnUrl', async () => {
    const member: AuthSession = { uid: 'member', email: 'member@example.test', displayName: null, role: 'member', roleId: 'member' };
    login.and.callFake(async () => { currentUser.set(member); });
    register.and.callFake(async () => { currentUser.set(member); });
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.form.patchValue({ email: 'member@example.test', password: 'password' });
    await component.submit();
    expect(navigate).toHaveBeenCalledWith('/game/home');
    currentUser.set(null); navigate.calls.reset();
    component.changeMode('register');
    component.form.controls.password.setValue('password');
    await component.submit();
    expect(navigate).toHaveBeenCalledOnceWith('/game/home');
  });

  it('prioritizes a player returnUrl for either member or admin sign-in', async () => {
    returnUrl = '/game/colecao?rarity=rare#cards';
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    for (const role of ['member', 'admin']) {
      currentUser.set(null); navigate.calls.reset();
      login.and.callFake(async () => { currentUser.set({ uid: role, email: null, displayName: null, role, roleId: role }); isAdmin.set(role === 'admin'); });
      component.form.patchValue({ email: 'member@example.test', password: 'password' });
      await component.submit();
      expect(navigate).toHaveBeenCalledOnceWith(returnUrl);
    }
  });

  it('honors an admin returnUrl only for an administrator', async () => {
    returnUrl = '/admin/cartas/lista';
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    for (const role of ['member', 'admin']) {
      currentUser.set(null); navigate.calls.reset();
      login.and.callFake(async () => { currentUser.set({ uid: role, email: null, displayName: null, role, roleId: role }); isAdmin.set(role === 'admin'); });
      component.form.patchValue({ email: 'member@example.test', password: 'password' });
      await component.submit();
      expect(navigate).toHaveBeenCalledOnceWith(role === 'admin' ? returnUrl : '/game/home');
    }
  });

  it('ignores external URLs, unknown routes, auxiliary outlets and traversal in returnUrl', async () => {
    login.and.callFake(async () => { currentUser.set({ uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' }); });
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    for (const value of ['https://example.test/game', '//example.test/game', '/login', '/game/decks/criar', '/game/unknown', '/game\\evil', '/game/../admin', '/game/%2Fadmin', '/game/(home//other:admin)']) {
      currentUser.set(null); navigate.calls.reset(); returnUrl = value;
      component.form.patchValue({ email: 'member@example.test', password: 'password' });
      await component.submit();
      expect(navigate).toHaveBeenCalledOnceWith('/game/home');
    }
  });

  it('denies post-login access and access links when the profile is invalid', async () => {
    login.and.callFake(async () => { currentUser.set({ uid: 'member', email: null, displayName: null, role: 'admin', roleId: 'member' }); });
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.form.patchValue({ email: 'member@example.test', password: 'password' });
    await fixture.componentInstance.submit(); fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Perfil indisponível');
    expect(page.querySelector('a[href="/game"]')).toBeNull();
    expect(page.querySelector('a[href="/admin/dashboard"]')).toBeNull();
  });

  it('opens the requested player page after a recovered Google sign-in redirect', () => {
    returnUrl = '/game/decks';
    currentUser.set({ uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' });
    completedSignInRedirect.set(true);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledOnceWith('/game/decks');
    expect(completedSignInRedirect()).toBeFalse();
  });

  it('keeps ordinary account management open without a recovered sign-in', () => {
    currentUser.set({ uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' });
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
  });
});
