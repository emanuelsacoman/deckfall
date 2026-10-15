import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthSession } from '../../../../model/interfaces/Auth/auth-session';
import { PackOpenResult, PlayerPack } from '../../../../model/interfaces/Packs/player-pack';
import { PlayerPackService } from '../../../../model/services/cruds/packs/player-pack.service';
import { AuthService } from '../../../../model/services/fire/auth.service';
import { PublishedCardStorageService } from '../../../../model/services/fire/published-card-storage.service';
import { packUiDeferred, testPackCards, testPlayerPack } from '../pack-ui-fixtures';
import { OpenPackComponent, PACK_OPENING_TIMING } from './open-pack.component';

describe('Abertura e reveal de pacote', () => {
  const member: AuthSession = { uid: 'player', email: null, displayName: 'Jogador', role: 'member', roleId: 'member' };
  const result: PackOpenResult = { packInstanceId: 'starter', alreadyOpened: false, revealedCards: testPackCards };
  const descriptor = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
  const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5MsAAAAASUVORK5CYII='), char => char.charCodeAt(0))], { type: 'image/png' });
  let fixture: ComponentFixture<OpenPackComponent>;
  let currentUser: ReturnType<typeof signal<AuthSession | null>>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let get: jasmine.Spy, open: jasmine.Spy, preview: jasmine.Spy;
  let motion: { matches: boolean; media: string; addEventListener: jasmine.Spy; removeEventListener: jasmine.Spy };
  beforeEach(() => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
    motion = { matches: false, media: '(prefers-reduced-motion: reduce)', addEventListener: jasmine.createSpy('motion listener'), removeEventListener: jasmine.createSpy('remove motion listener') };
    spyOn(window, 'matchMedia').and.returnValue(motion as unknown as MediaQueryList);
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
  function settle(): void { flushMicrotasks(); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); }
  function enter(): void { fixture.detectChanges(); settle(); }
  function confirm(): void { void fixture.componentInstance.open(); settle(); }
  function finishIntro(): void { tick(PACK_OPENING_TIMING.awakening + PACK_OPENING_TIMING.charging + PACK_OPENING_TIMING.burst); settle(); }
  function reveal(): void { fixture.componentInstance.revealCard(); settle(); }
  function changeMotion(matches: boolean): void {
    motion.matches = matches;
    motion.addEventListener.calls.mostRecent().args[1](new MediaQueryListEvent('change', { matches, media: motion.media }));
    settle();
  }
  it('checks the own instance and waits for an explicit click to open', fakeAsync(() => {
    enter(); expect(get).toHaveBeenCalledOnceWith('starter'); expect(open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-pack-shell')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.open-button').textContent).toContain('Abrir pacote');
    expect(fixture.componentInstance.phase()).toBe('sealed'); expect(preview).not.toHaveBeenCalled();
  }));
  it('stays sealed while the backend is pending and prevents a double click', fakeAsync(() => {
    const pending = packUiDeferred<PackOpenResult>(); open.and.returnValue(pending.promise); enter();
    fixture.nativeElement.querySelector('.open-button').click(); settle(); tick(3000);
    expect(fixture.nativeElement.querySelector('.open-button').disabled).toBeTrue();
    expect(fixture.componentInstance.phase()).toBe('sealed');
    expect(fixture.nativeElement.querySelector('.skip-animation')).toBeNull(); expect(preview).not.toHaveBeenCalled();
    void fixture.componentInstance.open(); expect(open).toHaveBeenCalledOnceWith('starter');
    pending.resolve(result); settle(); expect(fixture.componentInstance.phase()).toBe('awakening');
    finishIntro();
  }));
  it('runs awakening, charging and a single short burst only after confirmation', fakeAsync(() => {
    enter(); confirm(); expect(fixture.componentInstance.phase()).toBe('awakening');
    tick(PACK_OPENING_TIMING.awakening - 1); expect(fixture.componentInstance.phase()).toBe('awakening');
    tick(1); settle(); expect(fixture.componentInstance.phase()).toBe('charging');
    tick(PACK_OPENING_TIMING.charging); settle(); expect(fixture.componentInstance.phase()).toBe('burst');
    tick(PACK_OPENING_TIMING.burst); settle(); expect(fixture.componentInstance.phase()).toBe('revealing');
    expect(fixture.nativeElement.querySelector('.card-back')).not.toBeNull(); expect(preview).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  }));
  for (const [phase, elapsed] of [['awakening', 0], ['charging', PACK_OPENING_TIMING.awakening], ['burst', PACK_OPENING_TIMING.awakening + PACK_OPENING_TIMING.charging]] as const) {
    it('skips ' + phase + ' without losing the result or restarting the timeline', fakeAsync(() => {
      enter(); confirm(); tick(elapsed); settle(); expect(fixture.componentInstance.phase()).toBe(phase);
      fixture.nativeElement.querySelector('.skip-animation').click(); settle();
      expect(fixture.componentInstance.phase()).toBe('revealing'); expect(fixture.componentInstance.cards().length).toBe(2);
      tick(3000); settle(); expect(fixture.componentInstance.phase()).toBe('revealing');
      expect(fixture.componentInstance.faceRevealed()).toBeFalse(); expect(open).toHaveBeenCalledTimes(1);
    }));
  }
  it('reveals only the chosen card and downloads its published PNG once', fakeAsync(() => {
    enter(); confirm(); finishIntro(); fixture.nativeElement.querySelector('.card-back').click(); settle();
    fixture.componentInstance.revealCard(); settle();
    expect(fixture.nativeElement.textContent).toContain('Carta 1 de 2');
    expect(fixture.nativeElement.textContent).toContain('Primeira carta');
    expect(fixture.nativeElement.textContent).not.toContain('Segunda carta');
    expect(fixture.nativeElement.querySelectorAll('app-player-card-preview').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.reveal-card').getAttribute('data-rarity')).toBe('rare');
    expect(preview).toHaveBeenCalledOnceWith('cardA'); expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.next-card'));
  }));
  it('advances manually, gives legendary a brief moment, then shows the complete summary', fakeAsync(() => {
    enter(); confirm(); finishIntro(); reveal();
    fixture.nativeElement.querySelector('.next-card').click(); settle();
    expect(fixture.nativeElement.textContent).toContain('Carta 2 de 2');
    expect(fixture.componentInstance.faceRevealed()).toBeFalse(); expect(fixture.nativeElement.querySelector('.next-card')).toBeNull();
    reveal(); expect(fixture.componentInstance.specialLegendary()).toBeTrue(); expect(preview).toHaveBeenCalledTimes(1);
    tick(PACK_OPENING_TIMING.legendary - 1); settle(); expect(fixture.componentInstance.faceRevealed()).toBeFalse();
    tick(1); settle(); expect(fixture.componentInstance.specialLegendary()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Segunda carta'); expect(preview).toHaveBeenCalledWith('cardB');
    expect(fixture.nativeElement.querySelector('.next-card').textContent).toContain('Ver resumo');
    tick(3000); settle(); expect(fixture.componentInstance.index()).toBe(1); // No automatic card advance.
    fixture.nativeElement.querySelector('.next-card').click(); settle();
    expect(fixture.nativeElement.textContent).toContain('Pacote aberto');
    expect(fixture.nativeElement.textContent).toContain('2 cartas diferentes · 3 cópias recebidas');
    expect(fixture.nativeElement.querySelectorAll('.summary-card').length).toBe(2);
    expect(fixture.nativeElement.querySelector('a[href="/game/colecao"]')?.textContent).toContain('Ver minha coleção');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#summary-title'));
    expect(open).toHaveBeenCalledTimes(1);
  }));
  it('can skip the legendary pause and cannot reveal or advance it twice', fakeAsync(() => {
    enter(); confirm(); finishIntro(); reveal(); fixture.componentInstance.nextCard(); settle(); reveal();
    fixture.componentInstance.revealCard(); fixture.componentInstance.nextCard(); settle();
    expect(fixture.componentInstance.index()).toBe(1); expect(fixture.componentInstance.specialLegendary()).toBeTrue();
    fixture.nativeElement.querySelector('.skip-animation').click(); settle();
    expect(fixture.componentInstance.faceRevealed()).toBeTrue(); expect(preview.calls.allArgs()).toEqual([['cardA'], ['cardB']]);
    tick(1000); settle(); expect(fixture.componentInstance.phase()).toBe('revealing');
  }));
  it('keeps the result hidden on failure and goes directly to a recovered summary on retry', fakeAsync(() => {
    open.and.rejectWith({ code: 'functions/deadline-exceeded' }); enter(); confirm();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.componentInstance.phase()).toBe('sealed'); expect(preview).not.toHaveBeenCalled();
    open.and.resolveTo({ ...result, alreadyOpened: true }); fixture.nativeElement.querySelector('.open-button').click(); settle();
    expect(fixture.nativeElement.textContent).toContain('Resultado recuperado'); expect(fixture.componentInstance.phase()).toBe('summary');
    tick(3000); settle(); expect(fixture.componentInstance.phase()).toBe('summary'); expect(open).toHaveBeenCalledTimes(2);
  }));
  it('opens a saved result in summary and reviews it locally without another backend call', fakeAsync(() => {
    get.and.resolveTo(testPlayerPack(true)); enter();
    expect(fixture.componentInstance.phase()).toBe('summary'); expect(fixture.nativeElement.textContent).toContain('Resultado do pacote');
    tick(3000); settle(); expect(fixture.componentInstance.phase()).toBe('summary'); expect(open).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.summary-actions button').click(); settle();
    expect(fixture.componentInstance.phase()).toBe('revealing'); expect(fixture.componentInstance.index()).toBe(0);
    expect(fixture.nativeElement.querySelector('.opening-stage')).toBeNull(); expect(open).not.toHaveBeenCalled();
    reveal(); fixture.componentInstance.showSummary(); settle(); expect(fixture.componentInstance.phase()).toBe('summary');
  }));
  it('allows all cards to be shown without making individual reveals compulsory', fakeAsync(() => {
    enter(); confirm(); finishIntro(); fixture.nativeElement.querySelector('.summary-button').click(); settle();
    expect(fixture.componentInstance.phase()).toBe('summary'); expect(fixture.nativeElement.querySelectorAll('.summary-card').length).toBe(2);
    expect(open).toHaveBeenCalledTimes(1);
  }));
  it('reuses each downloaded PNG through reveal, summary and local review', fakeAsync(() => {
    enter(); confirm(); finishIntro(); reveal();
    fixture.componentInstance.nextCard(); settle(); reveal(); tick(PACK_OPENING_TIMING.legendary); settle();
    fixture.componentInstance.nextCard(); settle();
    expect(preview.calls.allArgs()).toEqual([['cardA'], ['cardB']]);
    fixture.componentInstance.reviewOpening(); settle(); reveal();
    fixture.componentInstance.nextCard(); settle(); reveal(); fixture.componentInstance.skipAnimation(); settle();
    expect(preview.calls.allArgs()).toEqual([['cardA'], ['cardB']]);
    expect(open).toHaveBeenCalledTimes(1);
  }));
  it('passes the real Nyra ID to the shared preview in reveal and summary without editor data', fakeAsync(() => {
    const cardId = '46f5c359-0d1e-423e-911e-4ba592567405';
    open.and.resolveTo({ ...result, revealedCards: [{ cardId, name: 'Nyra', rarity: 'rare', quantity: 1 }] });
    enter(); confirm(); finishIntro(); reveal();
    expect(preview).toHaveBeenCalledOnceWith(cardId);
    expect(fixture.nativeElement.querySelector('app-player-card-preview img').alt).toBe('Carta completa: Nyra');
    expect(fixture.componentInstance.cards()[0].preview).toEqual({ id: cardId, name: 'Nyra' });
    fixture.componentInstance.nextCard(); settle();
    expect(fixture.componentInstance.phase()).toBe('summary');
    expect(fixture.nativeElement.querySelector('.summary-card app-player-card-preview img').alt).toBe('Carta completa: Nyra');
    expect(preview).toHaveBeenCalledOnceWith(cardId);
    expect(fixture.componentInstance.previewCache.has(cardId)).toBeTrue();
  }));
  it('removes failed preview requests from the local cache so retry can download again', fakeAsync(() => {
    preview.and.rejectWith({ code: 'storage/object-not-found' });
    enter(); confirm(); finishIntro(); reveal();
    expect(fixture.componentInstance.previewCache.has('cardA')).toBeFalse();
    preview.and.resolveTo(png);
    fixture.nativeElement.querySelector('app-player-card-preview button').click(); settle();
    expect(preview.calls.allArgs()).toEqual([['cardA'], ['cardA']]);
    expect(fixture.componentInstance.previewCache.has('cardA')).toBeTrue();
  }));
  it('retries a failed reveal again in the summary and caches only the new successful request', fakeAsync(() => {
    preview.and.rejectWith({ code: 'storage/retry-limit-exceeded' });
    enter(); confirm(); finishIntro(); reveal();
    expect(fixture.componentInstance.previewCache.has('cardA')).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Confira sua conexão');
    preview.and.resolveTo(png);
    fixture.componentInstance.showSummary(); settle();
    expect(preview.calls.allArgs()).toEqual([['cardA'], ['cardA'], ['cardB']]);
    const downloaded = fixture.componentInstance.previewCache.get('cardA');
    expect(downloaded).toBeDefined();
    expect(fixture.nativeElement.querySelectorAll('app-player-card-preview img').length).toBe(2);
    fixture.componentInstance.reviewOpening(); settle(); reveal();
    expect(fixture.componentInstance.previewCache.get('cardA')).toBe(downloaded);
    expect(preview).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenCalledTimes(1);
  }));
  it('clears downloaded previews on an account change instead of retaining another session image', fakeAsync(() => {
    enter(); confirm(); finishIntro(); reveal(); expect(fixture.componentInstance.previewCache.size).toBe(1);
    get.and.resolveTo(testPlayerPack(true)); currentUser.set({ ...member, uid: 'another-player' }); settle();
    expect(fixture.componentInstance.phase()).toBe('summary');
    expect(preview.calls.allArgs()).toEqual([['cardA'], ['cardA'], ['cardB']]);
    fixture.destroy(); expect(fixture.componentInstance.previewCache.size).toBe(0);
  }));
  it('does not restore a pending image into a cleared cache after destruction', fakeAsync(() => {
    const pending = packUiDeferred<Blob>(); preview.and.returnValue(pending.promise);
    enter(); confirm(); finishIntro(); reveal(); expect(fixture.componentInstance.previewCache.size).toBe(1);
    fixture.destroy(); pending.resolve(png); flushMicrotasks();
    expect(fixture.componentInstance.previewCache.size).toBe(0);
  }));
  it('handles a missing pack without exposing an open button', fakeAsync(() => {
    get.and.resolveTo(null); enter(); expect(fixture.nativeElement.textContent).toContain('Pacote não encontrado');
    expect(fixture.nativeElement.querySelector('.open-button')).toBeNull(); expect(open).not.toHaveBeenCalled();
  }));
  it('retries a failed server read', fakeAsync(() => {
    get.and.rejectWith(new Error('network')); enter(); expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    get.and.resolveTo(testPlayerPack()); fixture.nativeElement.querySelector('.empty-state button').click(); settle();
    expect(fixture.nativeElement.querySelector('.open-button')).not.toBeNull(); expect(get).toHaveBeenCalledTimes(2);
  }));
  it('ignores a pending opening after the UID changes', fakeAsync(() => {
    const pending = packUiDeferred<PackOpenResult>(); open.and.returnValue(pending.promise); enter();
    void fixture.componentInstance.open(); currentUser.set({ ...member, uid: 'another-player' }); settle();
    pending.resolve(result); settle(); tick(3000);
    expect(fixture.componentInstance.cards()).toEqual([]); expect(fixture.componentInstance.phase()).toBe('sealed');
  }));
  it('cancels an active cinematic after the session changes', fakeAsync(() => {
    enter(); confirm(); tick(PACK_OPENING_TIMING.awakening); settle();
    currentUser.set(null); settle(); tick(3000); settle();
    expect(fixture.componentInstance.cards()).toEqual([]); expect(fixture.componentInstance.phase()).toBe('sealed');
    expect(fixture.nativeElement.querySelector('.reveal-card')).toBeNull();
  }));
  it('discards a read for an earlier route ID and resets its presentation', fakeAsync(() => {
    const pending = packUiDeferred<PlayerPack | null>(); get.and.returnValues(pending.promise, Promise.resolve(null));
    fixture.detectChanges(); params.next(convertToParamMap({ id: 'another' })); settle();
    pending.resolve(testPlayerPack()); settle(); expect(fixture.componentInstance.pack()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Pacote não encontrado');
  }));
  it('cancels legendary effects when the route changes', fakeAsync(() => {
    enter(); confirm(); finishIntro(); reveal(); fixture.componentInstance.nextCard(); settle(); reveal();
    get.and.resolveTo(null); params.next(convertToParamMap({ id: 'another' })); settle(); tick(1000); settle();
    expect(fixture.componentInstance.specialLegendary()).toBeFalse(); expect(fixture.componentInstance.faceRevealed()).toBeFalse();
    expect(fixture.componentInstance.cards()).toEqual([]);
  }));
  it('ignores backend completion after destruction', fakeAsync(() => {
    const pending = packUiDeferred<PackOpenResult>(); open.and.returnValue(pending.promise); enter();
    void fixture.componentInstance.open(); fixture.destroy(); pending.resolve(result); flushMicrotasks(); tick(3000);
    expect(fixture.componentInstance.cards()).toEqual([]); expect(fixture.componentInstance.phase()).toBe('sealed');
  }));
  it('destroys the timeline and the motion listener', fakeAsync(() => {
    enter(); confirm(); const phase = fixture.componentInstance.phase(); fixture.destroy(); tick(3000);
    expect(fixture.componentInstance.phase()).toBe(phase);
    expect(motion.removeEventListener).toHaveBeenCalledOnceWith('change', motion.addEventListener.calls.mostRecent().args[1]);
  }));
  it('releases each preview object URL on card changes, summary and destruction', fakeAsync(() => {
    const create = spyOn(URL, 'createObjectURL').and.callThrough(), revoke = spyOn(URL, 'revokeObjectURL').and.callThrough();
    enter(); confirm(); finishIntro(); reveal(); const first = create.calls.mostRecent().returnValue;
    fixture.componentInstance.nextCard(); settle(); expect(revoke).toHaveBeenCalledWith(first);
    reveal(); tick(PACK_OPENING_TIMING.legendary); settle(); fixture.componentInstance.nextCard(); settle(); fixture.destroy();
    expect(revoke.calls.count()).toBe(create.calls.count());
  }));
  it('respects reduced motion before opening, including immediate legendary reveal', fakeAsync(() => {
    enter(); changeMotion(true); confirm(); expect(fixture.componentInstance.phase()).toBe('revealing');
    expect(fixture.nativeElement.querySelector('.opening-stage')).toBeNull(); reveal();
    fixture.componentInstance.nextCard(); settle(); reveal();
    expect(fixture.componentInstance.faceRevealed()).toBeTrue(); expect(fixture.componentInstance.specialLegendary()).toBeFalse();
    tick(3000); settle(); expect(fixture.componentInstance.phase()).toBe('revealing');
  }));
  it('responds to reduced motion enabled during charge or legendary without losing cards', fakeAsync(() => {
    enter(); confirm(); tick(PACK_OPENING_TIMING.awakening); settle(); changeMotion(true);
    expect(fixture.componentInstance.phase()).toBe('revealing'); changeMotion(false); reveal();
    fixture.componentInstance.nextCard(); settle(); reveal(); expect(fixture.componentInstance.specialLegendary()).toBeTrue();
    changeMotion(true); expect(fixture.componentInstance.faceRevealed()).toBeTrue();
    tick(3000); settle(); expect(fixture.componentInstance.cards().length).toBe(2);
  }));
  it('disables movement, particles and flash through the reduced-motion stylesheet', fakeAsync(() => {
    enter(); confirm(); finishIntro(); reveal();
    const media = Array.from(document.styleSheets).flatMap(sheet => {
      try { return Array.from(sheet.cssRules).filter(rule => rule instanceof CSSMediaRule) as CSSMediaRule[]; } catch { return []; }
    }).find(rule => rule.conditionText.includes('prefers-reduced-motion: reduce') && rule.cssText.includes('.reveal-card'));
    expect(media).toBeDefined();
    const rule = Array.from(media!.cssRules).find(rule => rule instanceof CSSStyleRule && rule.selectorText.includes('.card-front')) as CSSStyleRule;
    expect(rule.style.animationName).toBe('none'); expect(rule.style.transitionProperty).toBe('none');
  }));
});
