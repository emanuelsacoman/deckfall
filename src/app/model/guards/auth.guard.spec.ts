import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthSession } from '../interfaces/Auth/auth-session';
import { AuthService } from '../services/fire/auth.service';
import { authChildGuard, authGuard } from './auth.guard';

describe('administrative route guards', () => {
  let waitForSession: jasmine.Spy;
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/cartas/lista' } as RouterStateSnapshot;

  beforeEach(() => {
    waitForSession = jasmine.createSpy('waitForSession').and.resolveTo(null);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { waitForSession } }] });
  });

  it('redirects signed-out or member users to login', async () => {
    for (const user of [null, { uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' }]) {
      waitForSession.and.resolveTo(user);
      const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
      expect(result instanceof UrlTree).toBeTrue();
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fadmin%2Fcartas%2Flista');
    }
  });

  it('waits for the profile before allowing child access', async () => {
    let resolveSession!: (session: AuthSession) => void;
    waitForSession.and.returnValue(new Promise<AuthSession>(resolve => { resolveSession = resolve; }));
    let resolved = false;
    const pending = Promise.resolve(TestBed.runInInjectionContext(() => authChildGuard(route, state))).then(value => { resolved = true; return value; });
    await Promise.resolve(); expect(resolved).toBeFalse();
    resolveSession({ uid: 'owner', email: null, displayName: null, role: 'admin', roleId: 'admin' });
    expect(await pending).toBeTrue();
  });

  it('rejects an inconsistent administrator profile', async () => {
    waitForSession.and.resolveTo({ uid: 'owner', email: null, displayName: null, role: 'admin', roleId: 'member' });
    expect(await TestBed.runInInjectionContext(() => authGuard(route, state)) instanceof UrlTree).toBeTrue();
  });
});
