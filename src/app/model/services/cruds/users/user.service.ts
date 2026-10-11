import { Injectable, inject } from '@angular/core';
import {
  Firestore, Timestamp, collection, doc, getDocFromServer, getDocsFromServer,
  runTransaction, serverTimestamp
} from '@angular/fire/firestore';
import { UserProfile, UserProfileInput } from '../../../interfaces/Users/user-profile';
import { validateUserProfile, validateUserUid } from '../../tools/user-validation';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);

  async list(): Promise<UserProfile[]> {
    // Sem orderBy: perfis do bootstrap podem não conter nome nem timestamps.
    const snapshot = await getDocsFromServer(collection(this.firestore, 'users'));
    return snapshot.docs.map(item => this.profile(item.id, item.data()))
      .sort((a, b) => this.sortLabel(a).localeCompare(this.sortLabel(b), 'pt-BR'));
  }

  async getByUid(uid: string): Promise<UserProfile | null> {
    const id = validateUserUid(uid);
    const snapshot = await getDocFromServer(doc(this.firestore, 'users', id));
    return snapshot.exists() ? this.profile(snapshot.id, snapshot.data()) : null;
  }

  async create(uid: string, input: UserProfileInput): Promise<void> {
    const id = validateUserUid(uid);
    const value = validateUserProfile(input);
    const reference = doc(this.firestore, 'users', id);
    await runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists()) {
        throw new Error('Este UID já possui um perfil. Abra a edição para alterar seus dados.');
      }
      transaction.set(reference, {
        ...value, roleId: value.role,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    });
  }

  async update(uid: string, input: UserProfileInput, original: UserProfile): Promise<void> {
    const id = validateUserUid(uid);
    if (original.uid !== id) throw new Error('O UID do perfil não pode ser alterado.');
    const value = validateUserProfile(input);
    const reference = doc(this.firestore, 'users', id);
    await runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('Perfil não encontrado. Recarregue a lista.');
      const current = this.profile(id, snapshot.data());
      if (!this.sameVersion(original, current)) {
        throw new Error('O perfil mudou em outra sessão. Recarregue antes de salvar.');
      }
      transaction.update(reference, {
        ...value, roleId: value.role, updatedAt: serverTimestamp()
      });
    });
  }

  private profile(uid: string, data: Record<string, unknown>): UserProfile {
    return {
      uid,
      displayName: typeof data['displayName'] === 'string' ? data['displayName'] : '',
      contactEmail: typeof data['contactEmail'] === 'string' ? data['contactEmail'] : '',
      role: typeof data['role'] === 'string' ? data['role'] : null,
      roleId: typeof data['roleId'] === 'string' ? data['roleId'] : null,
      createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'] : null,
      updatedAt: data['updatedAt'] instanceof Timestamp ? data['updatedAt'] : null
    };
  }

  private sameVersion(a: UserProfile, b: UserProfile): boolean {
    const timestampsEqual = a.updatedAt === null
      ? b.updatedAt === null : b.updatedAt !== null && a.updatedAt.isEqual(b.updatedAt);
    return timestampsEqual && a.role === b.role && a.roleId === b.roleId &&
      a.displayName === b.displayName && a.contactEmail === b.contactEmail;
  }

  private sortLabel(profile: UserProfile): string {
    return profile.displayName || profile.contactEmail || profile.uid;
  }
}
