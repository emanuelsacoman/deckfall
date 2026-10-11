import { TestBed } from '@angular/core/testing';
import { CardEditorStateService, CardElementAlignment } from './card-editor-state.service';
import { CardCanvasElement } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, resolveCardBinding, renderText } from './card-canvas-factory';
import { validateCardCanvas } from './card-canvas-validation';

describe('Estado do editor de cartas', () => {
  let state: CardEditorStateService;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [CardEditorStateService] }); state = TestBed.inject(CardEditorStateService); });

  it('reconstrói o modelo próprio por JSON sem nós Konva, URLs ou histórico', () => {
    state.addElement('circle'); state.patchElement(state.selectedIds()[0], { x: 91, y: 125, rotation: 24 });
    const serialized = JSON.stringify(state.document());
    const parsed = JSON.parse(serialized) as { canvas: unknown };
    expect(validateCardCanvas(parsed.canvas)).toEqual(state.canvas());
    const canvas = state.canvas();
    state.load({ ...state.document(), canvas });
    expect(state.canUndo()).toBeFalse(); expect(state.dirty()).toBeFalse();
    expect(serialized).not.toContain('className'); expect(serialized).not.toContain('blob:');
  });

  it('undo/redo restaura dados e geometria, enquanto zoom não altera o documento', () => {
    const original = structuredClone(state.document());
    state.addElement('rect'); const added = structuredClone(state.document());
    state.patchElement(state.selectedIds()[0], { width: 500, rotation: 35 });
    state.undo(); expect(state.document()).toEqual(added);
    state.undo(); expect(state.document()).toEqual(original);
    state.redo(); expect(state.document()).toEqual(added);
    state.setZoom(1.5); expect(state.document()).toEqual(added);
  });

  it('duplica com ID novo, protege remoção de item bloqueado e mantém ordem', () => {
    state.addElement('text'); const first = state.selectedElement()!;
    state.duplicate(); const duplicate = state.selectedElement()!;
    expect(duplicate.id).not.toBe(first.id); expect(duplicate.x).toBe(first.x + 20);
    state.moveLayer(duplicate.id, 'bottom'); expect(state.canvas().elements[0].id).toBe(duplicate.id);
    state.toggleLocked(duplicate.id); state.remove(duplicate.id);
    expect(state.canvas().elements.some(item => item.id === duplicate.id)).toBeTrue();
    state.toggleLocked(duplicate.id); state.remove(duplicate.id);
    expect(state.canvas().elements.some(item => item.id === duplicate.id)).toBeFalse();
  });

  it('renomear a chave de atributo preserva bindings por identidade', () => {
    state.setDocument({ ...state.document(), data: { ...state.data(), attributes: state.data().attributes.map(({ id: _id, ...attribute }) => attribute) } });
    const attribute = state.data().attributes[0];
    expect(attribute.id).toBeDefined();
    state.updateData({ ...state.data(), attributes: state.data().attributes.map(item => item.id === attribute.id ? { ...item, key: 'power', value: 95 } : item) });
    const visual = state.canvas().elements.find(item => item.type === 'attribute');
    expect(visual?.type === 'attribute' && visual.properties.attributeKey).toBe('power');
    expect(resolveCardBinding('attributes.power', state.data())).toBe('95');
    expect(renderText('{{name}} / {{attributes.power}}', null, state.data())).toBe('Nova carta / 95');
    expect(resolveCardBinding('constructor.prototype', state.data())).toBe('—');
  });

  it('recusa ordem incompleta e descarta redo depois de outro comando', () => {
    const ids = state.canvas().elements.map(item => item.id);
    state.reorder(ids.slice(1)); expect(state.canvas().elements.map(item => item.id)).toEqual(ids);
    state.addElement('line'); state.undo(); expect(state.canRedo()).toBeTrue();
    state.addElement('icon'); expect(state.canRedo()).toBeFalse();
  });

  it('libera assets sem referência ao excluir, preserva compartilhados e restaura no Undo', () => {
    const image = createCanvasElement('image', state.data());
    const duplicate = { ...structuredClone(image), id: crypto.randomUUID() };
    if (image.type === 'image') image.properties.assetId = 'shared-image';
    if (duplicate.type === 'image') duplicate.properties.assetId = 'shared-image';
    state.setDocument({ ...state.document(), canvas: { ...state.canvas(), elements: [image, duplicate], assets: [
      { id: 'shared-image', storagePath: null, fileName: 'a.png', contentType: 'image/png', size: 1 }
    ] } });
    state.remove(image.id); expect(state.canvas().assets.length).toBe(1);
    state.remove(duplicate.id); expect(state.canvas().assets.length).toBe(0);
    state.undo(); expect(state.canvas().assets[0].id).toBe('shared-image');
  });

  describe('Alinhamento à carta', () => {
    const loadElement = (patch: Partial<CardCanvasElement> = {}): CardCanvasElement => {
      const element = { ...createCanvasElement('rect', state.data()), x: 37, y: 51, width: 120, height: 80, ...patch } as CardCanvasElement;
      state.load({ ...state.document(), canvas: { ...state.canvas(), width: 600, height: 800, elements: [element] } });
      state.select(element.id);
      return element;
    };

    const edges: { alignment: CardElementAlignment; x: number; y: number }[] = [
      { alignment: 'left', x: 0, y: 51 },
      { alignment: 'center-x', x: 240, y: 51 },
      { alignment: 'right', x: 480, y: 51 },
      { alignment: 'top', x: 37, y: 0 },
      { alignment: 'center-y', x: 37, y: 360 },
      { alignment: 'bottom', x: 37, y: 720 }
    ];
    for (const { alignment, x, y } of edges) {
      it(`alinha ${alignment} sem alterar o tamanho ou o outro eixo`, () => {
        loadElement(); expect(state.alignSelected(alignment)).toBeTrue();
        expect(state.selectedElement()).toEqual(jasmine.objectContaining({ x, y, width: 120, height: 80, rotation: 0 }));
        expect(state.dirty()).toBeTrue(); expect(state.canUndo()).toBeTrue();
      });
    }

    it('alinha os limites visuais de um elemento rotacionado em 90 graus', () => {
      loadElement({ rotation: 90 });
      expect(state.alignSelected('left')).toBeTrue();
      expect(state.selectedElement()!.x).toBeCloseTo(80, 8);
      state.alignSelected('top');
      expect(state.selectedElement()!.y).toBeCloseTo(0, 8);
      state.alignSelected('center-x'); state.alignSelected('center-y');
      expect(state.selectedElement()).toEqual(jasmine.objectContaining({ width: 120, height: 80, rotation: 90 }));
      expect(state.selectedElement()!.x).toBeCloseTo(340, 8);
      expect(state.selectedElement()!.y).toBeCloseTo(340, 8);
      state.alignSelected('right'); state.alignSelected('bottom');
      expect(state.selectedElement()!.x).toBeCloseTo(600, 8);
      expect(state.selectedElement()!.y).toBeCloseTo(680, 8);
    });

    it('centraliza e alinha bordas com rotação negativa de 45 graus', () => {
      loadElement({ rotation: -45 });
      state.alignSelected('center-x'); state.alignSelected('center-y');
      expect(state.selectedElement()!.x).toBeCloseTo(300 - 100 * Math.SQRT1_2, 8);
      expect(state.selectedElement()!.y).toBeCloseTo(400 + 20 * Math.SQRT1_2, 8);
      state.alignSelected('right'); state.alignSelected('top');
      expect(state.selectedElement()!.x).toBeCloseTo(600 - 200 * Math.SQRT1_2, 8);
      expect(state.selectedElement()!.y).toBeCloseTo(120 * Math.SQRT1_2, 8);
      expect(state.selectedElement()).toEqual(jasmine.objectContaining({ width: 120, height: 80, rotation: -45 }));
    });

    it('cria um passo independente para cada alinhamento e permite desfazer/refazer', () => {
      const element = loadElement(); const original = structuredClone(state.document());
      state.alignSelected('left'); const left = structuredClone(state.document());
      state.alignSelected('right'); const right = structuredClone(state.document());
      state.undo(); expect(state.document()).toEqual(left);
      state.undo(); expect(state.document()).toEqual(original); expect(state.dirty()).toBeFalse();
      state.redo(); expect(state.document()).toEqual(left);
      state.redo(); expect(state.document()).toEqual(right);
      expect(state.canvas().elements[0].id).toBe(element.id);
    });

    it('não cria mudanças para um alinhamento repetido ou diferença insignificante', () => {
      loadElement({ x: 5e-8 }); const original = structuredClone(state.document());
      expect(state.alignSelected('left')).toBeTrue();
      expect(state.document()).toEqual(original); expect(state.dirty()).toBeFalse(); expect(state.canUndo()).toBeFalse();
      state.alignSelected('center-x'); state.markSaved();
      const centered = structuredClone(state.document());
      expect(state.alignSelected('center-x')).toBeTrue();
      expect(state.document()).toEqual(centered); expect(state.dirty()).toBeFalse();
      state.undo(); expect(state.document()).toEqual(original);
    });

    it('recusa coordenadas fora dos limites sem alterar o documento ou histórico', () => {
      for (const { rotation, alignment } of [
        { rotation: -45, alignment: 'right' as const },
        { rotation: 45, alignment: 'bottom' as const }
      ]) {
        loadElement({ width: 8192, height: 8192, rotation });
        expect(validateCardCanvas(state.canvas())).toEqual(state.canvas());
        const original = structuredClone(state.document());
        expect(state.alignSelected(alignment)).toBeFalse();
        expect(state.document()).toEqual(original); expect(state.dirty()).toBeFalse(); expect(state.canUndo()).toBeFalse();
      }
    });

    const blockedCases: { name: string; prepare: () => void }[] = [
      { name: 'bloqueado', prepare: () => { loadElement({ locked: true }); } },
      { name: 'oculto', prepare: () => { loadElement({ visible: false }); } },
      { name: 'ocupado', prepare: () => { loadElement(); state.busy.set(true); } },
      { name: 'modo Dados', prepare: () => { loadElement(); state.setMode('data'); } },
      { name: 'modo Preview', prepare: () => { loadElement(); state.setMode('preview'); } },
      { name: 'sem seleção', prepare: () => { loadElement(); state.select(null); } },
      { name: 'seleção inexistente', prepare: () => { loadElement(); state.select('missing'); } }
    ];
    for (const { name, prepare } of blockedCases) {
      it(`preserva documento e histórico quando ${name}`, () => {
        prepare(); const original = structuredClone(state.document());
        expect(state.alignSelected('right')).toBeFalse(); expect(state.alignSelected('bottom')).toBeFalse();
        expect(state.document()).toEqual(original); expect(state.dirty()).toBeFalse(); expect(state.canUndo()).toBeFalse();
      });
    }
  });
});
