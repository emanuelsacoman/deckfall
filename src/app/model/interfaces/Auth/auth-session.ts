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
}

export interface AuthSession extends AuthIdentity, UserAccessProfile {}

export interface MemberProfileSeed {
  displayName: string;
  contactEmail: string;
  role: 'member';
  roleId: 'member';
}

export function isAdminSession(session: AuthSession | null | undefined): boolean {
  return session?.role === ADMIN_ROLE && session.roleId === ADMIN_ROLE;
}
