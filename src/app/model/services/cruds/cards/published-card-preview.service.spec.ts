import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { Card } from '../../../interfaces/Cards/card';
import { PublishedCardStorageService } from '../../fire/published-card-storage.service';
import { defaultCardData } from '../../tools/card-canvas-factory';
import { CardPreviewService } from '../../tools/card-preview.service';
import { PUBLISHED_CARD_PREVIEW_READER, PublishedCardPreviewReader, PublishedCardPreviewService } from './published-card-preview.service';

describe('Sincronização da representação publicada', () => {
  let service: PublishedCardPreviewService;
  let reader: jasmine.SpyObj<PublishedCardPreviewReader>;
  let renderer: jasmine.SpyObj<CardPreviewService>;
  let storage: jasmine.SpyObj<PublishedCardStorageService>;
  let current: Card | null;
  const blob = new Blob(['png'], { type: 'image/png' });

  function card(status: Card['status'] = 'published', version = 1): Card {
    return { ...defaultCardData(), status, id: 'saved', slug: 'saved', art: null,
      createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(version) };
  }

  beforeEach(() => {
    reader = jasmine.createSpyObj<PublishedCardPreviewReader>('Cartas atuais', ['getById']);
    renderer = jasmine.createSpyObj<CardPreviewService>('Renderer existente', ['render']);
    storage = jasmine.createSpyObj<PublishedCardStorageService>('Preview publicada', ['uploadPreview', 'deletePreview']);
    current = card(); reader.getById.and.callFake(async () => current);
    renderer.render.and.resolveTo(blob); storage.uploadPreview.and.resolveTo(); storage.deletePreview.and.resolveTo();
    TestBed.configureTestingModule({ providers: [
      { provide: PUBLISHED_CARD_PREVIEW_READER, useValue: reader },
      { provide: CardPreviewService, useValue: renderer },
      { provide: PublishedCardStorageService, useValue: storage }
    ] });
    service = TestBed.inject(PublishedCardPreviewService);
  });

  it('renderiza a carta do servidor, confirma versão antes do upload e confirma estado após', async () => {
    expect(await service.synchronize('saved')).toEqual([]);
    expect(renderer.render).toHaveBeenCalledOnceWith(current!);
    expect(reader.getById).toHaveBeenCalledTimes(3);
    expect(storage.uploadPreview).toHaveBeenCalledOnceWith('saved', blob);
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('descarta render obsoleto se outra sessão editar a carta durante a geração', async () => {
    renderer.render.and.callFake(async () => { current = card('published', 2); return blob; });
    const warnings = await service.synchronize('saved');
    expect(warnings.join(' ')).toContain('mudou em outra sessão');
    expect(storage.uploadPreview).not.toHaveBeenCalled(); expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('não faz upload se a carta virar draft ou for excluída enquanto renderiza', async () => {
    for (const next of [card('draft', 2), null]) {
      current = card(); renderer.render.and.callFake(async () => { current = next; return blob; });
      expect((await service.synchronize('saved')).length).toBe(1);
    }
    expect(storage.uploadPreview).not.toHaveBeenCalled();
  });

  it('retorna warning de inconsistência se ocorrer edição durante upload, sem compensação que apague preview nova', async () => {
    storage.uploadPreview.and.callFake(async () => { current = card('published', 2); });
    expect((await service.synchronize('saved')).join(' ')).toContain('desatualizada');
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('remove preview depois de confirmar draft e archived, sem renderer', async () => {
    for (const status of ['draft', 'archived'] as const) {
      current = card(status);
      expect(await service.synchronize('saved')).toEqual([]);
    }
    expect(storage.deletePreview).toHaveBeenCalledTimes(2); expect(renderer.render).not.toHaveBeenCalled();
  });

  it('preserva preview quando uma carta voltar a published antes do cleanup', async () => {
    reader.getById.and.returnValues(Promise.resolve(card('draft')), Promise.resolve(card('published', 2)));
    expect((await service.synchronize('saved')).join(' ')).toContain('mudou em outra sessão');
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('avisa se uma nova publicação acontecer durante o delete de uma preview não publicada', async () => {
    current = card('archived');
    storage.deletePreview.and.callFake(async () => { current = card('published', 2); });
    expect((await service.synchronize('saved')).join(' ')).toContain('mudou em outra sessão');
    expect(storage.deletePreview).toHaveBeenCalledOnceWith('saved');
    expect(storage.uploadPreview).not.toHaveBeenCalled();
  });

  it('preserva preview quando não há timestamp verificável', async () => {
    current = { ...card(), updatedAt: null };
    expect((await service.synchronize('saved')).length).toBe(1);
    expect(storage.uploadPreview).not.toHaveBeenCalled();
  });

  it('mantém save confirmado como warning claro em falhas de render e upload', async () => {
    renderer.render.and.rejectWith(new Error('Imagem privada indisponível.'));
    const renderWarning = (await service.synchronize('saved')).join(' ');
    expect(renderWarning).toContain('A carta foi salva');
    expect(renderWarning).toContain('Imagem privada indisponível.');
    expect(renderWarning).not.toContain('Rules publicadas');
    expect(storage.uploadPreview).not.toHaveBeenCalled();
    renderer.render.and.resolveTo(blob); storage.uploadPreview.and.rejectWith(new Error('Upload negado.'));
    const warning = (await service.synchronize('saved')).join(' ');
    expect(warning).toContain('published-cards/saved/preview.png'); expect(warning).toContain('salve novamente');
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('orienta corrigir Rules e perfil antes de repetir um upload não autorizado', async () => {
    for (const code of ['storage/unauthorized', 'storage/unauthenticated']) {
      storage.uploadPreview.and.rejectWith(Object.assign(new Error('Upload sem permissão.'), { code }));
      const warnings = await service.synchronize('saved');
      expect(warnings.length).toBe(1);
      const warning = warnings[0];
      expect(warning).toContain('A carta foi salva');
      expect(warning).toContain('published-cards/saved/preview.png não pôde ser sincronizada');
      expect(warning).toContain('Rules publicadas do Storage');
      expect(warning).toContain('perfil administrativo desta conta antes de tentar novamente');
      expect(warning).toContain('Depois de corrigir a permissão, reabra a carta e salve novamente');
      expect(warning).toContain('Upload sem permissão.');
    }
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('avisa remoção não autorizada de draft e archived sem gerar ou enviar uma imagem', async () => {
    for (const status of ['draft', 'archived'] as const) {
      current = card(status);
      for (const code of ['storage/unauthorized', 'storage/unauthenticated']) {
        storage.deletePreview.and.rejectWith(Object.assign(new Error('Remoção sem permissão.'), { code }));
        const warnings = await service.synchronize('saved');
        expect(warnings.length).toBe(1);
        const warning = warnings[0];
        expect(warning).toContain('A carta foi salva');
        expect(warning).toContain('published-cards/saved/preview.png não pôde ser removida');
        expect(warning).toContain('Rules publicadas do Storage');
        expect(warning).toContain('perfil administrativo desta conta antes de tentar novamente');
        expect(warning).toContain('Depois de corrigir a permissão');
        expect(warning).toContain('Remoção sem permissão.');
      }
    }
    expect(storage.deletePreview).toHaveBeenCalledTimes(4);
    expect(renderer.render).not.toHaveBeenCalled(); expect(storage.uploadPreview).not.toHaveBeenCalled();
  });

  it('informa falha de leitura ou cleanup sem transformar save em erro', async () => {
    reader.getById.and.rejectWith(new Error('Offline.'));
    expect((await service.synchronize('saved')).join(' ')).toContain('Offline.');
    current = card('archived'); reader.getById.and.callFake(async () => current);
    storage.deletePreview.and.rejectWith(new Error('Delete negado.'));
    expect((await service.synchronize('saved')).join(' ')).toContain('A carta foi salva');
  });

  it('limpa preview de carta excluída somente após confirmar ausência no servidor', async () => {
    current = null;
    expect(await service.cleanupDeleted('saved')).toEqual([]);
    expect(storage.deletePreview).toHaveBeenCalledOnceWith('saved'); expect(renderer.render).not.toHaveBeenCalled();
  });

  it('preserva a preview de um documento recriado e informa cleanup não confirmado', async () => {
    expect((await service.cleanupDeleted('saved')).join(' ')).toContain('existe novamente');
    expect(storage.deletePreview).not.toHaveBeenCalled();
    reader.getById.and.rejectWith(new Error('Offline.'));
    const warning = (await service.cleanupDeleted('saved')).join(' ');
    expect(warning).toContain('exclusão da carta já foi confirmada');
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('informa falha do delete da preview sem falsa reversão da exclusão', async () => {
    current = null; storage.deletePreview.and.rejectWith(new Error('Storage indisponível.'));
    expect((await service.cleanupDeleted('saved')).join(' ')).toContain('exclusão da carta já foi confirmada');
  });

  it('orienta corrigir a permissão da limpeza sem pedir que a carta excluída seja salva', async () => {
    current = null;
    for (const code of ['storage/unauthorized', 'storage/unauthenticated']) {
      storage.deletePreview.and.rejectWith(Object.assign(new Error('Limpeza sem permissão.'), { code }));
      const warning = (await service.cleanupDeleted('saved')).join(' ');
      expect(warning).toContain('A exclusão da carta já foi confirmada');
      expect(warning).toContain('Rules publicadas do Storage');
      expect(warning).toContain('perfil administrativo desta conta antes de tentar a limpeza novamente');
      expect(warning).toContain('Limpeza sem permissão.');
      expect(warning).not.toContain('salve novamente');
    }
    expect(renderer.render).not.toHaveBeenCalled(); expect(storage.uploadPreview).not.toHaveBeenCalled();
  });

  it('avisa se a carta for recriada durante o delete da representação de uma exclusão confirmada', async () => {
    current = null;
    storage.deletePreview.and.callFake(async () => { current = card('published', 2); });
    const warning = (await service.cleanupDeleted('saved')).join(' ');
    expect(warning).toContain('recriado durante a limpeza'); expect(warning).toContain('salve a versão atual');
    expect(storage.deletePreview).toHaveBeenCalledOnceWith('saved');
  });
});
