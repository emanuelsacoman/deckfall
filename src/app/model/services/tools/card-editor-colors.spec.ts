import type { CardEditorDocument } from '../../interfaces/Cards/card-canvas';
import { createCanvasElement, defaultCardData } from './card-canvas-factory';
import { colorPickerHex, editorDocumentColors } from './card-editor-colors';

function documentFixture(): CardEditorDocument {
  return {
    data: defaultCardData(),
    canvas: { version: 1, width: 744, height: 1039, background: { kind: 'solid', color: '#fff', color2: 'white', angle: 0, assetId: null }, elements: [], assets: [] },
  };
}

describe('Cores do editor', () => {
  it('adapts opaque supported formats for a native picker without changing their original representation', () => {
    for (const [value, expected] of [
      ['#AbC', '#aabbcc'], ['#ABCDEF', '#abcdef'], ['#abcf', '#aabbcc'], ['#ABCDEFff', '#abcdef'],
      ['rgb(12, 34, 255)', '#0c22ff'], ['rgba(12, 34, 255, 1.0)', '#0c22ff'],
      ['green', '#008000'], ['grey', '#808080'], ['yellow', '#ffff00'],
    ]) expect(colorPickerHex(value)).withContext(value).toBe(expected);
  });

  it('keeps transparency and unsupported values out of the opaque picker', () => {
    for (const value of ['', 'transparent', '#abcd', '#11223380', 'rgba(1, 2, 3, 0.5)', 'rgb(999,0,0)', 'purple', 'url(example)']) {
      expect(colorPickerHex(value)).withContext(value).toBeNull();
    }
  });

  it('deduplicates equivalent colors while retaining the first exact spelling', () => {
    const document = documentFixture();
    const element = createCanvasElement('rect', document.data, 0);
    element.properties.fill = 'rgba(255, 255, 255, 1)';
    element.properties.stroke = '#ffffffff';
    element.properties.shadowColor = 'gray';
    document.canvas.elements.push(element);
    document.data.attributes[0].color = '#808080';
    const before = JSON.stringify(document);
    const palette = editorDocumentColors(document);
    expect(palette[0]).toBe('#fff');
    expect(palette).not.toContain('white');
    expect(palette).not.toContain('#ffffffff');
    expect(palette).not.toContain('#808080');
    expect(palette).toContain('gray');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('collects background, shape, bar, ornament and attribute colors within the requested limit', () => {
    const document = documentFixture();
    const shape = createCanvasElement('rect', document.data, 0);
    const bar = createCanvasElement('bar', document.data, 1);
    const frame = createCanvasElement('ornate-frame', document.data, 2);
    if (shape.type !== 'rect' || bar.type !== 'bar' || frame.type !== 'frame') throw new Error('Fixture inválida.');
    shape.properties.fill = '#111'; shape.properties.stroke = '#222'; shape.properties.shadowColor = '#333';
    shape.properties.gradientColor = '#444'; bar.properties.trackColor = '#555';
    frame.properties.accentColor = '#666'; frame.properties.gemColor = '#777';
    document.data.attributes[0].color = '#888';
    document.canvas.elements.push(shape, bar, frame);
    const colors = editorDocumentColors(document, 24);
    for (const color of ['#111', '#222', '#333', '#444', '#555', '#666', '#777', '#888']) expect(colors).toContain(color);
    expect(editorDocumentColors(document, 2)).toEqual(['#fff', '#111']);
    expect(editorDocumentColors(document, 0)).toEqual([]);
    expect(editorDocumentColors(document, NaN)).toEqual([]);
  });
});
