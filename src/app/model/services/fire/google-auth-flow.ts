import { AuthIdentity } from '../../interfaces/Auth/auth-session';

export interface GoogleAuthOperations<User extends AuthIdentity> {
  currentUser(): User | null;
  googleLinked(user: User): boolean;
  signInPopup(): Promise<User>;
  linkPopup(user: User): Promise<User>;
  reauthenticatePopup(user: User): Promise<User>;
  signInRedirect(): Promise<void>;
  linkRedirect(user: User): Promise<void>;
  reauthenticateRedirect(user: User): Promise<void>;
  captureCollision(error: unknown): void;
}

export function authErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
}

export async function runGoogleAuth<User extends AuthIdentity>(operations: GoogleAuthOperations<User>): Promise<User | null> {
  const user = operations.currentUser();
  const linked = !!user && operations.googleLinked(user);
  try {
    return user
      ? linked ? await operations.reauthenticatePopup(user) : await operations.linkPopup(user)
      : await operations.signInPopup();
  } catch (error: unknown) {
    const code = authErrorCode(error);
    if (code === 'auth/account-exists-with-different-credential') operations.captureCollision(error);
    if (code !== 'auth/popup-blocked' && code !== 'auth/operation-not-supported-in-this-environment') throw error;
    if (user) {
      if (linked) await operations.reauthenticateRedirect(user);
      else await operations.linkRedirect(user);
    } else await operations.signInRedirect();
    return null;
  }
}

export async function linkPendingGoogleCredential<User extends AuthIdentity, Credential>(
  user: User, expectedEmail: string | null, credential: Credential | null,
  link: (user: User, credential: Credential) => Promise<User>
): Promise<User> {
  if (!credential || !expectedEmail || user.email?.toLowerCase() !== expectedEmail.toLowerCase()) return user;
  return link(user, credential);
}

export class AuthenticatedGoogleError extends Error {
  constructor(readonly code: string, readonly identity: AuthIdentity) {
    super('A conta foi autenticada, mas o Google não pôde ser vinculado.');
    this.name = 'AuthenticatedGoogleError';
  }
}
