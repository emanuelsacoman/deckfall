import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Card } from '../../../../model/interfaces/Cards/card';
import { CARD_CANVAS_CONFIG } from '../../../../model/interfaces/Cards/card-canvas';
import { PublishedCardStorageService } from '../../../../model/services/fire/published-card-storage.service';

@Component({
  selector: 'app-player-card-preview', standalone: true,
  templateUrl: './player-card-preview.component.html', styleUrl: './player-card-preview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerCardPreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) card!: Card;
  @ViewChild('frame', { static: true }) private frame!: ElementRef<HTMLDivElement>;
  private readonly storage = inject(PublishedCardStorageService);
  private observer?: IntersectionObserver;
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
    ++this.version;
    this.releaseUrl();
    this.error.set('');
    this.loading.set(false);
    if (this.visible) void this.loadPreview();
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.visible = true;
      void this.loadPreview();
      return;
    }
    this.observer = new IntersectionObserver(entries => {
      if (this.destroyed || this.visible || !entries.some(entry => entry.isIntersecting)) return;
      this.visible = true;
      this.observer?.disconnect();
      void this.loadPreview();
    }, { rootMargin: '200px' });
    this.observer.observe(this.frame.nativeElement);
  }

  async loadPreview(): Promise<void> {
    if (this.destroyed || !this.visible || this.loading()) return;
    const version = ++this.version;
    const cardId = this.card.id;
    this.loading.set(true);
    this.error.set('');
    try {
      const blob = await this.storage.getPreviewBlob(cardId);
      if (!this.isCurrent(version)) return;
      this.releaseUrl();
      this.url.set(URL.createObjectURL(blob));
    } catch {
      if (this.isCurrent(version)) this.error.set('A imagem publicada não está disponível. Tente novamente.');
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  imageFailed(): void {
    this.releaseUrl();
    this.error.set('Não foi possível exibir a carta. Tente novamente.');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.version;
    this.observer?.disconnect();
    this.releaseUrl();
  }

  private isCurrent(version: number): boolean { return !this.destroyed && version === this.version; }
  private releaseUrl(): void {
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set('');
  }
}
