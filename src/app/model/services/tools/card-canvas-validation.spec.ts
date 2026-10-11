import { CARD_CANVAS_CONFIG, CardCanvasData } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData, fantasyBasicCanvas } from './card-canvas-factory';
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

  it('mantém documentos anteriores intactos sem preencher propriedades opcionais de personalização', () => {
    const value = canvas();
    const normalized = validateCardCanvas(value);
    expect(normalized).toEqual(value);
    for (const element of normalized.elements) {
      expect('borderStyle' in element.properties).toBeFalse();
      expect('textDecoration' in element.properties).toBeFalse();
      expect('verticalAlign' in element.properties).toBeFalse();
      expect('flipX' in element.properties).toBeFalse();
      expect('brightness' in element.properties).toBeFalse();
    }
  });

  it('conserva estilos de borda, decoração, alinhamento e efeitos opcionais no JSON validado', () => {
    const value = canvas();
    const text = createCanvasElement('text', defaultCardData());
    const attribute = createCanvasElement('attribute', defaultCardData());
    const image = createCanvasElement('image', defaultCardData());
    if (text.type !== 'text' || attribute.type !== 'attribute' || image.type !== 'image') throw new Error('Tipos ausentes no fixture.');
    text.properties = { ...text.properties, borderStyle: 'dashed', textDecoration: 'underline line-through', verticalAlign: 'bottom' };
    attribute.properties = { ...attribute.properties, borderStyle: 'dotted', textDecoration: 'line-through', verticalAlign: 'top' };
    image.properties = { ...image.properties, borderStyle: 'solid', flipX: true, flipY: false, brightness: 0.2, contrast: 15, saturation: -0.5, hue: -120 };
    value.elements = [text, attribute, image];
    expect(validateCardCanvas(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it('rejeita valores opcionais presentes com formato inválido em vez de substituí-los por defaults', () => {
    const value = canvas();
    const cases = [
      { preset: 'rect', field: 'borderStyle', invalid: [null, undefined, false, 1, 'double'] },
      { preset: 'text', field: 'textDecoration', invalid: [null, undefined, false, 1, 'overline'] },
      { preset: 'attribute', field: 'verticalAlign', invalid: [null, undefined, false, 1, 'center'] },
      { preset: 'image', field: 'flipX', invalid: [null, undefined, 0, 'true'] },
      { preset: 'artwork', field: 'flipY', invalid: [null, undefined, 1, 'false'] },
      { preset: 'image', field: 'brightness', invalid: [null, undefined, false, '0', -1.01, 1.01, NaN, Infinity] },
      { preset: 'image', field: 'contrast', invalid: [null, undefined, false, '0', -100.01, 100.01, NaN, Infinity] },
      { preset: 'image', field: 'saturation', invalid: [null, undefined, false, '0', -1.01, 1.01, NaN, Infinity] },
      { preset: 'image', field: 'hue', invalid: [null, undefined, false, '0', -180.01, 180.01, NaN, Infinity] }
    ] as const;
    for (const { preset, field, invalid } of cases) {
      const element = createCanvasElement(preset, defaultCardData());
      for (const rejected of invalid) {
        expect(() => validateCardCanvas({ ...value, elements: [{ ...element, properties: { ...element.properties, [field]: rejected } }] }))
          .withContext(`${preset}.${field}: ${String(rejected)}`).toThrow();
      }
    }
  });

  it('aceita os extremos de efeitos e impede propriedades de imagem em outros tipos', () => {
    const value = canvas();
    const image = createCanvasElement('image', defaultCardData());
    if (image.type !== 'image') throw new Error('Imagem ausente no fixture.');
    for (const direction of [-1, 1]) {
      image.properties = { ...image.properties, brightness: direction, contrast: 100 * direction,
        saturation: direction, hue: 180 * direction, flipX: false, flipY: true };
      value.elements = [image];
      expect(validateCardCanvas(value)).toEqual(value);
    }
    const text = createCanvasElement('text', defaultCardData());
    expect(() => validateCardCanvas({ ...value, elements: [{ ...text, properties: { ...text.properties, flipX: true } }] }))
      .toThrowError(/Campo desconhecido/);
  });
});
