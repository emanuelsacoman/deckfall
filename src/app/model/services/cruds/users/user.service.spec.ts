import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { UserProfile } from '../../../interfaces/Users/user-profile';
import { UserService } from './user.service';

describe('UserService', () => {
  it('impede trocar o UID do documento carregado sem depender de uma sessão', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: Firestore, useValue: {} }] });
    const original: UserProfile = {
      uid: 'owner', displayName: '', contactEmail: '', role: 'admin', roleId: 'admin',
      createdAt: null, updatedAt: null
    };
    await expectAsync(TestBed.inject(UserService).update('other', {
      displayName: '', contactEmail: '', role: 'admin'
    }, original)).toBeRejectedWithError('O UID do perfil não pode ser alterado.');
  });
});
