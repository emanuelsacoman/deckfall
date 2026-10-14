import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { AuthSession } from '../../../interfaces/Auth/auth-session';
import { PackOpenResult } from '../../../interfaces/Packs/player-pack';
import { AuthService } from '../../fire/auth.service';
import { PLAYER_PACK_CLIENT, PlayerPackDocument, PlayerPackService } from './player-pack.service';

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function startClientOperation(): Promise<void> {
  // Resolve waitForSession and then the service's auth boundary before inspection.
  await Promise.resolve();
  await Promise.resolve();
}

describe('PlayerPackService', () => {
  const member: AuthSession = { uid: 'player', email: null, displayName: 'Jogador', role: 'member', roleId: 'member' };
  const acquiredAt = Timestamp.fromMillis(1000);
  const openedAt = Timestamp.fromMillis(2000);
  const receipt: PackOpenResult = {
    packInstanceId: 'starter', alreadyOpened: false,
    revealedCards: [{ cardId: 'card-A', name: 'Aurora', rarity: 'rare', quantity: 2 }]
  };
  const sealed = (id = 'starter', extra: Record<string, unknown> = {}): PlayerPackDocument => ({
    id, data: { packId: 'starter', definitionVersion: 1, source: 'starter', state: 'sealed', acquiredAt, openedAt: null, ...extra }
  });
  const opened = (id = 'starter'): PlayerPackDocument => sealed(id, {
    state: 'opened', openedAt, revealedCards: receipt.revealedCards
  });
  let currentUser: ReturnType<typeof signal<AuthSession | null | undefined>>;
  let list: jasmine.Spy;
  let get: jasmine.Spy;
  let open: jasmine.Spy;
  let service: PlayerPackService;

  beforeEach(() => {
    currentUser = signal<AuthSession | null | undefined>(member);
    list = jasmine.createSpy('list').and.resolveTo([sealed()]);
    get = jasmine.createSpy('get').and.resolveTo(sealed());
    open = jasmine.createSpy('open').and.resolveTo(receipt);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { currentUser, waitForSession: () => Promise.resolve(currentUser()) } },
      { provide: PLAYER_PACK_CLIENT, useValue: { list, get, open } }
    ] });
    service = TestBed.inject(PlayerPackService);
    TestBed.flushEffects();
  });

  for (const role of ['member', 'admin'] as const) {
    it(`consulta somente o caminho da sessão ${role}`, async () => {
      currentUser.set({ ...member, role, roleId: role });
      const packs = await service.listCurrentUser();
      expect(list).toHaveBeenCalledOnceWith('player');
      expect(packs[0]).toEqual({ id: 'starter', ...sealed().data } as unknown as typeof packs[0]);
      expect(packs[0].revealedCards).toBeUndefined();
    });
  }

  it('retorna lista vazia sem criar um pacote', async () => {
    list.and.resolveTo([]);
    expect(await service.listCurrentUser()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it('ordena lacrados antes do histórico e aquisições mais recentes primeiro', async () => {
    list.and.resolveTo([opened('old'), sealed('older'), sealed('newer', { acquiredAt: Timestamp.fromMillis(1500) })]);
    expect((await service.listCurrentUser()).map(pack => pack.id)).toEqual(['newer', 'older', 'old']);
  });

  it('consulta a instância por ID e preserva versão concedida', async () => {
    get.and.resolveTo(sealed('starter', { definitionVersion: 2 }));
    expect((await service.getCurrentUser('starter'))?.definitionVersion).toBe(2);
    expect(get).toHaveBeenCalledOnceWith('player', 'starter');
  });

  it('distingue pacote ausente de falha de rede', async () => {
    get.and.resolveTo(null);
    expect(await service.getCurrentUser('starter')).toBeNull();
    get.and.rejectWith({ code: 'unavailable', message: 'SDK internals' });
    await expectAsync(service.getCurrentUser('starter')).toBeRejectedWithError(/Confira sua conexão/);
  });

  it('recupera snapshot de um opened pack sem chamar abertura', async () => {
    get.and.resolveTo(opened());
    const pack = await service.getCurrentUser('starter');
    expect(pack?.state).toBe('opened');
    expect(pack?.revealedCards).toEqual(receipt.revealedCards);
    expect(open).not.toHaveBeenCalled();
  });

  it('recusa identidade diferente no documento retornado', async () => {
    get.and.resolveTo(sealed('other'));
    await expectAsync(service.getCurrentUser('starter')).toBeRejectedWithError(/Não foi possível carregar/);
  });

  it('não consulta nem abre sem sessão/perfil válido', async () => {
    for (const session of [null, undefined, { ...member, roleId: 'admin' }, { ...member, role: null, roleId: null }]) {
      currentUser.set(session);
      await expectAsync(service.listCurrentUser()).toBeRejectedWithError(/perfil válido/);
      await expectAsync(service.getCurrentUser('starter')).toBeRejectedWithError(/perfil válido/);
      await expectAsync(service.openCurrentUser('starter')).toBeRejectedWithError(/perfil válido/);
    }
    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('recusa ID inválido antes de ler dados ou chamar a Function', async () => {
    for (const id of ['', '../other', 'other/path', 'https:evil', 'a b', 'a'.repeat(129)]) {
      await expectAsync(service.getCurrentUser(id)).toBeRejectedWithError('Identificador de pacote inválido.');
      await expectAsync(service.openCurrentUser(id)).toBeRejectedWithError('Identificador de pacote inválido.');
    }
    expect(get).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('chama openPack somente com o identificador e devolve a confirmação do servidor', async () => {
    const result = await service.openCurrentUser('starter');
    expect(open).toHaveBeenCalledOnceWith('starter');
    expect(result).toEqual(receipt);
    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('aceita retry com alreadyOpened e o snapshot persistido', async () => {
    open.and.resolveTo({ ...receipt, alreadyOpened: true });
    expect(await service.openCurrentUser('starter')).toEqual({ ...receipt, alreadyOpened: true });
  });

  it('deduplica aberturas locais simultâneas e libera a operação ao terminar', async () => {
    const backend = deferred<PackOpenResult>();
    open.and.returnValue(backend.promise);
    const first = service.openCurrentUser('starter');
    const second = service.openCurrentUser('starter');
    await startClientOperation();
    expect(open).toHaveBeenCalledTimes(1);
    backend.resolve(receipt);
    expect(await first).toEqual(receipt);
    expect(await second).toEqual(receipt);
    await service.openCurrentUser('starter');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('libera retry após falha de callable sem revelar resultado fictício', async () => {
    open.and.rejectWith({ code: 'functions/deadline-exceeded', message: 'Internal data' });
    await expectAsync(service.openCurrentUser('starter')).toBeRejectedWithError(/recuperar o resultado com segurança/);
    open.and.resolveTo({ ...receipt, alreadyOpened: true });
    expect((await service.openCurrentUser('starter')).alreadyOpened).toBeTrue();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('também trata erro síncrono do cliente e permite retry', async () => {
    open.and.throwError('SDK failure');
    await expectAsync(service.openCurrentUser('starter')).toBeRejectedWithError(/Confira sua conexão/);
    open.and.resolveTo(receipt);
    expect(await service.openCurrentUser('starter')).toEqual(receipt);
  });

  for (const operation of ['list', 'get', 'open'] as const) {
    it(`descarta ${operation} concluído depois da troca de UID`, async () => {
      const backend = deferred<unknown>();
      ({ list, get, open })[operation].and.returnValue(backend.promise);
      const pending: Promise<unknown> = operation === 'list' ? service.listCurrentUser()
        : operation === 'get' ? service.getCurrentUser('starter') : service.openCurrentUser('starter');
      await startClientOperation();
      currentUser.set({ ...member, uid: 'another' });
      TestBed.flushEffects();
      backend.resolve(operation === 'list' ? [sealed()] : operation === 'get' ? sealed() : receipt);
      await expectAsync(pending).toBeRejectedWithError(/Sua conta mudou/);
    });
  }

  it('descarta resposta da sessão anterior mesmo após logout e retorno ao mesmo UID', async () => {
    const backend = deferred<PackOpenResult>();
    open.and.returnValue(backend.promise);
    const pending = service.openCurrentUser('starter');
    await startClientOperation();
    currentUser.set(null); TestBed.flushEffects();
    currentUser.set(member); TestBed.flushEffects();
    const current = service.openCurrentUser('starter');
    await startClientOperation();
    expect(open).toHaveBeenCalledTimes(1);
    backend.resolve(receipt);
    await expectAsync(pending).toBeRejectedWithError(/Sua conta mudou/);
    expect(await current).toEqual(receipt);
  });

  it('descarta falha antiga sem exibir detalhes na sessão nova', async () => {
    const backend = deferred<PackOpenResult>();
    open.and.returnValue(backend.promise);
    const pending = service.openCurrentUser('starter');
    await startClientOperation();
    currentUser.set(null);
    backend.reject({ code: 'functions/internal', message: 'Private details' });
    await expectAsync(pending).toBeRejectedWithError(/Sua conta mudou/);
  });

  it('recusa snapshots inconsistentes em vez de presumir abertura', async () => {
    const invalid: Record<string, unknown>[] = [
      { state: 'invalid' }, { source: 'purchase' }, { definitionVersion: 0 }, { definitionVersion: 1.5 },
      { packId: '../starter' }, { acquiredAt: null }, { openedAt }, { revealedCards: [] },
      { state: 'opened', openedAt: null }, { state: 'opened', openedAt: Timestamp.fromMillis(500), revealedCards: receipt.revealedCards },
      { state: 'opened', openedAt, revealedCards: [] }, { uid: 'player' }
    ];
    for (const changes of invalid) {
      get.and.resolveTo(sealed('starter', changes));
      await expectAsync(service.getCurrentUser('starter')).toBeRejectedWithError(/Não foi possível carregar/);
    }
  });

  it('recusa resposta inválida ou pertencente a outra instância', async () => {
    const invalid = [null, {}, { ...receipt, packInstanceId: 'other' }, { ...receipt, alreadyOpened: 'yes' },
      { ...receipt, revealedCards: [] }, { ...receipt, uid: 'player' },
      { ...receipt, revealedCards: [...receipt.revealedCards, ...receipt.revealedCards] },
      ...[{ quantity: 0 }, { quantity: 1.5 }, { quantity: 10000 }, { name: '' }, { rarity: 'mythic' }, { cardId: '../card' }, { canvas: {} }]
        .map(change => ({ ...receipt, revealedCards: [{ ...receipt.revealedCards[0], ...change }] }))];
    for (const response of invalid) {
      open.and.resolveTo(response);
      await expectAsync(service.openCurrentUser('starter')).toBeRejectedWithError(/Não foi possível carregar/);
    }
  });

  it('devolve cópia do snapshot sem mutar o recibo original do cliente', async () => {
    const result = await service.openCurrentUser('starter');
    result.revealedCards[0].quantity = 1;
    expect(receipt.revealedCards[0].quantity).toBe(2);
  });

  for (const [code, message] of [
    ['functions/permission-denied', 'confirmar o acesso'], ['functions/unauthenticated', 'confirmar o acesso'],
    ['firestore/permission-denied', 'confirmar o acesso'], ['functions/not-found', 'não foi encontrado'],
    ['functions/failed-precondition', 'não pode ser aberto'], ['functions/unavailable', 'Confira sua conexão']
  ]) {
    it(`traduz ${code} sem expor detalhes do servidor`, async () => {
      open.and.rejectWith({ code, message: 'Private server details' });
      await expectAsync(service.openCurrentUser('starter')).toBeRejectedWithError(new RegExp(message));
    });
  }
});
