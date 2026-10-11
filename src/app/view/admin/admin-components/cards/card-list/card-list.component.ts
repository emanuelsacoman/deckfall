import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Card, CARD_RARITY_LABELS, CARD_STATUS_LABELS } from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';

@Component({
  selector: 'app-card-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './card-list.component.html',
  styleUrl: './card-list.component.css'
})
export class CardListComponent implements OnInit, OnDestroy {
  private readonly service = inject(CardService);
  private readonly storage = inject(CardStorageService);
  private readonly router = inject(Router);
  private loadVersion = 0;
  private destroyed = false;

  readonly cards = signal<Card[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deletingId = signal<string | null>(null);
  readonly artUrls = signal<Record<string, string>>({});
  readonly artFailures = signal<Set<string>>(new Set());
  readonly feedback = signal('');
  readonly warnings = signal<string[]>([]);
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly statusLabels = CARD_STATUS_LABELS;

  ngOnInit(): void {
    const state: unknown = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    this.readFeedback(state);
    void this.load();
  }

  async load(): Promise<void> {
    if (this.deletingId()) return;
    const version = ++this.loadVersion;
    this.releaseArtUrls();
    this.cards.set([]);
    this.artFailures.set(new Set());
    this.loading.set(true);
    this.error.set('');
    try {
      const cards = await this.service.list();
      if (!this.isCurrent(version)) return;
      this.cards.set(cards);
      void this.loadArt(cards, version);
    } catch (error: unknown) {
      if (this.isCurrent(version)) {
        this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar as cartas.');
      }
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  async deleteCard(card: Card): Promise<void> {
    if (this.deletingId() || !window.confirm(`Excluir a carta “${card.name}” e sua arte? Esta ação não pode ser desfeita.`)) return;
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

  updatedAt(card: Card): Date | null {
    return card.updatedAt?.toDate() ?? null;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.loadVersion;
    this.releaseArtUrls();
  }

  private async loadArt(cards: Card[], version: number): Promise<void> {
    const withArt = cards.filter(card => card.art);
    // Bound simultaneous downloads while keeping the document list usable.
    for (let start = 0; start < withArt.length && this.isCurrent(version); start += 4) {
      await Promise.all(withArt.slice(start, start + 4).map(async card => {
        if (!card.art) return;
        try {
          const url = await this.storage.getArtUrl(card.art);
          if (!this.isCurrent(version) || !this.cards().some(item => item.id === card.id)) {
            URL.revokeObjectURL(url);
            return;
          }
          this.artUrls.update(urls => ({ ...urls, [card.id]: url }));
        } catch {
          if (this.isCurrent(version) && this.cards().some(item => item.id === card.id)) {
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
