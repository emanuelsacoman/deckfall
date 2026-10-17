import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { CARD_ZOOMS, CardEditorAction, EditorExportOptions } from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';

@Component({
  selector: 'app-card-toolbar', standalone: true,
  templateUrl: './card-toolbar.component.html', styleUrl: './card-toolbar.component.css'
})
export class CardToolbarComponent {
  readonly state = inject(CardEditorStateService);
  readonly zooms = CARD_ZOOMS;
  private readonly zoomSteps = [0.1, ...CARD_ZOOMS, 2];
  @ViewChild('shortcutsTrigger') private shortcutsTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('shortcutsDialog') set shortcutsDialog(element: ElementRef<HTMLElement> | undefined) {
    element?.nativeElement.focus();
  }
  @Input() busy = false;
  @Input() canSave = true;
  @Input() hasSavedCard = false;
  @Input() dataValid = true;
  @Output() readonly action = new EventEmitter<CardEditorAction>();
  @Output() readonly exportRequested = new EventEmitter<EditorExportOptions>();
  format: EditorExportOptions['format'] = 'png';
  pixelRatio: EditorExportOptions['pixelRatio'] = 1;
  shortcutsOpen = false;

  get unavailable(): boolean { return this.busy || this.state.busy(); }
  zoomLabel(zoom: number): string { return `${Math.round(zoom * 100)}%`; }
  customZoom(): boolean { return !this.zooms.some(zoom => zoom === this.state.zoom()); }
  changeZoom(event: Event): void {
    if (this.unavailable) return;
    const zoom = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(zoom)) this.state.setZoom(zoom);
  }
  canStepZoom(direction: -1 | 1): boolean { return this.nextZoom(direction) !== this.state.zoom(); }
  stepZoom(direction: -1 | 1): void {
    if (!this.unavailable) this.state.setZoom(this.nextZoom(direction));
  }
  resetZoom(): void { if (!this.unavailable) this.state.setZoom(1); }
  fit(): void { if (!this.unavailable) this.state.requestFit(); }
  toggleGrid(event: Event): void { if (!this.unavailable) this.state.grid.set((event.target as HTMLInputElement).checked); }
  toggleSnap(event: Event): void { if (!this.unavailable) this.state.snap.set((event.target as HTMLInputElement).checked); }
  changeFormat(event: Event): void {
    if (this.unavailable) return;
    const format = (event.target as HTMLSelectElement).value;
    if (format === 'png' || format === 'jpeg') this.format = format;
  }
  changeRatio(event: Event): void {
    if (this.unavailable) return;
    const ratio = Number((event.target as HTMLSelectElement).value);
    if (ratio === 1 || ratio === 2 || ratio === 4) this.pixelRatio = ratio;
  }
  export(): void { if (!this.unavailable && this.dataValid) this.exportRequested.emit({ format: this.format, pixelRatio: this.pixelRatio }); }

  toggleShortcuts(): void {
    if (this.shortcutsOpen) this.closeShortcuts();
    else if (!this.unavailable) this.shortcutsOpen = true;
  }
  closeShortcuts(event?: Event): void {
    event?.preventDefault(); event?.stopPropagation();
    this.shortcutsOpen = false;
    this.shortcutsTrigger?.nativeElement.focus();
  }
  shortcutsKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.closeShortcuts(event);
  }

  private nextZoom(direction: -1 | 1): number {
    const current = this.state.zoom();
    return direction === 1 ? this.zoomSteps.find(zoom => zoom > current) ?? 2
      : [...this.zoomSteps].reverse().find(zoom => zoom < current) ?? 0.1;
  }
}
