import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserProfile } from '../../../../../model/interfaces/Users/user-profile';
import { UserService } from '../../../../../model/services/cruds/users/user.service';
import { UserListComponent } from './user-list.component';

describe('UserListComponent', () => {
  let fixture: ComponentFixture<UserListComponent>;
  let component: UserListComponent;
  let users: jasmine.SpyObj<UserService>;
  const profile: UserProfile = {
    uid: 'owner', displayName: '', contactEmail: '', role: 'admin', roleId: 'admin', createdAt: null, updatedAt: null
  };

  beforeEach(async () => {
    users = jasmine.createSpyObj<UserService>('UserService', ['list']);
    users.list.and.resolveTo([profile]);
    await TestBed.configureTestingModule({
      imports: [UserListComponent],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: users }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(UserListComponent);
    component = fixture.componentInstance;
  });

  it('displays a minimal bootstrap profile and unavailable metadata without authentication', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Nome não informado');
    expect(content).toContain('Não informado');
    expect(component.roleLabel(profile)).toBe('Administrador');
    expect(component.roleLabel({ ...profile, roleId: 'member' })).toBe('Papel inconsistente');
  });

  it('allows retry after a failed load and reports an empty profile list', async () => {
    users.list.and.rejectWith(new Error('Falha ao ler perfis.'));
    await component.load();
    expect(component.loading()).toBeFalse();
    expect(component.error()).toBe('Falha ao ler perfis.');
    users.list.and.resolveTo([]);
    await component.load();
    expect(component.error()).toBe('');
    expect(component.users()).toEqual([]);
  });

  it('ignores a late result from an obsolete list request', async () => {
    let resolveOld!: (profiles: UserProfile[]) => void;
    users.list.and.returnValue(new Promise(resolve => { resolveOld = resolve; }));
    const oldRequest = component.load();
    users.list.and.resolveTo([]);
    await component.load();
    resolveOld([profile]);
    await oldRequest;
    expect(component.users()).toEqual([]);
  });
});
