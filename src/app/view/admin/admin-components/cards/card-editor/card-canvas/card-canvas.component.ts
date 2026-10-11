import {
  AfterViewInit, ChangeDetectionStrategy, Component, effect, ElementRef, EventEmitter,
  inject, Input, OnDestroy, Output, signal, ViewChild
} from '@angular/core';
import { EditorExportOptions } from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { CardKonvaRenderer } from '../../../../../../model/services/tools/card-konva-renderer';

@Component({
  selector: 'app-card-canvas',
  standalone: true,
  templateUrl: './card-canvas.component.html',
  styleUrl: './card-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CardCanvasComponent implements AfterViewInit, OnDestroy {
  readonly state = inject(CardEditorStateService);
  @ViewChild('viewport', { static: true }) private viewport!: ElementRef<HTMLDivElement>;
  @Input() set assetUrls(value: Record<string, string>) { this.urls.set(value ?? {}); }
  @Output() readonly renderError = new EventEmitter<string>();
  private readonly urls = signal<Record<string, string>>({});
  private readonly ready = signal(false);
  private renderer?: CardKonvaRenderer;
  private observer?: ResizeObserver;
  private destroyed = false;
  private fitMode = true;
  private lastFitRevision = -1;
  private lastZoom = this.state.zoom();
  private readonly synchronization = effect(() => {
    const ready = this.ready();
    const document = this.state.document();
    const zoom = this.state.zoom();
    const revision = this.state.fitRevision();
    const mode = this.state.mode(), busy = this.state.busy();
    const selectedId = this.state.selectedIds()[0] ?? null;
    const grid = this.state.grid(), snap = this.state.snap(), urls = this.urls();
    if (!ready || !this.renderer) return;
    this.renderer.render(document, { zoom, mode, busy, selectedId, grid, snap }, urls);
    if (revision !== this.lastFitRevision) {
      this.lastFitRevision = revision;
      this.fitMode = true;
      this.lastZoom = this.renderer.fitZoom();
      this.state.setZoom(this.lastZoom);
    } else {
      if (zoom !== this.lastZoom) this.fitMode = false;
      this.lastZoom = zoom;
    }
  }, { allowSignalWrites: true });

  ngAfterViewInit(): void {
    this.renderer = new CardKonvaRenderer(this.viewport.nativeElement, {
      select: id => { if (!this.state.busy()) this.state.select(id); },
      change: (id, geometry) => { if (!this.state.busy()) this.state.patchElement(id, geometry); },
      zoom: value => { this.fitMode = false; this.state.setZoom(value); },
      error: message => queueMicrotask(() => { if (!this.destroyed) this.renderError.emit(message); })
    });
    this.observer = new ResizeObserver(() => {
      if (this.destroyed || !this.renderer) return;
      this.renderer.resize();
      if (this.fitMode) {
        this.lastZoom = this.renderer.fitZoom();
        this.state.setZoom(this.lastZoom);
      }
    });
    this.observer.observe(this.viewport.nativeElement);
    this.ready.set(true);
  }

  async exportImage(options: EditorExportOptions): Promise<Blob> {
    if (!this.renderer) throw new Error('O canvas ainda não está pronto.');
    this.renderer.render(this.state.document(), {
      zoom: this.state.zoom(), grid: this.state.grid(), snap: this.state.snap(), mode: this.state.mode(),
      busy: this.state.busy(), selectedId: this.state.selectedIds()[0] ?? null
    }, this.urls());
    return this.renderer.exportImage(options);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.synchronization.destroy(); this.observer?.disconnect(); this.renderer?.destroy();
  }
}
