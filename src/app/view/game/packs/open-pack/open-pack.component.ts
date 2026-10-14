import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { isAuthenticatedSession } from '../../../../model/interfaces/Auth/auth-session';
import { CARD_RARITY_LABELS } from '../../../../model/interfaces/Cards/card';
import { PackOpenedCard, PlayerPack } from '../../../../model/interfaces/Packs/player-pack';
import { PlayerPackService } from '../../../../model/services/cruds/packs/player-pack.service';
import { AuthService } from '../../../../model/services/fire/auth.service';
import { PlayerCardPreviewComponent, PlayerCardPreviewInput } from '../../collection/player-card-preview/player-card-preview.component';
import { PackShellComponent } from '../pack-shell/pack-shell.component';

interface RevealCard extends PackOpenedCard { preview: PlayerCardPreviewInput }

@Component({
  selector: 'app-open-pack', standalone: true, imports: [RouterLink, PackShellComponent, PlayerCardPreviewComponent],
  templateUrl: './open-pack.component.html', styleUrls: ['../../game-page.css', './open-pack.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenPackComponent implements OnDestroy {
  private readonly service = inject(PlayerPackService);
  private readonly auth = inject(AuthService);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private version = 0;
  private activeKey = '';
  private destroyed = false;
  readonly packId = computed(() => this.params()?.get('id') ?? '');
  readonly pack = signal<PlayerPack | null>(null);
  readonly loading = signal(true);
  readonly opening = signal(false);
  readonly error = signal('');
  readonly cards = signal<RevealCard[]>([]);
  readonly index = signal(0);
  readonly completed = signal(false);
  readonly reviewing = signal(false);
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly currentCard = computed(() => this.completed() ? [] : this.cards().slice(this.index(), this.index() + 1));
  readonly totalCopies = computed(() => this.cards().reduce((sum, card) => sum + card.quantity, 0));

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      const uid = isAuthenticatedSession(session) ? session.uid : null;
      const id = this.packId();
      const key = uid && id ? `${uid}/${id}` : '';
      if (key === this.activeKey) return;
      this.activeKey = key;
      untracked(() => {
        ++this.version;
        this.pack.set(null); this.cards.set([]); this.error.set('');
        this.opening.set(false); this.loading.set(false); this.completed.set(false); this.index.set(0);
        if (uid && id) void this.loadPack();
      });
    }, { allowSignalWrites: true });
  }

  async loadPack(): Promise<void> {
    const session = this.auth.currentUser();
    if (this.destroyed || !isAuthenticatedSession(session)) return;
    const uid = session.uid, id = this.packId(), version = ++this.version;
    this.loading.set(true); this.error.set(''); this.pack.set(null); this.cards.set([]);
    try {
      const pack = await this.service.getCurrentUser(id);
      if (!this.isCurrent(version, uid, id)) return;
      this.pack.set(pack);
      if (pack?.state === 'opened') this.startReveal(pack.revealedCards!, true);
    } catch {
      if (this.isCurrent(version, uid, id)) this.error.set('Não foi possível carregar este pacote. Tente novamente.');
    } finally {
      if (this.isCurrent(version, uid, id)) this.loading.set(false);
    }
  }

  async open(): Promise<void> {
    const session = this.auth.currentUser(), pack = this.pack();
    if (this.destroyed || !isAuthenticatedSession(session) || this.opening() || !pack || pack.state !== 'sealed' || this.cards().length) return;
    const uid = session.uid, id = this.packId(), version = this.version;
    this.opening.set(true); this.error.set('');
    try {
      const result = await this.service.openCurrentUser(id);
      if (this.isCurrent(version, uid, id)) this.startReveal(result.revealedCards, result.alreadyOpened);
    } catch (error: unknown) {
      if (this.isCurrent(version, uid, id)) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
        this.error.set(code === 'functions/failed-precondition'
          ? 'Não foi possível abrir este pacote. Um administrador precisa conferir as cartas e sua coleção.'
          : 'Não foi possível confirmar a abertura. Tente novamente; uma abertura já confirmada será recuperada.');
      }
    } finally {
      if (this.isCurrent(version, uid, id)) this.opening.set(false);
    }
  }

  nextCard(): void {
    if (!this.cards().length || this.completed()) return;
    if (this.index() === this.cards().length - 1) this.completed.set(true);
    else this.index.update(index => index + 1);
  }

  private startReveal(cards: PackOpenedCard[], reviewing: boolean): void {
    this.cards.set(cards.map(card => ({ ...card, preview: { id: card.cardId, name: card.name } })));
    this.index.set(0); this.completed.set(false); this.reviewing.set(reviewing);
  }

  ngOnDestroy(): void { this.destroyed = true; ++this.version; }
  private isCurrent(version: number, uid: string, id: string): boolean {
    const session = this.auth.currentUser();
    return !this.destroyed && this.version === version && id === this.packId() && isAuthenticatedSession(session) && session.uid === uid;
  }
}
