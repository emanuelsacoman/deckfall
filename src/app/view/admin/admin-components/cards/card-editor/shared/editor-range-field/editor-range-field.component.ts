import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';

let nextRangeFieldId = 0;

@Component({
  selector: 'app-editor-range-field', standalone: true,
  templateUrl: './editor-range-field.component.html', styleUrl: './editor-range-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorRangeFieldComponent implements OnChanges {
  @Input() label = '';
  @Input() value = 0;
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() scale = 1;
  @Input() unit = '';
  @Input() disabled = false;
  @Input() integerOnly = false;
  @Input() contextKey: string | null = null;
  @Input() sliderMin?: number;
  @Input() sliderMax?: number;
  @Output() readonly valueChange = new EventEmitter<number>();

  readonly fieldId = `editor-range-${nextRangeFieldId++}`;
  draft = '0';
  error = '';
  private committed = 0;
  private dirty = false;
  @ViewChild('numberInput') private numberInput?: ElementRef<HTMLInputElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] || changes['contextKey'] || changes['scale'] || changes['min'] || changes['max']) {
      this.committed = this.value;
      this.writeDraft(this.format(this.value * this.scale));
      this.error = '';
      this.dirty = false;
    }
  }

  get displayValue(): string { return this.format(this.committed * this.scale); }
  get displayMin(): number { return this.min * this.scale; }
  get displayMax(): number { return this.max * this.scale; }
  get displayStep(): number { return this.step * this.scale; }
  get effectiveSliderMin(): number { return this.sliderMin ?? this.min; }
  get effectiveSliderMax(): number { return this.sliderMax ?? this.max; }
  get sliderValue(): number {
    return this.safe(this.committed) ? Math.min(this.effectiveSliderMax, Math.max(this.effectiveSliderMin, this.committed)) : this.effectiveSliderMin;
  }
  get configurationValid(): boolean {
    return [this.min, this.max, this.step, this.scale, this.effectiveSliderMin, this.effectiveSliderMax,
      this.displayMin, this.displayMax, this.displayStep].every(value => this.safe(value)) &&
      this.min <= this.max && this.step > 0 && this.scale > 0 &&
      this.effectiveSliderMin >= this.min && this.effectiveSliderMax <= this.max &&
      this.effectiveSliderMin <= this.effectiveSliderMax;
  }

  edit(event: Event): void {
    if (this.disabled) return;
    this.draft = (event.target as HTMLInputElement).value;
    this.dirty = true;
    this.error = '';
  }

  commit(): void {
    if (this.disabled || !this.dirty) return;
    if (!this.configurationValid || this.draft.trim() === '') {
      this.error = 'Informe um número válido dentro do intervalo.';
      return;
    }
    const displayed = Number(this.draft);
    const next = displayed / this.scale;
    if (!this.safe(displayed) || !this.validModel(next)) {
      this.error = this.integerOnly && this.safe(next) && !Number.isInteger(next)
        ? `Use um número inteiro entre ${this.format(this.displayMin)} e ${this.format(this.displayMax)}${this.unit}.`
        : `Use um valor entre ${this.format(this.displayMin)} e ${this.format(this.displayMax)}${this.unit}.`;
      return;
    }
    this.accept(next);
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); this.commit(); }
    if (event.key === 'Escape') {
      event.preventDefault(); this.writeDraft(this.displayValue); this.error = ''; this.dirty = false;
    }
  }

  slide(event: Event): void {
    if (this.disabled || !this.configurationValid) return;
    const raw = (event.target as HTMLInputElement).value;
    if (raw.trim() === '') return;
    const next = Number(raw);
    if (!this.validModel(next) || next < this.effectiveSliderMin || next > this.effectiveSliderMax) return;
    this.accept(next);
  }

  private accept(next: number): void {
    this.writeDraft(this.format(next * this.scale));
    this.error = '';
    this.dirty = false;
    if (next === this.committed) return;
    this.committed = next;
    this.valueChange.emit(next);
  }

  private validModel(value: number): boolean {
    return this.safe(value) && value >= this.min && value <= this.max && (!this.integerOnly || Number.isInteger(value));
  }
  private safe(value: number): boolean { return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER; }
  private format(value: number): string { return this.safe(value) ? String(Number(value.toPrecision(14))) : ''; }
  private writeDraft(value: string): void {
    this.draft = value;
    // The browser may hold a draft that equals Angular's previous binding after cancellation.
    // Keep this local input in sync without dispatching an event or changing the model.
    if (this.numberInput) this.numberInput.nativeElement.value = value;
  }
}
