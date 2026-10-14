import { computed, effect, inject, Injectable, InjectionToken, signal, untracked } from '@angular/core';
import { Functions } from '@angular/fire/functions';
import { httpsCallable } from 'firebase/functions';
import { isAuthenticatedSession } from '../../interfaces/Auth/auth-session';
import { PlayerInitializationResult, PlayerInitializationStatus } from '../../interfaces/Players/player-profile';
import { PACK_INSTANCE_ID_PATTERN } from '../../interfaces/Packs/player-pack';
import { AuthService } from './auth.service';

export const PLAYER_INITIALIZATION_TIMEOUT_MS = 30_000;
export const PLAYER_FUNCTIONS_REGION = 'southamerica-east1';

export interface PlayerInitializationClient {
  initialize(): Promise<PlayerInitializationResult>;
}

export const PLAYER_INITIALIZATION_CLIENT = new InjectionToken<PlayerInitializationClient>('Player initialization client', {
  providedIn: 'root',
  factory: () => {
    const callable = httpsCallable<Record<string, never>, PlayerInitializationResult>(
      inject(Functions), 'initializePlayer', { timeout: PLAYER_INITIALIZATION_TIMEOUT_MS }
    );
    // Identity is provided by Firebase Authentication, never by caller data.
    return { initialize: async () => (await callable({})).data };
  }
});

@Injectable({ providedIn: 'root' })
export class PlayerInitializationService {
  private readonly auth = inject(AuthService);
  private readonly client = inject(PLAYER_INITIALIZATION_CLIENT);
  private readonly statusState = signal<PlayerInitializationStatus>('idle');
  private readonly errorState = signal('');
  private readonly resultState = signal<PlayerInitializationResult | null>(null);
  private readonly pendingByUid = new Map<string, Promise<PlayerInitializationResult>>();
  private activeUid: string | null | undefined;
  private version = 0;
  private activeRequest: { version: number; promise: Promise<PlayerInitializationResult | null> } | null = null;

  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly result = this.resultState.asReadonly();
  readonly ready = computed(() => {
    const session = this.auth.currentUser();
    return isAuthenticatedSession(session) && session.uid === this.activeUid && this.status() === 'ready';
  });

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      untracked(() => this.synchronizeSession(isAuthenticatedSession(session) ? session.uid : null));
    }, { allowSignalWrites: true });
  }

  /** Failures are exposed as state; a stale or failed request resolves to null. */
  initialize(): Promise<PlayerInitializationResult | null> {
    const session = this.auth.currentUser();
    const uid = isAuthenticatedSession(session) ? session.uid : null;
    this.synchronizeSession(uid);
    if (!uid) return Promise.resolve(null);
    if (this.status() === 'ready') return Promise.resolve(this.result());
    if (this.activeRequest?.version === this.version) return this.activeRequest.promise;

    const version = this.version;
    this.statusState.set('preparing');
    this.errorState.set('');
    let pending = this.pendingByUid.get(uid);
    if (!pending) {
      let invocation: Promise<PlayerInitializationResult>;
      try { invocation = this.client.initialize(); }
      catch (error: unknown) { invocation = Promise.reject(error); }
      const backendRequest = invocation.finally(() => {
        if (this.pendingByUid.get(uid) === backendRequest) this.pendingByUid.delete(uid);
      });
      this.pendingByUid.set(uid, backendRequest);
      pending = backendRequest;
    }

    const promise = pending.then(result => {
      if (!isInitializationResult(result)) throw new Error('Invalid initialization response');
      if (!this.isCurrent(uid, version)) return null;
      this.resultState.set(result);
      this.statusState.set('ready');
      return result;
    }).catch((error: unknown) => {
      if (this.isCurrent(uid, version)) {
        this.resultState.set(null);
        this.errorState.set(initializationErrorMessage(error));
        this.statusState.set('error');
      }
      return null;
    }).finally(() => {
      if (this.activeRequest?.promise === promise) this.activeRequest = null;
    });
    this.activeRequest = { version, promise };
    return promise;
  }

  private synchronizeSession(uid: string | null): void {
    if (uid === this.activeUid) return;
    this.activeUid = uid;
    ++this.version;
    this.activeRequest = null;
    this.statusState.set('idle');
    this.errorState.set('');
    this.resultState.set(null);
    // An accepted backend transaction is not canceled by local logout/navigation.
  }

  private isCurrent(uid: string, version: number): boolean {
    const session = this.auth.currentUser();
    return version === this.version && uid === this.activeUid && isAuthenticatedSession(session) && session.uid === uid;
  }
}

function isInitializationResult(value: unknown): value is PlayerInitializationResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return Object.keys(result).length === 4 && result['initialized'] === true
    && typeof result['alreadyInitialized'] === 'boolean' && typeof result['starterPackGranted'] === 'boolean'
    && result['starterPackGranted'] === !result['alreadyInitialized']
    && typeof result['starterPackInstanceId'] === 'string' && PACK_INSTANCE_ID_PATTERN.test(result['starterPackInstanceId']);
}

function initializationErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  switch (code) {
    case 'functions/unauthenticated':
    case 'functions/permission-denied':
      return 'Não foi possível confirmar o acesso da sua conta. Entre novamente ou contate um administrador.';
    case 'functions/failed-precondition':
      if (typeof error === 'object' && error !== null && 'details' in error && typeof error.details === 'object'
          && error.details !== null && 'reason' in error.details && error.details.reason === 'starter-not-configured') {
        return 'O pacote inicial ainda não foi configurado por um administrador.';
      }
      return 'Não foi possível preparar seu Starter Pack. Contate um administrador ou tente novamente mais tarde.';
    case 'functions/deadline-exceeded':
      return 'A preparação demorou mais que o esperado. Confira sua conexão e tente novamente.';
    case 'functions/unavailable':
    case 'functions/not-found':
      return 'A preparação do jogador está indisponível no momento. Tente novamente mais tarde.';
    default:
      return 'Não foi possível preparar sua jornada. Confira sua conexão e tente novamente.';
  }
}
