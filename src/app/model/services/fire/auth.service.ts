import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile
} from 'firebase/auth';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { BehaviorSubject, filter, firstValueFrom, take } from 'rxjs';
import {
  AuthIdentity, AuthSession, isAdminSession, MemberProfileSeed, UserAccessProfile
} from '../../interfaces/Auth/auth-session';

export interface AuthSessionClient {
  observeAuth(next: (user: AuthIdentity | null) => void, error: () => void): () => void;
  observeProfile(uid: string, next: (profile: UserAccessProfile) => void, error: () => void): () => void;
  ensureProfile(user: AuthIdentity, seed: MemberProfileSeed): Promise<void>;
  login(email: string, password: string): Promise<AuthIdentity>;
  register(email: string, password: string, displayName: string): Promise<AuthIdentity>;
  loginWithGoogle(): Promise<AuthIdentity>;
  logout(): Promise<void>;
}

export const AUTH_SESSION_CLIENT = new InjectionToken<AuthSessionClient>('Auth session client', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(Auth);
    const firestore = inject(Firestore);
    const google = new GoogleAuthProvider();
    return {
      observeAuth: (next, error) => onAuthStateChanged(auth, next, error),
      observeProfile: (uid, next, error) => onSnapshot(doc(firestore, 'users', uid), snapshot => {
        const data = snapshot.data();
        next({
          role: typeof data?.['role'] === 'string' ? data['role'] : null,
          roleId: typeof data?.['roleId'] === 'string' ? data['roleId'] : null
        });
      }, error),
      ensureProfile: async (user, seed) => {
        const reference = doc(firestore, 'users', user.uid);
        await runTransaction(firestore, async transaction => {
          if ((await transaction.get(reference)).exists()) return;
          transaction.set(reference, {
            ...seed, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          });
        });
      },
      login: async (email, password) => (await signInWithEmailAndPassword(auth, email, password)).user,
      register: async (email, password, displayName) => {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(user, { displayName });
        return user;
      },
      loginWithGoogle: async () => (await signInWithPopup(auth, google)).user,
      logout: () => signOut(auth)
    };
  }
});

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(AUTH_SESSION_CLIENT);
  private readonly userState = signal<AuthSession | null | undefined>(undefined);
  private readonly errorState = signal<string | null>(null);
  private readonly sessionChanges = new BehaviorSubject<AuthSession | null | undefined>(undefined);
  private profileUnsubscribe?: () => void;
  private timeout?: ReturnType<typeof setTimeout>;
  private version = 0;
  private requestVersion = 0;
  private allowAuthenticatedEvents = true;

  readonly currentUser = this.userState.asReadonly();
  readonly sessionError = this.errorState.asReadonly();
  readonly isAdmin = computed(() => isAdminSession(this.currentUser()));

  constructor() {
    this.startTimeout(this.version);
    const unsubscribe = this.client.observeAuth(
      user => { void this.observeUser(user); },
      () => this.denySession('Não foi possível verificar a sessão. Entre novamente.')
    );
    inject(DestroyRef).onDestroy(() => {
      ++this.version;
      ++this.requestVersion;
      unsubscribe();
      this.stopProfile();
      this.clearTimeout();
      this.sessionChanges.complete();
    });
  }

  login(email: string, password: string): Promise<void> {
    return this.authenticate(() => this.client.login(email.trim(), password));
  }

  register(email: string, password: string, displayName = ''): Promise<void> {
    if (password.length < 6) return Promise.reject(new Error('A senha deve ter pelo menos 6 caracteres.'));
    if (displayName.trim().length > 120) return Promise.reject(new Error('O nome deve ter até 120 caracteres.'));
    return this.authenticate(() => this.client.register(email.trim(), password, displayName.trim()));
  }

  loginWithGoogle(): Promise<void> {
    return this.authenticate(() => this.client.loginWithGoogle());
  }

  async logout(): Promise<void> {
    ++this.requestVersion;
    this.allowAuthenticatedEvents = false;
    ++this.version;
    this.stopProfile();
    this.clearTimeout();
    this.setSession(null);
    this.errorState.set(null);
    try {
      await this.client.logout();
    } catch {
      this.errorState.set('Não foi possível encerrar a sessão no servidor. Tente novamente.');
      throw new Error(this.sessionError()!);
    }
  }

  waitForSession(): Promise<AuthSession | null> {
    const current = this.currentUser();
    if (current !== undefined) return Promise.resolve(current);
    return firstValueFrom(this.sessionChanges.pipe(
      filter((user): user is AuthSession | null => user !== undefined), take(1)
    ));
  }

  private async authenticate(action: () => Promise<AuthIdentity>): Promise<void> {
    const requestVersion = ++this.requestVersion;
    this.allowAuthenticatedEvents = false;
    ++this.version;
    this.stopProfile();
    this.errorState.set(null);
    this.setSession(undefined);
    this.startTimeout(this.version);
    try {
      const user = await action();
      if (requestVersion !== this.requestVersion) {
        await this.client.logout();
        return;
      }
      await this.observeUser(user, true);
      await this.waitForSession();
      if (requestVersion === this.requestVersion) this.allowAuthenticatedEvents = true;
    } catch (error: unknown) {
      if (requestVersion === this.requestVersion) this.denySession(authErrorMessage(error));
      throw new Error(authErrorMessage(error));
    }
  }

  private async observeUser(user: AuthIdentity | null, explicitRequest = false): Promise<void> {
    if (!this.allowAuthenticatedEvents && user && !explicitRequest) return;
    if (user && this.profileUnsubscribe && this.currentUser()?.uid === user.uid) return;
    const version = ++this.version;
    this.stopProfile();
    this.clearTimeout();
    this.errorState.set(null);
    if (!user) {
      this.setSession(null);
      return;
    }
    this.setSession(undefined);
    this.startTimeout(version, user);
    try {
      await this.client.ensureProfile(user, {
        displayName: (user.displayName ?? '').trim().slice(0, 120),
        contactEmail: user.email ?? '', role: 'member', roleId: 'member'
      });
      if (version !== this.version) return;
      this.profileUnsubscribe = this.client.observeProfile(user.uid, profile => {
        if (version !== this.version) return;
        this.clearTimeout();
        const session: AuthSession = {
          uid: user.uid, email: user.email, displayName: user.displayName,
          role: profile.role, roleId: profile.roleId
        };
        this.setSession(session);
        this.errorState.set(isAdminSession(session) ? null : 'Sua conta está ativa. O acesso ao painel depende de permissão administrativa.');
      }, () => {
        if (version === this.version) this.denySession('Não foi possível verificar sua permissão. Tente entrar novamente.', user);
      });
    } catch {
      if (version === this.version) {
        this.denySession('Sua conta foi autenticada, mas o perfil não pôde ser preparado. Confira as Rules e tente entrar novamente.', user);
      }
    }
  }

  private denySession(message: string, user?: AuthIdentity): void {
    ++this.version;
    this.stopProfile();
    this.clearTimeout();
    this.setSession(user ? { ...user, role: null, roleId: null } : null);
    this.errorState.set(message);
  }

  private startTimeout(version: number, user?: AuthIdentity): void {
    this.clearTimeout();
    this.timeout = setTimeout(() => {
      if (version === this.version) this.denySession('A verificação da sessão demorou demais. Confira sua conexão e tente novamente.', user);
    }, 15_000);
  }

  private clearTimeout(): void {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
  }

  private stopProfile(): void {
    this.profileUnsubscribe?.();
    this.profileUnsubscribe = undefined;
  }

  private setSession(session: AuthSession | null | undefined): void {
    this.userState.set(session);
    this.sessionChanges.next(session);
  }
}

function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  switch (code) {
    case 'auth/invalid-email': return 'Informe um e-mail válido.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password': return 'E-mail ou senha inválidos.';
    case 'auth/email-already-in-use': return 'Este e-mail já possui uma conta. Use Entrar.';
    case 'auth/weak-password': return 'A senha deve ter pelo menos 6 caracteres.';
    case 'auth/too-many-requests': return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'auth/network-request-failed': return 'Não foi possível conectar. Confira sua conexão.';
    case 'auth/user-disabled': return 'Esta conta foi desativada.';
    case 'auth/popup-closed-by-user': return 'O acesso com Google foi cancelado.';
    case 'auth/popup-blocked': return 'O navegador bloqueou o popup. Permita popups para continuar.';
    case 'auth/account-exists-with-different-credential': return 'Este e-mail utiliza outro método de acesso. Entre com o método já cadastrado.';
    default: return 'Não foi possível autenticar. Confira os provedores habilitados no Firebase e tente novamente.';
  }
}
