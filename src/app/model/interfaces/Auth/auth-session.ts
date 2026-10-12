export const ADMIN_ROLE = 'admin';

export interface AuthIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerIds?: string[];
}

export interface UserAccessProfile {
  role: string | null;
  roleId: string | null;
  displayName?: string | null;
  contactEmail?: string | null;
}

export type AuthSession = AuthIdentity & UserAccessProfile;

export interface MemberProfileSeed {
  displayName: string;
  contactEmail: string;
  role: 'member';
  roleId: 'member';
}

export function isAuthenticatedSession(session: AuthSession | null | undefined): session is AuthSession {
  return typeof session?.uid === 'string' && !!session.uid.trim() && session.role === session.roleId &&
    (session.role === 'member' || session.role === ADMIN_ROLE);
}

export function isAdminSession(session: AuthSession | null | undefined): boolean {
  return isAuthenticatedSession(session) && session.role === ADMIN_ROLE;
}
