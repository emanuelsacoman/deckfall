import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Card, CARD_RARITY_LABELS } from '../../../../model/interfaces/Cards/card';
import { PackDefinitionVersion } from '../../../../model/interfaces/Packs/player-pack';
import { PACK_DEFINITION_LIMITS, PackDefinitionRecord, STARTER_PACK_ID, STARTER_PACK_NAME, validatePackDefinitionMetadata } from '../../../../model/interfaces/Packs/pack-definition';
import { CardService } from '../../../../model/services/cruds/cards/card.service';
import { PackDefinitionService } from '../../../../model/services/cruds/packs/pack-definition.service';

type ContentRow = FormGroup<{ cardId: FormControl<string>; quantity: FormControl<number | null> }>;
const wholeQuantity: ValidatorFn = control => Number.isInteger(control.value) ? null : { integer: true };

@Component({
  selector: 'app-pack-admin', standalone: true, imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, RouterLink],
  templateUrl: './pack-admin.component.html', styleUrl: './pack-admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PackAdminComponent implements OnInit, OnDestroy {
  private readonly service = inject(PackDefinitionService);
  private readonly cardService = inject(CardService);
  private destroyed = false;
  private loadEpoch = 0;
  private selectionEpoch = 0;
  readonly limits = PACK_DEFINITION_LIMITS;
  readonly starterName = STARTER_PACK_NAME;
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly packs = signal<PackDefinitionRecord[]>([]);
  readonly publishedCards = signal<Card[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly versionsLoading = signal(false);
  readonly loadError = signal('');
  readonly versionsError = signal('');
  readonly operationError = signal('');
  readonly feedback = signal('');
  readonly mode = signal<'create' | 'starter' | 'edit' | null>(null);
  readonly selected = signal<PackDefinitionRecord | null>(null);
  readonly versions = signal<PackDefinitionVersion[]>([]);
  readonly addingVersion = signal(false);
  readonly starter = computed(() => this.packs().find(pack => pack.id === STARTER_PACK_ID) ?? null);
  readonly isStarter = computed(() => this.mode() === 'starter' || this.selected()?.id === STARTER_PACK_ID);
  readonly currentVersion = computed(() => this.versions().find(version => version.version === this.selected()?.currentVersion) ?? null);
  readonly availableCards = computed(() => this.publishedCards());
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(PACK_DEFINITION_LIMITS.name)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(PACK_DEFINITION_LIMITS.description)] }),
    active: new FormControl(false, { nonNullable: true })
  });
  readonly content = new FormArray<ContentRow>([]);
  readonly picker = new FormControl('', { nonNullable: true });

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    if (this.destroyed || this.saving()) return;
    this.cancel();
    await this.fetchList();
  }

  startCreate(): void {
    if (this.busy()) return;
    this.cancel();
    this.mode.set('create');
    this.form.reset({ name: '', description: '', active: false });
  }

  async configureStarter(): Promise<void> {
    if (this.busy()) return;
    const existing = this.starter();
    if (existing) { await this.select(existing); return; }
    this.cancel();
    this.mode.set('starter');
    this.form.reset({ name: STARTER_PACK_NAME, description: '', active: true });
  }

  async select(pack: PackDefinitionRecord): Promise<void> {
    if (this.destroyed || this.saving()) return;
    this.cancel();
    this.selected.set(pack);
    this.mode.set('edit');
    this.form.reset({ name: pack.id === STARTER_PACK_ID ? STARTER_PACK_NAME : pack.name, description: pack.description, active: pack.active });
    await this.loadVersions();
  }

  async loadVersions(): Promise<void> {
    const pack = this.selected();
    if (!pack || this.destroyed || this.saving()) return;
    const epoch = ++this.selectionEpoch;
    this.versionsLoading.set(true);
    this.versionsError.set('');
    this.versions.set([]);
    this.addingVersion.set(false);
    try {
      const versions = await this.service.listVersions(pack.id);
      if (this.currentSelection(epoch, pack.id)) this.versions.set(versions);
    } catch (error: unknown) {
      if (this.currentSelection(epoch, pack.id)) this.versionsError.set(this.message(error, 'Não foi possível carregar as versões deste pacote.'));
    } finally {
      if (this.currentSelection(epoch, pack.id)) this.versionsLoading.set(false);
    }
  }

  cancel(): void {
    if (this.saving()) return;
    ++this.selectionEpoch;
    this.mode.set(null);
    this.selected.set(null);
    this.versions.set([]);
    this.versionsLoading.set(false);
    this.versionsError.set('');
    this.operationError.set('');
    this.addingVersion.set(false);
    this.content.clear();
    this.picker.setValue('');
  }

  addCard(): void {
    if (this.saving() || this.content.length >= this.limits.cards) return;
    const id = this.picker.value;
    if (!this.publishedCards().some(card => card.id === id)) return;
    if (this.content.controls.some(row => row.controls.cardId.value === id)) {
      this.operationError.set('Esta carta já está no pacote. Altere a quantidade na linha existente.');
      return;
    }
    this.content.push(this.row(id, 1));
    this.picker.setValue('');
    this.operationError.set('');
  }

  removeCard(index: number): void { if (!this.saving()) this.content.removeAt(index); }

  beginVersion(): void {
    if (this.busy() || this.versionsLoading() || this.versionsError() || !this.selected() || !this.currentVersion()) return;
    if (this.form.dirty) {
      this.operationError.set('Salve as informações do pacote antes de criar uma nova versão.');
      return;
    }
    this.content.clear();
    for (const card of this.currentVersion()?.cards ?? []) this.content.push(this.row(card.cardId, card.quantity));
    this.addingVersion.set(true);
    this.operationError.set('');
  }

  cancelVersion(): void { if (!this.saving()) { this.addingVersion.set(false); this.content.clear(); } }

  cardName(id: string): string { return this.publishedCards().find(card => card.id === id)?.name ?? `Carta indisponível (${id})`; }
  isPublished(id: string): boolean { return this.publishedCards().some(card => card.id === id); }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    this.operationError.set('');
    if (this.form.invalid || !this.form.controls.name.value.trim()) {
      this.operationError.set('Informe um nome válido e respeite os limites dos campos.');
      return;
    }
    const original = this.selected();
    const values = this.form.getRawValue();
    if (this.isStarter()) values.name = STARTER_PACK_NAME;
    try { validatePackDefinitionMetadata(values, !!this.isStarter()); }
    catch (error: unknown) { this.operationError.set(this.message(error, 'Informações do pacote inválidas.')); return; }
    if (this.mode() === 'edit' && original) {
      await this.mutate(() => this.service.updateMetadata(original, values).then(() => original.id), 'Informações do pacote salvas.');
    } else if (this.mode() === 'create' || this.mode() === 'starter') {
      if (!this.validContent()) return;
      await this.mutate(() => this.service.create({ ...values, cards: this.content.getRawValue().map(row => ({ cardId: row.cardId, quantity: row.quantity! })), isStarter: this.mode() === 'starter' }), 'Pacote e versão 1 criados.');
    }
  }

  async saveVersion(): Promise<void> {
    const pack = this.selected();
    if (this.busy() || !pack || !this.addingVersion() || !this.validContent()) return;
    await this.mutate(async () => {
      await this.service.createVersion(pack.id, this.content.getRawValue().map(row => ({ cardId: row.cardId, quantity: row.quantity! })), pack.currentVersion);
      return pack.id;
    }, 'Nova versão criada para futuras concessões. As versões anteriores foram preservadas.');
  }

  ngOnDestroy(): void { this.destroyed = true; ++this.loadEpoch; ++this.selectionEpoch; }

  private row(id: string, quantity: number): ContentRow {
    return new FormGroup({
      cardId: new FormControl(id, { nonNullable: true }),
      quantity: new FormControl<number | null>(quantity, { validators: [Validators.required, Validators.min(1), Validators.max(this.limits.quantity), wholeQuantity] })
    });
  }

  private validContent(): boolean {
    this.content.markAllAsTouched();
    const cards = this.content.getRawValue();
    if (!cards.length || cards.length > this.limits.cards || this.content.invalid) {
      this.operationError.set(`Escolha entre 1 e ${this.limits.cards} cartas, com quantidade inteira entre 1 e ${this.limits.quantity}.`);
      return false;
    }
    if (new Set(cards.map(card => card.cardId)).size !== cards.length || cards.some(card => !this.isPublished(card.cardId))) {
      this.operationError.set('Use somente cartas publicadas, sem repetir IDs. Remova cartas indisponíveis antes de salvar.');
      return false;
    }
    return true;
  }

  private async fetchList(): Promise<void> {
    const epoch = ++this.loadEpoch;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [packs, cards] = await Promise.all([this.service.list(), this.cardService.list()]);
      if (!this.destroyed && epoch === this.loadEpoch) {
        this.packs.set(packs);
        this.publishedCards.set(cards.filter(card => card.status === 'published').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      }
    } catch (error: unknown) {
      if (!this.destroyed && epoch === this.loadEpoch) this.loadError.set(this.message(error, 'Não foi possível carregar os pacotes e o catálogo.'));
    } finally {
      if (!this.destroyed && epoch === this.loadEpoch) this.loading.set(false);
    }
  }

  private async mutate(operation: () => Promise<string>, success: string): Promise<void> {
    this.saving.set(true);
    this.operationError.set('');
    this.feedback.set('');
    try {
      const id = await operation();
      if (this.destroyed) return;
      this.feedback.set(success);
      this.saving.set(false);
      this.cancel();
      await this.fetchList();
      const pack = this.packs().find(item => item.id === id);
      if (!this.loadError() && pack && !this.destroyed) await this.select(pack);
    } catch (error: unknown) {
      if (!this.destroyed) this.operationError.set(this.message(error, 'Não foi possível salvar o pacote. Atualize os dados antes de repetir.'));
    } finally { if (!this.destroyed) this.saving.set(false); }
  }

  private busy(): boolean { return this.destroyed || this.loading() || this.saving() || !!this.loadError(); }
  private currentSelection(epoch: number, id: string): boolean { return !this.destroyed && this.selectionEpoch === epoch && this.selected()?.id === id; }
  private message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
}
