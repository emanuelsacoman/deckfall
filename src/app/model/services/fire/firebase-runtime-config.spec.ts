import { FirebaseRuntimeConfiguration, shouldConnectFirebaseEmulators } from './firebase-runtime-config';

describe('Configuração isolada de emuladores Firebase', () => {
  const demo: FirebaseRuntimeConfiguration = { production: false, firebase: { projectId: 'demo-cardgame' }, firebaseEmulators: true };

  it('mantém o backend configurado por padrão, sem ativar emuladores pelo hostname', () => {
    expect(shouldConnectFirebaseEmulators({ production: false, firebase: { projectId: 'cardgame-6fdcb' } }, 'localhost')).toBeFalse();
    expect(shouldConnectFirebaseEmulators({ ...demo, firebaseEmulators: false }, 'localhost')).toBeFalse();
  });

  it('aceita somente demo explícito em origem local', () => {
    for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]']) expect(shouldConnectFirebaseEmulators(demo, hostname)).toBeTrue();
  });

  it('nega build de produção, projeto real e domínio hospedado mesmo com flag explícita', () => {
    expect(() => shouldConnectFirebaseEmulators({ ...demo, production: true }, 'localhost')).toThrowError(/produção/);
    expect(() => shouldConnectFirebaseEmulators({ ...demo, firebase: { projectId: 'cardgame-6fdcb' } }, 'localhost')).toThrowError(/demo-/);
    expect(() => shouldConnectFirebaseEmulators(demo, 'deckfall.web.app')).toThrowError(/localhost/);
  });
});
