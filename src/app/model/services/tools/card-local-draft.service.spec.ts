import { TestBed } from '@angular/core/testing';
import { CardLocalDraftService } from './card-local-draft.service';
import { defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';

describe('Rascunho local do editor', () => {
  it('preserva o modelo e binário em IndexedDB para reabrir em outra instância', async () => {
    TestBed.configureTestingModule({ providers: [CardLocalDraftService] });
    const service = TestBed.inject(CardLocalDraftService);
    const data = defaultCardData(); const document = { data, canvas: fantasyBasicCanvas(data) };
    document.canvas.assets.push({ id: 'test-image', storagePath: null, fileName: 'teste.png', contentType: 'image/png', size: 3 });
    const key = `test-${crypto.randomUUID()}`;
    await service.save(key, document, [{ id: 'test-image', file: new File([new Uint8Array([1, 2, 3])], 'teste.png', { type: 'image/png' }) }]);
    const reopened = await new CardLocalDraftService().load(key);
    expect(reopened?.document).toEqual(document);
    expect(reopened?.files[0].file.name).toBe('teste.png');
    expect([...new Uint8Array(await reopened!.files[0].file.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});
