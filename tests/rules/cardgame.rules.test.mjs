import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { deleteObject, getBytes, listAll, ref, uploadBytes } from 'firebase/storage';

let env;
const card = (overrides = {}) => ({
  name: 'Dragão', slug: 'dragao', description: 'Carta de teste', rarity: 'rare',
  status: 'draft', art: null, attributes: [{ key: 'attack', label: 'Ataque', value: 92 }],
  setId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides
});
const user = (overrides = {}) => ({
  displayName: 'Pessoa', contactEmail: 'pessoa@example.com', role: 'member', roleId: 'member',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides
});
const canvas = (overrides = {}) => ({
  version: 1, width: 744, height: 1039,
  background: { kind: 'solid', color: '#ffffff', color2: '#000000', angle: 0, assetId: null },
  elements: [], assets: [], ...overrides
});
const template = (overrides = {}) => ({
  name: 'Fantasy Basic', canvas: canvas(), attributes: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides
});
const dbFor = (uid) => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const storageFor = (uid) => uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage();
const ownedEntry = (overrides = {}) => ({
  quantity: 2, firstAcquiredAt: serverTimestamp(), lastAcquiredAt: serverTimestamp(), ...overrides
});
const ownedRef = (db, uid = 'member', cardId = 'published') => doc(db, 'users', uid, 'collection', cardId);
const publishedPath = (cardId = 'published') => `published-cards/${cardId}/preview.png`;
const playerProfile = (overrides = {}) => ({
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), starterGrantedAt: serverTimestamp(), ...overrides
});
const packDefinition = (overrides = {}) => ({
  name: 'StarterPack', description: 'Pacote inicial', active: true, currentVersion: 1,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides
});
const packDefinitionVersion = (overrides = {}) => ({
  version: 1, cards: [{ cardId: 'published', quantity: 2 }], createdAt: serverTimestamp(), ...overrides
});
const playerPack = (overrides = {}) => ({
  packId: 'starter', definitionVersion: 1, source: 'starter', state: 'sealed',
  acquiredAt: serverTimestamp(), openedAt: null, ...overrides
});

async function seedPlayer(uid, overrides = {}) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'players', uid), playerProfile(overrides)));
}

async function seedPackDefinition(packId = 'starter', overrides = {}) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'packDefinitions', packId), packDefinition(overrides)));
}

async function seedPackVersion(packId = 'starter', version = '1', overrides = {}) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'packDefinitions', packId, 'versions', version), packDefinitionVersion(overrides)));
}

async function seedPack(uid = 'member', packInstanceId = 'starter-v1', overrides = {}) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users', uid, 'packs', packInstanceId), playerPack(overrides)));
}

async function seedOwned(uid = 'member', cardId = 'published', overrides = {}) {
  await env.withSecurityRulesDisabled(context => setDoc(ownedRef(context.firestore(), uid, cardId), ownedEntry(overrides)));
}

async function seedPreview(cardId) {
  await env.withSecurityRulesDisabled(context => uploadBytes(ref(context.storage(), publishedPath(cardId)), new Uint8Array([1, 2, 3]), { contentType: 'image/png' }));
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cardgame',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: await readFile('storage.rules', 'utf8') }
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/admin'), { role: 'admin', roleId: 'admin' }),
      setDoc(doc(db, 'users/member'), { role: 'member', roleId: 'member' }),
      setDoc(doc(db, 'users/partial'), { role: 'admin', roleId: 'member' }),
      ...['draft', 'published', 'archived'].map((status) => setDoc(doc(db, `cards/${status}`), card({ status })))
    ]);
  });
});
after(async () => { if (env) await env.cleanup(); });

test('público lê apenas cartas published e precisa filtrar a consulta', async () => {
  const db = dbFor();
  await assertSucceeds(getDoc(doc(db, 'cards/published')));
  await assertFails(getDoc(doc(db, 'cards/draft')));
  await assertFails(getDoc(doc(db, 'cards/archived')));
  await assertFails(getDocs(collection(db, 'cards')));
  await assertSucceeds(getDocs(query(collection(db, 'cards'), where('status', '==', 'published'))));
});

test('perfil próprio é legível, mas membros não leem terceiros nem escrevem ou se promovem', async () => {
  const db = dbFor('member');
  await assertSucceeds(getDoc(doc(db, 'users/member')));
  await assertFails(getDoc(doc(db, 'users/admin')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(updateDoc(doc(db, 'users/member'), { role: 'admin', roleId: 'admin' }));
  await assertFails(updateDoc(doc(db, 'users/member'), { displayName: 'Editado', contactEmail: '', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/admin'), { displayName: 'Inválido', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(dbFor('new-user'), 'users/new-user'), user({ role: 'admin', roleId: 'admin' })));
  await assertFails(setDoc(doc(db, 'users/new-user'), user()));
  await assertFails(deleteDoc(doc(db, 'users/member')));
});

test('anônimo e perfil inconsistente não administram perfis', async () => {
  for (const uid of [undefined, 'partial']) {
    const db = dbFor(uid);
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(getDoc(doc(db, 'users/admin')));
    await assertFails(setDoc(doc(db, 'users/new-user'), user()));
    await assertFails(updateDoc(doc(db, 'users/member'), { ...user({ role: 'admin', roleId: 'admin' }) }));
    await assertFails(deleteDoc(doc(db, 'users/member')));
  }
});

test('cadastro cria somente perfil member próprio com e-mail do token, sem promover ou editar cargos', async () => {
  const db = env.authenticatedContext('registered', { email: 'registered@example.com' }).firestore();
  await assertSucceeds(setDoc(doc(db, 'users/registered'), user({ contactEmail: 'registered@example.com' })));
  await assertSucceeds(getDoc(doc(db, 'users/registered')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(updateDoc(doc(db, 'users/registered'), { role: 'admin', roleId: 'admin', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/registered'), { displayName: 'Alterado', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users/other'), user({ contactEmail: 'registered@example.com' })));
  await assertFails(setDoc(doc(db, 'cards/registered'), card()));
  const newDb = env.authenticatedContext('other-new', { email: 'new@example.com' }).firestore();
  await assertFails(setDoc(doc(newDb, 'users/other-new'), user({ role: 'admin', roleId: 'admin', contactEmail: 'new@example.com' })));
  await assertFails(setDoc(doc(newDb, 'users/other-new'), user({ contactEmail: 'different@example.com' })));
  await assertFails(setDoc(doc(dbFor('without-email'), 'users/without-email'), user()));
});

test('admin lista, consulta, vincula e promove terceiros sem cadastro Auth no cliente', async () => {
  const db = dbFor('admin');
  await assertSucceeds(getDocs(collection(db, 'users')));
  await assertSucceeds(getDoc(doc(db, 'users/member')));
  await assertSucceeds(setDoc(doc(db, 'users/new-user'), user()));
  await assertSucceeds(updateDoc(doc(db, 'users/new-user'), {
    displayName: 'Outro administrador', role: 'admin', roleId: 'admin', updatedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(dbFor('new-user'), 'cards/promoted'), card()));
});

test('bootstrap mínimo aceita completar dados, mas não inventa createdAt nem permite auto-rebaixamento', async () => {
  const db = dbFor('admin');
  await assertSucceeds(updateDoc(doc(db, 'users/admin'), {
    displayName: '', contactEmail: '', role: 'admin', roleId: 'admin', updatedAt: serverTimestamp()
  }));
  const profile = await getDoc(doc(db, 'users/admin'));
  assert.equal(Object.hasOwn(profile.data(), 'createdAt'), false);
  await assertFails(updateDoc(doc(db, 'users/admin'), {
    role: 'member', roleId: 'member', updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, 'users/admin'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users/admin'), user({ role: 'admin', roleId: 'admin' })));
  await assertFails(deleteDoc(doc(db, 'users/admin')));
  await assertFails(deleteDoc(doc(db, 'users/member')));
});

test('Rules validam schema de users, papéis sincronizados, UID e timestamps imutáveis', async () => {
  const db = dbFor('admin');
  await assertSucceeds(setDoc(doc(db, 'users/valid-user'), user()));
  await assertSucceeds(updateDoc(doc(db, 'users/valid-user'), {
    displayName: 'Atualizado', contactEmail: '', updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, 'users/valid-user'), {
    createdAt: Timestamp.fromMillis(1), updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, 'users/valid-user'), { updatedAt: Timestamp.fromMillis(1) }));
  const invalid = [
    { role: 'admin', roleId: 'member' }, { role: 'owner', roleId: 'owner' },
    { displayName: 'x'.repeat(121) }, { contactEmail: 'x'.repeat(255) },
    { contactEmail: 'invalido' }, { contactEmail: 'email com espaço@example.com' },
    { contactEmail: 'email\t@example.com' }, { contactEmail: null },
    { password: 'not-a-real-password' }, { createdAt: Timestamp.fromMillis(1) }
  ];
  for (const override of invalid) {
    await assertFails(setDoc(doc(db, 'users/invalid-user'), user(override)));
    await assertFails(updateDoc(doc(db, 'users/valid-user'), { ...override, updatedAt: serverTimestamp() }));
  }
  await assertFails(setDoc(doc(db, 'users/invalid.uid'), user()));
  await assertFails(setDoc(doc(db, 'users/missing-timestamp'), {
    displayName: '', contactEmail: '', role: 'member', roleId: 'member', updatedAt: serverTimestamp()
  }));
});

test('rebaixamento por outro admin revoga imediatamente escrita de perfis, cartas e Storage', async () => {
  const db = dbFor('admin');
  await assertSucceeds(setDoc(doc(db, 'users/second-admin'), user({ role: 'admin', roleId: 'admin' })));
  const secondDb = dbFor('second-admin');
  const secondStorage = storageFor('second-admin');
  const object = ref(secondStorage, 'cards/draft/art/second.png');
  await assertSucceeds(uploadBytes(object, new Uint8Array([1]), { contentType: 'image/png' }));
  await assertSucceeds(updateDoc(doc(db, 'users/second-admin'), {
    role: 'member', roleId: 'member', updatedAt: serverTimestamp()
  }));
  await assertFails(getDocs(collection(secondDb, 'users')));
  await assertFails(updateDoc(doc(secondDb, 'users/second-admin'), {
    role: 'admin', roleId: 'admin', updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(secondDb, 'cards/revoked'), card()));
  await assertFails(updateDoc(doc(secondDb, 'cards/draft'), { name: 'Alterada', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(secondDb, 'cards/draft')));
  await assertFails(uploadBytes(ref(secondStorage, 'cards/draft/art/revoked.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(deleteObject(object));
  await assertFails(getBytes(object));
});

test('anônimo, membro e perfil inconsistente não escrevem cartas nem leem drafts', async () => {
  for (const uid of [undefined, 'member', 'partial']) {
    const db = dbFor(uid);
    await assertFails(setDoc(doc(db, 'cards/new'), card()));
    await assertFails(updateDoc(doc(db, 'cards/published'), { name: 'Alterada', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'cards/published')));
    await assertFails(getDoc(doc(db, 'cards/draft')));
  }
});

test('admin cria, lista, atualiza e exclui com timestamps do servidor', async () => {
  const db = dbFor('admin');
  await assertSucceeds(getDocs(collection(db, 'cards')));
  await assertSucceeds(setDoc(doc(db, 'cards/new'), card()));
  await assertSucceeds(updateDoc(doc(db, 'cards/new'), { status: 'published', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'cards/new'), { createdAt: Timestamp.fromMillis(1), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'cards/new'), { updatedAt: Timestamp.fromMillis(1) }));
  await assertSucceeds(deleteDoc(doc(db, 'cards/new')));
});

test('Rules validam campos, raridade, status e oito atributos com arte em criação/edição', async () => {
  const db = dbFor('admin');
  const attributes = Array.from({ length: 8 }, (_, index) => ({ key: `custom_${index}`, label: 'Customizado', value: index === 7 ? 100 : 0 }));
  const art = { storagePath: 'cards/valid/art/a.png', fileName: 'a.png', contentType: 'image/png', size: 5 * 1024 * 1024 };
  await assertSucceeds(setDoc(doc(db, 'cards/valid'), card({ attributes, art })));
  await assertSucceeds(updateDoc(doc(db, 'cards/valid'), { description: 'Atualizada', attributes, art, updatedAt: serverTimestamp() }));
  const invalid = [
    { name: '' }, { rarity: 'mythic' }, { status: 'public' }, { secret: true },
    { attributes: [...attributes, { key: 'extra', label: 'Extra', value: 1 }] },
    { attributes: attributes.map((value, index) => index === 7 ? { ...value, value: 101 } : value) },
    { attributes: [{ key: 'attack', label: 'Ataque', value: -1 }] },
    { attributes: [{ key: 'attack', label: 'Ataque', value: '92' }] },
    { art: { storagePath: 'users/admin/avatar.png', fileName: 'a.png', contentType: 'image/png', size: 10 } },
    { art: { storagePath: 'cards/invalid/art/a.svg', fileName: 'a.svg', contentType: 'image/svg+xml', size: 10 } }
  ];
  for (const override of invalid) await assertFails(setDoc(doc(db, 'cards/invalid'), card(override)));
});

test('canvas e atributos estendidos preservam limites, documentos antigos e orçamento de avaliação', async () => {
  const db = dbFor('admin');
  const attributes = Array.from({ length: 8 }, (_, index) => ({
    id: `attribute_${index}`, key: `custom_${index}`, label: 'Vida', value: 500,
    min: 0, max: 1000, icon: '♥', color: '#ff0000'
  }));
  const elements = Array.from({ length: 64 }, (_, index) => ({
    id: `element_${index}`, name: 'Forma', type: 'rect', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, opacity: 1, visible: true, locked: false,
    properties: {
      fill: '#ffffff', stroke: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 0,
      shadowOffsetX: 0, shadowOffsetY: 0, cornerRadius: 0, fillMode: 'solid', gradientColor: '#000000', gradientAngle: 0
    }
  }));
  const assets = Array.from({ length: 24 }, (_, index) => ({
    id: `asset_${index}`, storagePath: `cards/visual/assets/asset_${index}.png`, fileName: 'a.png', contentType: 'image/png', size: 1
  }));
  const visual = canvas({ elements, assets });
  const art = { storagePath: 'cards/visual/assets/asset_0.png', fileName: 'a.png', contentType: 'image/png', size: 1 };
  await assertSucceeds(setDoc(doc(db, 'cards/visual'), card({ canvas: visual, attributes, art, type: 'character', subtype: null, templateId: null })));
  await assertSucceeds(updateDoc(doc(db, 'cards/visual'), { canvas: visual, attributes, art, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'cards/legacy'), card()));
  for (const invalid of [
    canvas({ width: 2049 }), canvas({ version: 2 }), canvas({ elements: [...elements, elements[0]] }),
    canvas({ assets: [...assets, assets[0]] }), canvas({ background: 'invalid' })
  ]) await assertFails(setDoc(doc(db, 'cards/invalid-canvas'), card({ canvas: invalid })));
  for (const invalidAttribute of [
    { key: 'health', label: 'Vida', value: 1001, min: 0, max: 1000 },
    { key: 'health', label: 'Vida', value: 50, min: 100, max: 0 },
    { key: 'health', label: 'Vida', value: 50, min: -1000001, max: 100 },
    { key: 'health', label: 'Vida', value: 50, max: 1000001 },
    { key: 'health', label: 'Vida', value: 50, max: '100' }
  ]) await assertFails(setDoc(doc(db, 'cards/invalid-attribute'), card({ attributes: [invalidAttribute] })));
});

test('templates são exclusivos de admin, com canvas versionado e timestamps protegidos', async () => {
  const db = dbFor('admin');
  await assertSucceeds(setDoc(doc(db, 'cardTemplates/basic'), template()));
  await assertSucceeds(getDocs(collection(db, 'cardTemplates')));
  await assertSucceeds(updateDoc(doc(db, 'cardTemplates/basic'), { name: 'Editado', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'cardTemplates/basic'), { createdAt: Timestamp.fromMillis(1), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'cardTemplates/invalid'), template({ canvas: canvas({ width: 1 }) })));
  for (const uid of [undefined, 'member', 'partial']) {
    const blocked = dbFor(uid);
    await assertFails(getDoc(doc(blocked, 'cardTemplates/basic')));
    await assertFails(getDocs(collection(blocked, 'cardTemplates')));
    await assertFails(setDoc(doc(blocked, 'cardTemplates/new'), template()));
    await assertFails(deleteDoc(doc(blocked, 'cardTemplates/basic')));
  }
  await assertSucceeds(deleteDoc(doc(db, 'cardTemplates/basic')));
});

test('Storage permite admin com imagem válida e impede overwrite/leitura pública', async () => {
  const storage = storageFor('admin');
  const path = 'cards/draft/art/test.png';
  const object = ref(storage, path);
  await assertSucceeds(uploadBytes(object, new Uint8Array([1, 2, 3]), { contentType: 'image/png' }));
  await assertSucceeds(getBytes(object));
  await assertSucceeds(listAll(ref(storage, 'cards/draft/art')));
  await assertFails(uploadBytes(object, new Uint8Array([4]), { contentType: 'image/png' }));
  for (const uid of [undefined, 'member', 'partial']) {
    const blocked = ref(storageFor(uid), path);
    await assertFails(getBytes(blocked));
    await assertFails(listAll(ref(storageFor(uid), 'cards/draft/art')));
    await assertFails(uploadBytes(ref(storageFor(uid), 'cards/draft/art/forbidden.png'), new Uint8Array([1]), { contentType: 'image/png' }));
    await assertFails(deleteObject(blocked));
  }
  await assertSucceeds(deleteObject(object));
});

test('Storage rejeita SVG, arquivo vazio, tamanho excedido e caminhos indevidos', async () => {
  const storage = storageFor('admin');
  await assertFails(uploadBytes(ref(storage, 'cards/draft/art/a.svg'), new Uint8Array([1]), { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(storage, 'cards/draft/art/empty.png'), new Uint8Array(), { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(storage, 'cards/draft/art/large.png'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(storage, 'other/a.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(storage, 'cards/missing/art/a.png'), new Uint8Array([1]), { contentType: 'image/png' }));
});

test('admin pode limpar arquivo órfão mesmo depois da remoção do documento', async () => {
  const db = dbFor('admin');
  const object = ref(storageFor('admin'), 'cards/draft/art/orphan.png');
  await assertSucceeds(uploadBytes(object, new Uint8Array([1]), { contentType: 'image/png' }));
  await assertSucceeds(deleteDoc(doc(db, 'cards/draft')));
  await assertSucceeds(deleteObject(object));
});

test('assets de cartas e templates mantêm admin, proprietário existente e uploads imutáveis', async () => {
  const db = dbFor('admin');
  await assertSucceeds(setDoc(doc(db, 'cardTemplates/basic'), template()));
  for (const path of ['cards/draft/assets/new.png', 'templates/basic/assets/new.png']) {
    const object = ref(storageFor('admin'), path);
    await assertSucceeds(uploadBytes(object, new Uint8Array([1]), { contentType: 'image/png' }));
    await assertSucceeds(getBytes(object));
    await assertFails(uploadBytes(object, new Uint8Array([2]), { contentType: 'image/png' }));
    for (const uid of [undefined, 'member', 'partial']) {
      await assertFails(getBytes(ref(storageFor(uid), path)));
      await assertFails(deleteObject(ref(storageFor(uid), path)));
    }
    await assertSucceeds(deleteObject(object));
  }
  await assertFails(uploadBytes(ref(storageFor('admin'), 'templates/missing/assets/new.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(storageFor('admin'), 'cards/missing/assets/new.png'), new Uint8Array([1]), { contentType: 'image/png' }));
});

test('coleção: membro consulta e lista somente a própria; admin consulta qualquer perfil existente', async () => {
  await seedOwned();
  await seedOwned('admin');
  const memberDb = dbFor('member');
  const entry = await assertSucceeds(getDoc(ownedRef(memberDb)));
  assert.equal(entry.data().quantity, 2);
  assert.deepEqual(Object.keys(entry.data()).sort(), ['firstAcquiredAt', 'lastAcquiredAt', 'quantity']);
  await assertSucceeds(getDocs(collection(memberDb, 'users/member/collection')));
  await assertFails(getDoc(ownedRef(memberDb, 'admin')));
  await assertFails(getDocs(collection(memberDb, 'users/admin/collection')));
  await assertSucceeds(getDoc(ownedRef(dbFor('admin'))));
  await assertSucceeds(getDocs(collection(dbFor('admin'), 'users/member/collection')));
});

test('coleção: membro não concede, altera ou remove cartas, inclusive na própria coleção', async () => {
  await seedOwned();
  const db = dbFor('member');
  await assertFails(setDoc(ownedRef(db, 'member', 'draft'), ownedEntry()));
  await assertFails(setDoc(ownedRef(db), ownedEntry()));
  await assertFails(updateDoc(ownedRef(db), { quantity: 3, lastAcquiredAt: serverTimestamp() }));
  await assertFails(deleteDoc(ownedRef(db)));
  await assertFails(setDoc(ownedRef(db, 'admin'), ownedEntry()));
});

test('coleção: anônimo, perfil ausente ou inconsistente não lê nem escreve propriedade', async () => {
  for (const uid of [undefined, 'missing-profile', 'partial']) {
    if (uid) await seedOwned(uid);
    const db = dbFor(uid);
    const target = uid ?? 'member';
    await assertFails(getDoc(ownedRef(db, target)));
    await assertFails(getDocs(collection(db, `users/${target}/collection`)));
    await assertFails(setDoc(ownedRef(db, target), ownedEntry()));
    await assertFails(deleteDoc(ownedRef(db, target)));
  }
});

test('coleção: admin concede publicada, define quantidade total e remove sem excluir a carta global', async () => {
  const db = dbFor('admin');
  const reference = ownedRef(db);
  await assertSucceeds(setDoc(reference, ownedEntry()));
  const first = (await getDoc(reference)).data().firstAcquiredAt;
  await assertSucceeds(updateDoc(reference, { quantity: 3, lastAcquiredAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(reference, { quantity: 1, lastAcquiredAt: serverTimestamp() }));
  const current = (await getDoc(reference)).data();
  assert.equal(current.quantity, 1);
  assert.ok(current.firstAcquiredAt.isEqual(first));
  assert.ok(current.lastAcquiredAt.toMillis() >= first.toMillis());
  await assertSucceeds(deleteDoc(reference));
  assert.equal((await getDoc(reference)).exists(), false);
  assert.equal((await getDoc(doc(db, 'cards/published'))).exists(), true);
});

test('coleção: quantidade é inteira de 1 a 9999 e campos/timestamps são estritos', async () => {
  const db = dbFor('admin');
  for (const quantity of [0, -1, 1.5, 10000, '2', null]) {
    await assertFails(setDoc(ownedRef(db), ownedEntry({ quantity })));
  }
  await assertSucceeds(setDoc(ownedRef(db), ownedEntry({ quantity: 9999 })));
  for (const quantity of [0, -1, 1.5, 10000, '2', null]) {
    await assertFails(updateDoc(ownedRef(db), { quantity, lastAcquiredAt: serverTimestamp() }));
  }
  await assertFails(updateDoc(ownedRef(db), { cardId: 'published', lastAcquiredAt: serverTimestamp() }));
  await assertFails(updateDoc(ownedRef(db), { name: 'Duplicado', lastAcquiredAt: serverTimestamp() }));
  await assertFails(updateDoc(ownedRef(db), { firstAcquiredAt: Timestamp.fromMillis(1), lastAcquiredAt: serverTimestamp() }));
  await assertFails(updateDoc(ownedRef(db), { quantity: 2, lastAcquiredAt: Timestamp.fromMillis(1) }));
  await assertSucceeds(deleteDoc(ownedRef(db)));
  for (const fields of [
    { cardId: 'published' }, { favorite: true }, { firstAcquiredAt: Timestamp.fromMillis(1) },
    { lastAcquiredAt: Timestamp.fromMillis(1) }, { firstAcquiredAt: null }, { lastAcquiredAt: null }
  ]) await assertFails(setDoc(ownedRef(db), ownedEntry(fields)));
  await assertFails(setDoc(ownedRef(db), { quantity: 2, lastAcquiredAt: serverTimestamp() }));
});

test('coleção: admin não concede drafts, arquivadas, IDs ausentes ou UID sem perfil', async () => {
  const db = dbFor('admin');
  for (const cardId of ['draft', 'archived', 'missing']) {
    await assertFails(setDoc(ownedRef(db, 'member', cardId), ownedEntry()));
  }
  await assertFails(setDoc(ownedRef(db, 'missing-profile'), ownedEntry()));
  await assertFails(setDoc(ownedRef(db, 'invalid.uid'), ownedEntry()));
});

test('coleção: carta retirada permanece como propriedade legível, mas seus dados ficam protegidos', async () => {
  await seedOwned();
  const adminDb = dbFor('admin');
  const memberDb = dbFor('member');
  await assertSucceeds(updateDoc(doc(adminDb, 'cards/published'), { status: 'archived', updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(ownedRef(memberDb)));
  await assertFails(getDoc(doc(memberDb, 'cards/published')));
  await assertFails(updateDoc(ownedRef(adminDb), { quantity: 3, lastAcquiredAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(ownedRef(adminDb)));
  await seedOwned();
  await assertSucceeds(deleteDoc(doc(adminDb, 'cards/published')));
  await assertSucceeds(getDoc(ownedRef(memberDb)));
  await assertSucceeds(deleteDoc(ownedRef(adminDb)));
});

test('preview publicada: admin cria, lê, substitui PNG e exclui; jogador recebe os bytes finais', async () => {
  const adminObject = ref(storageFor('admin'), publishedPath());
  await assertSucceeds(uploadBytes(adminObject, new Uint8Array([1, 2, 3]), { contentType: 'image/png' }));
  await assertSucceeds(getBytes(adminObject));
  await assertSucceeds(uploadBytes(adminObject, new Uint8Array([4, 5]), { contentType: 'image/png' }));
  const memberBytes = await assertSucceeds(getBytes(ref(storageFor('member'), publishedPath())));
  assert.deepEqual([...new Uint8Array(memberBytes)], [4, 5]);
  await assertSucceeds(deleteObject(adminObject));
});

test('preview publicada: membro é somente leitor e anônimo/perfil inválido não acessam', async () => {
  await seedPreview('published');
  const memberObject = ref(storageFor('member'), publishedPath());
  await assertSucceeds(getBytes(memberObject));
  await assertFails(uploadBytes(memberObject, new Uint8Array([4]), { contentType: 'image/png' }));
  await assertFails(deleteObject(memberObject));
  for (const uid of [undefined, 'partial', 'missing-profile']) {
    const object = ref(storageFor(uid), publishedPath());
    await assertFails(getBytes(object));
    await assertFails(uploadBytes(object, new Uint8Array([4]), { contentType: 'image/png' }));
    await assertFails(deleteObject(object));
  }
  await assertFails(listAll(ref(storageFor('member'), 'published-cards')));
});

test('preview publicada: papel desconhecido, incompleto ou de tipo inválido falha fechado', async () => {
  const profiles = [
    ['unknown-role', { role: 'owner', roleId: 'owner' }],
    ['only-role', { role: 'member' }],
    ['only-role-id', { roleId: 'member' }],
    ['null-role', { role: null, roleId: null }],
    ['numeric-role', { role: 1, roleId: 1 }],
    ['opposite-role', { role: 'member', roleId: 'admin' }],
    ['empty-profile', {}]
  ];
  await seedPreview('published');
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [uid, profile] of profiles) await setDoc(doc(db, 'users', uid), profile);
  });
  for (const [uid] of profiles) {
    const object = ref(storageFor(uid), publishedPath());
    await assertFails(getBytes(object));
    await assertFails(uploadBytes(object, new Uint8Array([1]), { contentType: 'image/png' }));
    await assertFails(deleteObject(object));
  }
});

test('preview publicada: remoção ou inconsistência do perfil revoga novo download', async () => {
  await seedPreview('published');
  const object = ref(storageFor('member'), publishedPath());
  await assertSucceeds(getBytes(object));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users/member'), { roleId: 'admin' });
  });
  await assertFails(getBytes(object));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/member'), { role: 'member', roleId: 'member' });
  });
  await assertSucceeds(getBytes(object));
  await env.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), 'users/member'));
  });
  await assertFails(getBytes(object));
});

test('preview publicada: Nyra usa o UUID e o caminho final sem depender de email ou posse', async () => {
  const cardId = '46f5c359-0d1e-423e-911e-4ba592567405';
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'cards', cardId), card({ name: 'Nyra', status: 'published' }));
  });
  const path = `published-cards/${cardId}/preview.png`;
  const adminObject = ref(storageFor('admin'), path);
  const bytes = new Uint8Array([137, 80, 78, 71]);
  await assertSucceeds(uploadBytes(adminObject, bytes, { contentType: 'image/png' }));
  // Este membro não possui entrada de coleção, e o token não contém email.
  const memberBytes = await assertSucceeds(getBytes(ref(storageFor('member'), path)));
  assert.deepEqual(new Uint8Array(memberBytes), bytes);
  await assertSucceeds(getBytes(adminObject));
  await assertFails(getBytes(ref(storageFor(), path)));
  await assertFails(getBytes(ref(storageFor('partial'), path)));
  await assertFails(listAll(ref(storageFor('admin'), `published-cards/${cardId}`)));
});

test('preview publicada: draft, archived e carta ausente negam leitura mesmo com PNG retido', async () => {
  for (const cardId of ['draft', 'archived', 'missing']) {
    await seedPreview(cardId);
    await assertFails(getBytes(ref(storageFor('member'), publishedPath(cardId))));
    await assertFails(uploadBytes(ref(storageFor('admin'), publishedPath(cardId)), new Uint8Array([1]), { contentType: 'image/png' }));
    await assertSucceeds(deleteObject(ref(storageFor('admin'), publishedPath(cardId))));
  }
});

test('preview publicada: mudança de status/exclusão bloqueia novo download sem depender de cleanup', async () => {
  await seedPreview('published');
  const object = ref(storageFor('member'), publishedPath());
  await assertSucceeds(getBytes(object));
  const db = dbFor('admin');
  await assertSucceeds(updateDoc(doc(db, 'cards/published'), { status: 'draft', updatedAt: serverTimestamp() }));
  await assertFails(getBytes(object));
  await assertSucceeds(updateDoc(doc(db, 'cards/published'), { status: 'published', updatedAt: serverTimestamp() }));
  await assertSucceeds(getBytes(object));
  await assertSucceeds(deleteDoc(doc(db, 'cards/published')));
  await assertFails(getBytes(object));
  await assertSucceeds(deleteObject(ref(storageFor('admin'), publishedPath())));
});

test('preview publicada: PNG não vazio até 20 MiB; MIME, tamanho e caminho inválidos são recusados', async () => {
  const storage = storageFor('admin');
  const object = ref(storage, publishedPath());
  await assertSucceeds(uploadBytes(object, new Uint8Array(20 * 1024 * 1024), { contentType: 'image/png' }));
  await assertFails(uploadBytes(object, new Uint8Array(20 * 1024 * 1024 + 1), { contentType: 'image/png' }));
  await assertFails(uploadBytes(object, new Uint8Array(), { contentType: 'image/png' }));
  await assertFails(uploadBytes(object, new Uint8Array([1]), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storage, 'published-cards/published/other.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(storage, 'published-cards/invalid.id/preview.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await assertSucceeds(deleteObject(object));
});

test('assets editáveis de carta published permanecem admin-only apesar da preview disponível', async () => {
  await seedPreview('published');
  await assertSucceeds(getBytes(ref(storageFor('member'), publishedPath())));
  for (const path of ['cards/published/art/original.png', 'cards/published/assets/layer.png']) {
    const object = ref(storageFor('admin'), path);
    await assertSucceeds(uploadBytes(object, new Uint8Array([1]), { contentType: 'image/png' }));
    await assertSucceeds(getBytes(object));
    await assertFails(getBytes(ref(storageFor('member'), path)));
    await assertFails(uploadBytes(object, new Uint8Array([2]), { contentType: 'image/png' }));
    await assertSucceeds(deleteObject(object));
  }
});

test('players: membro com perfil válido lê somente o próprio estado e não lista jogadores', async () => {
  await seedPlayer('member');
  await seedPlayer('admin');
  const db = dbFor('member');
  const own = await assertSucceeds(getDoc(doc(db, 'players/member')));
  assert.deepEqual(Object.keys(own.data()).sort(), ['createdAt', 'starterGrantedAt', 'updatedAt']);
  assert.ok(own.data().starterGrantedAt instanceof Timestamp);
  await assertFails(getDoc(doc(db, 'players/admin')));
  await assertFails(getDoc(doc(db, 'players/other')));
  await assertFails(getDocs(collection(db, 'players')));
});

test('players: admin lê o próprio estado, consulta terceiros e lista sem permissão de escrita', async () => {
  await seedPlayer('member');
  await seedPlayer('admin');
  const db = dbFor('admin');
  await assertSucceeds(getDoc(doc(db, 'players/admin')));
  await assertSucceeds(getDoc(doc(db, 'players/member')));
  const players = await assertSucceeds(getDocs(collection(db, 'players')));
  assert.deepEqual(players.docs.map(item => item.id).sort(), ['admin', 'member']);
});

test('players: anônimo e perfis ausentes, inconsistentes ou de papel desconhecido não leem estado', async () => {
  const invalidProfiles = [
    ['unknown-role', { role: 'owner', roleId: 'owner' }],
    ['only-role', { role: 'member' }],
    ['only-role-id', { roleId: 'member' }],
    ['null-role', { role: null, roleId: null }]
  ];
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [uid, profile] of invalidProfiles) await setDoc(doc(db, 'users', uid), profile);
  });
  for (const uid of [undefined, 'missing-profile', 'partial', ...invalidProfiles.map(([uid]) => uid)]) {
    const target = uid ?? 'member';
    await seedPlayer(target);
    const db = dbFor(uid);
    await assertFails(getDoc(doc(db, 'players', target)));
    await assertFails(getDoc(doc(db, 'players/member')));
    await assertFails(getDocs(collection(db, 'players')));
  }
});

test('players: nenhum cliente cria, sobrescreve, marca, reseta ou exclui estado, inclusive admin', async () => {
  for (const uid of [undefined, 'member', 'admin', 'partial', 'missing-profile']) {
    const target = uid ?? 'member';
    await seedPlayer(target);
    const db = dbFor(uid);
    const own = doc(db, 'players', target);
    await assertFails(setDoc(doc(db, 'players', `${target}-new`), playerProfile()));
    await assertFails(setDoc(own, playerProfile()));
    await assertFails(updateDoc(own, { starterGrantedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(own, { starterGrantedAt: null, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(own, { starterGrantedAt: deleteField(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(own, { coins: 100, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(own));
    await assertFails(setDoc(doc(db, 'players/member'), playerProfile({ starterGrantedAt: null })));
  }
});

test('packs: membro lista e lê seus lacrados/abertos, sem acesso a outro UID', async () => {
  await seedPack();
  await seedPack('member', 'opened-v1', {
    state: 'opened', openedAt: serverTimestamp(),
    revealedCards: [{ cardId: 'published', name: 'Dragão', rarity: 'rare', quantity: 2 }]
  });
  await seedPack('admin');
  const db = dbFor('member');
  const sealed = await assertSucceeds(getDoc(doc(db, 'users/member/packs/starter-v1')));
  assert.equal(sealed.data().state, 'sealed');
  assert.equal(Object.hasOwn(sealed.data(), 'revealedCards'), false);
  const opened = await assertSucceeds(getDoc(doc(db, 'users/member/packs/opened-v1')));
  assert.equal(opened.data().revealedCards[0].quantity, 2);
  const packs = await assertSucceeds(getDocs(collection(db, 'users/member/packs')));
  assert.deepEqual(packs.docs.map(item => item.id).sort(), ['opened-v1', 'starter-v1']);
  await assertFails(getDoc(doc(db, 'users/admin/packs/starter-v1')));
  await assertFails(getDocs(collection(db, 'users/admin/packs')));
});

test('packs: admin lê e lista instâncias de perfis existentes sem escrita', async () => {
  await seedPack();
  await seedPack('admin');
  const db = dbFor('admin');
  await assertSucceeds(getDoc(doc(db, 'users/member/packs/starter-v1')));
  await assertSucceeds(getDocs(collection(db, 'users/member/packs')));
  await assertSucceeds(getDoc(doc(db, 'users/admin/packs/starter-v1')));
  await assertSucceeds(getDocs(collection(db, 'users/admin/packs')));
});

test('packs: anônimo, perfil ausente, inconsistente ou de papel desconhecido não acessam', async () => {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users/unknown-role'), { role: 'owner', roleId: 'owner' }));
  for (const uid of [undefined, 'partial', 'missing-profile', 'unknown-role']) {
    const target = uid ?? 'member';
    await seedPack(target);
    const db = dbFor(uid);
    await assertFails(getDoc(doc(db, `users/${target}/packs/starter-v1`)));
    await assertFails(getDocs(collection(db, `users/${target}/packs`)));
    await assertFails(getDoc(doc(db, 'users/member/packs/starter-v1')));
  }
});

test('packs: nenhum cliente cria, sobrescreve ou exclui instância, inclusive admin', async () => {
  for (const uid of [undefined, 'member', 'admin', 'partial', 'missing-profile']) {
    const target = uid ?? 'member';
    await seedPack(target);
    const db = dbFor(uid);
    const own = doc(db, `users/${target}/packs/starter-v1`);
    await assertFails(setDoc(doc(db, `users/${target}/packs/new-pack`), playerPack()));
    await assertFails(setDoc(own, playerPack()));
    await assertFails(deleteDoc(own));
    await assertFails(setDoc(doc(db, 'users/member/packs/injected'), playerPack()));
  }
});

test('packs: clientes não marcam opened, escolhem versão/cartas nem alteram resultado', async () => {
  for (const uid of ['member', 'admin']) {
    await seedPack(uid);
    await seedPack(uid, 'opened-v1', {
      state: 'opened', openedAt: serverTimestamp(),
      revealedCards: [{ cardId: 'published', name: 'Dragão', rarity: 'rare', quantity: 2 }]
    });
    const db = dbFor(uid);
    const sealed = doc(db, `users/${uid}/packs/starter-v1`);
    for (const mutation of [
      { state: 'opened', openedAt: serverTimestamp() }, { packId: 'other' }, { source: 'reward' },
      { definitionVersion: 2 }, { acquiredAt: serverTimestamp() },
      { revealedCards: [{ cardId: 'published', name: 'Escolhida', rarity: 'legendary', quantity: 9999 }] }
    ]) await assertFails(updateDoc(sealed, mutation));
    const opened = doc(db, `users/${uid}/packs/opened-v1`);
    await assertFails(updateDoc(opened, { state: 'sealed', openedAt: null, revealedCards: deleteField() }));
    await assertFails(updateDoc(opened, { revealedCards: [] }));
    await assertFails(updateDoc(opened, { 'revealedCards.0.quantity': 9999 }));
  }
});

test('packs: concessão de pack não libera coleção/player e caminhos extras seguem negados', async () => {
  await seedPack();
  await seedPlayer('member');
  const db = dbFor('member');
  await assertFails(setDoc(ownedRef(db), ownedEntry()));
  await assertFails(updateDoc(doc(db, 'players/member'), { starterGrantedAt: null }));
  await assertFails(setDoc(doc(db, 'users/member/packs/starter-v1/results/extra'), { quantity: 9999 }));
  await assertFails(getDocs(collection(db, 'users/member/packs/starter-v1/results')));
});

test('packDefinitions: admin cria, lê/lista e atualiza envelope preservando createdAt', async () => {
  const db = dbFor('admin');
  const definition = doc(db, 'packDefinitions/starter');
  await assertSucceeds(setDoc(definition, packDefinition()));
  const initial = (await assertSucceeds(getDoc(definition))).data();
  assert.deepEqual(Object.keys(initial).sort(), ['active', 'createdAt', 'currentVersion', 'description', 'name', 'updatedAt']);
  await assertSucceeds(getDocs(collection(db, 'packDefinitions')));
  await assertSucceeds(updateDoc(definition, { description: '', active: false, currentVersion: 2, updatedAt: serverTimestamp() }));
  const current = (await getDoc(definition)).data();
  assert.equal(current.currentVersion, 2);
  assert.ok(current.createdAt.isEqual(initial.createdAt));
  await assertFails(updateDoc(definition, { createdAt: Timestamp.fromMillis(1), updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(definition));
});

test('packDefinitions: membro/anônimo/perfil inválido não lê configuração nem versões', async () => {
  await seedPackDefinition();
  await seedPackVersion();
  for (const uid of [undefined, 'member', 'partial', 'missing-profile']) {
    const db = dbFor(uid);
    const definition = doc(db, 'packDefinitions/starter');
    const version = doc(db, 'packDefinitions/starter/versions/1');
    await assertFails(getDoc(definition));
    await assertFails(getDocs(collection(db, 'packDefinitions')));
    await assertFails(getDoc(version));
    await assertFails(getDocs(collection(db, 'packDefinitions/starter/versions')));
    await assertFails(setDoc(doc(db, 'packDefinitions/other'), packDefinition()));
    await assertFails(updateDoc(definition, { currentVersion: 2, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(definition));
    await assertFails(setDoc(doc(db, 'packDefinitions/starter/versions/2'), packDefinitionVersion({ version: 2 })));
    await assertFails(updateDoc(version, { cards: [] }));
    await assertFails(deleteDoc(version));
  }
});

test('packDefinitions: StarterPack pertence somente à definição starter e seu nome não pode mudar', async () => {
  const db = dbFor('admin');
  const starter = doc(db, 'packDefinitions/starter');
  for (const name of ['Starter Pack', 'starterpack', 'Starter', 'Outro pacote', ' StarterPack ']) {
    await assertFails(setDoc(starter, packDefinition({ name })));
  }
  await assertSucceeds(setDoc(starter, packDefinition()));
  for (const name of ['Starter Pack', 'starterpack', 'Outro pacote']) {
    await assertFails(updateDoc(starter, { name, updatedAt: serverTimestamp() }));
  }
  await assertSucceeds(updateDoc(starter, { name: 'StarterPack', description: 'Novo texto', active: false, updatedAt: serverTimestamp() }));
});

test('packDefinitions: outros pacotes não usam variantes do nome reservado StarterPack', async () => {
  const db = dbFor('admin');
  const other = doc(db, 'packDefinitions/other');
  const variants = ['StarterPack', 'starterpack', 'STARTERPACK', 'Starter Pack', ' StarterPack ',
    'starter_pack', 'Starter-Pack', '\tStarter\nPack\t', 'S_t-a r_t_e_r P_a_c_k',
    ...[0x000B, 0x00A0, 0x1680, 0x2000, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF]
      .map(codePoint => `Starter${String.fromCodePoint(codePoint)}Pack`)];
  for (const name of variants) await assertFails(setDoc(other, packDefinition({ name })));
  await assertSucceeds(setDoc(other, packDefinition({ name: 'Pacote de dragões' })));
  for (const name of variants) await assertFails(updateDoc(other, { name, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(other, { name: 'Pacote inicial de dragões', updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'packDefinitions/StarterPack'), packDefinition({ name: 'Outro pacote' })));
});

test('packDefinitions: definição e primeira versão podem ser criadas atomicamente por admin', async () => {
  const db = dbFor('admin');
  for (const [packId, name] of [['starter', 'StarterPack'], ['dragons', 'Pacote de dragões']]) {
    const definition = doc(db, 'packDefinitions', packId);
    const version = doc(db, 'packDefinitions', packId, 'versions', '1');
    await assertSucceeds(runTransaction(db, async transaction => {
      assert.equal((await transaction.get(definition)).exists(), false);
      assert.equal((await transaction.get(version)).exists(), false);
      transaction.set(definition, packDefinition({ name }));
      transaction.set(version, packDefinitionVersion());
    }));
    assert.equal((await getDoc(definition)).data().currentVersion, 1);
    assert.equal((await getDoc(version)).data().version, 1);
  }
});

test('packDefinitions: primeira versão inválida ou nome reservado indevido aborta o commit inteiro', async () => {
  const db = dbFor('admin');
  const invalidVersionBatch = writeBatch(db);
  invalidVersionBatch.set(doc(db, 'packDefinitions/invalid-version'), packDefinition({ name: 'Pacote teste' }));
  invalidVersionBatch.set(doc(db, 'packDefinitions/invalid-version/versions/1'), packDefinitionVersion({ cards: [] }));
  await assertFails(invalidVersionBatch.commit());
  assert.equal((await getDoc(doc(db, 'packDefinitions/invalid-version'))).exists(), false);
  const reservedBatch = writeBatch(db);
  reservedBatch.set(doc(db, 'packDefinitions/impostor'), packDefinition());
  reservedBatch.set(doc(db, 'packDefinitions/impostor/versions/1'), packDefinitionVersion());
  await assertFails(reservedBatch.commit());
  assert.equal((await getDoc(doc(db, 'packDefinitions/impostor/versions/1'))).exists(), false);
});

test('packDefinitions: campos exatos, tipos e limites de nome/descrição são exigidos', async () => {
  const db = dbFor('admin');
  const definition = doc(db, 'packDefinitions/generic');
  await assertSucceeds(setDoc(definition, packDefinition({ name: 'x'.repeat(120), description: 'x'.repeat(1000) })));
  for (const override of [
    { name: '' }, { name: null }, { name: 1 }, { name: 'x'.repeat(121) },
    { description: null }, { description: 1 }, { description: 'x'.repeat(1001) },
    { active: 'true' }, { active: 1 }, { active: null },
    { createdAt: null }, { createdAt: 'now' }, { updatedAt: null }, { updatedAt: 'now' },
    { updatedAt: Timestamp.fromMillis(1) }, { price: 1 }, { cards: [] }
  ]) {
    await assertFails(setDoc(definition, packDefinition(override)));
    await assertFails(updateDoc(definition, { updatedAt: serverTimestamp(), ...override }));
  }
  for (const field of ['name', 'description', 'active', 'currentVersion', 'createdAt', 'updatedAt']) {
    const missing = packDefinition();
    delete missing[field];
    await assertFails(setDoc(definition, missing));
    await assertFails(updateDoc(definition, { updatedAt: serverTimestamp(), [field]: deleteField() }));
  }
});

test('packDefinitions: currentVersion inteiro de 1 a 1000000 e IDs técnicos são exigidos', async () => {
  const db = dbFor('admin');
  const definition = doc(db, 'packDefinitions/starter');
  await assertSucceeds(setDoc(definition, packDefinition({ currentVersion: 1000000 })));
  for (const currentVersion of [0, -1, 1.5, 1000001, '1', null]) {
    await assertFails(setDoc(definition, packDefinition({ currentVersion })));
    await assertFails(updateDoc(definition, { currentVersion, updatedAt: serverTimestamp() }));
  }
  await assertSucceeds(setDoc(doc(db, 'packDefinitions/valid_ID-2'), packDefinition({ name: 'Pacote válido' })));
  await assertSucceeds(setDoc(doc(db, 'packDefinitions', 'x'.repeat(128)), packDefinition({ name: 'Outro pacote' })));
  for (const id of ['invalid.id', 'invalid id', 'x'.repeat(129)]) {
    await assertFails(setDoc(doc(db, 'packDefinitions', id), packDefinition({ name: 'Pacote de teste' })));
  }
});

test('packDefinitions: versões são criadas/listadas por admin e nunca atualizadas/excluídas', async () => {
  await seedPackDefinition();
  const db = dbFor('admin');
  const version = doc(db, 'packDefinitions/starter/versions/1');
  await assertSucceeds(setDoc(version, packDefinitionVersion()));
  const result = (await assertSucceeds(getDoc(version))).data();
  assert.deepEqual(Object.keys(result).sort(), ['cards', 'createdAt', 'version']);
  await assertSucceeds(getDocs(collection(db, 'packDefinitions/starter/versions')));
  await assertSucceeds(setDoc(doc(db, 'packDefinitions/starter/versions/2'), packDefinitionVersion({ version: 2 })));
  await assertFails(setDoc(version, packDefinitionVersion()));
  await assertFails(updateDoc(version, { cards: [{ cardId: 'published', quantity: 3 }] }));
  await assertFails(updateDoc(version, { version: 2 }));
  await assertFails(updateDoc(version, { createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(version));
  await assertFails(deleteDoc(doc(db, 'packDefinitions/starter')));
});

test('packDefinitions: versão exige definição existente e caminho decimal canônico igual ao campo', async () => {
  await seedPackDefinition();
  const db = dbFor('admin');
  await assertFails(setDoc(doc(db, 'packDefinitions/missing/versions/1'), packDefinitionVersion()));
  await assertSucceeds(setDoc(doc(db, 'packDefinitions/starter/versions/1000000'), packDefinitionVersion({ version: 1000000 })));
  for (const [path, version] of [
    ['01', 1], ['+1', 1], ['1.0', 1], ['two', 2], ['2', 1], ['0', 0], ['-1', -1],
    ['1.5', 1.5], ['1000001', 1000001], ['3', '3'], ['4', null]
  ]) await assertFails(setDoc(doc(db, 'packDefinitions/starter/versions', path), packDefinitionVersion({ version })));
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'packDefinitions/invalid.id'), packDefinition()));
  await assertFails(setDoc(doc(db, 'packDefinitions/invalid.id/versions/1'), packDefinitionVersion()));
});

test('packDefinitions: versão exige três campos exatos, data do servidor e lista de 1 a 25', async () => {
  await seedPackDefinition();
  const db = dbFor('admin');
  const version = doc(db, 'packDefinitions/starter/versions/1');
  for (const override of [
    { cards: [] }, { cards: null }, { cards: {} }, { cards: 'published' },
    { cards: Array.from({ length: 26 }, (_, index) => ({ cardId: `card_${index}`, quantity: 1 })) },
    { createdAt: null }, { createdAt: 'now' }, { createdAt: Timestamp.fromMillis(1) }, { updatedAt: serverTimestamp() }
  ]) await assertFails(setDoc(version, packDefinitionVersion(override)));
  for (const field of ['version', 'cards', 'createdAt']) {
    const missing = packDefinitionVersion();
    delete missing[field];
    await assertFails(setDoc(version, missing));
  }
  await assertSucceeds(setDoc(version, packDefinitionVersion({
    cards: Array.from({ length: 25 }, (_, index) => ({ cardId: `card_${index}`, quantity: 1 }))
  })));
});

test('packDefinitions: conteúdo profundo é revalidado pelo backend, sem liberar propriedade ao cliente', async () => {
  await seedPackDefinition();
  const adminDb = dbFor('admin');
  // Envelope administrativo aceito; initializePlayer/openPack devem rejeitar estes itens.
  await assertSucceeds(setDoc(doc(adminDb, 'packDefinitions/starter/versions/1'), packDefinitionVersion({
    cards: [{ cardId: 'draft', quantity: -1 }, { cardId: 'draft', quantity: 10000 }]
  })));
  await seedPack();
  await seedPlayer('member');
  const memberDb = dbFor('member');
  await assertFails(setDoc(ownedRef(memberDb), ownedEntry()));
  await assertFails(updateDoc(doc(memberDb, 'players/member'), { starterGrantedAt: null }));
  await assertFails(updateDoc(doc(memberDb, 'users/member/packs/starter-v1'), { state: 'opened' }));
});

test('starterCollections: domínio anterior fica integralmente negado, inclusive admin', async () => {
  const legacy = { active: true, version: 1, cards: [{ cardId: 'published', quantity: 2 }], updatedAt: serverTimestamp() };
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'starterCollections/default'), legacy));
  for (const uid of [undefined, 'member', 'admin', 'partial', 'missing-profile']) {
    const db = dbFor(uid);
    const reference = doc(db, 'starterCollections/default');
    await assertFails(getDoc(reference));
    await assertFails(getDocs(collection(db, 'starterCollections')));
    await assertFails(setDoc(doc(db, 'starterCollections/other'), legacy));
    await assertFails(updateDoc(reference, { version: 2, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(reference));
  }
});
