import { Timestamp } from '@angular/fire/firestore';

export const USER_ROLES = ['member', 'admin'] as const;
export type UserRole = typeof USER_ROLES[number];
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  member: 'Membro', admin: 'Administrador'
};
export const USER_LIMITS = { uid: 128, displayName: 120, contactEmail: 254 } as const;

export interface UserProfileInput {
  displayName: string;
  contactEmail: string;
  role: UserRole;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  contactEmail: string;
  role: string | null;
  roleId: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export function userProfileRole(profile: UserProfile): UserRole | null {
  return profile.role === profile.roleId && USER_ROLES.some(role => role === profile.role)
    ? profile.role as UserRole : null;
}
