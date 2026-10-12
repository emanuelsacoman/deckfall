import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AuthIdentity, MemberProfileSeed, UserAccessProfile } from '../../interfaces/Auth/auth-session';
import { AUTH_SESSION_CLIENT, AuthService, AuthSessionClient } from './auth.service';
import { AuthenticatedGoogleError } from './google-auth-flow';

describe('AuthService session and member provisioning', () => {
  const alice: AuthIdentity = { uid: 'alice', email: 'alice@example.test', displayName: 'Alice' };
  const bob: AuthIdentity = { uid: 'bob', email: 'bob@example.test', displayName: null };
  const admin: UserAccessProfile = { role: 'admin', roleId: 'admin' };
  const member: UserAccessProfile = { role: 'member', roleId: 'member' };
  let authNext: (user: AuthIdentity | null) => void;
  let authError: () => void;
  let profiles: { uid: string; next: (profile: UserAccessProfile) => void; error: () => void; stop: jasmine.Spy }[];
  let client: jasmine.SpyObj<AuthSessionClient>;
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

  beforeEach(() => {
    profiles = [];
    client = jasmine.createSpyObj<AuthSessionClient>('client', [
      'observeAuth', 'observeProfile', 'ensureProfile', 'login', 'register', 'loginWithGoogle', 'addPassword', 'sendPasswordReset', 'redirectResult', 'logout'
    ]);
    client.observeAuth.and.callFake((next, error) => {
      authNext = next; authError = error;
      return jasmine.createSpy('stopAuth');
    });
    client.observeProfile.and.callFake((uid, next, error) => {
      const stop = jasmine.createSpy('stopProfile');
      profiles.push({ uid, next, error, stop });
      return stop;
    });
    client.ensureProfile.and.resolveTo();
    client.login.and.resolveTo(alice);
    client.register.and.resolveTo(alice);
    client.loginWithGoogle.and.resolveTo(alice);
    client.addPassword.and.resolveTo({ ...alice, providerIds: ['google.com', 'password'] });
    client.sendPasswordReset.and.resolveTo();
    client.redirectResult.and.resolveTo(null);
    client.logout.and.resolveTo();
    TestBed.configureTestingModule({ providers: [{ provide: AUTH_SESSION_CLIENT, useValue: client }] });
  });

  it('waits for provisioning before observing the profile', async () => {
    const service = TestBed.inject(AuthService);
    let finish!: () => void;
    client.ensureProfile.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    authNext(alice);
    expect(service.currentUser()).toBeUndefined();
    expect(profiles.length).toBe(0);
    finish();
    await flush();
    profiles[0].next(admin);
    expect(service.isAdmin()).toBeTrue();
  });

  it('email signup always provisions member and ignores duplicate request callbacks', async () => {
    const service = TestBed.inject(AuthService);
    authNext(null);
    const named = { ...alice, displayName: 'Ana' };
    client.register.and.resolveTo(named);
    const pending = service.register(' alice@example.test ', 'secret', ' Ana ');
    authNext(named);
    await flush();
    const seed: MemberProfileSeed = { displayName: 'Ana', contactEmail: alice.email!, role: 'member', roleId: 'member' };
    expect(client.register).toHaveBeenCalledWith('alice@example.test', 'secret', 'Ana');
    expect(client.ensureProfile).toHaveBeenCalledOnceWith(named, seed);
    profiles[0].next(member);
    await pending;
    expect(service.currentUser()?.uid).toBe('alice');
    expect(service.isAdmin()).toBeFalse();
    authNext(named);
    expect(client.ensureProfile).toHaveBeenCalledTimes(1);
  });

  it('rejects a short signup password before calling Firebase', async () => {
    const service = TestBed.inject(AuthService);
    await expectAsync(service.register('alice@example.test', '12345')).toBeRejectedWithError('A senha deve ter pelo menos 6 caracteres.');
    expect(client.register).not.toHaveBeenCalled();
  });

  it('Google sign-in uses the same member provisioning and keeps an existing admin profile', async () => {
    const service = TestBed.inject(AuthService);
    authNext(null);
    const pending = service.loginWithGoogle();
    await flush();
    expect(client.ensureProfile).toHaveBeenCalledWith(alice, {
      displayName: 'Alice', contactEmail: 'alice@example.test', role: 'member', roleId: 'member'
    });
    profiles[0].next(admin);
    await pending;
    expect(service.isAdmin()).toBeTrue();
  });

  it('requires both admin fields and tracks revocation', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush();
    profiles[0].next({ role: 'admin', roleId: 'member' });
    expect(service.isAdmin()).toBeFalse();
    profiles[0].next(admin);
    expect(service.isAdmin()).toBeTrue();
    profiles[0].next(member);
    expect(service.isAdmin()).toBeFalse();
  });

  it('does not resolve a new loading session with an older profile', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    authNext(bob);
    let resolved = false;
    const pending = service.waitForSession().then(value => { resolved = true; return value; });
    await flush();
    expect(resolved).toBeFalse();
    profiles[0].next(admin);
    expect(resolved).toBeFalse();
    profiles[1].next(member);
    expect((await pending)?.uid).toBe('bob');
  });

  it('keeps only the identity and denies admin if provisioning fails', async () => {
    const service = TestBed.inject(AuthService);
    client.ensureProfile.and.rejectWith(new Error('permission-denied'));
    authNext(alice); await flush();
    expect(service.currentUser()?.uid).toBe('alice');
    expect(service.currentUser()?.role).toBeNull();
    expect(service.isAdmin()).toBeFalse();
    expect(profiles.length).toBe(0);
  });

  it('clears permission on a profile error and ignores its later callbacks', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    profiles[0].error(); profiles[0].next(admin);
    expect(service.isAdmin()).toBeFalse();
    expect(service.currentUser()?.role).toBeNull();
    expect(profiles[0].stop).toHaveBeenCalled();
  });

  it('drops late provisioning after logout', async () => {
    const service = TestBed.inject(AuthService);
    let finish!: () => void;
    client.ensureProfile.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    authNext(alice);
    await service.logout(); finish(); await flush();
    expect(service.currentUser()).toBeNull();
    expect(profiles.length).toBe(0);
  });

  it('does not restore sign-in completed after logout', async () => {
    const service = TestBed.inject(AuthService);
    let finish!: (user: AuthIdentity) => void;
    client.login.and.returnValue(new Promise<AuthIdentity>(resolve => { finish = resolve; }));
    const pending = service.login('alice@example.test', 'secret');
    await service.logout(); authNext(alice); finish(alice); await pending;
    expect(service.currentUser()).toBeNull();
    expect(client.ensureProfile).not.toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalledTimes(2);
  });

  it('denies access after the initial profile timeout', fakeAsync(() => {
    const service = TestBed.inject(AuthService);
    authNext(alice); tick(); tick(15_000);
    expect(service.isAdmin()).toBeFalse();
    profiles[0].next(admin);
    expect(service.isAdmin()).toBeFalse();
  }));

  it('clears the session on expiration and denies an Auth listener error', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    authNext(null); profiles[0].next(admin);
    expect(service.currentUser()).toBeNull();
    authError();
    expect(service.currentUser()).toBeNull();
    expect(service.isAdmin()).toBeFalse();
  });

  it('keeps access denied if signOut fails', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    client.logout.and.rejectWith(new Error('network'));
    await expectAsync(service.logout()).toBeRejected();
    authNext(alice); profiles[0].next(admin);
    expect(service.currentUser()).toBeNull();
    expect(service.isAdmin()).toBeFalse();
  });

  it('recovers a redirect identity without duplicating profile provisioning', async () => {
    client.redirectResult.and.resolveTo({ identity: { ...alice, providerIds: ['google.com'] }, operationType: 'signIn' });
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush();
    expect(client.ensureProfile).toHaveBeenCalledTimes(1);
    profiles[0].next(admin); await flush();
    expect(service.currentUser()?.uid).toBe('alice');
    expect(service.googleLinked()).toBeTrue();
    expect(service.isAdmin()).toBeTrue();
    expect(service.completedSignInRedirect()).toBeTrue();
    service.clearSignInRedirect();
    expect(service.completedSignInRedirect()).toBeFalse();
  });

  it('does not request post-login navigation for a recovered Google link', async () => {
    client.redirectResult.and.resolveTo({ identity: { ...alice, providerIds: ['google.com'] }, operationType: 'link' });
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(member); await flush();
    expect(service.completedSignInRedirect()).toBeFalse();
  });

  it('exposes profile contact and name without replacing the Authentication email', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush();
    profiles[0].next({ ...member, displayName: 'Nome do perfil', contactEmail: 'contact@example.test' });
    expect(service.currentUser()?.displayName).toBe('Nome do perfil');
    expect(service.currentUser()?.contactEmail).toBe('contact@example.test');
    expect(service.currentUser()?.email).toBe('alice@example.test');
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.sessionError()).toBeNull();
    authNext({ ...alice, displayName: 'Nome do Google', providerIds: ['google.com'] });
    expect(service.currentUser()?.displayName).toBe('Nome do perfil');
    expect(service.currentUser()?.contactEmail).toBe('contact@example.test');
  });

  it('supports the minimal bootstrap profile and denies player access for invalid roles', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.currentUser()?.displayName).toBe('Alice');
    expect(service.currentUser()?.contactEmail).toBeNull();
    profiles[0].next({ role: 'member', roleId: 'admin' });
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.sessionError()).toContain('papel válido');
    profiles[0].error();
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('retains the live admin session when Google linking is cancelled', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    client.loginWithGoogle.and.rejectWith({ code: 'auth/popup-closed-by-user' });
    await expectAsync(service.loginWithGoogle()).toBeRejectedWithError('O acesso com Google foi cancelado.');
    expect(service.currentUser()?.uid).toBe('alice'); expect(service.isAdmin()).toBeTrue();
    expect(profiles[0].stop).not.toHaveBeenCalled();
    profiles[0].next(member); expect(service.isAdmin()).toBeFalse();
  });

  it('updates linked provider information while preserving the existing UID and profile', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    client.loginWithGoogle.and.resolveTo({ ...alice, providerIds: ['password', 'google.com'] });
    await service.loginWithGoogle();
    expect(service.currentUser()?.uid).toBe('alice'); expect(service.googleLinked()).toBeTrue();
    expect(service.isAdmin()).toBeTrue(); expect(client.ensureProfile).toHaveBeenCalledTimes(1);
  });

  it('preserves a successfully authenticated password account when credential linking fails', async () => {
    const service = TestBed.inject(AuthService);
    authNext(null);
    client.login.and.rejectWith(new AuthenticatedGoogleError('auth/credential-already-in-use', alice));
    const pending = service.login('alice@example.test', 'secret');
    await flush(); profiles[0].next(member);
    await expectAsync(pending).toBeRejectedWithError(/outra conta/);
    expect(service.currentUser()?.uid).toBe('alice'); expect(service.isAdmin()).toBeFalse();
  });

  it('reports redirect errors separately from the observed permission state', async () => {
    client.redirectResult.and.rejectWith({ code: 'auth/account-exists-with-different-credential' });
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    expect(service.googleError()).toContain('outro método');
    expect(service.currentUser()?.uid).toBe('alice'); expect(service.isAdmin()).toBeTrue();
  });

  it('links a password while preserving the existing UID, admin role and profile listener', async () => {
    const service = TestBed.inject(AuthService);
    authNext({ ...alice, providerIds: ['google.com'] }); await flush(); profiles[0].next(admin);
    expect(service.passwordLinked()).toBeFalse();
    await service.addPassword('secret');
    expect(client.addPassword).toHaveBeenCalledOnceWith('secret');
    expect(service.currentUser()?.uid).toBe('alice'); expect(service.isAdmin()).toBeTrue();
    expect(service.passwordLinked()).toBeTrue(); expect(service.googleLinked()).toBeTrue();
    expect(client.ensureProfile).toHaveBeenCalledTimes(1); expect(profiles[0].stop).not.toHaveBeenCalled();
    profiles[0].next(member); expect(service.isAdmin()).toBeFalse();
  });

  it('retains the current session when adding a password fails or Google reauthentication is cancelled', async () => {
    const service = TestBed.inject(AuthService);
    authNext({ ...alice, providerIds: ['google.com'] }); await flush(); profiles[0].next(admin);
    for (const code of ['auth/popup-closed-by-user', 'auth/email-already-in-use', 'auth/credential-already-in-use', 'auth/requires-recent-login']) {
      client.addPassword.and.rejectWith({ code });
      await expectAsync(service.addPassword('secret')).toBeRejected();
      expect(service.currentUser()?.uid).toBe('alice'); expect(service.isAdmin()).toBeTrue();
      expect(service.passwordLinked()).toBeFalse();
    }
    expect(profiles[0].stop).not.toHaveBeenCalled();
  });

  it('marks redirecting during password reauthentication without claiming the password is linked', async () => {
    const service = TestBed.inject(AuthService);
    authNext({ ...alice, providerIds: ['google.com'] }); await flush(); profiles[0].next(member);
    client.addPassword.and.resolveTo(null);
    await service.addPassword('secret');
    expect(service.redirecting()).toBeTrue(); expect(service.passwordLinked()).toBeFalse();
    expect(service.currentUser()?.uid).toBe('alice'); expect(profiles[0].stop).not.toHaveBeenCalled();
  });

  it('reports project password policy failures while keeping the signed Google account', async () => {
    const service = TestBed.inject(AuthService);
    authNext({ ...alice, providerIds: ['google.com'] }); await flush(); profiles[0].next(member);
    for (const code of ['auth/weak-password', 'auth/password-does-not-meet-requirements']) {
      client.addPassword.and.rejectWith({ code });
      await expectAsync(service.addPassword('secret')).toBeRejectedWithError(/política de senhas/);
      expect(service.currentUser()?.uid).toBe('alice'); expect(service.passwordLinked()).toBeFalse();
    }
  });

  it('rejects a missing session and a short password before requesting credential linking', async () => {
    const service = TestBed.inject(AuthService);
    authNext(null);
    await expectAsync(service.addPassword('secret')).toBeRejectedWithError(/Entre com Google/);
    await expectAsync(service.addPassword('short')).toBeRejectedWithError('A senha deve ter pelo menos 6 caracteres.');
    expect(client.addPassword).not.toHaveBeenCalled();
  });

  it('sends password reset to the normalized email without changing the authenticated session', async () => {
    const service = TestBed.inject(AuthService);
    authNext(alice); await flush(); profiles[0].next(admin);
    const before = service.currentUser();
    await service.sendPasswordReset(' alice@example.test ');
    expect(client.sendPasswordReset).toHaveBeenCalledOnceWith('alice@example.test');
    expect(service.currentUser()).toBe(before); expect(service.isAdmin()).toBeTrue();
    expect(client.ensureProfile).toHaveBeenCalledTimes(1); expect(profiles[0].stop).not.toHaveBeenCalled();
  });

  it('returns the same reset outcome for an absent account without enumerating users', async () => {
    const service = TestBed.inject(AuthService);
    authNext(null);
    client.sendPasswordReset.and.rejectWith({ code: 'auth/user-not-found' });
    await expectAsync(service.sendPasswordReset('absent@example.test')).toBeResolved();
    expect(service.currentUser()).toBeNull(); expect(service.sessionError()).toBeNull();
    expect(client.ensureProfile).not.toHaveBeenCalled();
  });

  it('rejects invalid email syntax before requesting reset and reports actionable Firebase failures', async () => {
    const service = TestBed.inject(AuthService);
    authNext(null);
    for (const email of ['', 'invalid', 'alice@', 'alice @example.test']) {
      await expectAsync(service.sendPasswordReset(email)).toBeRejectedWithError('Informe um e-mail válido.');
    }
    expect(client.sendPasswordReset).not.toHaveBeenCalled();
    for (const [code, expected] of [
      ['auth/invalid-email', 'Informe um e-mail válido.'],
      ['auth/too-many-requests', 'Muitas tentativas. Aguarde um pouco e tente novamente.'],
      ['auth/network-request-failed', 'Não foi possível conectar. Confira sua conexão.']
    ]) {
      client.sendPasswordReset.and.rejectWith({ code });
      await expectAsync(service.sendPasswordReset('alice@example.test')).toBeRejectedWithError(expected);
    }
    expect(service.currentUser()).toBeNull(); expect(service.sessionError()).toBeNull();
  });
});
