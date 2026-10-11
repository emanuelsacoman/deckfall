import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import {
  AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule,
  ValidatorFn, Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  Card, CardAttribute, CardInput, CardOperationError, CardRarity, CardStatus,
  CARD_IMAGE_TYPES, CARD_LIMITS, CARD_RARITIES, CARD_RARITY_LABELS,
  CARD_STATUSES, CARD_STATUS_LABELS, DEFAULT_CARD_ATTRIBUTES
} from '../../../../../model/interfaces/Cards/card';
import { CardService } from '../../../../../model/services/cruds/cards/card.service';
import { CardStorageService } from '../../../../../model/services/fire/card-storage.service';

type AttributeForm = FormGroup<{
  key: FormControl<string>;
  label: FormControl<string>;
  value: FormControl<number | null>;
}>;

const notBlank: ValidatorFn = control =>
  typeof control.value === 'string' && control.value.trim().length > 0 ? null : { required: true };

const finiteNumber: ValidatorFn = control =>
  typeof control.value === 'number' && Number.isFinite(control.value) ? null : { number: true };

const oneOf = (values: readonly string[]): ValidatorFn => control =>
  values.includes(control.value) ? null : { option: true };

const uniqueAttributeKeys: ValidatorFn = control => {
  const rows = control.value as CardAttribute[];
  const keys = rows.map(row => row.key.trim()).filter(Boolean);
  return new Set(keys).size === keys.length ? null : { duplicateKeys: true };
};

@Component({
  selector: 'app-card-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './card-form.component.html',
  styleUrl: './card-form.component.css'
})
export class CardFormComponent implements OnChanges, OnDestroy {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() cardId: string | null = null;

  private readonly cards = inject(CardService);
  private readonly storage = inject(CardStorageService);
  private readonly router = inject(Router);
  private original: Card | null = null;
  private selectedFile: File | undefined;
  private existingArtUrl: string | null = null;
  private selectedArtUrl: string | null = null;
  private loadVersion = 0;
  private destroyed = false;

  readonly rarities = CARD_RARITIES;
  readonly statuses = CARD_STATUSES;
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly statusLabels = CARD_STATUS_LABELS;
  readonly limits = CARD_LIMITS;
  readonly imageTypes = CARD_IMAGE_TYPES.join(',');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly fileError = signal('');
  readonly artError = signal('');
  readonly previewUrl = signal<string | null>(null);
  readonly selectedFileName = signal('');
  readonly recoveryId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly warnings = signal<string[]>([]);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.maxLength(CARD_LIMITS.name)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(CARD_LIMITS.description)] }),
    rarity: new FormControl<CardRarity>('common', { nonNullable: true, validators: [oneOf(CARD_RARITIES)] }),
    status: new FormControl<CardStatus>('draft', { nonNullable: true, validators: [oneOf(CARD_STATUSES)] }),
    attributes: new FormArray<AttributeForm>(DEFAULT_CARD_ATTRIBUTES.map(attribute => this.attributeForm(attribute)), {
      validators: [uniqueAttributeKeys, Validators.maxLength(CARD_LIMITS.attributes)]
    })
  });

  get attributes(): FormArray<AttributeForm> {
    return this.form.controls.attributes;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] || changes['cardId']) {
      void this.loadCard();
    }
  }

  async loadCard(): Promise<void> {
    const version = ++this.loadVersion;
    this.clearArtUrls();
    this.original = null;
    this.selectedFile = undefined;
    this.selectedFileName.set('');
    this.loadError.set('');
    this.saveError.set('');
    this.fileError.set('');
    this.artError.set('');
    this.recoveryId.set(null);
    this.successMessage.set('');
    this.warnings.set([]);
    if (this.mode === 'create') {
      this.resetForm();
      this.loading.set(false);
      return;
    }
    if (!this.cardId) {
      this.loadError.set('O endereço não contém o ID da carta.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const card = await this.cards.getById(this.cardId);
      if (!this.isCurrent(version)) return;
      if (!card) {
        this.loadError.set('Carta não encontrada. Ela pode ter sido excluída.');
        return;
      }
      this.original = card;
      this.resetForm(card);
      void this.loadExistingArt(version);
    } catch (error: unknown) {
      if (this.isCurrent(version)) {
        this.loadError.set(this.errorMessage(error, 'Não foi possível carregar a carta.'));
      }
    } finally {
      if (this.isCurrent(version)) this.loading.set(false);
    }
  }

  addAttribute(): void {
    if (this.attributes.length < CARD_LIMITS.attributes && !this.saving()) {
      this.attributes.push(this.attributeForm({ key: '', label: '', value: 0 }));
      this.form.markAsDirty();
    }
  }

  removeAttribute(index: number): void {
    if (!this.saving()) {
      this.attributes.removeAt(index);
      this.form.markAsDirty();
    }
  }

  invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  chooseArt(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.clearSelectedArt();
    this.fileError.set('');
    try {
      this.storage.validateImage(file);
      this.selectedFile = file;
      this.selectedFileName.set(file.name);
      this.selectedArtUrl = URL.createObjectURL(file);
      this.previewUrl.set(this.selectedArtUrl);
      this.form.markAsDirty();
    } catch (error: unknown) {
      this.fileError.set(this.errorMessage(error, 'Selecione uma imagem PNG, JPEG ou WebP de até 5 MiB.'));
      input.value = '';
    }
  }

  clearSelectedArt(input?: HTMLInputElement): void {
    if (this.selectedArtUrl) URL.revokeObjectURL(this.selectedArtUrl);
    this.selectedArtUrl = null;
    this.selectedFile = undefined;
    this.selectedFileName.set('');
    this.fileError.set('');
    this.previewUrl.set(this.existingArtUrl);
    if (input) input.value = '';
  }

  async retryArt(): Promise<void> {
    await this.loadExistingArt(this.loadVersion);
  }

  async save(): Promise<void> {
    if (this.saving() || this.loading() || this.loadError() || this.recoveryId() || this.successMessage()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || this.fileError()) return;
    if (this.mode === 'edit' && !this.original) return;
    const version = this.loadVersion;
    const value = this.form.getRawValue();
    const input: CardInput = {
      name: value.name.trim(),
      description: value.description.trim(),
      rarity: value.rarity,
      status: value.status,
      attributes: value.attributes.map(attribute => ({
        key: attribute.key.trim(), label: attribute.label.trim(), value: attribute.value!
      })),
      setId: this.original?.setId ?? null
    };
    this.saving.set(true);
    this.saveError.set('');
    try {
      const result = this.original
        ? await this.cards.update(this.original, input, this.selectedFile)
        : await this.cards.create(input, this.selectedFile);
      if (!this.isCurrent(version)) return;
      const message = this.mode === 'create' ? 'Carta criada com sucesso.' : 'Carta atualizada com sucesso.';
      this.successMessage.set(message);
      this.warnings.set(result.warnings);
      await this.router.navigate(['/admin/cartas/lista'], {
        state: { cardFeedback: { message, warnings: result.warnings } }
      });
    } catch (error: unknown) {
      if (!this.isCurrent(version)) return;
      if (this.successMessage()) {
        this.saveError.set('A carta foi salva. Use o link para voltar à lista.');
      } else {
        this.saveError.set(this.errorMessage(error, 'Não foi possível salvar a carta.'));
        if (error instanceof CardOperationError && error.cardId && this.mode === 'create') {
          this.recoveryId.set(error.cardId);
        }
      }
    } finally {
      if (!this.destroyed) this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.loadVersion;
    this.clearArtUrls();
  }

  private attributeForm(attribute: CardAttribute): AttributeForm {
    return new FormGroup({
      key: new FormControl(attribute.key, {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(CARD_LIMITS.attributeKey), Validators.pattern(/^[a-z][a-z0-9_-]*$/)]
      }),
      label: new FormControl(attribute.label, {
        nonNullable: true, validators: [notBlank, Validators.maxLength(CARD_LIMITS.attributeLabel)]
      }),
      value: new FormControl<number | null>(attribute.value, {
        validators: [Validators.required, finiteNumber, Validators.min(0), Validators.max(100)]
      })
    });
  }

  private resetForm(card?: Card): void {
    this.form.reset({
      name: card?.name ?? '', description: card?.description ?? '',
      rarity: card?.rarity ?? 'common', status: card?.status ?? 'draft'
    });
    this.attributes.clear();
    for (const attribute of card?.attributes ?? DEFAULT_CARD_ATTRIBUTES) {
      this.attributes.push(this.attributeForm(attribute));
    }
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private async loadExistingArt(version: number): Promise<void> {
    const art = this.original?.art;
    if (!art) return;
    this.artError.set('');
    try {
      const url = await this.storage.getArtUrl(art);
      if (!this.isCurrent(version)) {
        URL.revokeObjectURL(url);
        return;
      }
      if (this.existingArtUrl) URL.revokeObjectURL(this.existingArtUrl);
      this.existingArtUrl = url;
      if (!this.selectedFile) this.previewUrl.set(url);
    } catch (error: unknown) {
      if (this.isCurrent(version)) {
        this.artError.set(this.errorMessage(error, 'Não foi possível carregar a arte existente. Os dados da carta continuam disponíveis.'));
      }
    }
  }

  private clearArtUrls(): void {
    if (this.existingArtUrl) URL.revokeObjectURL(this.existingArtUrl);
    if (this.selectedArtUrl) URL.revokeObjectURL(this.selectedArtUrl);
    this.existingArtUrl = null;
    this.selectedArtUrl = null;
    this.previewUrl.set(null);
  }

  private isCurrent(version: number): boolean {
    return !this.destroyed && version === this.loadVersion;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
