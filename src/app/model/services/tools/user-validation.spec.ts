import { UserProfile, userProfileRole } from '../../interfaces/Users/user-profile';
import { validateUserProfile, validateUserUid } from './user-validation';

describe('Validação de perfis de usuários', () => {
  it('normaliza dados opcionais sem exigir nome no bootstrap', () => {
    expect(validateUserProfile({ displayName: '  ', contactEmail: '', role: 'admin' }))
      .toEqual({ displayName: '', contactEmail: '', role: 'admin' });
    expect(validateUserProfile({ displayName: ' Emanuel ', contactEmail: ' nome@example.com ', role: 'member' }).contactEmail)
      .toBe('nome@example.com');
  });

  it('recusa UID vazio, caminhos e excesso de caracteres', () => {
    expect(validateUserUid(' abc_DEF-123 ')).toBe('abc_DEF-123');
    for (const uid of ['', '../admin', 'users/admin', 'a'.repeat(129)]) {
      expect(() => validateUserUid(uid)).toThrow();
    }
  });

  it('recusa contato inválido e nomes acima do limite', () => {
    expect(() => validateUserProfile({ displayName: '', contactEmail: 'sem-email', role: 'member' })).toThrow();
    expect(() => validateUserProfile({ displayName: 'a'.repeat(121), contactEmail: '', role: 'member' })).toThrow();
  });

  it('perfis inconsistentes não são tratados como administrador', () => {
    const profile: UserProfile = {
      uid: 'owner', displayName: '', contactEmail: '', role: 'admin', roleId: 'member',
      createdAt: null, updatedAt: null
    };
    expect(userProfileRole(profile)).toBeNull();
    expect(userProfileRole({ ...profile, roleId: 'admin' })).toBe('admin');
    expect(userProfileRole({ ...profile, role: 'owner', roleId: 'owner' })).toBeNull();
  });
});
