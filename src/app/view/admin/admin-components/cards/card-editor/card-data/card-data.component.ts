import { Component, EventEmitter, Output, computed, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators
} from '@angular/forms';
import {
  CARD_LIMITS, CARD_RARITIES, CARD_RARITY_LABELS, CARD_STATUSES, CARD_STATUS_LABELS, CardAttribute,
  CardDataInput, CardRarity, CardStatus
} from '../../../../../../model/interfaces/Cards/card';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { isCanvasColor } from '../../../../../../model/services/tools/card-canvas-validation';
import { editorDocumentColors } from '../../../../../../model/services/tools/card-editor-colors';
import { EditorColorFieldComponent } from '../shared/editor-color-field/editor-color-field.component';

type AttributeForm = FormGroup<{
  id: FormControl<string>; key: FormControl<string>; label: FormControl<string>;
  value: FormControl<number | null>; min: FormControl<number | null>; max: FormControl<number | null>;
  icon: FormControl<string>; color: FormControl<string>;
}>;
const notBlank: ValidatorFn = control => typeof control.value === 'string' && !!control.value.trim() ? null : { required: true };
const finite: ValidatorFn = control => typeof control.value === 'number' && Number.isFinite(control.value) ? null : { number: true };
const range: ValidatorFn = control => {
  const { min, max, value } = control.value as { min: number | null; max: number | null; value: number | null };
  return min !== null && max !== null && value !== null && min < max && value >= min && value <= max ? null : { range: true };
};
const uniqueKeys: ValidatorFn = control => {
  const keys = (control.value as CardAttribute[]).map(attribute => attribute.key).filter(Boolean);
  return new Set(keys).size === keys.length ? null : { duplicateKeys: true };
};

@Component({
  selector: 'app-card-data', standalone: true, imports: [ReactiveFormsModule, EditorColorFieldComponent],
  templateUrl: './card-data.component.html', styleUrl: './card-data.component.css'
})
export class CardDataComponent {
  private lastDataSignature = '';
  readonly state = inject(CardEditorStateService);
  readonly limits = CARD_LIMITS;
  readonly rarities = CARD_RARITIES;
  readonly statuses = CARD_STATUSES;
  readonly rarityLabels = CARD_RARITY_LABELS;
  readonly statusLabels = CARD_STATUS_LABELS;
  readonly documentColors = computed(() => editorDocumentColors(this.state.document(), 12));
  readonly attributeSymbols = [
    { value: '★', label: 'estrela' }, { value: '✦', label: 'brilho' },
    { value: '◆', label: 'losango' }, { value: '○', label: 'círculo' }
  ] as const;
  @Output() readonly validityChanged = new EventEmitter<boolean>();
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.maxLength(CARD_LIMITS.name)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(CARD_LIMITS.description)] }),
    rarity: new FormControl<CardRarity>('common', { nonNullable: true, validators: [control => CARD_RARITIES.some(rarity => rarity === control.value) ? null : { rarity: true }] }),
    status: new FormControl<CardStatus>('draft', { nonNullable: true, validators: [control => CARD_STATUSES.some(status => status === control.value) ? null : { status: true }] }),
    type: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    subtype: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    attributes: new FormArray<AttributeForm>([], { validators: [uniqueKeys, Validators.maxLength(CARD_LIMITS.attributes)] })
  });

  constructor() {
    effect(() => {
      const data = this.state.data();
      untracked(() => {
        const shape = this.formShape(data);
        const signature = JSON.stringify(shape);
        if (signature !== this.lastDataSignature) {
          this.lastDataSignature = signature;
          if (signature !== JSON.stringify(this.form.getRawValue())) this.applyData(shape);
        }
        this.validityChanged.emit(this.form.valid);
      });
    }, { allowSignalWrites: true });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.publish());
  }

  get attributes(): FormArray<AttributeForm> { return this.form.controls.attributes; }
  invalid(control: AbstractControl): boolean { return control.invalid && (control.touched || control.dirty); }

  addAttribute(): void {
    if (this.state.busy() || this.attributes.length >= this.limits.attributes) return;
    this.attributes.push(this.attributeForm({ id: crypto.randomUUID(), key: '', label: '', value: 0, min: 0, max: 100 }));
    this.form.markAsDirty();
  }
  removeAttribute(index: number): void {
    if (this.state.busy()) return;
    this.attributes.removeAt(index); this.form.markAsDirty();
  }
  moveAttribute(index: number, offset: -1 | 1): void {
    if (this.state.busy()) return;
    const next = index + offset;
    if (next < 0 || next >= this.attributes.length) return;
    const control = this.attributes.at(index);
    this.attributes.removeAt(index, { emitEvent: false });
    this.attributes.insert(next, control, { emitEvent: false });
    this.attributes.updateValueAndValidity(); this.form.markAsDirty();
  }

  commitAttributeColor(index: number, color: string): void {
    if (this.state.busy() || index < 0 || index >= this.attributes.length) return;
    const control = this.attributes.at(index).controls.color;
    if (control.value === color) return;
    control.markAsDirty(); control.markAsTouched(); control.setValue(color);
  }

  chooseAttributeSymbol(index: number, symbol: string): void {
    if (this.state.busy() || index < 0 || index >= this.attributes.length) return;
    const control = this.attributes.at(index).controls.icon;
    if (control.value === symbol) return;
    control.markAsDirty(); control.setValue(symbol);
  }

  private publish(): void {
    this.validityChanged.emit(this.form.valid);
    if (this.form.invalid || this.state.busy()) return;
    const value = this.form.getRawValue();
    const data: CardDataInput = {
      ...this.state.data(), name: value.name, description: value.description, rarity: value.rarity, status: value.status,
      type: value.type.trim() ? value.type : null, subtype: value.subtype.trim() ? value.subtype : null,
      attributes: value.attributes.map(attribute => ({
        id: attribute.id, key: attribute.key, label: attribute.label, value: attribute.value!, min: attribute.min!, max: attribute.max!,
        ...(attribute.icon ? { icon: attribute.icon } : {}), ...(attribute.color ? { color: attribute.color } : {})
      }))
    };
    this.lastDataSignature = JSON.stringify(this.formShape(data));
    this.state.updateData(data);
  }

  private attributeForm(attribute: CardAttribute): AttributeForm {
    const numberControl = (value: number): FormControl<number | null> => new FormControl<number | null>(value, {
      validators: [Validators.required, finite, Validators.min(-1_000_000), Validators.max(1_000_000)]
    });
    return new FormGroup({
      id: new FormControl(attribute.id ?? `attribute-${attribute.key}`, { nonNullable: true }),
      key: new FormControl(attribute.key, { nonNullable: true, validators: [notBlank, Validators.maxLength(this.limits.attributeKey), Validators.pattern(/^[a-z][a-z0-9_-]*$/)] }),
      label: new FormControl(attribute.label, { nonNullable: true, validators: [notBlank, Validators.maxLength(this.limits.attributeLabel)] }),
      value: numberControl(attribute.value), min: numberControl(attribute.min ?? 0), max: numberControl(attribute.max ?? 100),
      icon: new FormControl(attribute.icon ?? '', { nonNullable: true, validators: [Validators.maxLength(32)] }),
      color: new FormControl(attribute.color ?? '', { nonNullable: true, validators: [control => isCanvasColor(control.value) ? null : { color: true }] })
    }, { validators: [range] });
  }

  private formShape(data: CardDataInput) {
    return {
      name: data.name, description: data.description, rarity: data.rarity, status: data.status,
      type: data.type ?? '', subtype: data.subtype ?? '',
      attributes: data.attributes.map(attribute => ({
        id: attribute.id ?? `attribute-${attribute.key}`, key: attribute.key, label: attribute.label,
        value: attribute.value, min: attribute.min ?? 0, max: attribute.max ?? 100,
        icon: attribute.icon ?? '', color: attribute.color ?? ''
      }))
    };
  }

  private applyData(value: ReturnType<CardDataComponent['formShape']>): void {
    const sameRows = this.attributes.length === value.attributes.length &&
      this.attributes.controls.every((row, index) => row.controls.id.value === value.attributes[index].id);
    if (!sameRows) {
      this.attributes.clear({ emitEvent: false });
      for (const attribute of value.attributes) this.attributes.push(this.attributeForm(attribute), { emitEvent: false });
    }
    this.form.setValue(value, { emitEvent: false });
    this.form.markAsPristine();
  }
}
