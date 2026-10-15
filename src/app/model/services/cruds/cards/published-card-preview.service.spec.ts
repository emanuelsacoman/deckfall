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
    expect(renderWarning).toContain('não pôde ser sincronizada');
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
      expect(warning).toContain(`Código: ${code}`);
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
        expect(warning).toContain(`Código: ${code}`);
      }
    }
    expect(storage.deletePreview).toHaveBeenCalledTimes(4);
    expect(renderer.render).not.toHaveBeenCalled(); expect(storage.uploadPreview).not.toHaveBeenCalled();
  });

  it('informa falha de leitura ou cleanup sem transformar save em erro', async () => {
    reader.getById.and.rejectWith(new Error('Offline.'));
    expect((await service.synchronize('saved')).join(' ')).toContain('não pôde ser sincronizada');
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
      expect(warning).toContain(`Código: ${code}`);
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

  it('repara Nyra no caminho determinístico sem alterar o documento e ignora duplicadas, draft e archived', async () => {
    const nyraId = '46f5c359-0d1e-423e-911e-4ba592567405';
    current = { ...card(), id: nyraId, name: 'Nyra' };
    const onResult = jasmine.createSpy('resultado por carta');
    const results = await service.repairPublished([current, current, card('draft'), card('archived')], onResult);
    expect(results).toEqual([{
      cardId: nyraId, name: 'Nyra', path: `published-cards/${nyraId}/preview.png`, status: 'synchronized',
      message: 'PNG publicado regenerado e enviado. A versão da carta foi conferida.'
    }]);
    expect(reader.getById).toHaveBeenCalledTimes(3);
    expect(renderer.render).toHaveBeenCalledOnceWith(current!);
    expect(storage.uploadPreview).toHaveBeenCalledOnceWith(nyraId, blob);
    expect(storage.deletePreview).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledOnceWith(results[0]);
  });

  it('não remove nem gera preview se a carta foi retirada ou excluída antes do reparo', async () => {
    for (const next of [card('draft'), card('archived'), null]) {
      current = next;
      const results = await service.repairPublished([card()], () => {});
      expect(results[0].status).toBe('skipped');
    }
    expect(storage.deletePreview).not.toHaveBeenCalled();
    expect(storage.uploadPreview).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('detecta mudança de versão durante o reparo sem declarar sucesso', async () => {
    renderer.render.and.callFake(async () => { current = card('published', 2); return blob; });
    const results = await service.repairPublished([card()], () => {});
    expect(results[0].status).toBe('failed');
    expect(results[0].message).toContain('mudou durante a sincronização');
    expect(storage.uploadPreview).not.toHaveBeenCalled();
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('continua após falha de uma carta e limita o reparo a uma renderização simultânea', async () => {
    const entries = ['one', 'two', 'three'].map(id => ({ ...card(), id, name: id }));
    reader.getById.and.callFake(async id => entries.find(entry => entry.id === id)!);
    let inFlight = 0;
    let maxInFlight = 0;
    renderer.render.and.callFake(async current => {
      ++inFlight; maxInFlight = Math.max(inFlight, maxInFlight);
      await Promise.resolve();
      --inFlight;
      if (current.id === 'two') throw Object.assign(new Error('Bearer secret https://private.invalid?token=secret'), { code: 'storage/unauthorized' });
      return blob;
    });
    const results = await service.repairPublished(entries, () => {});
    expect(results.map(result => result.status)).toEqual(['synchronized', 'failed', 'synchronized']);
    expect(maxInFlight).toBe(1);
    expect(results[1].message).toContain('storage/unauthorized');
    expect(results[1].message).not.toContain('secret');
    expect(results[1].message).not.toContain('https://');
    expect(storage.uploadPreview).toHaveBeenCalledTimes(2);
    expect(storage.deletePreview).not.toHaveBeenCalled();
  });

  it('não inicia outras cartas quando a página é destruída durante o lote', async () => {
    const entries = ['one', 'two'].map(id => ({ ...card(), id, name: id }));
    reader.getById.and.callFake(async id => entries.find(entry => entry.id === id)!);
    let keepGoing = true;
    const results = await service.repairPublished(entries, () => { keepGoing = false; }, () => keepGoing);
    expect(results.length).toBe(1);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(storage.uploadPreview).toHaveBeenCalledOnceWith('one', blob);
  });

  it('remove detalhes sensíveis dos avisos de save e limpeza, conservando o código Firebase', async () => {
    const sensitive = Object.assign(new Error('Authorization: Bearer private-token https://storage.invalid?token=private-token'), { code: 'storage/unauthorized' });
    storage.uploadPreview.and.rejectWith(sensitive);
    const saved = (await service.synchronize('saved')).join(' ');
    current = null; storage.deletePreview.and.rejectWith(sensitive);
    const cleanup = (await service.cleanupDeleted('saved')).join(' ');
    for (const warning of [saved, cleanup]) {
      expect(warning).toContain('storage/unauthorized');
      expect(warning).not.toContain('private-token');
      expect(warning).not.toContain('Authorization');
      expect(warning).not.toContain('https://');
    }
  });
});
