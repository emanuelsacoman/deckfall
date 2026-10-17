const { cpSync } = require('node:fs');
const { resolve } = require('node:path');

// Only generated build outputs are targets. No source copying, rewriting or deletion.
const targets = {
  production: resolve(__dirname, '../lib/gameplay'),
  test: resolve(__dirname, '../lib-test/src/gameplay'),
};
const target = Object.hasOwn(targets, process.argv[2]) ? targets[process.argv[2]] : undefined;
if (!target) throw new Error('Escolha production ou test para copiar o módulo compilado.');
cpSync(resolve(__dirname, '../../shared/gameplay/lib'), target, { recursive: true });
