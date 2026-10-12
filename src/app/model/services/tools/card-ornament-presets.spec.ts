import { TestBed } from '@angular/core/testing';
import { CardCanvasData, CardEditorDocument } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData, fantasyBasicCanvas, renderText } from './card-canvas-factory';
import { validateCardCanvas, validateCardDocumentSize } from './card-canvas-validation';
import { CardEditorStateService } from './card-editor-state.service';
import { CARD_ORNAMENT_THEMES, ornateFantasyCanvas } from './card-ornament-presets';

describe('Composições ornamentadas e contrato persistido', () => {
  it('conserva os modelos antigos e cria camadas próprias sem imagens nem nós serializados', () => {
    const data = defaultCardData();
    expect(createCanvasElement('frame', data).type).toBe('rect');
    const old = fantasyBasicCanvas(data);
    expect(validateCardCanvas(JSON.parse(JSON.stringify(old)))).toEqual(old);
    for (const theme of CARD_ORNAMENT_THEMES) {
      const canvas = ornateFantasyCanvas(data, theme.id);
      expect(validateCardCanvas(JSON.parse(JSON.stringify(canvas)))).toEqual(canvas);
      expect(canvas.elements.some(element => element.type === 'frame')).toBeTrue();
      expect(canvas.elements.some(element => element.type === 'emblem')).toBeTrue();
      expect(canvas.assets).toEqual([]);
      expect(() => validateCardDocumentSize({ data, canvas })).not.toThrow();
      const name = canvas.elements.find(element => element.type === 'text' && element.properties.binding === 'name');
      if (name?.type !== 'text') throw new Error('Título ausente.');
      expect(renderText(name.properties.text, name.properties.binding, { ...data, name: 'Mago de Fogo' })).toBe('Mago de Fogo');
      expect(canvas.elements.flatMap(element => element.type === 'attribute' && element.properties.labelMode === 'value' ? [element.properties.attributeKey] : []))
        .toEqual(data.attributes.map(attribute => attribute.key));
    }
  });

  it('suporta zero a oito atributos sem extrapolar limites de elementos e dimensões', () => {
    const data = defaultCardData();
    for (const count of [0, 1, 2, 4, 8]) {
      data.attributes = Array.from({ length: count }, (_, index) => ({ key: `attribute${index}`, label: `Atributo ${index}`, value: index }));
      for (const [width, height] of [[744, 1039], [160, 2048], [2048, 160], [160, 160], [2048, 2048]]) {
        const source = { ...fantasyBasicCanvas(data), width, height };
        const canvas = ornateFantasyCanvas(data, 'arcane', source);
        expect(validateCardCanvas(canvas)).toEqual(canvas);
        expect(canvas.elements.length).toBeLessThanOrEqual(64);
        expect(canvas.elements.every(element => element.x >= 0 && element.y >= 0 && element.x + element.width <= width && element.y + element.height <= height))
          .withContext(`${count} atributos / ${width}×${height}`).toBeTrue();
      }
    }
  });

  it('rejeita propriedades arbitrárias, sementes/detalhes fracionários e cores/relevo inválidos', () => {
    const data = defaultCardData();
    const canvas = ornateFantasyCanvas(data);
    const frame = createCanvasElement('ornate-frame', data), emblem = createCanvasElement('emblem', data);
    for (const [element, key, values] of [
      [frame, 'seed', [-1, 1000000, 1.5, NaN, '42']],
      [frame, 'detail', [-1, 13, 0.1, null]],
      [frame, 'borderWidth', [1, 129, Infinity]],
      [frame, 'frameStyle', ['unknown', null]],
      [frame, 'motif', ['<svg onload=alert(1)>', null]],
      [frame, 'accentColor', ['url(https://example.com)', '#xx0000']],
      [emblem, 'relief', [-0.1, 1.1, NaN]],
      [emblem, 'container', ['unknown', null]]
    ] as const) {
      for (const value of values) expect(() => validateCardCanvas({ ...canvas, elements: [{ ...element, properties: { ...element.properties, [key]: value } }] }))
        .withContext(`${key}: ${value}`).toThrow();
    }
    expect(() => validateCardCanvas({ ...canvas, elements: [{ ...frame, properties: { ...frame.properties, path: 'arbitrary executable data' } }] })).toThrowError(/Campo desconhecido/);
  });

  it('escolhe uma arte com arquivo quando existem janelas vazias anteriores', () => {
    const data = defaultCardData();
    const empty = createCanvasElement('artwork', data), populated = createCanvasElement('artwork', data);
    if (populated.type !== 'artwork') throw new Error('Arte ausente.');
    populated.properties.assetId = 'primary-art';
    const source = { ...fantasyBasicCanvas(data), elements: [empty, populated], assets: [
      { id: 'primary-art', storagePath: null, fileName: 'art.png', contentType: 'image/png', size: 10 }
    ] };
    const canvas = ornateFantasyCanvas(data, 'solar', source);
    expect(canvas.elements.find(element => element.type === 'artwork')?.properties).toEqual(jasmine.objectContaining({ assetId: 'primary-art' }));
    expect(validateCardCanvas(canvas)).toEqual(canvas);
  });
});

describe('Ornamentos no histórico do editor', () => {
  let state: CardEditorStateService;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [CardEditorStateService] }); state = TestBed.inject(CardEditorStateService); });

  function withArtwork(): CardEditorDocument {
    const editor = structuredClone(state.document());
    const art = editor.canvas.elements.find(element => element.type === 'artwork');
    if (art?.type !== 'artwork') throw new Error('Arte ausente.');
    art.properties.assetId = 'existing-art';
    Object.assign(art.properties, { brightness: 0.2, flipX: true, crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 } });
    editor.canvas.assets = [{ id: 'existing-art', storagePath: 'cards/old/assets/art.png', fileName: 'art.png', contentType: 'image/png', size: 10 }];
    state.load(editor);
    return editor;
  }

  it('aplica composição em um passo, conserva arte/dados/assets e desfaz/restaura exatamente', () => {
    const before = withArtwork();
    state.applyOrnamentLayout('frost');
    const after = structuredClone(state.document());
    expect(after.data).toEqual(before.data);
    expect(after.canvas.assets).toEqual(before.canvas.assets);
    const art = after.canvas.elements.find(element => element.type === 'artwork');
    expect(art?.properties).toEqual(jasmine.objectContaining({ assetId: 'existing-art', brightness: 0.2, flipX: true,
      crop: { x: 0.1, y: 0.1, width: 0.7, height: 0.8 } }));
    expect(validateCardCanvas(after.canvas)).toEqual(after.canvas);
    expect(state.dirty()).toBeTrue();
    state.undo(); expect(state.document()).toEqual(before); expect(state.dirty()).toBeFalse();
    state.redo(); expect(state.document()).toEqual(after);
  });

  it('muda apenas cores de ornamentos desbloqueados e mantém geometria, motivos e imagens', () => {
    const before = withArtwork();
    const locked = before.canvas.elements.find(element => element.type === 'emblem')!;
    locked.locked = true; state.load(before);
    state.applyOrnamentTheme('verdant');
    const theme = CARD_ORNAMENT_THEMES.find(item => item.id === 'verdant')!;
    state.canvas().elements.forEach((element, index) => {
      const original = before.canvas.elements[index];
      if ((element.type === 'frame' || element.type === 'emblem') && !element.locked) {
        expect(JSON.parse(JSON.stringify(element))).toEqual({ ...original, properties: { ...original.properties, fill: theme.fill, stroke: theme.stroke,
          accentColor: theme.accentColor, gemColor: theme.gemColor } });
      } else expect(element).toEqual(original);
    });
    expect(state.data()).toEqual(before.data);
    state.undo(); expect(state.document()).toEqual(before);
  });

  it('preserva tudo quando ocupado, fora do Design ou com uma camada bloqueada na troca de layout', () => {
    const before = withArtwork();
    state.busy.set(true); state.applyOrnamentLayout('abyss'); state.applyOrnamentTheme('abyss');
    expect(state.document()).toEqual(before);
    state.busy.set(false); state.setMode('preview'); state.applyOrnamentLayout('abyss'); state.applyOrnamentTheme('abyss');
    expect(state.document()).toEqual(before);
    state.setMode('design'); const locked = structuredClone(before); locked.canvas.elements[0].locked = true; state.load(locked);
    state.applyOrnamentLayout('abyss'); expect(state.document()).toEqual(locked); expect(state.canUndo()).toBeFalse();
  });

  it('adiciona moldura ajustada às dimensões da carta e mantém atributos ligados por identidade', () => {
    state.load({ ...state.document(), canvas: { ...state.canvas(), width: 500, height: 700 } as CardCanvasData });
    state.addElement('ornate-frame');
    expect(state.selectedElement()).toEqual(jasmine.objectContaining({ type: 'frame', width: 486, height: 686, x: 7, y: 7 }));
    const attribute = state.data().attributes[0];
    state.updateData({ ...state.data(), attributes: state.data().attributes.map(item => item.id === attribute.id ? { ...item, key: 'renamed' } : item) });
    expect(state.canvas().elements.some(element => element.type === 'attribute' && element.properties.attributeKey === 'renamed')).toBeTrue();
  });
});
