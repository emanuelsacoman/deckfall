import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthSession } from '../../interfaces/Auth/auth-session';
import { PlayerInitializationResult } from '../../interfaces/Players/player-profile';
import { AuthService } from './auth.service';
import { PLAYER_INITIALIZATION_CLIENT, PlayerInitializationService } from './player-initialization.service';

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('PlayerInitializationService', () => {
  const member: AuthSession = { uid: 'player', email: null, displayName: 'Jogador', role: 'member', roleId: 'member' };
  const granted: PlayerInitializationResult = { initialized: true, alreadyInitialized: false, cardsGranted: 8 };
  let currentUser: ReturnType<typeof signal<AuthSession | null | undefined>>;
  let initialize: jasmine.Spy;
  let service: PlayerInitializationService;

  beforeEach(() => {
    currentUser = signal<AuthSession | null | undefined>(member);
    initialize = jasmine.createSpy('initialize').and.resolveTo(granted);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { currentUser } },
      { provide: PLAYER_INITIALIZATION_CLIENT, useValue: { initialize } }
    ] });
    service = TestBed.inject(PlayerInitializationService);
    TestBed.flushEffects();
  });

  it('waits until entry requests initialization, without calling the backend on service creation', () => {
    expect(service.status()).toBe('idle');
    expect(service.ready()).toBeFalse();
    expect(initialize).not.toHaveBeenCalled();
  });

  for (const role of ['member', 'admin'] as const) {
    it(`initializes a valid ${role} with no identity arguments`, async () => {
      currentUser.set({ ...member, role, roleId: role });
      const promise = service.initialize();
      expect(service.status()).toBe('preparing');
      expect(service.ready()).toBeFalse();
      expect(await promise).toEqual(granted);
      expect(initialize).toHaveBeenCalledOnceWith();
      expect(service.status()).toBe('ready');
      expect(service.result()).toEqual(granted);
      expect(service.error()).toBe('');
      expect(service.ready()).toBeTrue();
    });
  }

  it('refuses missing, unresolved, empty UID and inconsistent profiles', async () => {
    const sessions = [null, undefined, { ...member, uid: ' ' }, { ...member, roleId: 'admin' }, { ...member, role: null, roleId: null }];
    for (const session of sessions) {
      currentUser.set(session);
      expect(await service.initialize()).toBeNull();
      expect(service.status()).toBe('idle');
      expect(service.ready()).toBeFalse();
    }
    expect(initialize).not.toHaveBeenCalled();
  });

  it('accepts an already initialized player without granting more cards', async () => {
    const result: PlayerInitializationResult = { initialized: true, alreadyInitialized: true, cardsGranted: 0 };
    initialize.and.resolveTo(result);
    expect(await service.initialize()).toEqual(result);
    expect(service.ready()).toBeTrue();
    expect(service.result()?.cardsGranted).toBe(0);
  });

  it('reuses the same promise for simultaneous local requests', async () => {
    const backend = deferred<PlayerInitializationResult>();
    initialize.and.returnValue(backend.promise);
    const first = service.initialize();
    const second = service.initialize();
    expect(first).toBe(second);
    expect(initialize).toHaveBeenCalledTimes(1);
    backend.resolve(granted);
    expect(await first).toEqual(granted);
  });

  it('caches successful initialization only for the current authenticated session', async () => {
    await service.initialize();
    await service.initialize();
    currentUser.set({ ...member, displayName: 'Outro nome', role: 'admin', roleId: 'admin' });
    TestBed.flushEffects();
    await service.initialize();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(service.ready()).toBeTrue();
    currentUser.set(null);
    TestBed.flushEffects();
    expect(service.result()).toBeNull();
    expect(service.status()).toBe('idle');
    currentUser.set(member);
    TestBed.flushEffects();
    await service.initialize();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('shows a critical error and retries without pretending initialization succeeded', async () => {
    initialize.and.rejectWith({ code: 'functions/failed-precondition', message: 'Private starter details' });
    expect(await service.initialize()).toBeNull();
    expect(service.status()).toBe('error');
    expect(service.result()).toBeNull();
    expect(service.ready()).toBeFalse();
    expect(service.error()).toContain('coleção inicial');
    expect(service.error()).not.toContain('Private starter');
    initialize.and.resolveTo(granted);
    const retry = service.initialize();
    expect(service.error()).toBe('');
    expect(service.status()).toBe('preparing');
    await retry;
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(service.ready()).toBeTrue();
  });

  it('handles synchronous client failure and allows a later retry', async () => {
    initialize.and.throwError('A synchronous SDK failure');
    expect(await service.initialize()).toBeNull();
    expect(service.status()).toBe('error');
    initialize.and.resolveTo(granted);
    await service.initialize();
    expect(service.ready()).toBeTrue();
  });

  it('discards a response arriving after logout, without canceling the backend operation', async () => {
    const backend = deferred<PlayerInitializationResult>();
    initialize.and.returnValue(backend.promise);
    const request = service.initialize();
    currentUser.set(null);
    TestBed.flushEffects();
    expect(service.status()).toBe('idle');
    backend.resolve(granted);
    expect(await request).toBeNull();
    expect(service.result()).toBeNull();
    expect(service.error()).toBe('');
    expect(service.ready()).toBeFalse();
  });

  it('does not expose readiness immediately after the UID changes before effects run', async () => {
    await service.initialize();
    currentUser.set({ ...member, uid: 'another-player' });
    expect(service.ready()).toBeFalse();
  });

  it('ignores player A success arriving after player B has initialized', async () => {
    const first = deferred<PlayerInitializationResult>();
    const second = deferred<PlayerInitializationResult>();
    initialize.and.returnValues(first.promise, second.promise);
    const requestA = service.initialize();
    currentUser.set({ ...member, uid: 'another-player' });
    TestBed.flushEffects();
    const requestB = service.initialize();
    const resultB: PlayerInitializationResult = { initialized: true, alreadyInitialized: true, cardsGranted: 0 };
    second.resolve(resultB);
    await requestB;
    first.resolve(granted);
    expect(await requestA).toBeNull();
    expect(service.result()).toEqual(resultB);
    expect(service.ready()).toBeTrue();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('ignores player A failure after player B has initialized', async () => {
    const first = deferred<PlayerInitializationResult>();
    initialize.and.returnValues(first.promise, Promise.resolve(granted));
    const requestA = service.initialize();
    currentUser.set({ ...member, uid: 'another-player' });
    await service.initialize();
    first.reject({ code: 'functions/deadline-exceeded' });
    expect(await requestA).toBeNull();
    expect(service.status()).toBe('ready');
    expect(service.error()).toBe('');
  });

  it('invalidates state when a profile becomes inconsistent during an operation', async () => {
    const backend = deferred<PlayerInitializationResult>();
    initialize.and.returnValue(backend.promise);
    const request = service.initialize();
    currentUser.set({ ...member, roleId: 'admin' });
    TestBed.flushEffects();
    backend.resolve(granted);
    expect(await request).toBeNull();
    expect(service.status()).toBe('idle');
    expect(service.result()).toBeNull();
    expect(service.ready()).toBeFalse();
  });

  it('reuses an uncanceled request for the same UID after leaving and returning during its execution', async () => {
    const backend = deferred<PlayerInitializationResult>();
    initialize.and.returnValue(backend.promise);
    const oldRequest = service.initialize();
    currentUser.set(null);
    TestBed.flushEffects();
    currentUser.set(member);
    TestBed.flushEffects();
    const currentRequest = service.initialize();
    expect(currentRequest).not.toBe(oldRequest);
    expect(initialize).toHaveBeenCalledTimes(1);
    backend.resolve(granted);
    expect(await oldRequest).toBeNull();
    expect(await currentRequest).toEqual(granted);
    expect(service.ready()).toBeTrue();
  });

  it('rejects malformed success responses', async () => {
    for (const result of [null, {}, { ...granted, initialized: false }, { ...granted, cardsGranted: -1 }, { ...granted, cardsGranted: 1.5 }, { ...granted, alreadyInitialized: true }]) {
      initialize.and.resolveTo(result);
      expect(await service.initialize()).toBeNull();
      expect(service.ready()).toBeFalse();
      expect(service.status()).toBe('error');
    }
  });

  for (const [code, expected] of [
    ['functions/deadline-exceeded', 'demorou'],
    ['functions/unauthenticated', 'acesso da sua conta'],
    ['functions/permission-denied', 'acesso da sua conta'],
    ['functions/not-found', 'indisponível'],
    ['functions/unavailable', 'indisponível'],
    ['functions/internal', 'Confira sua conexão']
  ]) {
    it(`maps ${code} to an actionable message without backend details`, async () => {
      initialize.and.rejectWith({ code, message: 'Private implementation detail' });
      await service.initialize();
      expect(service.error()).toContain(expected);
      expect(service.error()).not.toContain('Private');
      expect(service.ready()).toBeFalse();
    });
  }
});
