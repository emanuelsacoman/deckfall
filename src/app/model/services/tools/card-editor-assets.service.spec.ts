import { TestBed } from '@angular/core/testing';
import { CardCanvasAsset } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';
import { CardEditorAssetsService } from './card-editor-assets.service';
import { defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';

describe('Cache de imagens do editor', () => {
  let storage: jasmine.SpyObj<CardStorageService>;
  let assets: CardEditorAssetsService;
  const first: CardCanvasAsset = { id: 'shared', storagePath: 'cards/a/assets/a.png', fileName: 'a.png', contentType: 'image/png', size: 1 };
  const second: CardCanvasAsset = { ...first, storagePath: 'templates/b/assets/b.png' };
  const canvasWith = (asset: CardCanvasAsset) => ({ ...fantasyBasicCanvas(defaultCardData()), assets: [asset] });

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
});
