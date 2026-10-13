import { TestBed } from '@angular/core/testing';
import {
  PUBLISHED_CARD_PREVIEW_MAX_BYTES, PUBLISHED_CARD_STORAGE_CLIENT, PublishedCardStorageClient,
  PublishedCardStorageService, publishedCardPreviewPath, publishedPreviewDownloadError
} from './published-card-storage.service';

describe('Storage da representação publicada', () => {
  let service: PublishedCardStorageService;
  let client: jasmine.SpyObj<PublishedCardStorageClient>;
  const png = () => new Blob(['png'], { type: 'image/png' });

  beforeEach(() => {
    client = jasmine.createSpyObj<PublishedCardStorageClient>('Storage publicado', ['upload', 'download', 'delete']);
    client.upload.and.resolveTo(); client.download.and.resolveTo(png()); client.delete.and.resolveTo();
    TestBed.configureTestingModule({ providers: [{ provide: PUBLISHED_CARD_STORAGE_CLIENT, useValue: client }] });
    service = TestBed.inject(PublishedCardStorageService);
  });

  it('usa somente o caminho determinístico e rejeita IDs que escapariam do namespace', async () => {
    expect(publishedCardPreviewPath('card_123')).toBe('published-cards/card_123/preview.png');
    for (const id of ['', '../outside', 'a/b', 'a b']) {
      await expectAsync(service.getPreviewBlob(id)).toBeRejected();
    }
    expect(client.download).not.toHaveBeenCalled();
  });

  it('permite substituir a preview por outro PNG no mesmo caminho', async () => {
    const first = png(), second = new Blob(['other'], { type: 'image/png' });
    await service.uploadPreview('saved', first); await service.uploadPreview('saved', second);
    expect(client.upload.calls.allArgs()).toEqual([
      ['published-cards/saved/preview.png', first], ['published-cards/saved/preview.png', second]
    ]);
  });

  it('aceita exatamente 20 MiB e rejeita overflow, vazio e MIME diferente', async () => {
    expect(() => service.validatePreview(new Blob([new Uint8Array(PUBLISHED_CARD_PREVIEW_MAX_BYTES)], { type: 'image/png' }))).not.toThrow();
    expect(() => service.validatePreview(new Blob([new Uint8Array(PUBLISHED_CARD_PREVIEW_MAX_BYTES + 1)], { type: 'image/png' }))).toThrowError(/20 MiB/);
    await expectAsync(service.uploadPreview('saved', new Blob([], { type: 'image/png' }))).toBeRejectedWithError(/20 MiB/);
    await expectAsync(service.uploadPreview('saved', new Blob(['jpeg'], { type: 'image/jpeg' }))).toBeRejectedWithError(/PNG/);
    expect(client.upload).not.toHaveBeenCalled();
  });

  it('baixa um Blob autenticado com limite explícito, sem criar URL ou acessar assets editáveis', async () => {
    const created = spyOn(URL, 'createObjectURL');
    const output = await service.getPreviewBlob('saved');
    expect(client.download).toHaveBeenCalledOnceWith('published-cards/saved/preview.png', PUBLISHED_CARD_PREVIEW_MAX_BYTES);
    expect(output.type).toBe('image/png'); expect(created).not.toHaveBeenCalled();
  });

  it('rejeita um arquivo retornado vazio ou de outro tipo', async () => {
    client.download.and.resolveTo(new Blob([], { type: 'image/png' }));
    await expectAsync(service.getPreviewBlob('saved')).toBeRejectedWithError(/Não foi possível baixar/);
    client.download.and.resolveTo(new Blob(['svg'], { type: 'image/svg+xml' }));
    await expectAsync(service.getPreviewBlob('saved')).toBeRejectedWithError(/Não foi possível baixar/);
  });

  it('informa permissão, ausência e conexão/CORS sem pedir acesso administrativo ao jogador', async () => {
    expect(publishedPreviewDownloadError({ code: 'storage/object-not-found' })).toContain('ainda não está disponível');
    expect(publishedPreviewDownloadError({ code: 'storage/unauthorized' })).toContain('carta pode estar indisponível');
    expect(publishedPreviewDownloadError({ code: 'storage/unauthenticated' })).not.toContain('administrativa');
    client.download.and.rejectWith({ code: 'storage/retry-limit-exceeded' });
    await expectAsync(service.getPreviewBlob('saved')).toBeRejectedWithError(/CORS/);
  });

  it('aceita preview já ausente no cleanup, mas propaga falha de autorização', async () => {
    client.delete.and.rejectWith({ code: 'storage/object-not-found' });
    await expectAsync(service.deletePreview('saved')).toBeResolved();
    expect(client.delete).toHaveBeenCalledWith('published-cards/saved/preview.png');
    const denied = { code: 'storage/unauthorized' }; client.delete.and.rejectWith(denied);
    await expectAsync(service.deletePreview('saved')).toBeRejectedWith(denied);
  });
});
