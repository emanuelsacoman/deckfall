import { TestBed } from '@angular/core/testing';
import { CardEditorStateService } from './card-editor-state.service';
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
});
