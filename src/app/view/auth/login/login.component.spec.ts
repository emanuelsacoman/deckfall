import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthSession } from '../../../model/interfaces/Auth/auth-session';
import { AuthService } from '../../../model/services/fire/auth.service';
import { LoginComponent } from './login.component';

describe('Login and registration', () => {
  const currentUser = signal<AuthSession | null | undefined>(null);
  const isAdmin = signal(false);
  const sessionError = signal<string | null>(null);
  let login: jasmine.Spy;
  let register: jasmine.Spy;
  let google: jasmine.Spy;

  beforeEach(async () => {
    currentUser.set(null); isAdmin.set(false); sessionError.set(null);
    login = jasmine.createSpy('login').and.resolveTo();
    register = jasmine.createSpy('register').and.resolveTo();
    google = jasmine.createSpy('google').and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: {
        currentUser, isAdmin, sessionError, login, register,
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
    expect(login).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
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

  it('shows a member identity and explains that signup does not grant admin', () => {
    currentUser.set({ uid: 'member-uid', email: 'member@example.test', displayName: null, role: 'member', roleId: 'member' });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('member-uid');
    expect(page.textContent).toContain('Permissão administrativa pendente');
    expect(page.querySelector('a[href="/admin/dashboard"]')).toBeNull();
    expect(page.querySelector('form')).toBeNull();
  });
});
