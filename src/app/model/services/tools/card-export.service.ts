import Konva from 'konva';
import { CARD_CANVAS_CONFIG, EditorExportOptions } from '../../interfaces/Cards/card-canvas';

export async function exportCardContent(content: Konva.Group, width: number, height: number, options: EditorExportOptions): Promise<Blob> {
  if (width * height * options.pixelRatio ** 2 > CARD_CANVAS_CONFIG.maxExportPixels) {
    throw new Error('A exportação ultrapassa o limite de 32 milhões de pixels. Reduza a resolução.');
  }
  if (document.fonts) await document.fonts.ready;
  const output = new Konva.Group();
  const clone = content.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1, listening: false });
  if (options.format === 'jpeg') output.add(new Konva.Rect({ width, height, fill: '#ffffff', listening: false }));
  output.add(clone);
  try {
    clone.find('.editor-placeholder').forEach(node => node.hide());
    clone.find('Image').forEach(node => {
      if (node instanceof Konva.Image && node.filters()?.length) node.cache({ pixelRatio: options.pixelRatio });
    });
    const canvas = output.toCanvas({ x: 0, y: 0, width, height, pixelRatio: options.pixelRatio });
    return await new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('O navegador não conseguiu gerar a imagem.')),
          options.format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95);
      } catch {
        reject(new Error('Não foi possível exportar. Verifique o carregamento e a origem das imagens.'));
      }
    });
  } finally {
    output.destroy();
  }
}
