import { USER_LIMITS, USER_ROLES, UserProfileInput } from '../../interfaces/Users/user-profile';

export function validateUserUid(uid: string): string {
  const value = uid.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new Error('Informe o UID da conta Firebase, com até 128 letras, números, _ ou -.');
  }
  return value;
}

export function validateUserProfile(input: UserProfileInput): UserProfileInput {
  const displayName = input.displayName.trim();
  const contactEmail = input.contactEmail.trim();
  if (displayName.length > USER_LIMITS.displayName) {
    throw new Error(`O nome deve ter até ${USER_LIMITS.displayName} caracteres.`);
  }
  if (contactEmail.length > USER_LIMITS.contactEmail ||
      (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
    throw new Error('Informe um e-mail de contato válido ou deixe o campo vazio.');
  }
  if (!USER_ROLES.includes(input.role)) throw new Error('Selecione um cargo válido.');
  return { displayName, contactEmail, role: input.role };
}
