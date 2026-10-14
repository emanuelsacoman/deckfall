import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthSession } from '../../../model/interfaces/Auth/auth-session';
import { PlayerPack } from '../../../model/interfaces/Packs/player-pack';
import { PlayerPackService } from '../../../model/services/cruds/packs/player-pack.service';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PlayerInitializationService } from '../../../model/services/fire/player-initialization.service';
import { HomeComponent } from './home.component';
import { packUiDeferred, testPlayerPack } from '../packs/pack-ui-fixtures';

describe('Chegada do Starter Pack na Home', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let get: jasmine.Spy;
  let ready: ReturnType<typeof signal<boolean>>;
  let currentUser: ReturnType<typeof signal<AuthSession | null>>;
  const member: AuthSession = { uid: 'player', email: null, displayName: 'Jogador', role: 'member', roleId: 'member' };
  beforeEach(() => {
    get = jasmine.createSpy('getCurrentUser').and.resolveTo(testPlayerPack()); ready = signal(true); currentUser = signal<AuthSession | null>(member);
    TestBed.configureTestingModule({ imports: [HomeComponent], providers: [provideRouter([]),
      { provide: AuthService, useValue: { currentUser } },
      { provide: PlayerInitializationService, useValue: { ready, result: signal({ initialized: true, alreadyInitialized: true, starterPackGranted: false, starterPackInstanceId: 'starter' }) } },
      { provide: PlayerPackService, useValue: { getCurrentUser: get } },
    ] }); fixture = TestBed.createComponent(HomeComponent);
  });
  async function settle(): Promise<void> { await fixture.whenStable(); fixture.detectChanges(); }
  it('shows a sealed pack on first entry or a later session without opening it', async () => {
    fixture.detectChanges(); await settle(); expect(get).toHaveBeenCalledOnceWith('starter');
    expect(fixture.nativeElement.textContent).toContain('Seu Starter Pack chegou!');
    expect(fixture.nativeElement.querySelector('a[href="/game/pacotes/abrir/starter"]')?.textContent).toContain('Abrir Starter Pack');
  });
  it('does not announce a pack already opened', async () => {
    get.and.resolveTo(testPlayerPack(true)); fixture.detectChanges(); await settle();
    expect(fixture.nativeElement.textContent).not.toContain('Seu Starter Pack chegou!');
  });
  it('waits for bootstrap readiness before querying the pack', async () => {
    ready.set(false); fixture.detectChanges(); await settle(); expect(get).not.toHaveBeenCalled();
  });
  it('offers retry if the pack cannot be checked', async () => {
    get.and.rejectWith(new Error('network')); fixture.detectChanges(); await settle(); expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    get.and.resolveTo(testPlayerPack()); fixture.nativeElement.querySelector('.starter-check button').click(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Seu Starter Pack chegou!');
  });
  it('ignores a pending receipt from the previous session', async () => {
    const pending = packUiDeferred<PlayerPack | null>(); get.and.returnValue(pending.promise); fixture.detectChanges();
    currentUser.set(null); fixture.detectChanges(); pending.resolve(testPlayerPack()); await settle();
    expect(fixture.componentInstance.starter()).toBeNull();
  });
});
