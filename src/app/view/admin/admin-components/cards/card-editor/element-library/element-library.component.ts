import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CARD_IMAGE_TYPES, CARD_LIMITS } from '../../../../../../model/interfaces/Cards/card';
import { CARD_CANVAS_CONFIG, CardElementPreset, EditorAssetSelection } from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';

export function editorImageError(file: File): string | null {
  if (!CARD_IMAGE_TYPES.some(type => type === file.type)) return 'Use PNG, JPEG ou WebP.';
  if (file.size <= 0 || file.size > CARD_LIMITS.imageBytes) return 'A imagem deve ter conteúdo e até 5 MiB.';
  return file.name.length > 255 ? 'Use um nome de arquivo de até 255 caracteres.' : null;
}

@Component({
  selector: 'app-element-library', standalone: true,
  templateUrl: './element-library.component.html', styleUrl: './element-library.component.css'
})
export class ElementLibraryComponent {
  readonly state = inject(CardEditorStateService);
  readonly maxElements = CARD_CANVAS_CONFIG.maxElements;
  readonly imageTypes = CARD_IMAGE_TYPES.join(',');
  readonly imageError = signal('');
  @Output() readonly assetSelected = new EventEmitter<EditorAssetSelection>();
  readonly tools: readonly { preset: CardElementPreset; label: string; icon: string; description: string }[] = [
    { preset: 'text', label: 'Texto', icon: 'T', description: 'Texto livre ou vinculado aos dados' },
    { preset: 'artwork', label: 'Arte principal', icon: '▧', description: 'Área de personagem com máscara e crop' },
    { preset: 'image', label: 'Imagem', icon: '▨', description: 'Imagem adicional da carta' },
    { preset: 'rect', label: 'Retângulo', icon: '▭', description: 'Forma com cor, gradiente e borda' },
    { preset: 'circle', label: 'Círculo', icon: '○', description: 'Forma circular ou elíptica' },
    { preset: 'line', label: 'Linha', icon: '╱', description: 'Linha editável' },
    { preset: 'icon', label: 'Ícone', icon: '✦', description: 'Símbolo de texto personalizável' },
    { preset: 'frame', label: 'Moldura', icon: '▣', description: 'Borda editável para a carta' },
    { preset: 'badge', label: 'Badge', icon: '◆', description: 'Marcador de texto editável' },
    { preset: 'attribute', label: 'Atributo', icon: '85', description: 'Valor vinculado a um atributo de jogo' },
    { preset: 'bar', label: 'Barra', icon: '▰', description: 'Progresso vinculado a um atributo' },
    { preset: 'description', label: 'Descrição', icon: '≡', description: 'Texto vinculado à descrição da carta' }
  ];

  upload(event: Event): void {
    if (this.state.busy()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.imageError.set(editorImageError(file) ?? '');
    if (this.imageError() || this.state.canvas().elements.length >= this.maxElements) return;
    this.state.addElement('image');
    const selected = this.state.selectedElement();
    if (selected) this.assetSelected.emit({ elementId: selected.id, file });
  }
}
