import { TestBed } from '@angular/core/testing';
import { CardCanvasAsset, CardCanvasData } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';
import { CardEditorAssetsService } from './card-editor-assets.service';
import { defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';

describe('Cache de imagens do editor', () => {
  let storage: jasmine.SpyObj<CardStorageService>;
  let assets: CardEditorAssetsService;
  const first: CardCanvasAsset = { id: 'shared', storagePath: 'cards/a/assets/a.png', fileName: 'a.png', contentType: 'image/png', size: 1 };
  const second: CardCanvasAsset = { ...first, storagePath: 'templates/b/assets/b.png' };
  const canvasWith = (asset: CardCanvasAsset) => ({ ...fantasyBasicCanvas(defaultCardData()), assets: [asset] });
  const unavailable = () => new Error('Storage indisponível por configuração de CORS.');

  beforeEach(() => {
    storage = jasmine.createSpyObj<CardStorageService>('Storage', ['validateImage', 'getAssetBlob']);
    storage.getAssetBlob.and.callFake(async asset => new Blob([asset.storagePath === first.storagePath ? 'A' : 'B'], { type: 'image/png' }));
    TestBed.configureTestingModule({ providers: [CardEditorAssetsService, { provide: CardStorageService, useValue: storage }] });
    assets = TestBed.inject(CardEditorAssetsService);
  });

  it('troca a origem de um ID e preserva os bytes anteriores para Undo sem outro download', async () => {
    await assets.ensure(canvasWith(first));
    await assets.ensure(canvasWith(second));
    expect(await (await assets.snapshotFiles(canvasWith(second)))[0].file.text()).toBe('B');
    expect(await (await assets.snapshotFiles(canvasWith(first)))[0].file.text()).toBe('A');
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
  });

  it('não deixa uma resposta de imagem antiga substituir a origem atual', async () => {
    let resolveFirst!: (blob: Blob) => void;
    storage.getAssetBlob.and.callFake(asset => asset.storagePath === first.storagePath
      ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(new Blob(['B'], { type: 'image/png' })));
    const pending = assets.ensure(canvasWith(first));
    await assets.ensure(canvasWith(second)); const currentUrl = assets.urls()['shared'];
    resolveFirst(new Blob(['A'], { type: 'image/png' })); await pending;
    expect(assets.urls()['shared']).toBe(currentUrl);
    expect(await (await assets.snapshotFiles(canvasWith(second)))[0].file.text()).toBe('B');
  });

  it('lembra a falha e não repete o download quando o design muda', async () => {
    storage.getAssetBlob.and.rejectWith(unavailable());
    await expectAsync(assets.ensure(canvasWith(first))).toBeRejectedWithError(/a\.png.*CORS/);
    const updated = canvasWith(first); updated.background.color = '#ff0000';
    await expectAsync(assets.ensure(updated)).toBeRejectedWithError(/a\.png.*CORS/);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    expect(assets.downloadErrors()).toEqual([{ assetId: first.id, fileName: first.fileName,
      message: 'Não foi possível carregar a.png. Storage indisponível por configuração de CORS.' }]);
  });

  it('baixa novamente uma origem com falha apenas após a tentativa explícita', async () => {
    storage.getAssetBlob.and.rejectWith(unavailable());
    await expectAsync(assets.ensure(canvasWith(first))).toBeRejected();
    storage.getAssetBlob.and.resolveTo(new Blob(['recuperado'], { type: 'image/png' }));
    assets.retryFailed();
    expect(assets.downloadErrors()).toEqual([]);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    await assets.ensure(canvasWith(first));
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
    expect(await (await assets.snapshotFiles(canvasWith(first)))[0].file.text()).toBe('recuperado');
  });

  it('coalesce tentativas simultâneas da mesma origem mesmo quando o download falha', async () => {
    let rejectDownload!: (reason: Error) => void;
    storage.getAssetBlob.and.callFake(() => new Promise((_resolve, reject) => { rejectDownload = reject; }));
    const pending = [assets.ensure(canvasWith(first)), assets.ensure(canvasWith(first))];
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    rejectDownload(unavailable());
    const results = await Promise.allSettled(pending);
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(assets.downloadErrors().length).toBe(1);
  });

  it('carrega imagens válidas dos lotes seguintes mesmo com uma falha no primeiro', async () => {
    const images = Array.from({ length: 6 }, (_value, index) => ({ ...first, id: `image-${index}`,
      storagePath: `cards/a/assets/${index}.png`, fileName: `${index}.png` }));
    storage.getAssetBlob.and.callFake(asset => asset.storagePath === images[0].storagePath
      ? Promise.reject(unavailable()) : Promise.resolve(new Blob(['valid'], { type: 'image/png' })));
    const canvas: CardCanvasData = { ...canvasWith(first), assets: images };
    await expectAsync(assets.ensure(canvas)).toBeRejectedWithError(/0\.png/);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(6);
    expect(Object.keys(assets.urls())).toEqual(images.slice(1).map(asset => asset.id));
    expect(assets.downloadErrors().map(error => error.assetId)).toEqual([images[0].id]);
    await expectAsync(assets.ensure({ ...canvas, width: canvas.width + 1 })).toBeRejected();
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(6);
  });

  it('ignora uma falha atrasada da origem anterior sem afetar a imagem atual', async () => {
    let rejectFirst!: (reason: Error) => void;
    storage.getAssetBlob.and.callFake(asset => asset.storagePath === first.storagePath
      ? new Promise((_resolve, reject) => { rejectFirst = reject; })
      : Promise.resolve(new Blob(['B'], { type: 'image/png' })));
    const pending = assets.ensure(canvasWith(first));
    await assets.ensure(canvasWith(second));
    const currentUrl = assets.urls()[second.id];
    rejectFirst(unavailable());
    await expectAsync(pending).toBeResolved();
    expect(assets.urls()[second.id]).toBe(currentUrl);
    expect(assets.downloadErrors()).toEqual([]);
  });

  it('remove a URL da origem anterior quando a nova origem não pode carregar', async () => {
    await assets.ensure(canvasWith(first));
    const previousUrl = assets.urls()[first.id];
    storage.getAssetBlob.and.rejectWith(unavailable());
    await expectAsync(assets.ensure(canvasWith(second))).toBeRejected();
    expect(assets.urls()[second.id]).toBeUndefined();
    await assets.ensure(canvasWith(first));
    expect(assets.urls()[first.id]).toBeDefined();
    expect(assets.urls()[first.id]).not.toBe(previousUrl);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
    expect(assets.downloadErrors()).toEqual([]);
  });

  it('a tentativa explícita limpa somente falhas presentes no canvas atual', async () => {
    storage.getAssetBlob.and.callFake(asset => asset.storagePath === first.storagePath
      ? Promise.reject(unavailable()) : Promise.resolve(new Blob(['B'], { type: 'image/png' })));
    await expectAsync(assets.ensure(canvasWith(first))).toBeRejected();
    await assets.ensure(canvasWith(second));
    assets.retryFailed();
    await expectAsync(assets.ensure(canvasWith(first))).toBeRejected();
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
  });

  it('ignora falhas anteriores ao reset e preserva o novo download da mesma origem', async () => {
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (blob: Blob) => void;
    storage.getAssetBlob.and.returnValues(new Promise((_resolve, reject) => { rejectFirst = reject; }),
      new Promise(resolve => { resolveSecond = resolve; }));
    const oldPending = assets.ensure(canvasWith(first));
    assets.reset();
    const newPending = assets.ensure(canvasWith(first));
    rejectFirst(unavailable());
    await expectAsync(oldPending).toBeResolved();
    const joinedPending = assets.ensure(canvasWith(first));
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
    resolveSecond(new Blob(['new'], { type: 'image/png' }));
    await Promise.all([newPending, joinedPending]);
    expect(assets.downloadErrors()).toEqual([]);
    expect(await (await assets.snapshotFiles(canvasWith(first)))[0].file.text()).toBe('new');
  });

  it('não usa um arquivo antigo para snapshot quando a versão desejada falhou', async () => {
    await assets.ensure(canvasWith(first));
    storage.getAssetBlob.and.rejectWith(unavailable());
    await expectAsync(assets.snapshotFiles(canvasWith(second))).toBeRejectedWithError(/CORS/);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
  });
});
