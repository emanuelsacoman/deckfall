import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { CARD_IMAGE_TYPES, CARD_LIMITS } from '../../../../../../model/interfaces/Cards/card';
import { CARD_CANVAS_CONFIG, CardElementPreset, EditorAssetSelection } from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { CARD_ORNAMENT_THEMES, CardOrnamentThemeId } from '../../../../../../model/services/tools/card-ornament-presets';

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
  readonly ornamentThemes = CARD_ORNAMENT_THEMES;
  readonly selectedTheme = signal<CardOrnamentThemeId>('ember');
  readonly pendingLayout = signal(false);
  readonly ornamentNotice = signal('');
  readonly currentTheme = computed(() => this.ornamentThemes.find(theme => theme.id === this.selectedTheme())!);
  readonly editableOrnaments = computed(() => this.state.canvas().elements.filter(element =>
    (element.type === 'frame' || element.type === 'emblem') && !element.locked).length);
  readonly hasLockedLayers = computed(() => this.state.canvas().elements.some(element => element.locked));
  readonly unavailable = computed(() => this.state.busy() || this.state.mode() !== 'design');
  @Output() readonly assetSelected = new EventEmitter<EditorAssetSelection>();
  readonly tools: readonly { preset: CardElementPreset; label: string; icon: string; description: string }[] = [
    { preset: 'text', label: 'Texto', icon: 'T', description: 'Texto livre ou vinculado aos dados' },
    { preset: 'artwork', label: 'Arte principal', icon: '▧', description: 'Área de personagem com máscara e crop' },
    { preset: 'image', label: 'Imagem', icon: '▨', description: 'Imagem adicional da carta' },
    { preset: 'rect', label: 'Retângulo', icon: '▭', description: 'Forma com cor, gradiente e borda' },
    { preset: 'circle', label: 'Círculo', icon: '○', description: 'Forma circular ou elíptica' },
    { preset: 'line', label: 'Linha', icon: '╱', description: 'Linha editável' },
    { preset: 'icon', label: 'Ícone', icon: '✦', description: 'Símbolo de texto personalizável' },
    { preset: 'ornate-frame', label: 'Moldura ornamental', icon: '❖', description: 'Metal, cantos, símbolos e variações editáveis' },
    { preset: 'emblem', label: 'Emblema vetorial', icon: '✺', description: 'Símbolo com medalhão, escudo ou sem suporte' },
    { preset: 'frame', label: 'Borda simples', icon: '▣', description: 'Borda retangular editável para a carta' },
    { preset: 'badge', label: 'Badge', icon: '◆', description: 'Marcador de texto editável' },
    { preset: 'attribute', label: 'Atributo', icon: '85', description: 'Valor vinculado a um atributo de jogo' },
    { preset: 'bar', label: 'Barra', icon: '▰', description: 'Progresso vinculado a um atributo' },
    { preset: 'description', label: 'Descrição', icon: '≡', description: 'Texto vinculado à descrição da carta' }
  ];

  chooseTheme(id: CardOrnamentThemeId): void {
    if (this.unavailable() || !this.ornamentThemes.some(theme => theme.id === id)) return;
    this.selectedTheme.set(id); this.pendingLayout.set(false); this.ornamentNotice.set('');
  }
  applyPalette(): void {
    if (this.unavailable() || !this.editableOrnaments()) return;
    this.state.applyOrnamentTheme(this.selectedTheme());
    this.pendingLayout.set(false);
    this.ornamentNotice.set(`Paleta ${this.currentTheme().label} aplicada aos ornamentos desbloqueados.`);
  }
  requestLayout(): void {
    if (this.unavailable() || this.hasLockedLayers()) return;
    this.pendingLayout.set(true); this.ornamentNotice.set('');
  }
  createLayout(): void {
    if (!this.pendingLayout() || this.unavailable() || this.hasLockedLayers()) return;
    this.state.applyOrnamentLayout(this.selectedTheme());
    this.pendingLayout.set(false);
    this.ornamentNotice.set(`Layout ${this.currentTheme().label} criado. Ajuste as camadas em Propriedades ou use Desfazer para restaurar.`);
  }
  addElement(preset: CardElementPreset): void {
    if (this.unavailable() || this.state.canvas().elements.length >= this.maxElements) return;
    this.state.addElement(preset);
  }

  upload(event: Event): void {
    if (this.unavailable()) return;
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
