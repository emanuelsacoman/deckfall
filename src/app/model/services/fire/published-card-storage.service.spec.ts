import { TestBed } from '@angular/core/testing';
import { StorageReference } from '@angular/fire/storage';
import { PublishedCardPreviewError } from '../../interfaces/Cards/published-card-preview-error';
import {
  PUBLISHED_CARD_PREVIEW_MAX_BYTES, PUBLISHED_CARD_STORAGE_CLIENT, PublishedCardStorageClient,
  PublishedCardStorageService, downloadPublishedCardPreview, publishedCardPreviewPath, publishedPreviewDownloadError
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

  it('omite o limite opcional do SDK para preservar o MIME original do PNG', async () => {
    const reference = { fullPath: 'published-cards/saved/preview.png' } as StorageReference;
    const original = png();
    const sdkDownload = jasmine.createSpy('getBlob').and.callFake((_reference: StorageReference, maxBytes?: number) =>
      Promise.resolve(maxBytes === undefined ? original : original.slice(0, maxBytes)));
    const output = await downloadPublishedCardPreview(reference, sdkDownload);
    expect(sdkDownload).toHaveBeenCalledOnceWith(reference);
    expect(output).toBe(original); expect(output.type).toBe('image/png');
  });

  it('baixa um Blob autenticado e valida tamanho depois, sem criar URL ou acessar assets editáveis', async () => {
    const created = spyOn(URL, 'createObjectURL');
    const output = await service.getPreviewBlob('saved');
    expect(client.download).toHaveBeenCalledOnceWith('published-cards/saved/preview.png');
    expect(output.type).toBe('image/png'); expect(created).not.toHaveBeenCalled();
  });

  it('rejeita download acima de 20 MiB mantendo o limite após o retorno do SDK', async () => {
    client.download.and.resolveTo(new Blob([new Uint8Array(PUBLISHED_CARD_PREVIEW_MAX_BYTES + 1)], { type: 'image/png' }));
    const error = await service.getPreviewBlob('saved').catch((failure: unknown) => failure) as PublishedCardPreviewError;
    expect(error.code).toBe('preview-invalid'); expect(error.message).toContain('inválida');
  });

  for (const [label, value] of [
    ['vazio', new Blob([], { type: 'image/png' })],
    ['MIME inválido', new Blob(['svg'], { type: 'image/svg+xml' })],
    ['sem MIME', new Blob(['png'])],
    ['valor que não é Blob', { type: 'image/png', size: 3 } as Blob]
  ] as const) {
    it(`rejeita ${label} com diagnóstico tipado sem criar URL`, async () => {
      client.download.and.resolveTo(value);
      const createUrl = spyOn(URL, 'createObjectURL');
      const error = await service.getPreviewBlob('saved').catch((failure: unknown) => failure) as PublishedCardPreviewError;
      expect(error instanceof PublishedCardPreviewError).toBeTrue();
      expect(error.code).toBe('preview-invalid');
      expect(error.cardId).toBe('saved'); expect(error.path).toBe('published-cards/saved/preview.png');
      expect(error.message).toBe('A imagem publicada desta carta está inválida.');
      expect(error.cause instanceof PublishedCardPreviewError).toBeTrue();
      expect(createUrl).not.toHaveBeenCalled();
    });
  }

  for (const code of ['storage/object-not-found', 'storage/unauthorized', 'storage/unauthenticated', 'storage/retry-limit-exceeded', 'storage/network-request-failed']) {
    it(`preserva code, cause e contexto ao receber ${code}`, async () => {
      const original = Object.assign(new Error('Mensagem SDK com informação privada'), { code });
      client.download.and.rejectWith(original);
      const cardId = '46f5c359-0d1e-423e-911e-4ba592567405';
      const error = await service.getPreviewBlob(cardId).catch((failure: unknown) => failure) as PublishedCardPreviewError;
      expect(error instanceof PublishedCardPreviewError).toBeTrue();
      expect(error.code).toBe(code); expect(error.cause).toBe(original);
      expect(error.cardId).toBe(cardId); expect(error.path).toBe(`published-cards/${cardId}/preview.png`);
      expect(error.message).not.toContain(original.message);
    });
  }

  it('preserva a causa desconhecida e mantém a mensagem segura, sem repetir URLs de download', async () => {
    const original = new Error('https://firebasestorage.googleapis.com/example?token=private');
    client.download.and.rejectWith(original);
    const error = await service.getPreviewBlob('saved').catch((failure: unknown) => failure) as PublishedCardPreviewError;
    expect(error.code).toBeNull(); expect(error.cause).toBe(original);
    expect(error.message).toBe('Não foi possível carregar a imagem publicada. Tente novamente.');
    expect(error.message).not.toContain('token');
  });

  for (const original of [new TypeError('Failed to fetch'), new DOMException('Network request failed', 'NetworkError')]) {
    it(`classifica ${original.name} de rede sem inventar diagnóstico CORS`, async () => {
      client.download.and.rejectWith(original);
      const error = await service.getPreviewBlob('saved').catch((failure: unknown) => failure) as PublishedCardPreviewError;
      expect(error.code).toBe('network'); expect(error.cause).toBe(original);
      expect(error.message).toBe('Não foi possível baixar a imagem. Confira sua conexão.');
    });
  }

  it('não expõe conteúdo sensível que venha indevidamente no campo code', async () => {
    const original = { code: 'https://example.test/image?token=private' };
    client.download.and.rejectWith(original);
    const error = await service.getPreviewBlob('saved').catch((failure: unknown) => failure) as PublishedCardPreviewError;
    expect(error.code).toBeNull(); expect(error.cause).toBe(original);
    expect(error.message).not.toContain('token');
  });

  it('inicia outro download após uma falha sem manter Promise rejeitada no serviço', async () => {
    client.download.and.rejectWith({ code: 'storage/retry-limit-exceeded' });
    await expectAsync(service.getPreviewBlob('saved')).toBeRejected();
    const output = png(); client.download.and.resolveTo(output);
    await expectAsync(service.getPreviewBlob('saved')).toBeResolvedTo(output);
    expect(client.download).toHaveBeenCalledTimes(2);
  });

  it('mantém o código preview-invalid no upload inválido e o cardId correto', async () => {
    const error = await service.uploadPreview('saved', null as unknown as Blob).catch((failure: unknown) => failure) as PublishedCardPreviewError;
    expect(error.code).toBe('preview-invalid'); expect(error.cardId).toBe('saved');
    expect(error.path).toBe('published-cards/saved/preview.png'); expect(client.upload).not.toHaveBeenCalled();
  });

  it('informa permissão, ausência e conexão/CORS sem pedir acesso administrativo ao jogador', async () => {
    expect(publishedPreviewDownloadError({ code: 'storage/object-not-found' })).toContain('ainda não foi publicada');
    expect(publishedPreviewDownloadError({ code: 'storage/unauthorized' })).toContain('não possui autorização');
    expect(publishedPreviewDownloadError({ code: 'storage/unauthenticated' })).not.toContain('administrativa');
    client.download.and.rejectWith({ code: 'storage/retry-limit-exceeded' });
    await expectAsync(service.getPreviewBlob('saved')).toBeRejectedWithError(/Confira sua conexão/);
  });

  it('aceita preview já ausente no cleanup, mas propaga falha de autorização', async () => {
    client.delete.and.rejectWith({ code: 'storage/object-not-found' });
    await expectAsync(service.deletePreview('saved')).toBeResolved();
    expect(client.delete).toHaveBeenCalledWith('published-cards/saved/preview.png');
    const denied = { code: 'storage/unauthorized' }; client.delete.and.rejectWith(denied);
    await expectAsync(service.deletePreview('saved')).toBeRejectedWith(denied);
  });
});
