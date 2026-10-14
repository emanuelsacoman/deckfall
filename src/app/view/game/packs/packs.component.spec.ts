import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthSession } from '../../../model/interfaces/Auth/auth-session';
import { PlayerPackService } from '../../../model/services/cruds/packs/player-pack.service';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PlayerPack } from '../../../model/interfaces/Packs/player-pack';
import { PacksComponent } from './packs.component';
import { packUiDeferred, testPlayerPack } from './pack-ui-fixtures';

describe('Meus Pacotes', () => {
  let fixture: ComponentFixture<PacksComponent>;
  let currentUser: ReturnType<typeof signal<AuthSession | null>>;
  let list: jasmine.Spy;
  const member: AuthSession = { uid: 'player', email: null, displayName: 'Jogador', role: 'member', roleId: 'member' };
  beforeEach(() => {
    currentUser = signal<AuthSession | null>(member);
    list = jasmine.createSpy('listCurrentUser').and.resolveTo([]);
    TestBed.configureTestingModule({ imports: [PacksComponent], providers: [provideRouter([]),
      { provide: PlayerPackService, useValue: { listCurrentUser: list } },
      { provide: AuthService, useValue: { currentUser } },
    ] });
    fixture = TestBed.createComponent(PacksComponent);
  });
  async function settle(): Promise<void> { await fixture.whenStable(); fixture.detectChanges(); }
  it('shows loading while the server read is pending', async () => {
    const pending = packUiDeferred<PlayerPack[]>(); list.and.returnValue(pending.promise);
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Carregando seus pacotes');
    pending.resolve([]); await settle(); expect(fixture.nativeElement.textContent).toContain('Nenhum pacote');
  });
  it('displays the sealed Starter Pack and routes to opening without opening automatically', async () => {
    list.and.resolveTo([testPlayerPack()]); fixture.detectChanges(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Lacrado');
    expect(fixture.nativeElement.querySelector('a[href="/game/pacotes/abrir/starter"]')?.textContent).toContain('Abrir pacote');
    expect(fixture.nativeElement.querySelector('app-pack-shell')).not.toBeNull();
  });
  it('shows opened history separately with a review link', async () => {
    list.and.resolveTo([testPlayerPack(true)]); fixture.detectChanges(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Abertos recentemente');
    expect(fixture.nativeElement.querySelector('a[href="/game/pacotes/abrir/starter"]')?.textContent).toContain('Rever cartas');
    expect(fixture.nativeElement.querySelector('app-pack-shell')).toBeNull();
  });
  it('retries a failed list without simulating an empty inventory', async () => {
    list.and.rejectWith(new Error('network')); fixture.detectChanges(); await settle();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Nenhum pacote');
    list.and.resolveTo([testPlayerPack()]); fixture.nativeElement.querySelector('button').click(); await settle();
    expect(list).toHaveBeenCalledTimes(2); expect(fixture.nativeElement.textContent).toContain('Lacrado');
  });
  it('discards an old user response after logout', async () => {
    const pending = packUiDeferred<PlayerPack[]>(); list.and.returnValue(pending.promise); fixture.detectChanges();
    currentUser.set(null); fixture.detectChanges(); pending.resolve([testPlayerPack()]); await settle();
    expect(fixture.componentInstance.packs()).toEqual([]);
  });
});
