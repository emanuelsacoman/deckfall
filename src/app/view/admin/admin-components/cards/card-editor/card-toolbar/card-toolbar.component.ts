import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CARD_ZOOMS, CardEditorAction, EditorExportOptions } from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';

@Component({
  selector: 'app-card-toolbar', standalone: true,
  templateUrl: './card-toolbar.component.html', styleUrl: './card-toolbar.component.css'
})
export class CardToolbarComponent {
  readonly state = inject(CardEditorStateService);
  readonly zooms = CARD_ZOOMS;
  @Input() busy = false;
  @Input() canSave = true;
  @Input() hasSavedCard = false;
  @Input() dataValid = true;
  @Output() readonly action = new EventEmitter<CardEditorAction>();
  @Output() readonly exportRequested = new EventEmitter<EditorExportOptions>();
  format: EditorExportOptions['format'] = 'png';
  pixelRatio: EditorExportOptions['pixelRatio'] = 1;

  zoomLabel(zoom: number): string { return `${Math.round(zoom * 100)}%`; }
  customZoom(): boolean { return !this.zooms.some(zoom => zoom === this.state.zoom()); }
  changeZoom(event: Event): void {
    const zoom = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(zoom)) this.state.setZoom(zoom);
  }
  toggleGrid(event: Event): void { this.state.grid.set((event.target as HTMLInputElement).checked); }
  toggleSnap(event: Event): void { this.state.snap.set((event.target as HTMLInputElement).checked); }
  changeFormat(event: Event): void {
    const format = (event.target as HTMLSelectElement).value;
    if (format === 'png' || format === 'jpeg') this.format = format;
  }
  changeRatio(event: Event): void {
    const ratio = Number((event.target as HTMLSelectElement).value);
    if (ratio === 1 || ratio === 2 || ratio === 4) this.pixelRatio = ratio;
  }
  export(): void { this.exportRequested.emit({ format: this.format, pixelRatio: this.pixelRatio }); }
}
