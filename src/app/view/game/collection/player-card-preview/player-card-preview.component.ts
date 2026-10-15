import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject, isDevMode, signal } from '@angular/core';
import { Card } from '../../../../model/interfaces/Cards/card';
import { CARD_CANVAS_CONFIG } from '../../../../model/interfaces/Cards/card-canvas';
import { publishedCardPreviewErrorCode, publishedCardPreviewMessage } from '../../../../model/interfaces/Cards/published-card-preview-error';
import { PublishedCardStorageService, publishedCardPreviewPath } from '../../../../model/services/fire/published-card-storage.service';

/** Published PNG needs only identity/name; pack snapshots never contain editor data. */
export type PlayerCardPreviewInput = Pick<Card, 'id' | 'name'> & { canvas?: Pick<NonNullable<Card['canvas']>, 'width' | 'height'> };

@Component({
  selector: 'app-player-card-preview', standalone: true,
  templateUrl: './player-card-preview.component.html', styleUrls: ['../../game-page.css', './player-card-preview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerCardPreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) card!: PlayerCardPreviewInput;
  /** Optional cache owned by the current pack view; never shared across sessions. */
  @Input() previewCache?: Map<string, Promise<Blob>>;
  @ViewChild('frame', { static: true }) private frame!: ElementRef<HTMLDivElement>;
  private readonly storage = inject(PublishedCardStorageService);
  private observer?: IntersectionObserver;
  private visible = false;
  private destroyed = false;
  private version = 0;
  private imageRequest?: Promise<Blob>;
  private readonly loadedAspectRatio = signal<string | null>(null);
  readonly url = signal('');
  readonly loading = signal(false);
  readonly error = signal('');

  get aspectRatio(): string {
    return this.loadedAspectRatio() ?? `${this.card.canvas?.width ?? CARD_CANVAS_CONFIG.width} / ${this.card.canvas?.height ?? CARD_CANVAS_CONFIG.height}`;
  }

  ngOnChanges(): void {
    ++this.version;
    this.imageRequest = undefined;
    this.loadedAspectRatio.set(null);
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
    const cache = this.previewCache;
    let request: Promise<Blob> | undefined;
    this.loading.set(true);
    this.error.set('');
    try {
      request = cache?.get(cardId);
      if (!request) {
        request = this.storage.getPreviewBlob(cardId);
        cache?.set(cardId, request);
      }
      const blob = await request;
      if (!this.isCurrent(version)) return;
      this.releaseUrl();
      this.imageRequest = request;
      this.url.set(URL.createObjectURL(blob));
    } catch (error: unknown) {
      if (request && cache?.get(cardId) === request) cache.delete(cardId);
      if (this.isCurrent(version)) {
        this.error.set(publishedCardPreviewMessage(error));
        this.reportFailure(cardId, error);
      }
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  imageLoaded(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.currentSrc !== this.url() && image.src !== this.url()) return;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      this.loadedAspectRatio.set(`${image.naturalWidth} / ${image.naturalHeight}`);
    }
  }

  imageFailed(): void {
    if (this.imageRequest && this.previewCache?.get(this.card.id) === this.imageRequest) this.previewCache.delete(this.card.id);
    this.imageRequest = undefined;
    this.loadedAspectRatio.set(null);
    this.releaseUrl();
    const error = { code: 'preview-invalid' };
    this.error.set(publishedCardPreviewMessage(error));
    this.reportFailure(this.card.id, error);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.version;
    this.observer?.disconnect();
    this.imageRequest = undefined;
    this.releaseUrl();
  }

  private isCurrent(version: number): boolean { return !this.destroyed && version === this.version; }
  private reportFailure(cardId: string, error: unknown): void {
    if (!isDevMode()) return;
    // Only a validated identifier and deterministic path reach the console, never cause/message/URL.
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cardId)) return;
    console.warn('[Deckfall preview]', { cardId, path: publishedCardPreviewPath(cardId), code: publishedCardPreviewErrorCode(error) });
  }
  private releaseUrl(): void {
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set('');
  }
}
