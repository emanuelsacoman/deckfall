// Copie para src/environments/environment.ts e environment.development.ts.
// Preencha somente a configuração pública do Web App no Firebase Console.
export const environment = {
  production: true, // false no arquivo de desenvolvimento
  firebaseEmulators: false, // true somente em localhost, production:false e projectId demo-
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};
