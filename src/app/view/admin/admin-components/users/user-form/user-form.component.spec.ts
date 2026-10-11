import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserProfile } from '../../../../../model/interfaces/Users/user-profile';
import { UserService } from '../../../../../model/services/cruds/users/user.service';
import { UserFormComponent } from './user-form.component';

describe('UserFormComponent', () => {
  let fixture: ComponentFixture<UserFormComponent>;
  let component: UserFormComponent;
  let users: jasmine.SpyObj<UserService>;
  let navigation: jasmine.Spy;
  const member: UserProfile = {
    uid: 'existing-user', displayName: 'Maria', contactEmail: 'maria@example.com',
    role: 'member', roleId: 'member', createdAt: null, updatedAt: null
  };

  beforeEach(async () => {
    users = jasmine.createSpyObj<UserService>('UserService', ['getByUid', 'create', 'update']);
    users.getByUid.and.resolveTo(member);
    users.create.and.resolveTo();
    users.update.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [UserFormComponent],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: users }
      ]
    }).compileComponents();
    navigation = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
  });

  it('rejects invalid UIDs and contact email while accepting an optional blank name and email', async () => {
    fixture.detectChanges();
    component.form.controls.uid.setValue('wrong/uid');
    await component.save();
    expect(users.create).not.toHaveBeenCalled();
    component.form.controls.uid.setValue(' new-user ');
    component.form.controls.contactEmail.setValue('invalid-email');
    await component.save();
    expect(users.create).not.toHaveBeenCalled();
    component.form.controls.contactEmail.setValue('');
    await component.save();
    expect(users.create).toHaveBeenCalledOnceWith('new-user', { displayName: '', contactEmail: '', role: 'member' });
    expect(navigation).toHaveBeenCalledWith(['/admin/usuarios/lista'], {
      state: { userFeedback: 'Perfil vinculado com sucesso.' }
    });
  });

  it('loads persisted information and keeps the original UID when updating', async () => {
    await loadMember();
    expect(component.form.getRawValue()).toEqual({
      uid: member.uid, displayName: 'Maria', contactEmail: 'maria@example.com', role: 'member'
    });
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#user-uid')!;
    expect(input.readOnly).toBeTrue();
    component.form.controls.uid.setValue('tampered-other-user');
    component.form.controls.displayName.setValue(' Maria revisada ');
    component.form.controls.contactEmail.setValue(' contato@example.com ');
    await component.save();
    expect(users.update).toHaveBeenCalledOnceWith(member.uid, {
      displayName: 'Maria revisada', contactEmail: 'contato@example.com', role: 'member'
    }, member);
  });

  it('requires confirmation before promoting another user and respects cancellation', async () => {
    await loadMember();
    component.form.controls.role.setValue('admin');
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    await component.save();
    expect(confirm).toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    confirm.and.returnValue(true);
    await component.save();
    expect(users.update).toHaveBeenCalledOnceWith(member.uid, jasmine.objectContaining({ role: 'admin' }), member);
  });

  it('requires confirmation before linking a new administrative profile', async () => {
    fixture.detectChanges();
    component.form.controls.uid.setValue('new-admin');
    component.form.controls.role.setValue('admin');
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    await component.save();
    expect(users.create).not.toHaveBeenCalled();
    confirm.and.returnValue(true);
    await component.save();
    expect(users.create).toHaveBeenCalledOnceWith('new-admin', jasmine.objectContaining({ role: 'admin' }));
  });

  it('requires confirmation before removing another administrator’s access', async () => {
    const admin: UserProfile = { ...member, role: 'admin', roleId: 'admin' };
    users.getByUid.and.resolveTo(admin);
    await loadMember();
    component.form.controls.role.setValue('member');
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    await component.save();
    expect(confirm.calls.mostRecent().args[0]).toContain('remover');
    expect(users.update).not.toHaveBeenCalled();
    confirm.and.returnValue(true);
    await component.save();
    expect(users.update).toHaveBeenCalledOnceWith(member.uid, jasmine.objectContaining({ role: 'member' }), admin);
  });

  it('edits profile data without an authentication provider', async () => {
    const admin: UserProfile = { ...member, uid: 'owner', role: 'admin', roleId: 'admin' };
    users.getByUid.and.resolveTo(admin);
    await loadMember(admin.uid);
    component.form.controls.displayName.setValue('Nome atualizado');
    await component.save();
    expect(users.update).toHaveBeenCalledOnceWith(admin.uid, {
      displayName: 'Nome atualizado', contactEmail: 'maria@example.com', role: 'admin'
    }, admin);
  });

  it('requires an explicit role choice for an inconsistent legacy profile', async () => {
    const inconsistent: UserProfile = { ...member, roleId: 'admin' };
    users.getByUid.and.resolveTo(inconsistent);
    await loadMember();
    expect(component.form.controls.role.value).toBeNull();
    expect(component.inconsistentRole()).toBeTrue();
    await component.save();
    expect(users.update).not.toHaveBeenCalled();
    component.form.controls.role.setValue('member');
    spyOn(window, 'confirm').and.returnValue(true);
    await component.save();
    expect(users.update).toHaveBeenCalledOnceWith(member.uid, jasmine.objectContaining({ role: 'member' }), inconsistent);
  });

  it('shows a reload action after a stale-version update fails', async () => {
    await loadMember();
    users.update.and.rejectWith(new Error('O perfil mudou em outra sessão. Recarregue antes de salvar.'));
    await component.save();
    fixture.detectChanges();
    expect(component.saveError()).toContain('outra sessão');
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const reload = buttons.find(button => button.textContent?.includes('Recarregar perfil'));
    expect(reload).toBeDefined();
    reload!.click();
    await fixture.whenStable();
    expect(component.saveError()).toBe('');
    expect(users.getByUid).toHaveBeenCalledTimes(2);
  });

  async function loadMember(uid = member.uid): Promise<void> {
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('uid', uid);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
});
