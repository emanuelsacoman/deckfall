import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { UserProfile } from '../../../../../model/interfaces/Users/user-profile';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { PlayerCollectionService } from '../../../../../model/services/cruds/collection/player-collection.service';
import { UserService } from '../../../../../model/services/cruds/users/user.service';
import { UserEditComponent } from './user-edit.component';

describe('UserEditComponent collection integration', () => {
  const profile: UserProfile = { uid: 'member', displayName: 'Jogador', contactEmail: '', role: 'member', roleId: 'member', createdAt: null, updatedAt: null };
  let users: jasmine.SpyObj<UserService>;
  let collection: jasmine.SpyObj<PlayerCollectionService>;
  const params = new BehaviorSubject(convertToParamMap({ uid: 'member' }));

  beforeEach(() => {
    params.next(convertToParamMap({ uid: 'member' }));
    users = jasmine.createSpyObj<UserService>('UserService', ['getByUid']); users.getByUid.and.resolveTo(profile);
    collection = jasmine.createSpyObj<PlayerCollectionService>('PlayerCollectionService', ['listForUser']); collection.listForUser.and.resolveTo([]);
    TestBed.configureTestingModule({ imports: [UserEditComponent], providers: [provideRouter([]),
      { provide: UserService, useValue: users }, { provide: PlayerCollectionService, useValue: collection },
      { provide: CardService, useValue: { list: () => Promise.resolve([]) } },
      { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { paramMap: params.value } } }
    ] });
  });

  it('monta o gestor só depois de encontrar perfil usando a leitura do formulário', async () => {
    let resolve!: (value: UserProfile | null) => void;
    users.getByUid.and.returnValue(new Promise(complete => { resolve = complete; }));
    const fixture = TestBed.createComponent(UserEditComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-user-collection')).toBeNull();
    expect(collection.listForUser).not.toHaveBeenCalled();
    resolve(profile); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-user-collection')).not.toBeNull();
    expect(users.getByUid).toHaveBeenCalledOnceWith('member');
    expect(collection.listForUser).toHaveBeenCalledOnceWith('member');
  });

  it('não monta coleção para UID cujo perfil não existe', async () => {
    users.getByUid.and.resolveTo(null);
    const fixture = TestBed.createComponent(UserEditComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Perfil não encontrado');
    expect(fixture.nativeElement.querySelector('app-user-collection')).toBeNull();
    expect(collection.listForUser).not.toHaveBeenCalled();
  });

  it('remove gestor anterior enquanto carrega outra rota e não reaproveita UID inexistente', async () => {
    const fixture = TestBed.createComponent(UserEditComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable();
    expect(collection.listForUser).toHaveBeenCalledOnceWith('member');
    users.getByUid.and.resolveTo(null); params.next(convertToParamMap({ uid: 'missing' })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-user-collection')).toBeNull();
    await fixture.whenStable(); fixture.detectChanges();
    expect(collection.listForUser).toHaveBeenCalledTimes(1);
  });
});
