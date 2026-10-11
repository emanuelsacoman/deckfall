import { TestBed } from '@angular/core/testing';
import { Storage } from '@angular/fire/storage';
import { CARD_LIMITS, CardArt } from '../../interfaces/Cards/card';
import { CardStorageService } from './card-storage.service';

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
});
