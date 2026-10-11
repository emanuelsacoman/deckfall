import { AuthIdentity } from '../../interfaces/Auth/auth-session';
import { PasswordAuthFlow, PasswordAuthOperations } from './password-auth-flow';

describe('PasswordAuthFlow', () => {
  const google: AuthIdentity = { uid: 'same-uid', email: 'owner@gmail.com', displayName: 'Owner', providerIds: ['google.com'] };
  const linked: AuthIdentity = { ...google, providerIds: ['google.com', 'password'] };
  let current: AuthIdentity | null;
  let operations: jasmine.SpyObj<PasswordAuthOperations<AuthIdentity>>;
  let flow: PasswordAuthFlow<AuthIdentity>;
  let now: number;

  beforeEach(() => {
    current = google;
    now = 1_000_000;
    operations = jasmine.createSpyObj<PasswordAuthOperations<AuthIdentity>>('password', [
      'currentUser', 'googleLinked', 'passwordLinked', 'reauthenticatePopup', 'reauthenticateRedirect', 'linkPassword'
    ]);
    operations.currentUser.and.callFake(() => current);
    operations.googleLinked.and.callFake(user => user.providerIds?.includes('google.com') ?? false);
    operations.passwordLinked.and.callFake(user => user.providerIds?.includes('password') ?? false);
    operations.reauthenticatePopup.and.resolveTo(google);
    operations.reauthenticateRedirect.and.resolveTo();
    operations.linkPassword.and.resolveTo(linked);
    flow = new PasswordAuthFlow(operations, () => now);
  });

  it('reauthenticates before linking a password to the same UID and Auth email', async () => {
    const order: string[] = [];
    operations.reauthenticatePopup.and.callFake(async () => { order.push('reauth'); return google; });
    operations.linkPassword.and.callFake(async () => { order.push('link'); return linked; });
    expect(await flow.addPassword('secret')).toEqual(linked);
    expect(order).toEqual(['reauth', 'link']);
    expect(operations.linkPassword).toHaveBeenCalledOnceWith(google, google.email!, 'secret');
  });

  it('never overwrites an already linked password or links without a Google account', async () => {
    current = linked;
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/password-already-linked' }));
    current = { ...google, providerIds: ['passwordless'] };
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/google-required' }));
    expect(operations.reauthenticatePopup).not.toHaveBeenCalled();
    expect(operations.linkPassword).not.toHaveBeenCalled();
  });

  it('redirects on a blocked popup without sending or retaining the password', async () => {
    operations.reauthenticatePopup.and.rejectWith({ code: 'auth/popup-blocked' });
    expect(await flow.addPassword('secret')).toBeNull();
    expect(operations.reauthenticateRedirect).toHaveBeenCalledOnceWith(google);
    expect(operations.linkPassword).not.toHaveBeenCalled();
    flow.acceptGoogleReauthentication(google, now);
    expect(await flow.addPassword('new-secret')).toEqual(linked);
    expect(operations.reauthenticatePopup).toHaveBeenCalledTimes(1);
    expect(operations.linkPassword).toHaveBeenCalledOnceWith(google, google.email!, 'new-secret');
  });

  it('uses fresh redirect proof only once and clears it after a linking failure', async () => {
    flow.acceptGoogleReauthentication(google, now);
    operations.linkPassword.and.rejectWith({ code: 'auth/credential-already-in-use' });
    await expectAsync(flow.addPassword('secret')).toBeRejected();
    expect(operations.reauthenticatePopup).not.toHaveBeenCalled();
    operations.linkPassword.and.resolveTo(linked);
    await flow.addPassword('secret');
    expect(operations.reauthenticatePopup).toHaveBeenCalledTimes(1);
  });

  it('rejects expired, future, mismatched and cleared redirect proofs', async () => {
    flow.acceptGoogleReauthentication(google, now - 5 * 60_000);
    await flow.addPassword('secret');
    flow.acceptGoogleReauthentication(google, now + 60_001);
    await flow.addPassword('secret');
    flow.acceptGoogleReauthentication({ ...google, uid: 'another-uid' }, now);
    await flow.addPassword('secret');
    flow.acceptGoogleReauthentication(google, now);
    flow.clear();
    await flow.addPassword('secret');
    flow.acceptGoogleReauthentication(google, now);
    now += 5 * 60_000;
    await flow.addPassword('secret');
    expect(operations.reauthenticatePopup).toHaveBeenCalledTimes(5);
  });

  it('does not redirect on cancellation or network error and never links after failed reauthentication', async () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/network-request-failed']) {
      operations.reauthenticatePopup.and.rejectWith({ code });
      await expectAsync(flow.addPassword('secret')).toBeRejectedWith({ code });
    }
    expect(operations.reauthenticateRedirect).not.toHaveBeenCalled();
    expect(operations.linkPassword).not.toHaveBeenCalled();
  });

  it('rejects an identity switch during Google reauthentication', async () => {
    operations.reauthenticatePopup.and.callFake(async () => {
      current = { ...google, uid: 'other' };
      return current;
    });
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/user-mismatch' }));
    expect(operations.linkPassword).not.toHaveBeenCalled();
  });

  it('rejects an Auth email change after reauthentication and an identity switch while linking', async () => {
    operations.reauthenticatePopup.and.callFake(async () => { current = { ...google, email: 'other@example.test' }; return google; });
    await expectAsync(flow.addPassword('secret')).toBeRejected();
    expect(operations.linkPassword).not.toHaveBeenCalled();
    current = google;
    operations.reauthenticatePopup.and.resolveTo(google);
    operations.linkPassword.and.callFake(async () => { current = { ...google, uid: 'other' }; return linked; });
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/user-mismatch' }));
  });

  it('captures identity fields before awaiting reauthentication even if the Auth object mutates', async () => {
    const mutable = { ...google };
    current = mutable;
    operations.reauthenticatePopup.and.callFake(async () => {
      mutable.email = 'changed@example.test';
      return mutable;
    });
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/user-mismatch' }));
    expect(operations.linkPassword).not.toHaveBeenCalled();
  });

  it('rejects short passwords, missing sessions and missing Auth emails before any operation', async () => {
    await expectAsync(flow.addPassword('short')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/weak-password' }));
    current = null;
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/no-current-user' }));
    current = { ...google, email: null };
    await expectAsync(flow.addPassword('secret')).toBeRejectedWith(jasmine.objectContaining({ code: 'auth/missing-email' }));
    expect(operations.reauthenticatePopup).not.toHaveBeenCalled();
    expect(operations.linkPassword).not.toHaveBeenCalled();
  });
});
