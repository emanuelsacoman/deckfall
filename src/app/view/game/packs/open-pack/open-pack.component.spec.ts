import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthSession } from '../../../../model/interfaces/Auth/auth-session';
import { PackOpenResult, PlayerPack } from '../../../../model/interfaces/Packs/player-pack';
import { PlayerPackService } from '../../../../model/services/cruds/packs/player-pack.service';
import { AuthService } from '../../../../model/services/fire/auth.service';
import { PublishedCardStorageService } from '../../../../model/services/fire/published-card-storage.service';
import { packUiDeferred, testPackCards, testPlayerPack } from '../pack-ui-fixtures';
import { OpenPackComponent } from './open-pack.component';

describe('Abertura e reveal de pacote', () => {
  const member: AuthSession = { uid: 'player', email: null, displayName: 'Jogador', role: 'member', roleId: 'member' };
  const result: PackOpenResult = { packInstanceId: 'starter', alreadyOpened: false, revealedCards: testPackCards };
  const descriptor = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
  const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5MsAAAAASUVORK5CYII='), char => char.charCodeAt(0))], { type: 'image/png' });
  let fixture: ComponentFixture<OpenPackComponent>;
  let currentUser: ReturnType<typeof signal<AuthSession | null>>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let get: jasmine.Spy, open: jasmine.Spy, preview: jasmine.Spy;
  beforeEach(() => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
    currentUser = signal<AuthSession | null>(member); params = new BehaviorSubject(convertToParamMap({ id: 'starter' }));
    get = jasmine.createSpy('getCurrentUser').and.resolveTo(testPlayerPack());
    open = jasmine.createSpy('openCurrentUser').and.resolveTo(result);
    preview = jasmine.createSpy('getPreviewBlob').and.resolveTo(png);
    TestBed.configureTestingModule({ imports: [OpenPackComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: AuthService, useValue: { currentUser } },
      { provide: PlayerPackService, useValue: { getCurrentUser: get, openCurrentUser: open } },
      { provide: PublishedCardStorageService, useValue: { getPreviewBlob: preview } },
    ] }); fixture = TestBed.createComponent(OpenPackComponent);
  });
  afterEach(() => {
    fixture.destroy();
    if (descriptor) Object.defineProperty(window, 'IntersectionObserver', descriptor); else Reflect.deleteProperty(window, 'IntersectionObserver');
  });
  async function settle(): Promise<void> { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  async function enter(): Promise<void> { fixture.detectChanges(); await settle(); }
  async function confirm(): Promise<void> { await fixture.componentInstance.open(); await settle(); }
  it('checks the own instance and waits for an explicit click to open', async () => {
    await enter(); expect(get).toHaveBeenCalledOnceWith('starter'); expect(open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-pack-shell')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.open-button').textContent).toContain('Abrir pacote');
    expect(preview).not.toHaveBeenCalled();
  });
  it('waits for backend confirmation before revealing and prevents double click', async () => {
    const pending = packUiDeferred<PackOpenResult>(); open.and.returnValue(pending.promise); await enter();
    fixture.nativeElement.querySelector('.open-button').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.open-button').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.reveal-card')).toBeNull(); expect(preview).not.toHaveBeenCalled();
    await fixture.componentInstance.open(); expect(open).toHaveBeenCalledOnceWith('starter');
    pending.resolve(result); await settle(); expect(fixture.nativeElement.querySelector('.reveal-card')).not.toBeNull();
  });
  it('reveals only card 1, with its rarity and quantity, using the published PNG', async () => {
    await enter(); await confirm();
    expect(fixture.nativeElement.textContent).toContain('Carta 1 de 2');
    expect(fixture.nativeElement.textContent).toContain('Primeira carta');
    expect(fixture.nativeElement.textContent).not.toContain('Segunda carta');
    expect(fixture.nativeElement.querySelectorAll('app-player-card-preview').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.reveal-card').getAttribute('data-rarity')).toBe('rare');
    expect(preview).toHaveBeenCalledOnceWith('cardA'); expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });
  it('advances manually to the last card and then displays the complete summary', async () => {
    await enter(); await confirm(); fixture.nativeElement.querySelector('.next-card').click(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Carta 2 de 2');
    expect(fixture.nativeElement.querySelector('.reveal-card').getAttribute('data-rarity')).toBe('legendary');
    expect(fixture.nativeElement.querySelector('.next-card').textContent).toContain('Ver resumo');
    fixture.nativeElement.querySelector('.next-card').click(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Starter Pack aberto!');
    expect(fixture.nativeElement.textContent).toContain('2 cartas diferentes · 3 cópias');
    expect(fixture.nativeElement.querySelectorAll('.summary-card').length).toBe(2);
    expect(fixture.nativeElement.querySelector('a[href="/game/colecao"]')?.textContent).toContain('Ver minha coleção');
    expect(fixture.nativeElement.querySelector('.summary-actions a[href="/game/pacotes"]')).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('keeps reveal hidden on failure and recovers a committed response via retry', async () => {
    open.and.rejectWith({ code: 'functions/deadline-exceeded' }); await enter(); await confirm();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull(); expect(fixture.nativeElement.querySelector('.reveal-card')).toBeNull();
    open.and.resolveTo({ ...result, alreadyOpened: true }); fixture.nativeElement.querySelector('.open-button').click(); await settle();
    expect(fixture.nativeElement.textContent).toContain('Resultado recuperado'); expect(open).toHaveBeenCalledTimes(2);
  });
  it('reconstructs an opened result after refresh without calling openPack', async () => {
    get.and.resolveTo(testPlayerPack(true)); await enter();
    expect(fixture.nativeElement.textContent).toContain('Carta 1 de 2'); expect(fixture.nativeElement.textContent).toContain('Resultado recuperado');
    expect(open).not.toHaveBeenCalled();
    fixture.componentInstance.nextCard(); await settle(); expect(fixture.nativeElement.textContent).toContain('Carta 2 de 2');
  });
  it('handles a missing pack without exposing an open button', async () => {
    get.and.resolveTo(null); await enter(); expect(fixture.nativeElement.textContent).toContain('Pacote não encontrado');
    expect(fixture.nativeElement.querySelector('.open-button')).toBeNull(); expect(open).not.toHaveBeenCalled();
  });
  it('retries a failed server read', async () => {
    get.and.rejectWith(new Error('network')); await enter();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    get.and.resolveTo(testPlayerPack()); fixture.nativeElement.querySelector('.empty-state button').click(); await settle();
    expect(fixture.nativeElement.querySelector('.open-button')).not.toBeNull(); expect(get).toHaveBeenCalledTimes(2);
  });
  it('ignores opening for the previous UID after the account changes', async () => {
    const pending = packUiDeferred<PackOpenResult>(); open.and.returnValue(pending.promise); await enter();
    const accepted = fixture.componentInstance.open(); currentUser.set({ ...member, uid: 'another-player' }); fixture.detectChanges();
    pending.resolve(result); await accepted; await settle(); expect(fixture.componentInstance.cards()).toEqual([]);
  });
  it('discards a read for an earlier route ID', async () => {
    const pending = packUiDeferred<PlayerPack | null>(); get.and.returnValues(pending.promise, Promise.resolve(null)); fixture.detectChanges();
    params.next(convertToParamMap({ id: 'another' })); fixture.detectChanges(); pending.resolve(testPlayerPack()); await settle();
    expect(fixture.componentInstance.pack()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Pacote não encontrado');
  });
  it('releases each object URL on next card, summary and destruction', async () => {
    const create = spyOn(URL, 'createObjectURL').and.callThrough(), revoke = spyOn(URL, 'revokeObjectURL').and.callThrough();
    await enter(); await confirm(); const first = create.calls.mostRecent().returnValue;
    fixture.componentInstance.nextCard(); await settle(); expect(revoke).toHaveBeenCalledWith(first);
    fixture.componentInstance.nextCard(); await settle(); fixture.destroy();
    expect(revoke.calls.count()).toBe(create.calls.count());
  });
  it('includes a reduced-motion override disabling reveal animations', async () => {
    await enter(); await confirm();
    const media = Array.from(document.styleSheets).flatMap(sheet => {
      try { return Array.from(sheet.cssRules).filter(rule => rule instanceof CSSMediaRule) as CSSMediaRule[]; } catch { return []; }
    }).find(rule => rule.conditionText.includes('prefers-reduced-motion: reduce') && rule.cssText.includes('.reveal-card'));
    expect(media).toBeDefined();
    const rule = Array.from(media!.cssRules).find(rule => rule instanceof CSSStyleRule && rule.selectorText.includes('.reveal-card')) as CSSStyleRule;
    expect(rule.style.animationName).toBe('none'); expect(rule.style.transitionProperty).toBe('none');
  });
});
