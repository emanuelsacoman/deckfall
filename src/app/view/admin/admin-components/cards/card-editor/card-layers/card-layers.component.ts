import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { CardElementType } from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';

@Component({
  selector: 'app-card-layers', standalone: true,
  templateUrl: './card-layers.component.html', styleUrl: './card-layers.component.css'
})
export class CardLayersComponent {
  readonly state = inject(CardEditorStateService);
  readonly layers = computed(() => [...this.state.canvas().elements].reverse());
  readonly dragTarget = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly renameError = signal('');
  renameDraft = '';
  readonly typeLabels: Record<CardElementType, string> = {
    text: 'Texto', icon: 'Símbolo', rect: 'Retângulo', circle: 'Círculo', line: 'Linha', image: 'Imagem',
    artwork: 'Arte principal', attribute: 'Atributo', bar: 'Barra', frame: 'Moldura', emblem: 'Emblema'
  };
  @ViewChild('renameInput') set renameInput(input: ElementRef<HTMLInputElement> | undefined) {
    input?.nativeElement.focus(); input?.nativeElement.select();
  }
  private draggedId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.editingId();
      if (!id) return;
      const layer = this.state.canvas().elements.find(item => item.id === id);
      if (this.state.busy() || this.state.mode() !== 'design' || !layer || layer.locked || this.state.selectedIds()[0] !== id) this.cancelRename();
    }, { allowSignalWrites: true });
  }

  beginRename(id = this.state.selectedIds()[0]): boolean {
    const layer = this.state.canvas().elements.find(item => item.id === id);
    if (this.state.busy() || this.state.mode() !== 'design' || !layer || layer.locked) return false;
    this.state.select(layer.id); this.endDrag();
    this.renameDraft = layer.name; this.renameError.set(''); this.editingId.set(layer.id);
    return true;
  }

  changeRename(event: Event): void { this.renameDraft = (event.target as HTMLInputElement).value; this.renameError.set(''); }

  confirmRename(): void {
    const id = this.editingId();
    const layer = this.state.canvas().elements.find(item => item.id === id);
    if (this.state.busy() || this.state.mode() !== 'design' || !layer || layer.locked) return;
    if (!this.renameDraft.trim() || this.renameDraft.length > 120) {
      this.renameError.set('Informe um nome de até 120 caracteres.'); return;
    }
    this.state.patchElement(layer.id, { name: this.renameDraft.trim() });
    this.cancelRename(); this.focusLayer(layer.id);
  }

  cancelRename(restoreFocus = false): void {
    const id = this.editingId(); this.editingId.set(null); this.renameError.set('');
    if (restoreFocus && id) this.focusLayer(id);
  }

  renameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.confirmRename(); }
    else if (event.key === 'Escape') {
      const id = this.editingId(); event.preventDefault(); event.stopPropagation(); this.cancelRename();
      if (id) this.focusLayer(id);
    }
  }

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private focusLayer(id: string): void { this.host.nativeElement.querySelector<HTMLButtonElement>(`[data-layer-id="${id}"] .layer-select`)?.focus(); }

  dragStart(id: string, event: DragEvent): void {
    if (this.state.busy() || this.editingId()) { event.preventDefault(); return; }
    this.draggedId = id;
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  dragOver(id: string, event: DragEvent): void {
    if (!this.draggedId || this.state.busy()) return;
    event.preventDefault();
    this.dragTarget.set(id);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  drop(id: string, event: DragEvent): void {
    event.preventDefault();
    const source = this.draggedId;
    this.endDrag();
    if (!source || source === id || this.state.busy()) return;
    const ids = this.layers().map(element => element.id).filter(elementId => elementId !== source);
    const index = ids.indexOf(id);
    if (index < 0) return;
    ids.splice(index, 0, source);
    this.state.reorder(ids.reverse());
  }

  endDrag(): void {
    this.draggedId = null;
    this.dragTarget.set(null);
  }
}
