import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Card } from '../../../../../model/interfaces/Cards/card';
import { CARD_CANVAS_CONFIG } from '../../../../../model/interfaces/Cards/card-canvas';
import { CardPreviewService } from '../../../../../model/services/tools/card-preview.service';

@Component({
  selector: 'app-card-preview', standalone: true,
  templateUrl: './card-preview.component.html', styleUrl: './card-preview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CardPreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) card!: Card;
  @ViewChild('frame', { static: true }) private frame!: ElementRef<HTMLDivElement>;
  private readonly previews = inject(CardPreviewService);
  private observer?: IntersectionObserver;
  private request?: AbortController;
  private visible = false;
  private destroyed = false;
  private version = 0;
  readonly url = signal('');
  readonly loading = signal(false);
  readonly error = signal('');

  get aspectRatio(): string {
    return `${this.card.canvas?.width ?? CARD_CANVAS_CONFIG.width} / ${this.card.canvas?.height ?? CARD_CANVAS_CONFIG.height}`;
  }

  ngOnChanges(): void {
    ++this.version; this.request?.abort(); this.releaseUrl();
    this.error.set(''); this.loading.set(false);
    if (this.visible) void this.loadPreview();
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.visible = true; void this.loadPreview(); return;
    }
    this.observer = new IntersectionObserver(entries => {
      if (this.destroyed || this.visible || !entries.some(entry => entry.isIntersecting)) return;
      this.visible = true; this.observer?.disconnect(); void this.loadPreview();
    }, { rootMargin: '200px' });
    this.observer.observe(this.frame.nativeElement);
  }

  async loadPreview(): Promise<void> {
    if (this.destroyed || !this.visible || this.loading()) return;
    const version = ++this.version;
    const request = new AbortController(); this.request?.abort(); this.request = request;
    this.loading.set(true); this.error.set('');
    try {
      const blob = await this.previews.render(this.card, request.signal);
      if (this.destroyed || version !== this.version || request.signal.aborted) return;
      this.releaseUrl(); this.url.set(URL.createObjectURL(blob));
    } catch (error: unknown) {
      if (!this.destroyed && version === this.version && !request.signal.aborted) {
        this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar a prévia da carta.');
      }
    } finally {
      if (!this.destroyed && version === this.version) this.loading.set(false);
    }
  }

  imageFailed(): void {
    this.releaseUrl(); this.error.set('Não foi possível exibir a prévia. Tente carregá-la novamente.');
  }

  ngOnDestroy(): void {
    this.destroyed = true; ++this.version; this.request?.abort(); this.observer?.disconnect(); this.releaseUrl();
  }

  private releaseUrl(): void {
    const url = this.url(); if (url) URL.revokeObjectURL(url);
    this.url.set('');
  }
}
