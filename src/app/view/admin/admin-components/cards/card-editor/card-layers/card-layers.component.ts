import { Component, computed, inject, signal } from '@angular/core';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';

@Component({
  selector: 'app-card-layers', standalone: true,
  templateUrl: './card-layers.component.html', styleUrl: './card-layers.component.css'
})
export class CardLayersComponent {
  readonly state = inject(CardEditorStateService);
  readonly layers = computed(() => [...this.state.canvas().elements].reverse());
  readonly dragTarget = signal<string | null>(null);
  private draggedId: string | null = null;

  dragStart(id: string, event: DragEvent): void {
    if (this.state.busy()) { event.preventDefault(); return; }
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
