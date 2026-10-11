import { CARD_CANVAS_CONFIG, CardCanvasData } from '../../interfaces/Cards/card-canvas';
import { defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';
import { validateCardCanvas, validateCardDocumentSize } from './card-canvas-validation';

describe('Modelo próprio do canvas — validação de dados externos', () => {
  function canvas(): CardCanvasData { return fantasyBasicCanvas(defaultCardData()); }

  it('valida o template inicial com os tipos visuais sem depender de uma serialização Konva', () => {
    const value = canvas();
    expect(validateCardCanvas(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(() => validateCardCanvas({ ...value, className: 'Stage' })).toThrowError(/Campo desconhecido/);
  });

  it('bloqueia bindings arbitrários, propriedades inesperadas e números não finitos', () => {
    const value = canvas();
    const index = value.elements.findIndex(element => element.type === 'text');
    const element = value.elements[index];
    if (element.type !== 'text') throw new Error('Texto ausente no fixture.');
    const invalid = structuredClone(value);
    const text = invalid.elements[index];
    if (text.type !== 'text') throw new Error('Texto ausente no fixture.');
    expect(() => validateCardCanvas({ ...value, elements: [{ ...element, properties: { ...element.properties, binding: 'constructor.prototype' } }] }))
      .toThrowError(/Binding inválido/);
    expect(() => validateCardCanvas({ ...value, elements: [{ ...element, properties: { ...element.properties, url: 'data:image/png;base64,anything' } }] }))
      .toThrowError(/Campo desconhecido/);
    text.x = Number.NaN;
    expect(() => validateCardCanvas(invalid)).toThrowError(/posição X/);
  });

  it('exige IDs únicos e referências de assets existentes, sem aceitar namespaces externos', () => {
    const value = canvas();
    expect(() => validateCardCanvas({ ...value, elements: [value.elements[0], value.elements[0]] })).toThrowError(/IDs de elemento repetidos/);
    const artwork = value.elements.find(element => element.type === 'artwork');
    if (!artwork || artwork.type !== 'artwork') throw new Error('Arte ausente no fixture.');
    artwork.properties.assetId = 'missing';
    expect(() => validateCardCanvas(value)).toThrowError(/referenciado.*não existe/);
    value.assets = [{ id: 'missing', storagePath: 'users/admin/a.png', fileName: 'a.png', contentType: 'image/png', size: 1 }];
    expect(() => validateCardCanvas(value)).toThrowError(/Caminho do asset inválido/);
  });

  it('aceita arquivos pendentes identificados e rejeita crop fora da área normalizada', () => {
    const value = canvas();
    value.assets = [{ id: 'pending', storagePath: null, fileName: 'a.png', contentType: 'image/png', size: 1 }];
    const artwork = value.elements.find(element => element.type === 'artwork');
    if (!artwork || artwork.type !== 'artwork') throw new Error('Arte ausente no fixture.');
    artwork.properties.assetId = 'pending';
    expect(() => validateCardCanvas(value)).not.toThrow();
    artwork.properties.crop.x = 0.5;
    expect(() => validateCardCanvas(value)).toThrowError(/crop deve permanecer/);
  });

  it('limita elementos, dimensão e bytes UTF-8 com margem para o Firestore', () => {
    const value = canvas();
    expect(() => validateCardCanvas({ ...value, width: CARD_CANVAS_CONFIG.maxDimension + 1 })).toThrowError(/largura do canvas/);
    const elements = Array.from({ length: 65 }, (_, index) => ({ ...value.elements[0], id: `element_${index}` }));
    expect(() => validateCardCanvas({ ...value, elements })).toThrowError(/até 64 itens/);
    expect(() => validateCardDocumentSize({ text: '😀'.repeat(CARD_CANVAS_CONFIG.maxBytes / 4) })).toThrowError(/128 KiB/);
    const cyclic: { next?: unknown } = {};
    cyclic.next = cyclic;
    expect(() => validateCardDocumentSize(cyclic)).toThrowError(/serializados/);
  });
});
