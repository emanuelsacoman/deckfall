import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { isAuthenticatedSession } from '../../../model/interfaces/Auth/auth-session';
import { CARD_RARITIES, CARD_RARITY_LABELS, CardRarity } from '../../../model/interfaces/Cards/card';
import { PlayerOwnedCard } from '../../../model/interfaces/Collection/player-card-collection';
import { PlayerCollectionService } from '../../../model/services/cruds/collection/player-collection.service';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PlayerCardPreviewComponent } from './player-card-preview/player-card-preview.component';

@Component({
  selector: 'app-game-collection',
  standalone: true,
  imports: [PlayerCardPreviewComponent],
  templateUrl: './collection.component.html',
  styleUrls: ['../game-page.css', './collection.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionComponent implements OnDestroy {
  private readonly collectionService = inject(PlayerCollectionService);
  private readonly auth = inject(AuthService);
  private activeUid: string | null | undefined;
  private version = 0;
  private destroyed = false;
  readonly rarities = CARD_RARITIES;
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly entries = signal<PlayerOwnedCard[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly rarity = signal<CardRarity | null>(null);
  readonly availableCards = computed(() => this.entries().filter(item => item.card !== null));
  readonly unavailableCount = computed(() => this.entries().length - this.availableCards().length);
  readonly totalQuantity = computed(() => this.entries().reduce((sum, item) => sum + item.collection.quantity, 0));
  readonly filteredCards = computed(() => {
    const search = this.normalize(this.search().trim());
    const rarity = this.rarity();
    return this.availableCards().filter(item => {
      const card = item.card!;
      return (!rarity || card.rarity === rarity)
        && (!search || [card.name, card.type, card.subtype].some(value => this.normalize(value ?? '').includes(search)));
    });
  });

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      const uid = isAuthenticatedSession(session) ? session.uid : null;
      if (uid === this.activeUid) return;
      this.activeUid = uid;
      ++this.version;
      this.entries.set([]);
      this.clearFilters();
      this.loading.set(true);
      this.error.set('');
      if (uid) untracked(() => { void this.loadCollection(); });
    }, { allowSignalWrites: true });
  }

  async loadCollection(): Promise<void> {
    if (this.destroyed) return;
    const session = this.auth.currentUser();
    if (!isAuthenticatedSession(session)) return;
    const uid = session.uid;
    const version = ++this.version;
    this.loading.set(true);
    this.error.set('');
    // Remove as imagens anteriores ao reler; um status pode ter mudado.
    this.entries.set([]);
    try {
      const entries = await this.collectionService.listCurrentUser();
      if (this.isCurrent(version, uid)) this.entries.set(entries);
    } catch {
      if (this.isCurrent(version, uid)) this.error.set('Não foi possível carregar sua coleção. Tente novamente.');
    } finally {
      if (this.isCurrent(version, uid)) this.loading.set(false);
    }
  }

  updateSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  clearFilters(): void { this.search.set(''); this.rarity.set(null); }
  ngOnDestroy(): void { this.destroyed = true; ++this.version; }
  private isCurrent(version: number, uid: string): boolean {
    const session = this.auth.currentUser();
    return !this.destroyed && version === this.version && isAuthenticatedSession(session) && session.uid === uid;
  }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
}
