import { AuthIdentity } from '../../interfaces/Auth/auth-session';
import { authErrorCode } from './google-auth-flow';

type PasswordAccount = Pick<AuthIdentity, 'uid' | 'email'>;

export interface PasswordAuthOperations<User extends PasswordAccount> {
  currentUser(): User | null;
  googleLinked(user: User): boolean;
  passwordLinked(user: User): boolean;
  reauthenticatePopup(user: User): Promise<User>;
  reauthenticateRedirect(user: User): Promise<void>;
  linkPassword(user: User, email: string, password: string): Promise<User>;
}

export class PasswordAuthError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'PasswordAuthError'; }
}

/** Reauthentication proof is memory-only; a password never survives a redirect. */
export class PasswordAuthFlow<User extends PasswordAccount> {
  private proof: { uid: string; expiresAt: number } | null = null;

  constructor(private readonly operations: PasswordAuthOperations<User>, private readonly now = Date.now) {}

  clear(): void { this.proof = null; }

  acceptGoogleReauthentication(user: User, authenticatedAt: number): void {
    this.clear();
    const current = this.operations.currentUser();
    const now = this.now();
    if (Number.isFinite(authenticatedAt) && authenticatedAt <= now + 60_000 && authenticatedAt + 5 * 60_000 > now &&
      current?.uid === user.uid && this.operations.googleLinked(current) && !this.operations.passwordLinked(current)) {
      this.proof = { uid: current.uid, expiresAt: Math.min(authenticatedAt + 5 * 60_000, now + 5 * 60_000) };
    }
  }

  async addPassword(password: string): Promise<User | null> {
    if (password.length < 6) throw new PasswordAuthError('auth/weak-password');
    const user = this.operations.currentUser();
    if (!user) throw new PasswordAuthError('auth/no-current-user');
    if (!user.email) throw new PasswordAuthError('auth/missing-email');
    if (this.operations.passwordLinked(user)) throw new PasswordAuthError('auth/password-already-linked');
    if (!this.operations.googleLinked(user)) throw new PasswordAuthError('auth/google-required');
    const expected: PasswordAccount = { uid: user.uid, email: user.email };
    const email = user.email;

    const proven = this.proof?.uid === expected.uid && this.proof.expiresAt > this.now();
    this.clear();
    if (!proven) {
      try {
        const verified = await this.operations.reauthenticatePopup(user);
        if (verified.uid !== expected.uid) throw new PasswordAuthError('auth/user-mismatch');
      } catch (error: unknown) {
        const code = authErrorCode(error);
        if (code !== 'auth/popup-blocked' && code !== 'auth/operation-not-supported-in-this-environment') throw error;
        this.assertCurrent(expected);
        await this.operations.reauthenticateRedirect(user);
        return null;
      }
    }

    const current = this.assertCurrent(expected);
    if (this.operations.passwordLinked(current)) throw new PasswordAuthError('auth/password-already-linked');
    const linked = await this.operations.linkPassword(current, email, password);
    this.assertCurrent(expected);
    if (linked.uid !== expected.uid) throw new PasswordAuthError('auth/user-mismatch');
    return linked;
  }

  private assertCurrent(expected: PasswordAccount): User {
    const current = this.operations.currentUser();
    if (!current || current.uid !== expected.uid || current.email !== expected.email) {
      throw new PasswordAuthError('auth/user-mismatch');
    }
    return current;
  }
}
