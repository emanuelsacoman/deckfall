// Exemplo exclusivo de emuladores: copie para environment.development.ts para testar localmente.
// Nenhum valor abaixo aponta para produção; não usar no environment.ts de produção.
export const environment = {
  production: false,
  firebaseEmulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-cardgame.firebaseapp.com',
    projectId: 'demo-cardgame',
    storageBucket: 'demo-cardgame.appspot.com',
    appId: 'demo-cardgame'
  }
};
