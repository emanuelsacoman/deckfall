import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthSession, isAdminSession } from '../../../model/interfaces/Auth/auth-session';
import { AuthService } from '../../../model/services/fire/auth.service';
import { GameLayoutComponent } from './game-layout.component';

describe('GameLayoutComponent session lifecycle', () => {
  const member: AuthSession = { uid: 'player', email: 'player@example.test', displayName: 'Jogador', role: 'member', roleId: 'member' };
  let currentUser: ReturnType<typeof signal<AuthSession | null | undefined>>;
  let logout: jasmine.Spy;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    currentUser = signal<AuthSession | null | undefined>(member);
    logout = jasmine.createSpy('logout').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [GameLayoutComponent],
      providers: [provideRouter([]), {
        provide: AuthService,
        useValue: { currentUser, isAdmin: computed(() => isAdminSession(currentUser())), logout },
      }],
    });
    const router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOnProperty(router, 'url', 'get').and.returnValue('/game/colecao');
  });

  it('waits for an unresolved session without rendering the player shell', () => {
    currentUser.set(undefined);
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Verificando acesso');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('removes the shell and preserves the current route when the profile becomes invalid', () => {
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav')).not.toBeNull();
    currentUser.set({ ...member, role: null, roleId: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], {
      replaceUrl: true, queryParams: { returnUrl: '/game/colecao' },
    });
  });

  it('keeps an administrator in the player area after a valid demotion to member', () => {
    currentUser.set({ ...member, role: 'admin', roleId: 'admin' });
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/admin"]')).not.toBeNull();
    currentUser.set(member);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/admin"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('nav')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves the area when the account signs out in another session', () => {
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    currentUser.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], {
      replaceUrl: true, queryParams: { returnUrl: '/game/colecao' },
    });
  });

  it('prevents duplicate logout and returns to login after clearing the session', async () => {
    let finish!: () => void;
    logout.and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const pending = component.logout();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.logout').disabled).toBeTrue();
    await component.logout();
    expect(logout).toHaveBeenCalledTimes(1);
    currentUser.set(null);
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], { replaceUrl: true });
    expect(component.signingOut()).toBeFalse();
  });

  it('returns to the account screen even when Firebase logout fails', async () => {
    logout.and.rejectWith(new Error('Falha na conexão'));
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    await fixture.componentInstance.logout();
    expect(navigate).toHaveBeenCalledOnceWith(['/login'], { replaceUrl: true });
    expect(fixture.componentInstance.signingOut()).toBeFalse();
  });
});
