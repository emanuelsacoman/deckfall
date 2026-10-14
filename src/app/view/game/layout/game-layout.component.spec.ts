import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthSession, isAdminSession } from '../../../model/interfaces/Auth/auth-session';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PLAYER_INITIALIZATION_CLIENT, PlayerInitializationService } from '../../../model/services/fire/player-initialization.service';
import { PlayerInitializationResult } from '../../../model/interfaces/Players/player-profile';
import { GameLayoutComponent } from './game-layout.component';

describe('GameLayoutComponent session lifecycle', () => {
  const member: AuthSession = { uid: 'player', email: 'player@example.test', displayName: 'Jogador', role: 'member', roleId: 'member' };
  let currentUser: ReturnType<typeof signal<AuthSession | null | undefined>>;
  let logout: jasmine.Spy;
  let navigate: jasmine.Spy;
  let initialize: jasmine.Spy;

  beforeEach(() => {
    currentUser = signal<AuthSession | null | undefined>(member);
    logout = jasmine.createSpy('logout').and.resolveTo();
    initialize = jasmine.createSpy('initialize').and.resolveTo({ initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter' });
    TestBed.configureTestingModule({
      imports: [GameLayoutComponent],
      providers: [provideRouter([]), { provide: PLAYER_INITIALIZATION_CLIENT, useValue: { initialize } }, {
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
    expect(initialize).not.toHaveBeenCalled();
  });

  it('requests bootstrap on game entry and gates the outlet until it succeeds', async () => {
    let finish!: (result: PlayerInitializationResult) => void;
    initialize.and.returnValue(new Promise<PlayerInitializationResult>(resolve => { finish = resolve; }));
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    expect(initialize).toHaveBeenCalledOnceWith();
    expect(fixture.nativeElement.textContent).toContain('Preparando sua jornada');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/login"]')?.textContent).toContain('Gerenciar minha conta');
    expect(fixture.nativeElement.querySelector('button.logout')).not.toBeNull();
    finish({ initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter' });
    await TestBed.inject(PlayerInitializationService).initialize();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Preparando sua jornada');
  });

  it('renders a critical error with retry and retains admin and account navigation', async () => {
    currentUser.set({ ...member, role: 'admin', roleId: 'admin' });
    initialize.and.rejectWith({ code: 'functions/failed-precondition' });
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    await TestBed.inject(PlayerInitializationService).initialize();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Starter Pack');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/admin"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/admin/pacotes"]')?.textContent).toContain('Configurar pacotes');
    initialize.and.resolveTo({ initialized: true, alreadyInitialized: true, starterPackGranted: false, starterPackInstanceId: 'starter' });
    fixture.nativeElement.querySelector('.journey-error button').click();
    await TestBed.inject(PlayerInitializationService).initialize();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('includes packages in the player menu', () => {
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav a[href="/game/pacotes"]')?.textContent).toContain('Pacotes');
    expect(fixture.nativeElement.querySelectorAll('nav a').length).toBe(6);
  });

  it('does not repeat bootstrap during ordinary navigation or profile name changes', async () => {
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixture.detectChanges();
    await TestBed.inject(PlayerInitializationService).initialize();
    currentUser.set({ ...member, displayName: 'Nome atualizado' });
    fixture.detectChanges();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
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
