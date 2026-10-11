import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AuthIdentity, MemberProfileSeed, UserAccessProfile } from '../../interfaces/Auth/auth-session';
import { AUTH_SESSION_CLIENT, AuthService, AuthSessionClient } from './auth.service';

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
      'observeAuth', 'observeProfile', 'ensureProfile', 'login', 'register', 'loginWithGoogle', 'logout'
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
});
