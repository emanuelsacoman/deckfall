import { TestBed } from '@angular/core/testing';
import { Storage } from '@angular/fire/storage';
import { CARD_LIMITS, CardArt } from '../../interfaces/Cards/card';
import { CardCanvasAsset } from '../../interfaces/Cards/card-canvas';
import { defaultCardData, fantasyBasicCanvas } from '../tools/card-canvas-factory';
import { CARD_STORAGE_OPERATION_RETRY_MS, CardStorageService, storageDownloadErrorMessage } from './card-storage.service';

describe('Limites e caminhos da arte', () => {
  let service: CardStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: Storage, useValue: {} }] });
    service = TestBed.inject(CardStorageService);
  });

  it('rejeita SVG e arquivos vazios, sem depender do nome/extensão informado', () => {
    expect(() => service.validateImage(new File(['<svg/>'], 'art.png', { type: 'image/svg+xml' })))
      .toThrowError('Selecione uma imagem PNG, JPEG ou WebP.');
    expect(() => service.validateImage(new File([], 'art.png', { type: 'image/png' })))
      .toThrowError(/no máximo 5 MiB/);
  });

  it('limita a janela de novas tentativas do Storage e explica falhas de imagem sem confundir permissão com CORS', () => {
    expect(TestBed.inject(Storage).maxOperationRetryTime).toBe(CARD_STORAGE_OPERATION_RETRY_MS);
    expect(storageDownloadErrorMessage({ code: 'storage/retry-limit-exceeded' })).toContain('CORS');
    expect(storageDownloadErrorMessage({ code: 'storage/unauthorized' })).toContain('permissão administrativa');
    expect(storageDownloadErrorMessage({ code: 'storage/unauthenticated' })).not.toContain('CORS');
    expect(storageDownloadErrorMessage({ code: 'storage/object-not-found' })).toContain('não existe mais');
  });

  it('mantém a fronteira de tamanho consistente com as Rules', () => {
    const limit = new File([new Uint8Array(CARD_LIMITS.imageBytes)], 'art.webp', { type: 'image/webp' });
    const overflow = new File([new Uint8Array(CARD_LIMITS.imageBytes + 1)], 'art.webp', { type: 'image/webp' });
    expect(() => service.validateImage(limit)).not.toThrow();
    expect(() => service.validateImage(overflow)).toThrowError(/no máximo 5 MiB/);
  });

  it('cria caminhos únicos a partir do MIME, sem interpolar o nome original no caminho', () => {
    const file = new File(['image'], '../nome estranho.svg', { type: 'image/jpeg' });
    const first = service.prepareArt('card_123', file);
    const second = service.prepareArt('card_123', file);
    expect(first.storagePath).toMatch(/^cards\/card_123\/art\/[a-zA-Z0-9_-]+\.jpg$/);
    expect(first.storagePath).not.toEqual(second.storagePath);
    expect(first.fileName).toBe(file.name);
    expect(first.contentType).toBe('image/jpeg');
  });

  it('bloqueia a leitura e exclusão de caminhos externos antes de qualquer chamada de rede', async () => {
    const art: CardArt = {
      storagePath: 'users/another/avatar.png', fileName: 'avatar.png', contentType: 'image/png', size: 1
    };
    await expectAsync(service.getArtUrl(art)).toBeRejectedWithError('Caminho da arte inválido.');
    await expectAsync(service.deleteArt(art)).toBeRejectedWithError('Caminho da arte inválido.');
  });

  it('separa assets de cartas e templates e reconhece arte antiga do próprio proprietário', () => {
    const file = new File(['image'], 'a.png', { type: 'image/png' });
    const card = service.prepareAsset({ kind: 'card', id: 'card-one' }, 'asset-one', file);
    const template = service.prepareAsset({ kind: 'template', id: 'template-one' }, 'asset-one', file);
    expect(card.storagePath).toMatch(/^cards\/card-one\/assets\//);
    expect(template.storagePath).toMatch(/^templates\/template-one\/assets\//);
    expect(service.isOwnedAsset({ kind: 'card', id: 'card-one' }, card.storagePath!)).toBeTrue();
    expect(service.isOwnedAsset({ kind: 'card', id: 'card-one' }, template.storagePath!)).toBeFalse();
    expect(service.isOwnedAsset({ kind: 'card', id: 'card-one' }, 'cards/card-one/art/old.png')).toBeTrue();
  });

  it('copia bytes para o novo proprietário sem criar referência compartilhada ou mudar o ID', async () => {
    const canvas = fantasyBasicCanvas(defaultCardData());
    const source: CardCanvasAsset = { id: 'source-asset', storagePath: 'cards/source/assets/a.png', fileName: 'a.png', contentType: 'image/png', size: 3 };
    canvas.assets = [source];
    const read = spyOn(service, 'getAssetBlob').and.resolveTo(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    const upload = spyOn(service, 'uploadAsset').and.resolveTo();
    const attempted: CardCanvasAsset[] = [];
    const copied = await service.materializeAssets({ kind: 'template', id: 'target' }, canvas, [], attempted);
    expect(read).toHaveBeenCalledWith(source);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(copied.assets[0].id).toBe(source.id);
    expect(copied.assets[0].storagePath).toMatch(/^templates\/target\/assets\//);
    expect(source.storagePath).toBe('cards/source/assets/a.png');
    expect(attempted).toEqual(copied.assets);
  });

  it('reutiliza arquivo próprio e registra tentativa antes de uma falha de upload para compensação', async () => {
    const canvas = fantasyBasicCanvas(defaultCardData());
    canvas.assets = [{ id: 'own', storagePath: 'cards/current/art/a.png', fileName: 'a.png', contentType: 'image/png', size: 3 }];
    const upload = spyOn(service, 'uploadAsset').and.rejectWith(new Error('network'));
    const attempted: CardCanvasAsset[] = [];
    const unchanged = await service.materializeAssets({ kind: 'card', id: 'current' }, canvas, [], attempted);
    expect(unchanged.assets).toEqual(canvas.assets);
    expect(upload).not.toHaveBeenCalled();
    const file = new File([new Uint8Array([1, 2, 3])], 'new.png', { type: 'image/png' });
    await expectAsync(service.materializeAssets({ kind: 'card', id: 'current' }, canvas, [{ id: 'own', file }], attempted))
      .toBeRejectedWithError('network');
    expect(attempted.length).toBe(1);
    expect(attempted[0].storagePath).toMatch(/^cards\/current\/assets\//);
    expect(attempted[0].storagePath).not.toEqual(canvas.assets[0].storagePath);
  });
});
