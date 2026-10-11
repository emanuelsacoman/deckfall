import { AuthIdentity } from '../../interfaces/Auth/auth-session';
import { GoogleAuthOperations, linkPendingGoogleCredential, runGoogleAuth } from './google-auth-flow';

describe('Google gateway popup/redirect decisions', () => {
  const user: AuthIdentity = { uid: 'existing-uid', email: 'account@example.test', displayName: 'Account' };
  let operations: jasmine.SpyObj<GoogleAuthOperations<AuthIdentity>>;

  beforeEach(() => {
    operations = jasmine.createSpyObj<GoogleAuthOperations<AuthIdentity>>('Google operations', [
      'currentUser', 'googleLinked', 'signInPopup', 'linkPopup', 'reauthenticatePopup',
      'signInRedirect', 'linkRedirect', 'reauthenticateRedirect', 'captureCollision'
    ]);
    operations.currentUser.and.returnValue(null); operations.googleLinked.and.returnValue(false);
    operations.signInPopup.and.resolveTo(user); operations.linkPopup.and.resolveTo(user);
    operations.reauthenticatePopup.and.resolveTo(user);
    operations.signInRedirect.and.resolveTo(); operations.linkRedirect.and.resolveTo(); operations.reauthenticateRedirect.and.resolveTo();
  });

  it('uses sign-in redirect only when the signed-out popup is blocked', async () => {
    operations.signInPopup.and.rejectWith({ code: 'auth/popup-blocked' });
    expect(await runGoogleAuth(operations)).toBeNull();
    expect(operations.signInRedirect).toHaveBeenCalledTimes(1);
    expect(operations.linkRedirect).not.toHaveBeenCalled();
  });

  it('links Google to the password account instead of signing into another UID', async () => {
    operations.currentUser.and.returnValue(user);
    expect(await runGoogleAuth(operations)).toBe(user);
    expect(operations.linkPopup).toHaveBeenCalledWith(user);
    expect(operations.signInPopup).not.toHaveBeenCalled();
    operations.linkPopup.and.rejectWith({ code: 'auth/popup-blocked' });
    expect(await runGoogleAuth(operations)).toBeNull();
    expect(operations.linkRedirect).toHaveBeenCalledWith(user);
    expect(operations.signInRedirect).not.toHaveBeenCalled();
  });

  it('reauthenticates an already-linked Google account, including supported redirect fallback', async () => {
    operations.currentUser.and.returnValue(user); operations.googleLinked.and.returnValue(true);
    expect(await runGoogleAuth(operations)).toBe(user);
    expect(operations.reauthenticatePopup).toHaveBeenCalledWith(user);
    expect(operations.linkPopup).not.toHaveBeenCalled();
    operations.reauthenticatePopup.and.rejectWith({ code: 'auth/operation-not-supported-in-this-environment' });
    expect(await runGoogleAuth(operations)).toBeNull();
    expect(operations.reauthenticateRedirect).toHaveBeenCalledWith(user);
    expect(operations.signInRedirect).not.toHaveBeenCalled();
  });

  it('does not redirect after cancellation, network failure or an account conflict', async () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/network-request-failed', 'auth/credential-already-in-use']) {
      const error = { code }; operations.signInPopup.and.rejectWith(error);
      await expectAsync(runGoogleAuth(operations)).toBeRejectedWith(error);
    }
    expect(operations.signInRedirect).not.toHaveBeenCalled();
    expect(operations.captureCollision).not.toHaveBeenCalled();
  });

  it('captures an account collision for explicit existing-method recovery without redirecting or merging', async () => {
    const error = { code: 'auth/account-exists-with-different-credential' };
    operations.signInPopup.and.rejectWith(error);
    await expectAsync(runGoogleAuth(operations)).toBeRejectedWith(error);
    expect(operations.captureCollision).toHaveBeenCalledWith(error);
    expect(operations.signInRedirect).not.toHaveBeenCalled(); expect(operations.linkPopup).not.toHaveBeenCalled();
  });

  it('propagates a redirect failure instead of pretending that fallback succeeded', async () => {
    operations.signInPopup.and.rejectWith({ code: 'auth/popup-blocked' });
    const error = { code: 'auth/unauthorized-domain' }; operations.signInRedirect.and.rejectWith(error);
    await expectAsync(runGoogleAuth(operations)).toBeRejectedWith(error);
  });

  it('links an in-memory pending credential only after password authentication of the matching email', async () => {
    const credential = { testCredential: true };
    const link = jasmine.createSpy('linkCredential').and.resolveTo(user);
    expect(await linkPendingGoogleCredential(user, 'ACCOUNT@example.test', credential, link)).toBe(user);
    expect(link).toHaveBeenCalledOnceWith(user, credential);
    link.calls.reset();
    await linkPendingGoogleCredential(user, 'different@example.test', credential, link);
    await linkPendingGoogleCredential(user, null, credential, link);
    expect(link).not.toHaveBeenCalled();
  });
});
