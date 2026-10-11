const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
process.chdir(__dirname);

const appDir = './src/app';
const srcDir = './src';
const envDir = './src/environments';
const angularJsonPath = './angular.json';
const firebaseJsonPath = './firebase.json';

// Estrutura de pastas
const structure = [
  `${appDir}/view`,
  `${appDir}/model`,
  `${appDir}/model/interfaces`,
  `${appDir}/model/services`,
  `${appDir}/assets`,
  `${srcDir}/assets/images`
];

// Conteúdo do .gitignore
const gitignoreContent = `# Arquivos de configuração específicos do ambiente
.env

# Arquivos de log ou de saída de depuração
*.log
*.log.*
*.out
*.err
*.dump

# Pastas de build ou de compilação
/build
/dist
/obj

# Arquivos temporários ou de cache
*.tmp
*.temp
*.bak
*.old

# Arquivos de backup ou de cópia de segurança
*.backup

# Arquivos de sistema operacional ou de IDE
.DS_Store
.idea
*.sublime-workspace
*.suo

# Pastas de node_modules
node_modules/
!node_modules/*

# Pastas de environments
environments/
!environments/*

# Arquivos e pastas ocultos
.*/
*/.*/

# Firebase
.firebase
*-debug.log
.runtimeconfig.json
`;

// Conteúdo do robots.txt
const robotsContent = `User-agent: *
Disallow:

Sitemap: https://cafesacoman.com.br/sitemap.xml

User-agent: Googlebot
Allow: /

User-agent: Googlebot-News
Allow: /

User-agent: Googlebot-Image/1.0
Allow: /

User-agent: Googlebot-Video/1.0
Allow: /

User-agent: SAMSUNG-SGH-E250/1.0 Profile/MIDP-2.0 Configuration/CLDC-1.1 UP.Browser/6.2.3.3.c.1.101 (GUI) MMP/2.0 (compatible; Googlebot-Mobile/2.1;+http://www.google.com/bot.html)
Allow: /

User-agent: Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)
Allow: /

User-agent: (compatible; Mediapartners-Google/2.1; +http://www.google.com/bot.html)
Allow: /

User-agent: Mediapartners-Google
Allow: /

User-agent: AdsBot-Google (+http://www.google.com/adsbot.html)
Allow: /

User-agent: AdsBot-Google-Mobile-Apps
Allow: /
`;

// Conteúdo do sitemap.xml
const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <url>
    <loc>https://cafesacoman.com.br/</loc>
    <lastmod>2025-01-11</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
`;

// Criação das pastas
structure.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Criada pasta: ${dir}`);
  } else {
    console.log(`✅ Já existe: ${dir}`);
  }
});

// Atualizar .gitignore
fs.writeFileSync(path.join('./', '.gitignore'), gitignoreContent, 'utf8');
console.log('📝 .gitignore atualizado na raiz do projeto');

// Criar robots.txt e sitemap.xml
fs.writeFileSync(path.join(srcDir, 'robots.txt'), robotsContent, 'utf8');
console.log('📝 robots.txt criado em src/');
fs.writeFileSync(path.join(srcDir, 'sitemap.xml'), sitemapContent, 'utf8');
console.log('📝 sitemap.xml criado em src/');

// Atualizar angular.json
if (fs.existsSync(angularJsonPath)) {
  const angularJson = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));
  const projectName = Object.keys(angularJson.projects)[0];
  const buildOptions = angularJson.projects[projectName].architect.build.options;

  // Atualizar assets
  const assetsArray = buildOptions.assets;
  const addIfMissing = (p) => {
    if (!assetsArray.includes(p)) {
      assetsArray.push(p);
      console.log(`⚙️ Adicionado ao angular.json: ${p}`);
    }
  };
  addIfMissing('src/robots.txt');
  addIfMissing('src/sitemap.xml');

  // Atualizar budgets
  const budgets = angularJson.projects[projectName].architect.build.configurations?.production?.budgets
    || buildOptions.budgets;

  if (budgets && Array.isArray(budgets)) {
    budgets.forEach((b) => {
      if (b.type === 'initial' || b.type === 'anyComponentStyle') {
        b.maximumWarning = '2mb';
        b.maximumError = '4mb';
      }
    });
    console.log('💾 Budgets atualizados para 2mb/4mb');
  }

  // Salvar angular.json
  fs.writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2), 'utf8');
  console.log('✅ angular.json atualizado com assets e budgets');
} else {
  console.warn('⚠️ Arquivo angular.json não encontrado.');
}

// Instalar versoes compativeis com Angular 18.
try {
  console.log('Verificando a instalacao do Firebase e AngularFire...');
  execSync('npm install firebase@^10.14.1 --prefer-dedupe @angular/fire@^18.0.1 --no-audit --no-fund', { stdio: 'inherit' });
  execSync('npm ls firebase @angular/fire --depth=0', { stdio: 'inherit' });
} catch (err) {
  console.error('Erro ao instalar Firebase:', err.message);
  process.exit(1);
}

// ✅ Garantir que app.config.ts tenha o conteúdo desejado
const appConfigPath = path.join(appDir, 'app.config.ts');
const appConfigContent = `import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes), 
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth())
  ]
};
`;

try {
  if (!fs.existsSync(appConfigPath)) fs.writeFileSync(appConfigPath, appConfigContent, 'utf8');
  console.log('🧩 app.config.ts atualizado com configuração Firebase.');
} catch (err) {
  console.error('⚠️ Erro ao escrever app.config.ts:', err.message);
}

// ✅ Criar ou atualizar environments
const envContent = `export const environment = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
  },
  production: true,
};
`;

try {
  if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true });
  if (!fs.existsSync(path.join(envDir, 'environment.ts'))) fs.writeFileSync(path.join(envDir, 'environment.ts'), envContent, 'utf8');
  if (!fs.existsSync(path.join(envDir, 'environment.development.ts'))) fs.writeFileSync(path.join(envDir, 'environment.development.ts'), envContent.replace('production: true', 'production: false'), 'utf8');
  console.log('🌿 environments preenchidos com estrutura Firebase.');
} catch (err) {
  console.error('⚠️ Erro ao gerar environments:', err.message);
}

const firebaseJson = fs.existsSync(firebaseJsonPath) ? JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8')) : {};
delete firebaseJson.rewrites;
if (!firebaseJson.hosting) firebaseJson.hosting = {
  public: 'dist/card-game/browser',
  ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
  rewrites: [{ source: '**', destination: '/index.html' }]
};
fs.writeFileSync(firebaseJsonPath, JSON.stringify(firebaseJson, null, 2) + '\n', 'utf8');
console.log('Firebase configurado. Configuracoes existentes foram preservadas.');
