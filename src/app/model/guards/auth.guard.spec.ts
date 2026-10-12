import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthSession } from '../interfaces/Auth/auth-session';
import { AuthService } from '../services/fire/auth.service';
import { adminChildGuard, adminGuard, authenticatedChildGuard, authenticatedGuard } from './auth.guard';

describe('authenticated and administrative route guards', () => {
  let waitForSession: jasmine.Spy;
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/cartas/lista' } as RouterStateSnapshot;
  const gameState = { url: '/game/colecao' } as RouterStateSnapshot;
  const member: AuthSession = { uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' };
  const admin: AuthSession = { ...member, uid: 'admin', role: 'admin', roleId: 'admin' };

  beforeEach(() => {
    waitForSession = jasmine.createSpy('waitForSession').and.resolveTo(null);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { waitForSession } }] });
  });

  it('redirects signed-out or member users to login', async () => {
    for (const user of [null, { uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' }]) {
      waitForSession.and.resolveTo(user);
      const result = await TestBed.runInInjectionContext(() => adminGuard(route, state));
      expect(result instanceof UrlTree).toBeTrue();
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fadmin%2Fcartas%2Flista');
    }
  });

  it('waits for the profile before allowing child access', async () => {
    let resolveSession!: (session: AuthSession) => void;
    waitForSession.and.returnValue(new Promise<AuthSession>(resolve => { resolveSession = resolve; }));
    let resolved = false;
    const pending = Promise.resolve(TestBed.runInInjectionContext(() => adminChildGuard(route, state))).then(value => { resolved = true; return value; });
    await Promise.resolve(); expect(resolved).toBeFalse();
    resolveSession({ uid: 'owner', email: null, displayName: null, role: 'admin', roleId: 'admin' });
    expect(await pending).toBeTrue();
  });

  it('rejects an inconsistent administrator profile', async () => {
    waitForSession.and.resolveTo({ uid: 'owner', email: null, displayName: null, role: 'admin', roleId: 'member' });
    expect(await TestBed.runInInjectionContext(() => adminGuard(route, state)) instanceof UrlTree).toBeTrue();
  });

  it('allows both member and admin profiles into the player area', async () => {
    for (const user of [member, admin]) {
      waitForSession.and.resolveTo(user);
      expect(await TestBed.runInInjectionContext(() => authenticatedGuard(route, gameState))).toBeTrue();
      expect(await TestBed.runInInjectionContext(() => authenticatedChildGuard(route, gameState))).toBeTrue();
    }
  });

  it('preserves the player returnUrl when the Firebase session is absent', async () => {
    const result = await TestBed.runInInjectionContext(() => authenticatedGuard(route, gameState));
    expect(result instanceof UrlTree).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fgame%2Fcolecao');
  });

  it('denies either area for missing, unknown, inconsistent or empty-UID profiles', async () => {
    for (const user of [
      { ...member, role: null, roleId: null },
      { ...member, role: 'unknown', roleId: 'unknown' },
      { ...admin, roleId: 'member' },
      { ...member, uid: '' }
    ]) {
      waitForSession.and.resolveTo(user);
      expect(await TestBed.runInInjectionContext(() => authenticatedGuard(route, gameState)) instanceof UrlTree).toBeTrue();
      expect(await TestBed.runInInjectionContext(() => adminGuard(route, state)) instanceof UrlTree).toBeTrue();
    }
  });

  it('allows an admin through the parent and child administrative guards', async () => {
    waitForSession.and.resolveTo(admin);
    expect(await TestBed.runInInjectionContext(() => adminGuard(route, state))).toBeTrue();
    expect(await TestBed.runInInjectionContext(() => adminChildGuard(route, state))).toBeTrue();
  });

  it('waits for profile resolution before allowing player child access', async () => {
    let resolveSession!: (session: AuthSession) => void;
    waitForSession.and.returnValue(new Promise<AuthSession>(resolve => { resolveSession = resolve; }));
    let resolved = false;
    const pending = Promise.resolve(TestBed.runInInjectionContext(() => authenticatedChildGuard(route, gameState))).then(value => { resolved = true; return value; });
    await Promise.resolve(); expect(resolved).toBeFalse();
    resolveSession(member);
    expect(await pending).toBeTrue();
  });
});
