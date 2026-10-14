import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
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
export type PackOpeningPhase = 'sealed' | 'awakening' | 'charging' | 'burst' | 'revealing' | 'summary';
/** One short, cancelable timeline, started only after a confirmed server result. */
export const PACK_OPENING_TIMING = { awakening: 320, charging: 620, burst: 260, legendary: 360 } as const;

@Component({
  selector: 'app-open-pack', standalone: true, imports: [RouterLink, PackShellComponent, PlayerCardPreviewComponent],
  templateUrl: './open-pack.component.html', styleUrls: ['../../game-page.css', './open-pack.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenPackComponent implements OnDestroy {
  private readonly service = inject(PlayerPackService);
  private readonly auth = inject(AuthService);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  private version = 0;
  private activeKey: string | null = null;
  private destroyed = false;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  private timeline = 0;
  private focusRequested = false;
  readonly packId = computed(() => this.params()?.get('id') ?? '');
  readonly pack = signal<PlayerPack | null>(null);
  readonly loading = signal(true);
  readonly opening = signal(false);
  readonly error = signal('');
  readonly cards = signal<RevealCard[]>([]);
  readonly previewCache = new Map<string, Promise<Blob>>();
  readonly index = signal(0);
  readonly phase = signal<PackOpeningPhase>('sealed');
  readonly reviewing = signal(false);
  readonly faceRevealed = signal(false);
  readonly specialLegendary = signal(false);
  readonly reducedMotion = signal(this.motionQuery?.matches ?? false);
  readonly completed = computed(() => this.phase() === 'summary');
  readonly cinematic = computed(() => ['awakening', 'charging', 'burst'].includes(this.phase()));
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly currentCard = computed(() => this.phase() === 'revealing' ? this.cards().slice(this.index(), this.index() + 1) : []);
  readonly totalCopies = computed(() => this.cards().reduce((sum, card) => sum + card.quantity, 0));
  readonly phaseLabel = computed(() => {
    switch (this.phase()) {
      case 'awakening': return 'O selo desperta.';
      case 'charging': return 'A luz atravessa o pacote.';
      case 'burst': return 'O selo se abre.';
      default: return '';
    }
  });

  @ViewChild('revealControl') set revealControl(control: ElementRef<HTMLButtonElement> | undefined) {
    if (control && this.focusRequested && !this.destroyed) {
      control.nativeElement.focus(); this.focusRequested = false;
    }
  }
  @ViewChild('summaryHeading') set summaryHeading(heading: ElementRef<HTMLHeadingElement> | undefined) {
    if (heading && this.focusRequested && !this.destroyed) {
      heading.nativeElement.focus(); this.focusRequested = false;
    }
  }
  private readonly motionChanged = (event: MediaQueryListEvent): void => {
    this.reducedMotion.set(event.matches);
    if (event.matches && (this.cinematic() || this.specialLegendary())) this.skipAnimation();
  };

  constructor() {
    this.motionQuery?.addEventListener('change', this.motionChanged);
    effect(() => {
      const session = this.auth.currentUser();
      const uid = isAuthenticatedSession(session) ? session.uid : null;
      const id = this.packId();
      const key = uid && id ? `${uid}/${id}` : '';
      if (key === this.activeKey) return;
      this.activeKey = key;
      untracked(() => {
        ++this.version;
        this.resetPresentation();
        this.pack.set(null); this.error.set(''); this.opening.set(false); this.loading.set(false);
        if (uid && id) void this.loadPack();
      });
    }, { allowSignalWrites: true });
  }

  async loadPack(): Promise<void> {
    const session = this.auth.currentUser();
    if (this.destroyed || !isAuthenticatedSession(session) || this.opening()) return;
    const uid = session.uid, id = this.packId(), version = ++this.version;
    this.resetPresentation(); this.loading.set(true); this.error.set(''); this.pack.set(null);
    try {
      const pack = await this.service.getCurrentUser(id);
      if (!this.isCurrent(version, uid, id)) return;
      this.pack.set(pack);
      if (pack?.state === 'opened') this.acceptResult(pack.revealedCards!, true);
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
      if (this.isCurrent(version, uid, id)) this.acceptResult(result.revealedCards, result.alreadyOpened);
    } catch (error: unknown) {
      if (this.isCurrent(version, uid, id)) {
        this.cancelTimeline();
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
        this.error.set(code === 'functions/failed-precondition'
          ? 'Não foi possível abrir este pacote. Um administrador precisa conferir as cartas e sua coleção.'
          : 'Não foi possível confirmar a abertura. Tente novamente; uma abertura já confirmada será recuperada.');
      }
    } finally {
      if (this.isCurrent(version, uid, id)) this.opening.set(false);
    }
  }

  revealCard(): void {
    if (this.destroyed || this.phase() !== 'revealing' || this.faceRevealed() || this.specialLegendary() || !this.currentCard().length) return;
    if (this.currentCard()[0].rarity === 'legendary' && !this.reducedMotion()) {
      this.specialLegendary.set(true); this.focusRequested = true;
      this.schedule(() => this.finishReveal(), PACK_OPENING_TIMING.legendary);
    } else this.finishReveal();
  }
  nextCard(): void {
    if (this.destroyed || this.phase() !== 'revealing' || !this.faceRevealed()) return;
    this.cancelTimeline(); this.focusRequested = true;
    if (this.index() === this.cards().length - 1) this.phase.set('summary');
    else {
      this.index.update(index => index + 1);
      this.faceRevealed.set(false); this.specialLegendary.set(false);
    }
  }
  skipAnimation(): void {
    if (this.destroyed || !this.cards().length) return;
    if (this.cinematic()) {
      this.cancelTimeline(); this.beginReveal();
    } else if (this.specialLegendary()) {
      this.cancelTimeline(); this.finishReveal();
    }
  }
  reviewOpening(): void {
    if (this.destroyed || !this.cards().length || this.phase() !== 'summary') return;
    this.cancelTimeline(); this.index.set(0); this.reviewing.set(true); this.beginReveal();
  }
  showSummary(): void {
    if (this.destroyed || !this.cards().length) return;
    this.cancelTimeline(); this.focusRequested = true; this.specialLegendary.set(false); this.phase.set('summary');
  }

  private acceptResult(cards: PackOpenedCard[], reviewing: boolean): void {
    this.cancelTimeline();
    this.cards.set(cards.map(card => ({ ...card, preview: { id: card.cardId, name: card.name } })));
    this.index.set(0); this.faceRevealed.set(false); this.specialLegendary.set(false); this.reviewing.set(reviewing);
    if (reviewing) this.phase.set('summary');
    else if (this.reducedMotion()) this.beginReveal();
    else {
      this.focusRequested = true; this.phase.set('awakening');
      this.schedule(() => {
        this.phase.set('charging');
        this.schedule(() => {
          this.phase.set('burst');
          this.schedule(() => this.beginReveal(), PACK_OPENING_TIMING.burst);
        }, PACK_OPENING_TIMING.charging);
      }, PACK_OPENING_TIMING.awakening);
    }
  }
  private beginReveal(): void {
    this.faceRevealed.set(false); this.specialLegendary.set(false); this.focusRequested = true; this.phase.set('revealing');
  }
  private finishReveal(): void {
    this.specialLegendary.set(false); this.focusRequested = true; this.faceRevealed.set(true);
  }
  private schedule(action: () => void, milliseconds: number): void {
    if (this.scheduled !== null) clearTimeout(this.scheduled);
    const timeline = this.timeline;
    const version = this.version, session = this.auth.currentUser(), id = this.packId();
    const uid = isAuthenticatedSession(session) ? session.uid : '';
    this.scheduled = setTimeout(() => {
      this.scheduled = null;
      if (timeline === this.timeline && this.isCurrent(version, uid, id)) action();
    }, milliseconds);
  }
  private cancelTimeline(): void {
    ++this.timeline;
    if (this.scheduled !== null) clearTimeout(this.scheduled);
    this.scheduled = null;
  }
  private resetPresentation(): void {
    this.cancelTimeline(); this.previewCache.clear(); this.cards.set([]); this.index.set(0); this.phase.set('sealed');
    this.reviewing.set(false); this.faceRevealed.set(false); this.specialLegendary.set(false); this.focusRequested = false;
  }
  ngOnDestroy(): void {
    this.destroyed = true; ++this.version; this.cancelTimeline(); this.previewCache.clear(); this.motionQuery?.removeEventListener('change', this.motionChanged);
  }
  private isCurrent(version: number, uid: string, id: string): boolean {
    const session = this.auth.currentUser();
    return !this.destroyed && this.version === version && id === this.packId() && isAuthenticatedSession(session) && session.uid === uid;
  }
}
