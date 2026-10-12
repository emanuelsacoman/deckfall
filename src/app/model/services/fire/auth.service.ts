import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import {
  createUserWithEmailAndPassword, EmailAuthProvider, GoogleAuthProvider, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile,
  getRedirectResult, getIdTokenResult, linkWithPopup, linkWithRedirect, linkWithCredential,
  reauthenticateWithPopup, reauthenticateWithRedirect, sendPasswordResetEmail, OAuthCredential, User
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { BehaviorSubject, filter, firstValueFrom, take } from 'rxjs';
import {
  AuthIdentity, AuthSession, isAdminSession, isAuthenticatedSession, MemberProfileSeed, UserAccessProfile
} from '../../interfaces/Auth/auth-session';
import { AuthenticatedGoogleError, authErrorCode, linkPendingGoogleCredential, runGoogleAuth } from './google-auth-flow';
import { PasswordAuthFlow } from './password-auth-flow';

export interface AuthRedirectResult {
  identity: AuthIdentity;
  operationType: 'signIn' | 'link' | 'reauthenticate';
}

export interface AuthSessionClient {
  observeAuth(next: (user: AuthIdentity | null) => void, error: () => void): () => void;
  observeProfile(uid: string, next: (profile: UserAccessProfile) => void, error: () => void): () => void;
  ensureProfile(user: AuthIdentity, seed: MemberProfileSeed): Promise<void>;
  login(email: string, password: string): Promise<AuthIdentity>;
  register(email: string, password: string, displayName: string): Promise<AuthIdentity>;
  loginWithGoogle(): Promise<AuthIdentity | null>;
  addPassword(password: string): Promise<AuthIdentity | null>;
  sendPasswordReset(email: string): Promise<void>;
  redirectResult(): Promise<AuthRedirectResult | null>;
  logout(): Promise<void>;
}

export const AUTH_SESSION_CLIENT = new InjectionToken<AuthSessionClient>('Auth session client', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(Auth);
    const firestore = inject(Firestore);
    const google = new GoogleAuthProvider();
    let pendingCredential: OAuthCredential | null = null;
    let pendingEmail: string | null = null;
    const identity = (user: User): AuthIdentity => ({
      uid: user.uid, email: user.email, displayName: user.displayName,
      providerIds: user.providerData.map(provider => provider.providerId)
    });
    const passwordFlow = new PasswordAuthFlow<User>({
      currentUser: () => auth.currentUser,
      googleLinked: account => account.providerData.some(provider => provider.providerId === GoogleAuthProvider.PROVIDER_ID),
      passwordLinked: account => account.providerData.some(provider => provider.providerId === EmailAuthProvider.PROVIDER_ID),
      reauthenticatePopup: async account => (await reauthenticateWithPopup(account, google)).user,
      reauthenticateRedirect: account => reauthenticateWithRedirect(account, google),
      linkPassword: async (account, email, password) => (await linkWithCredential(account, EmailAuthProvider.credential(email, password))).user
    });
    const captureCollision = (error: unknown): void => {
      if (!(error instanceof FirebaseError) || authErrorCode(error) !== 'auth/account-exists-with-different-credential') return;
      pendingCredential = GoogleAuthProvider.credentialFromError(error);
      pendingEmail = typeof error.customData?.['email'] === 'string' ? error.customData['email'] : null;
    };
    return {
      observeAuth: (next, error) => onAuthStateChanged(auth, user => next(user ? identity(user) : null), error),
      observeProfile: (uid, next, error) => onSnapshot(doc(firestore, 'users', uid), snapshot => {
        const data = snapshot.data();
        next({
          role: typeof data?.['role'] === 'string' ? data['role'] : null,
          roleId: typeof data?.['roleId'] === 'string' ? data['roleId'] : null,
          displayName: typeof data?.['displayName'] === 'string' ? data['displayName'] : null,
          contactEmail: typeof data?.['contactEmail'] === 'string' ? data['contactEmail'] : null
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
      login: async (email, password) => {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        const credential = pendingCredential, expectedEmail = pendingEmail;
        pendingCredential = null; pendingEmail = null;
        try {
          return identity(await linkPendingGoogleCredential(user, expectedEmail, credential,
            async (account, value) => (await linkWithCredential(account, value)).user));
        } catch (error: unknown) {
          throw new AuthenticatedGoogleError(authErrorCode(error), identity(user));
        }
      },
      register: async (email, password, displayName) => {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(user, { displayName });
        return identity(user);
      },
      loginWithGoogle: async () => {
        passwordFlow.clear();
        pendingCredential = null; pendingEmail = null;
        const user = await runGoogleAuth({
          currentUser: () => auth.currentUser,
          googleLinked: account => account.providerData.some(provider => provider.providerId === GoogleAuthProvider.PROVIDER_ID),
          signInPopup: async () => (await signInWithPopup(auth, google)).user,
          linkPopup: async account => (await linkWithPopup(account, google)).user,
          reauthenticatePopup: async account => (await reauthenticateWithPopup(account, google)).user,
          signInRedirect: () => signInWithRedirect(auth, google),
          linkRedirect: account => linkWithRedirect(account, google),
          reauthenticateRedirect: account => reauthenticateWithRedirect(account, google),
          captureCollision
        });
        return user ? identity(user) : null;
      },
      addPassword: async password => {
        const user = await passwordFlow.addPassword(password);
        return user ? identity(user) : null;
      },
      sendPasswordReset: email => {
        auth.languageCode = 'pt-BR';
        return sendPasswordResetEmail(auth, email);
      },
      redirectResult: async () => {
        try {
          const result = await getRedirectResult(auth);
          if (result?.operationType === 'reauthenticate' && result.providerId === GoogleAuthProvider.PROVIDER_ID) {
            const token = await getIdTokenResult(result.user);
            passwordFlow.acceptGoogleReauthentication(result.user, Date.parse(token.authTime));
          }
          return result ? { identity: identity(result.user), operationType: result.operationType } : null;
        } catch (error: unknown) {
          captureCollision(error); throw error;
        }
      },
      logout: () => {
        passwordFlow.clear();
        pendingCredential = null; pendingEmail = null;
        return signOut(auth);
      }
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
  private resolvingUid: string | null = null;
  private identity: AuthIdentity | null = null;
  private accessProfile: UserAccessProfile | null = null;
  private readonly redirectSignInState = signal(false);
  readonly redirecting = signal(false);
  readonly googleError = signal<string | null>(null);

  readonly currentUser = this.userState.asReadonly();
  readonly completedSignInRedirect = this.redirectSignInState.asReadonly();
  readonly sessionError = this.errorState.asReadonly();
  readonly isAdmin = computed(() => isAdminSession(this.currentUser()));
  readonly isAuthenticated = computed(() => isAuthenticatedSession(this.currentUser()));
  readonly googleLinked = computed(() => this.currentUser()?.providerIds?.includes(GoogleAuthProvider.PROVIDER_ID) ?? false);
  readonly passwordLinked = computed(() => this.currentUser()?.providerIds?.includes(EmailAuthProvider.PROVIDER_ID) ?? false);

  constructor() {
    this.startTimeout(this.version);
    const unsubscribe = this.client.observeAuth(
      user => { void this.observeUser(user); },
      () => this.denySession('Não foi possível verificar a sessão. Entre novamente.')
    );
    void this.recoverRedirect();
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
    return this.authenticate(() => this.client.loginWithGoogle(), !!this.currentUser());
  }

  addPassword(password: string): Promise<void> {
    if (password.length < 6) return Promise.reject(new Error('A senha deve ter pelo menos 6 caracteres.'));
    if (!this.currentUser()) return Promise.reject(new Error('Entre com Google antes de adicionar uma senha.'));
    return this.authenticate(() => this.client.addPassword(password), true);
  }

  async sendPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Informe um e-mail válido.');
    try {
      await this.client.sendPasswordReset(normalizedEmail);
    } catch (error: unknown) {
      if (authErrorCode(error) === 'auth/user-not-found') return;
      throw new Error(authErrorMessage(error, 'Não foi possível enviar o e-mail de recuperação. Confira a configuração do Firebase e tente novamente.'));
    }
  }

  async logout(): Promise<void> {
    ++this.requestVersion;
    this.allowAuthenticatedEvents = false;
    this.redirecting.set(false); this.identity = null; this.resolvingUid = null;
    this.googleError.set(null);
    this.redirectSignInState.set(false);
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

  clearSignInRedirect(): void {
    this.redirectSignInState.set(false);
  }

  private async authenticate(action: () => Promise<AuthIdentity | null>, preserveSession = false): Promise<void> {
    const requestVersion = ++this.requestVersion;
    this.allowAuthenticatedEvents = false;
    this.redirecting.set(false);
    this.googleError.set(null);
    if (!preserveSession) { ++this.version; this.resolvingUid = null; this.stopProfile(); }
    this.errorState.set(null);
    if (!preserveSession) { this.setSession(undefined); this.startTimeout(this.version); }
    try {
      const user = await action();
      if (requestVersion !== this.requestVersion) {
        await this.client.logout();
        return;
      }
      if (!user) { this.redirecting.set(true); this.clearTimeout(); return; }
      await this.observeUser(user, true);
      await this.waitForSession();
      if (requestVersion === this.requestVersion) this.allowAuthenticatedEvents = true;
    } catch (error: unknown) {
      if (requestVersion === this.requestVersion) {
        if (error instanceof AuthenticatedGoogleError) {
          await this.observeUser(error.identity, true); await this.waitForSession();
          this.allowAuthenticatedEvents = true; this.errorState.set(authErrorMessage(error));
        } else if (preserveSession) {
          this.allowAuthenticatedEvents = true; this.errorState.set(authErrorMessage(error));
        } else this.denySession(authErrorMessage(error));
      }
      throw new Error(authErrorMessage(error));
    }
  }

  private async observeUser(user: AuthIdentity | null, explicitRequest = false): Promise<void> {
    if (!this.allowAuthenticatedEvents && user && !explicitRequest) return;
    if (user && this.resolvingUid === user.uid) { this.identity = user; return; }
    if (user && this.profileUnsubscribe && this.currentUser()?.uid === user.uid) {
      this.identity = user;
      const session = this.currentUser();
      if (session) this.setSession({ ...session, ...user, displayName: this.accessProfile?.displayName ?? user.displayName });
      return;
    }
    this.identity = user; this.resolvingUid = user?.uid ?? null;
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
      this.resolvingUid = null;
      this.profileUnsubscribe = this.client.observeProfile(user.uid, profile => {
        if (version !== this.version) return;
        this.clearTimeout();
        this.accessProfile = profile;
        const identity = this.identity?.uid === user.uid ? this.identity : user;
        const session: AuthSession = {
          ...identity, role: profile.role, roleId: profile.roleId,
          displayName: profile.displayName ?? identity.displayName, contactEmail: profile.contactEmail ?? null
        };
        this.setSession(session);
        this.errorState.set(isAuthenticatedSession(session) ? null : 'O perfil da sua conta não possui um papel válido. Tente entrar novamente ou contate um administrador.');
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
    this.resolvingUid = null;
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
    this.accessProfile = null;
  }

  private setSession(session: AuthSession | null | undefined): void {
    this.userState.set(session);
    this.sessionChanges.next(session);
  }

  private async recoverRedirect(): Promise<void> {
    const requestVersion = this.requestVersion;
    try {
      const result = await this.client.redirectResult();
      if (result && requestVersion === this.requestVersion) {
        await this.observeUser(result.identity, true);
        await this.waitForSession();
        if (requestVersion === this.requestVersion && result.operationType === 'signIn') this.redirectSignInState.set(true);
      }
    } catch (error: unknown) {
      if (requestVersion === this.requestVersion) this.googleError.set(authErrorMessage(error));
    }
  }
}

function authErrorMessage(error: unknown, fallback = 'Não foi possível autenticar. Confira os provedores habilitados no Firebase e tente novamente.'): string {
  const code = authErrorCode(error);
  switch (code) {
    case 'auth/invalid-email': return 'Informe um e-mail válido.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password': return 'E-mail ou senha inválidos.';
    case 'auth/email-already-in-use': return 'Este e-mail já possui uma conta. Use Entrar.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements': return 'A senha deve ter pelo menos 6 caracteres e atender à política de senhas do projeto.';
    case 'auth/too-many-requests': return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'auth/network-request-failed': return 'Não foi possível conectar. Confira sua conexão.';
    case 'auth/user-disabled': return 'Esta conta foi desativada.';
    case 'auth/popup-closed-by-user': return 'O acesso com Google foi cancelado.';
    case 'auth/popup-blocked': return 'O navegador bloqueou o popup. Permita popups para continuar.';
    case 'auth/account-exists-with-different-credential': return 'Este e-mail utiliza outro método de acesso. Entre com o método já cadastrado.';
    case 'auth/credential-already-in-use': return 'Esta credencial já está vinculada a outra conta. Entre pelo método existente; as contas não serão mescladas automaticamente.';
    case 'auth/provider-already-linked': return 'Este método de acesso já está vinculado à conta.';
    case 'auth/password-already-linked': return 'Esta conta já possui acesso por e-mail e senha. Use Esqueci minha senha para redefini-la.';
    case 'auth/no-current-user':
    case 'auth/google-required': return 'Entre com Google antes de adicionar uma senha.';
    case 'auth/missing-email': return 'Esta conta não possui um e-mail de autenticação para adicionar uma senha.';
    case 'auth/user-mismatch': return 'Selecione a conta Google vinculada à sessão atual.';
    case 'auth/requires-recent-login': return 'Entre novamente com o método atual antes de vincular outro método de acesso.';
    case 'auth/unauthorized-domain': return 'Este domínio não está autorizado no Firebase Authentication. Confira Authorized domains no Console.';
    case 'auth/operation-not-supported-in-this-environment': return 'Este ambiente não permite o acesso com Google. Abra o aplicativo em um navegador compatível.';
    default: return fallback;
  }
}
