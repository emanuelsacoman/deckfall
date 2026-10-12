import { TestBed } from '@angular/core/testing';
import Konva from 'konva';
import { Card } from '../../interfaces/Cards/card';
import { CardCanvasAsset, CardCanvasElement } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';
import { createCanvasElement, defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';
import { CardKonvaRenderer } from './card-konva-renderer';
import { CardPreviewService } from './card-preview.service';
import { savedCardDocument } from './card-saved-document';

describe('Prévias completas das cartas salvas', () => {
  let preview: CardPreviewService;
  let storage: jasmine.SpyObj<CardStorageService>;

  beforeEach(() => {
    storage = jasmine.createSpyObj<CardStorageService>('Storage', ['getAssetBlob']);
    TestBed.configureTestingModule({ providers: [{ provide: CardStorageService, useValue: storage }] });
    preview = TestBed.inject(CardPreviewService);
  });

  function card(id = 'saved'): Card {
    const data = { ...defaultCardData(), name: 'FULL' };
    return { ...data, id, slug: 'full', art: null, createdAt: null, updatedAt: null,
      canvas: { ...fantasyBasicCanvas(data), width: 160, height: 200, elements: [], assets: [],
        background: { kind: 'solid', color: 'transparent', color2: 'transparent', angle: 0, assetId: null } } };
  }

  function asset(id = 'source'): CardCanvasAsset {
    return { id, storagePath: `cards/saved/assets/${id}.png`, fileName: `${id}.png`, contentType: 'image/png', size: 100 };
  }

  function image(value: Card, id = 'source'): Extract<CardCanvasElement, { type: 'image' | 'artwork' }> {
    const element = createCanvasElement('image', value);
    if (element.type !== 'image') throw new Error('Fixture de imagem inválido.');
    Object.assign(element, { x: 70, y: 20, width: 64, height: 64 });
    Object.assign(element.properties, { assetId: id, mask: 'none', fit: 'fill' });
    value.canvas!.assets.push(asset(id)); value.canvas!.elements.push(element);
    return element;
  }

  async function png(color = '#00ff00'): Promise<Blob> {
    const source = document.createElement('canvas'); source.width = 8; source.height = 8;
    const context = source.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 8, 8);
    return new Promise<Blob>((resolve, reject) => source.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG indisponível.')), 'image/png'));
  }

  async function canvas(blob: Blob): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(blob);
    const result = document.createElement('canvas'); result.width = bitmap.width; result.height = bitmap.height;
    result.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); return result;
  }

  function pixel(output: HTMLCanvasElement, x: number, y: number): number[] {
    return Array.from(output.getContext('2d')!.getImageData(x, y, 1, 1).data);
  }

  it('gera o design completo com moldura, texto vinculado, imagem e efeitos, preservando o documento e liberando recursos', async () => {
    const value = card();
    const shape = createCanvasElement('rect', value), title = createCanvasElement('text', value);
    if (shape.type !== 'rect' || title.type !== 'text') throw new Error('Fixture inválido.');
    Object.assign(shape, { x: 8, y: 8, width: 40, height: 40 });
    Object.assign(shape.properties, { fill: '#ff0000', cornerRadius: 0 });
    Object.assign(title, { x: 10, y: 110, width: 140, height: 40 });
    Object.assign(title.properties, { binding: 'name', fill: '#000000', fontFamily: 'Arial', fontSize: 24, strokeWidth: 0 });
    value.canvas!.elements.push(shape, title);
    image(value).properties.filter = 'sepia';
    storage.getAssetBlob.and.resolveTo(await png());
    const before = JSON.stringify(value);
    const initialStages = Konva.stages.length;
    const created = spyOn(URL, 'createObjectURL').and.callThrough();
    const revoked = spyOn(URL, 'revokeObjectURL').and.callThrough();
    const output = await canvas(await preview.render(value));
    expect(output.width).toBe(160); expect(output.height).toBe(200);
    expect(pixel(output, 20, 20)).toEqual([255, 0, 0, 255]);
    expect(pixel(output, 100, 50)[3]).toBe(255);
    expect(pixel(output, 100, 50).slice(0, 3)).not.toEqual([0, 255, 0]);
    const textPixels = output.getContext('2d')!.getImageData(10, 110, 140, 40).data;
    expect(textPixels.some((value, index) => index % 4 === 3 && value > 0)).toBeTrue();
    expect(pixel(output, 155, 195)).toEqual([0, 0, 0, 0]);
    expect(JSON.stringify(value)).toBe(before);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1); expect(revoked).toHaveBeenCalledWith(created.calls.mostRecent().returnValue);
    expect(Konva.stages.length).toBe(initialStages);
    expect(document.querySelector('[data-card-preview-renderer]')).toBeNull();
  });

  it('usa a arte de uma camada oculta quando há binding visível e ignora assets ocultos, transparentes e de fundo sólido', async () => {
    const value = card();
    const visible = image(value);
    visible.properties.binding = 'art';
    const source = createCanvasElement('artwork', value);
    if (source.type !== 'artwork') throw new Error('Arte ausente.');
    source.visible = false; source.properties.assetId = 'primary';
    value.canvas!.elements.push(source); value.canvas!.assets.push(asset('primary'));
    image(value, 'hidden').visible = false;
    image(value, 'zero').opacity = 0;
    value.canvas!.assets.push(asset('background'));
    value.canvas!.background.assetId = 'background';
    storage.getAssetBlob.and.resolveTo(await png());
    const before = JSON.stringify(value), output = await canvas(await preview.render(value));
    expect(pixel(output, 100, 50)).toEqual([0, 255, 0, 255]);
    expect(storage.getAssetBlob.calls.allArgs().map(([item]) => item.storagePath)).toEqual(['cards/saved/assets/primary.png']);
    expect(JSON.stringify(value)).toBe(before);
  });

  it('renderiza textura e imagens de fundo que não aparecem como camadas', async () => {
    const value = card();
    value.canvas!.assets.push(asset());
    value.canvas!.background = { kind: 'texture', color: 'transparent', color2: 'transparent', angle: 0, assetId: 'source' };
    storage.getAssetBlob.and.resolveTo(await png());
    const output = await canvas(await preview.render(value));
    expect(pixel(output, 150, 190)).toEqual([0, 255, 0, 255]);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(1);
  });

  it('adapta cartas antigas ao Fantasy Basic com arte e atributos sem gravar nem alterar a carta', async () => {
    const value = card(); delete value.canvas;
    value.attributes = [{ key: 'attack', label: 'Ataque', value: 37 }];
    value.art = { storagePath: 'cards/saved/art/legacy.png', fileName: 'legacy.png', contentType: 'image/png', size: 100 };
    const before = JSON.stringify(value), document = savedCardDocument(value);
    expect(document.data.attributes[0].id).toBeTruthy();
    expect(document.canvas.elements.some(element => element.type === 'attribute' && element.properties.attributeKey === 'attack')).toBeTrue();
    const title = document.canvas.elements.find(element => element.type === 'text');
    expect(title?.type === 'text' ? title.properties.binding : null).toBe('name');
    storage.getAssetBlob.and.resolveTo(await png());
    const output = await canvas(await preview.render(value));
    expect(output.width).toBe(744); expect(output.height).toBe(1039);
    expect(pixel(output, 150, 300)).toEqual([0, 255, 0, 255]);
    expect(pixel(output, 20, 20)[3]).toBe(255);
    expect(JSON.stringify(value)).toBe(before);
  });

  it('rejeita download e imagem inválida sem produzir uma carta parcial e libera Stage e URLs', async () => {
    const value = card(); image(value);
    storage.getAssetBlob.and.rejectWith(new Error('CORS indisponível.'));
    await expectAsync(preview.render(value)).toBeRejectedWithError(/source\.png.*CORS/);
    storage.getAssetBlob.and.resolveTo(new Blob(['invalid image'], { type: 'image/png' }));
    const initialStages = Konva.stages.length;
    const created = spyOn(URL, 'createObjectURL').and.callThrough();
    const revoked = spyOn(URL, 'revokeObjectURL').and.callThrough();
    await expectAsync(preview.render(value)).toBeRejectedWithError(/carregar.*source\.png/);
    expect(revoked).toHaveBeenCalledWith(created.calls.mostRecent().returnValue);
    expect(Konva.stages.length).toBe(initialStages);
    expect(document.querySelector('[data-card-preview-renderer]')).toBeNull();
  });

  it('não inicia imagem ausente ou documento inválido', async () => {
    const value = card(); image(value); value.canvas!.assets[0].storagePath = null;
    await expectAsync(preview.render(value)).toBeRejectedWithError(/source\.png.*não está disponível/);
    value.canvas!.width = 10000;
    await expectAsync(preview.render(value)).toBeRejectedWithError(/largura/);
    expect(storage.getAssetBlob).not.toHaveBeenCalled();
  });

  it('limita a fila a duas renderizações e descarta uma solicitação cancelada antes do download', async () => {
    const file = await png();
    const pending: ((blob: Blob) => void)[] = [];
    storage.getAssetBlob.and.callFake(() => new Promise(resolve => { pending.push(resolve); }));
    const first = card('first'), second = card('second'), third = card('third');
    image(first); image(second); image(third);
    const controller = new AbortController();
    const requests = [preview.render(first), preview.render(second)];
    const queued = preview.render(third, controller.signal);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
    controller.abort();
    await expectAsync(queued).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    pending.forEach(resolve => resolve(file)); await Promise.all(requests);
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
  });

  it('cancelamento durante download rejeita prontamente e não cria URLs nem Stage após a resposta', async () => {
    const file = await png(), value = card(); image(value);
    let release!: (blob: Blob) => void;
    storage.getAssetBlob.and.callFake(() => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController(), created = spyOn(URL, 'createObjectURL').and.callThrough();
    const request = preview.render(value, controller.signal);
    controller.abort();
    await expectAsync(request).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    release(file); await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(created).not.toHaveBeenCalled();
    expect(document.querySelector('[data-card-preview-renderer]')).toBeNull();
  });

  it('cancelamento durante exportação destrói imediatamente o Stage e libera as URLs temporárias', async () => {
    const value = card(); image(value); storage.getAssetBlob.and.resolveTo(await png());
    let complete!: (blob: Blob) => void;
    spyOn(CardKonvaRenderer.prototype, 'exportImage').and.callFake(() => new Promise(resolve => { complete = resolve; }));
    const created = spyOn(URL, 'createObjectURL').and.callThrough(), revoked = spyOn(URL, 'revokeObjectURL').and.callThrough();
    const initialStages = Konva.stages.length, controller = new AbortController();
    const request = preview.render(value, controller.signal);
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('[data-card-preview-renderer]')).not.toBeNull();
    controller.abort();
    await expectAsync(request).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    expect(Konva.stages.length).toBe(initialStages);
    expect(revoked).toHaveBeenCalledWith(created.calls.mostRecent().returnValue);
    expect(document.querySelector('[data-card-preview-renderer]')).toBeNull();
    complete(new Blob()); await Promise.resolve();
  });

  it('destruição cancela a fila e novas solicitações sem realizar outros downloads', async () => {
    const value = card(); image(value);
    const releases: ((blob: Blob) => void)[] = [];
    storage.getAssetBlob.and.callFake(() => new Promise(resolve => { releases.push(resolve); }));
    const first = preview.render(value), second = preview.render(value), queued = preview.render(value);
    preview.ngOnDestroy();
    for (const request of [first, second, queued, preview.render(value)]) {
      await expectAsync(request).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    }
    expect(storage.getAssetBlob).toHaveBeenCalledTimes(2);
    releases.forEach(resolve => resolve(new Blob()));
  });
});
