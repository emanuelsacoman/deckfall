import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Card, CARD_RARITY_LABELS, CARD_STATUS_LABELS } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { PublishedCardPreviewRepairResult, PublishedCardPreviewService } from '../../../../../model/services/cruds/cards/published-card-preview.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';
import { CardPreviewComponent } from '../card-preview/card-preview.component';

type CardDisplayMode = 'list' | 'cards';

@Component({
  selector: 'app-card-list',
  standalone: true,
  imports: [DatePipe, RouterLink, CardPreviewComponent],
  templateUrl: './card-list.component.html',
  styleUrl: './card-list.component.css'
})
export class CardListComponent implements OnInit, OnDestroy {
  private readonly service = inject(CardService);
  private readonly storage = inject(CardStorageService);
  private readonly publishedPreviews = inject(PublishedCardPreviewService);
  private readonly router = inject(Router);
  private loadVersion = 0;
  private artVersion = 0;
  private destroyed = false;

  readonly cards = signal<Card[]>([]);
  readonly displayMode = signal<CardDisplayMode>('list');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deletingId = signal<string | null>(null);
  readonly artUrls = signal<Record<string, string>>({});
  readonly artFailures = signal<Set<string>>(new Set());
  readonly feedback = signal('');
  readonly warnings = signal<string[]>([]);
  readonly synchronizingPreviews = signal(false);
  readonly previewRepairTotal = signal(0);
  readonly previewRepairResults = signal<PublishedCardPreviewRepairResult[]>([]);
  readonly previewRepairHasFailures = computed(() => this.previewRepairResults().some(result => result.status === 'failed'));
  readonly hasPublishedCards = computed(() => this.cards().some(card => card.status === 'published'));
  readonly previewRepairLabels = { synchronized: 'Sincronizada', failed: 'Falha', skipped: 'Ignorada' };
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly statusLabels = CARD_STATUS_LABELS;

  ngOnInit(): void {
    const state: unknown = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    this.readFeedback(state);
    void this.load();
  }

  async load(): Promise<void> {
    if (this.deletingId() || this.synchronizingPreviews()) return;
    const version = ++this.loadVersion;
    ++this.artVersion;
    this.releaseArtUrls();
    this.cards.set([]);
    this.artFailures.set(new Set());
    this.loading.set(true);
    this.error.set('');
    try {
      const cards = await this.service.list();
      if (!this.isCurrent(version)) return;
      this.cards.set(cards);
      if (this.displayMode() === 'list') void this.loadArt(cards, version);
    } catch (error: unknown) {
      if (this.isCurrent(version)) {
        this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar as cartas.');
      }
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  setDisplayMode(mode: CardDisplayMode): void {
    if (this.displayMode() === mode) return;
    this.displayMode.set(mode); ++this.artVersion; this.releaseArtUrls(); this.artFailures.set(new Set());
    if (mode === 'list' && !this.loading()) void this.loadArt(this.cards(), this.loadVersion);
  }

  async deleteCard(card: Card): Promise<void> {
    if (this.deletingId() || this.synchronizingPreviews() || !window.confirm(`Excluir a carta “${card.name}” e sua arte? Esta ação não pode ser desfeita.`)) return;
    this.deletingId.set(card.id);
    this.error.set('');
    try {
      await this.service.delete(card);
      if (this.destroyed) return;
      this.cards.update(cards => cards.filter(item => item.id !== card.id));
      const urls = { ...this.artUrls() };
      if (urls[card.id]) URL.revokeObjectURL(urls[card.id]);
      delete urls[card.id];
      this.artUrls.set(urls);
      this.feedback.set(`Carta “${card.name}” excluída.`);
      this.warnings.set([]);
    } catch (error: unknown) {
      if (!this.destroyed) {
        this.error.set(error instanceof Error ? error.message : 'Não foi possível excluir a carta. Tente novamente.');
      }
    } finally {
      if (!this.destroyed) this.deletingId.set(null);
    }
  }

  async synchronizePreviews(selected?: Card): Promise<void> {
    if (this.loading() || this.deletingId() || this.synchronizingPreviews() || (selected && selected.status !== 'published')) return;
    this.synchronizingPreviews.set(true);
    this.previewRepairResults.set([]);
    this.previewRepairTotal.set(0);
    this.feedback.set('');
    this.error.set('');
    try {
      // Refresh the catalogue before repairing; the service rereads each selected card too.
      const cards = await this.service.list();
      if (this.destroyed) return;
      const published = cards.filter(card => card.status === 'published' && (!selected || selected.id === card.id));
      this.previewRepairTotal.set(published.length);
      const results = await this.publishedPreviews.repairPublished(published, result => {
        if (!this.destroyed) this.previewRepairResults.update(current => [...current, result]);
      }, () => !this.destroyed);
      if (this.destroyed) return;
      const succeeded = results.filter(result => result.status === 'synchronized').length;
      const failed = results.filter(result => result.status === 'failed').length;
      const skipped = results.filter(result => result.status === 'skipped').length;
      this.feedback.set(published.length
        ? `Sincronização concluída: ${succeeded} sincronizada(s), ${failed} com falha e ${skipped} ignorada(s). Confira o resultado de cada carta.`
        : 'Nenhuma carta publicada encontrada para sincronizar. Atualize a lista para conferir o catálogo.');
    } catch {
      if (!this.destroyed) this.error.set('Não foi possível concluir a sincronização das previews publicadas. Confira a conexão e o acesso administrativo e tente novamente.');
    } finally {
      if (!this.destroyed) this.synchronizingPreviews.set(false);
    }
  }

  updatedAt(card: Card): Date | null {
    return card.updatedAt?.toDate() ?? null;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.loadVersion;
    ++this.artVersion;
    this.releaseArtUrls();
  }

  private async loadArt(cards: Card[], version: number): Promise<void> {
    const artVersion = ++this.artVersion;
    const current = (): boolean => this.isCurrent(version) && this.artVersion === artVersion && this.displayMode() === 'list';
    const withArt = cards.filter(card => card.art);
    // Bound simultaneous downloads while keeping the document list usable.
    for (let start = 0; start < withArt.length && current(); start += 4) {
      await Promise.all(withArt.slice(start, start + 4).map(async card => {
        if (!card.art) return;
        try {
          const url = await this.storage.getArtUrl(card.art);
          if (!current() || !this.cards().some(item => item.id === card.id)) {
            URL.revokeObjectURL(url);
            return;
          }
          this.artUrls.update(urls => ({ ...urls, [card.id]: url }));
        } catch {
          if (current() && this.cards().some(item => item.id === card.id)) {
            this.artFailures.update(ids => new Set([...ids, card.id]));
          }
        }
      }));
    }
  }

  private releaseArtUrls(): void {
    for (const url of Object.values(this.artUrls())) URL.revokeObjectURL(url);
    this.artUrls.set({});
  }

  private isCurrent(version: number): boolean {
    return !this.destroyed && this.loadVersion === version;
  }

  private readFeedback(state: unknown): void {
    if (!state || typeof state !== 'object' || !('cardFeedback' in state)) return;
    const feedback = state.cardFeedback;
    if (!feedback || typeof feedback !== 'object') return;
    if ('message' in feedback && typeof feedback.message === 'string') this.feedback.set(feedback.message);
    if ('warnings' in feedback && Array.isArray(feedback.warnings)) {
      this.warnings.set(feedback.warnings.filter((warning): warning is string => typeof warning === 'string'));
    }
  }
}
