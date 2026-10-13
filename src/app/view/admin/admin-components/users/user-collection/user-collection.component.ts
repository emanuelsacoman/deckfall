import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { CARD_RARITY_LABELS, Card } from '../../../../../model/interfaces/Cards/card';
import { PLAYER_COLLECTION_MAX_QUANTITY, PlayerOwnedCard } from '../../../../../model/interfaces/Collection/player-card-collection';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { PlayerCollectionService } from '../../../../../model/services/cruds/collection/player-collection.service';

const integerQuantity: ValidatorFn = control => Number.isInteger(control.value) ? null : { integer: true };

@Component({
  selector: 'app-user-collection', standalone: true, imports: [ReactiveFormsModule],
  templateUrl: './user-collection.component.html', styleUrl: './user-collection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserCollectionComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) uid!: string;
  private readonly service = inject(PlayerCollectionService);
  private readonly cards = inject(CardService);
  private version = 0;
  private destroyed = false;
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly maxQuantity = PLAYER_COLLECTION_MAX_QUANTITY;
  readonly entries = signal<PlayerOwnedCard[]>([]);
  readonly publishedCards = signal<Card[]>([]);
  readonly quantities = signal<Record<string, number>>({});
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly operationError = signal('');
  readonly success = signal('');
  readonly form = new FormGroup({
    cardId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl<number | null>(1, { validators: [Validators.required, Validators.min(0), Validators.max(PLAYER_COLLECTION_MAX_QUANTITY), integerQuantity] })
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['uid']) {
      this.entries.set([]);
      this.publishedCards.set([]);
      this.form.reset({ cardId: '', quantity: 1 });
      void this.loadCollection();
    }
  }

  async loadCollection(preserveFeedback = false): Promise<void> {
    if (this.destroyed) return;
    const version = ++this.version;
    const uid = this.uid;
    this.loading.set(true);
    this.loadError.set('');
    if (!preserveFeedback) { this.operationError.set(''); this.success.set(''); }
    try {
      const [entries, cards] = await Promise.all([this.service.listForUser(uid), this.cards.list()]);
      if (!this.isCurrent(version)) return;
      this.entries.set(entries);
      this.publishedCards.set(cards.filter(card => card.status === 'published').sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')));
      this.quantities.set(Object.fromEntries(entries.map(item => [item.collection.cardId, item.collection.quantity])));
      this.selectCard();
    } catch (error: unknown) {
      if (this.isCurrent(version)) this.loadError.set(this.errorMessage(error, 'Não foi possível carregar a coleção e as cartas publicadas.'));
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  selectCard(): void {
    const cardId = this.form.controls.cardId.value;
    this.form.controls.quantity.setValue(this.entries().find(item => item.collection.cardId === cardId)?.collection.quantity ?? 1);
  }

  changeQuantity(cardId: string, event: Event): void {
    const quantity = (event.target as HTMLInputElement).valueAsNumber;
    this.quantities.update(current => ({ ...current, [cardId]: quantity }));
  }

  quantityFor(owned: PlayerOwnedCard): number { return this.quantities()[owned.collection.cardId] ?? owned.collection.quantity; }
  validQuantity(quantity: number): boolean { return Number.isInteger(quantity) && quantity >= 0 && quantity <= this.maxQuantity; }

  async defineQuantity(): Promise<void> {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { cardId, quantity } = this.form.getRawValue();
    if (!this.publishedCards().some(card => card.id === cardId)) {
      this.operationError.set('Escolha uma carta publicada da lista.');
      return;
    }
    const owned = this.entries().find(item => item.collection.cardId === cardId);
    if (quantity === 0) {
      if (owned) await this.removeOwned(owned);
      else this.operationError.set('Esta carta ainda não pertence à coleção. Use uma quantidade maior que zero para concedê-la.');
      return;
    }
    await this.mutate(() => this.service.setQuantity(this.uid, cardId, quantity!, owned?.collection ?? null), 'Quantidade total definida com sucesso.');
  }

  async saveQuantity(owned: PlayerOwnedCard): Promise<void> {
    if (this.busy()) return;
    const quantity = this.quantityFor(owned);
    if (!this.validQuantity(quantity)) {
      this.operationError.set(`Informe uma quantidade inteira entre 0 e ${this.maxQuantity}. Zero remove a carta após confirmação.`);
      return;
    }
    if (quantity === 0) { await this.removeOwned(owned); return; }
    if (!owned.card || owned.card.status !== 'published') {
      this.operationError.set('Somente cartas publicadas podem receber uma nova quantidade. A remoção continua disponível.');
      return;
    }
    await this.mutate(() => this.service.setQuantity(this.uid, owned.collection.cardId, quantity, owned.collection), 'Quantidade total atualizada com sucesso.');
  }

  async removeOwned(owned: PlayerOwnedCard): Promise<void> {
    if (this.busy()) return;
    const name = owned.card?.name ?? 'esta carta indisponível';
    if (!window.confirm(`Remover ${name} da coleção deste usuário? Todas as cópias possuídas serão removidas.`)) return;
    await this.mutate(() => this.service.remove(this.uid, owned.collection.cardId, owned.collection), 'Carta removida da coleção deste usuário.');
  }

  ngOnDestroy(): void { this.destroyed = true; ++this.version; }

  private busy(): boolean { return this.destroyed || this.loading() || this.saving() || !!this.loadError(); }
  private isCurrent(version: number): boolean { return !this.destroyed && version === this.version; }
  private errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }

  private async mutate(operation: () => Promise<void>, message: string): Promise<void> {
    const version = this.version;
    this.saving.set(true);
    this.operationError.set('');
    this.success.set('');
    try {
      await operation();
      if (!this.isCurrent(version)) return;
      this.success.set(message);
      await this.loadCollection(true);
    } catch (error: unknown) {
      if (this.isCurrent(version)) this.operationError.set(this.errorMessage(error, 'Não foi possível alterar a coleção. Recarregue antes de tentar novamente.'));
    } finally {
      if (!this.destroyed) this.saving.set(false);
    }
  }
}
