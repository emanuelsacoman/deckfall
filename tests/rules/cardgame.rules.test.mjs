import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
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
