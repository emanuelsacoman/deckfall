import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { Card, CardInput, CardOperationError } from '../../../interfaces/Cards/card';
import { CardStorageService } from '../../fire/card-storage.service';
import { defaultCardData } from '../../tools/card-canvas-factory';
import { CARD_PERSISTENCE_CLIENT, CardPersistenceClient, CardService } from './card.service';
import { PublishedCardPreviewService } from './published-card-preview.service';

describe('Persistência de cartas e sincronização publicada', () => {
  let service: CardService;
  let persistence: jasmine.SpyObj<CardPersistenceClient>;
  let storage: jasmine.SpyObj<CardStorageService>;
  let publication: jasmine.SpyObj<PublishedCardPreviewService>;
  let original: Card;

  function input(status: CardInput['status'] = 'published'): CardInput {
    return { ...defaultCardData(), name: 'Nyra', status };
  }

  beforeEach(() => {
    original = { ...input(), id: 'saved', slug: 'nyra', art: null,
      createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1) };
    persistence = jasmine.createSpyObj<CardPersistenceClient>('Persistência cartas', ['newId', 'list', 'getById', 'create', 'update', 'delete', 'cleanup']);
    persistence.newId.and.returnValue('saved'); persistence.list.and.resolveTo([original]); persistence.getById.and.resolveTo(original);
    persistence.create.and.resolveTo(); persistence.update.and.resolveTo(); persistence.delete.and.resolveTo(); persistence.cleanup.and.resolveTo([]);
    storage = jasmine.createSpyObj<CardStorageService>('Assets privados', ['validateImage', 'validatePendingAssets', 'prepareArt', 'uploadArt', 'isOwnedAsset']);
    storage.isOwnedAsset.and.returnValue(true); storage.uploadArt.and.resolveTo();
    storage.prepareArt.and.returnValue({ storagePath: 'cards/saved/art/new.png', fileName: 'new.png', contentType: 'image/png', size: 3 });
    publication = jasmine.createSpyObj<PublishedCardPreviewService>('Publicação', ['synchronize', 'cleanupDeleted']);
    publication.synchronize.and.resolveTo([]); publication.cleanupDeleted.and.resolveTo([]);
    TestBed.configureTestingModule({ providers: [
      { provide: CARD_PERSISTENCE_CLIENT, useValue: persistence },
      { provide: CardStorageService, useValue: storage },
      { provide: PublishedCardPreviewService, useValue: publication }
    ] });
    service = TestBed.inject(CardService);
  });

  it('mantém leitura/lista e rejeita IDs inválidos antes de consultar infraestrutura', async () => {
    expect(await service.list()).toEqual([original]); expect(await service.getById('saved')).toBe(original);
    await expectAsync(service.getById('../other')).toBeRejected();
    expect(persistence.getById).toHaveBeenCalledTimes(1);
  });

  it('publica somente após criar a carta sem uploads e retorna warnings da representação', async () => {
    const order: string[] = [];
    persistence.create.and.callFake(async () => { order.push('commit'); });
    publication.synchronize.and.callFake(async () => { order.push('preview'); return ['Preview pendente.']; });
    const result = await service.create(input());
    expect(order).toEqual(['commit', 'preview']); expect(result).toEqual({ id: 'saved', warnings: ['Preview pendente.'] });
    expect(persistence.create.calls.mostRecent().args[1].status).toBe('published');
  });

  it('cria draft para permitir upload privado e sincroniza apenas depois do commit final', async () => {
    const order: string[] = [];
    persistence.create.and.callFake(async () => { order.push('draft'); });
    storage.uploadArt.and.callFake(async () => { order.push('upload privado'); });
    persistence.update.and.callFake(async () => { order.push('commit final'); });
    publication.synchronize.and.callFake(async () => { order.push('preview'); return []; });
    await service.create(input(), new File(['png'], 'new.png', { type: 'image/png' }));
    expect(persistence.create.calls.mostRecent().args[1].status).toBe('draft');
    expect(persistence.update.calls.mostRecent().args[1].status).toBe('published');
    expect(order).toEqual(['draft', 'upload privado', 'commit final', 'preview']);
  });

  it('edita published e aciona também sincronização de draft/archived para remover preview', async () => {
    for (const status of ['published', 'draft', 'archived'] as const) {
      expect(await service.update(original, input(status))).toEqual({ id: 'saved', warnings: [] });
    }
    expect(publication.synchronize).toHaveBeenCalledTimes(3);
    expect(persistence.update.calls.allArgs().map(args => args[1].status)).toEqual(['published', 'draft', 'archived']);
  });

  it('não compensa uploads nem invalida edição confirmada quando a publicação falha', async () => {
    publication.synchronize.and.rejectWith(new Error('Renderer indisponível.'));
    const result = await service.update(original, input(), new File(['png'], 'new.png', { type: 'image/png' }));
    expect(result.warnings.join(' ')).toContain('A carta foi salva');
    expect(result.warnings.join(' ')).toContain('Renderer indisponível.');
    expect(persistence.cleanup).toHaveBeenCalledOnceWith({ kind: 'card', id: 'saved' }, []);
    expect(persistence.update).toHaveBeenCalledTimes(1);
  });

  it('mantém criação confirmada e ainda sincroniza a preview quando cleanup pós-commit falha', async () => {
    persistence.cleanup.and.rejectWith(new Error('Cleanup indisponível.'));
    expect((await service.create(input())).warnings.join(' ')).toContain('A carta foi salva');
    expect(persistence.cleanup).toHaveBeenCalledTimes(1); expect(publication.synchronize).toHaveBeenCalledOnceWith('saved');
  });

  it('preserva compensação existente e não publica uma criação ou edição sem commit confirmado', async () => {
    persistence.create.and.rejectWith(new Error('Confirmação perdida.'));
    await expectAsync(service.create(input())).toBeRejectedWithError(CardOperationError, /confirmação da gravação/);
    persistence.update.and.rejectWith(new Error('Versão mudou.'));
    await expectAsync(service.update(original, input())).toBeRejectedWithError(CardOperationError, /Recarregue/);
    expect(publication.synchronize).not.toHaveBeenCalled(); expect(persistence.cleanup).toHaveBeenCalledTimes(2);
  });

  it('remove documento antes dos assets e da representação publicada', async () => {
    const order: string[] = [];
    persistence.delete.and.callFake(async () => { order.push('documento'); });
    persistence.cleanup.and.callFake(async () => { order.push('assets'); return []; });
    publication.cleanupDeleted.and.callFake(async () => { order.push('preview'); return []; });
    await service.delete(original);
    expect(order).toEqual(['documento', 'assets', 'preview']);
  });

  it('informa exclusão confirmada com limpeza pendente e tenta ambas as limpezas', async () => {
    persistence.cleanup.and.rejectWith(new Error('Assets pendentes.'));
    publication.cleanupDeleted.and.resolveTo(['Preview pendente.']);
    await expectAsync(service.delete(original)).toBeRejectedWithError(CardOperationError, /A carta foi excluída.*Preview pendente/);
    expect(publication.cleanupDeleted).toHaveBeenCalledOnceWith('saved');
  });

  it('preserva todos os arquivos se a exclusão do documento não for confirmada', async () => {
    persistence.delete.and.rejectWith(new Error('Confirmação perdida.'));
    await expectAsync(service.delete(original)).toBeRejectedWithError(CardOperationError, /Os arquivos foram preservados/);
    expect(persistence.cleanup).not.toHaveBeenCalled(); expect(publication.cleanupDeleted).not.toHaveBeenCalled();
  });

  it('mantém o bloqueio local por ID até terminar a sincronização e libera após concluir', async () => {
    let finish!: (warnings: string[]) => void;
    let started!: () => void;
    const synchronizing = new Promise<void>(resolve => { started = resolve; });
    publication.synchronize.and.callFake(() => new Promise(resolve => { finish = resolve; started(); }));
    const updating = service.update(original, input());
    await synchronizing;
    await expectAsync(service.delete(original)).toBeRejectedWithError(/operação em andamento/);
    finish([]); await updating;
    await expectAsync(service.delete(original)).toBeResolved();
  });
});
