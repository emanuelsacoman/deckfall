import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { isCanvasColor } from '../../../../../../../model/services/tools/card-canvas-validation';
import { colorPickerHex } from '../../../../../../../model/services/tools/card-editor-colors';

let nextColorFieldId = 0;
const NEUTRAL_COLORS = ['#000000', '#ffffff', '#808080', '#deba75'] as const;

@Component({
  selector: 'app-editor-color-field', standalone: true,
  templateUrl: './editor-color-field.component.html', styleUrl: './editor-color-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorColorFieldComponent implements OnChanges {
  @Input() label = '';
  @Input() value = '';
  @Input() disabled = false;
  @Input() allowEmpty = true;
  @Input() allowTransparent = true;
  @Input() palette: readonly string[] = [];
  @Input() contextKey: string | null = null;
  @Output() readonly valueChange = new EventEmitter<string>();

  readonly fieldId = `editor-color-${nextColorFieldId++}`;
  draft = '';
  error = '';
  private committed = '';
  @ViewChild('textInput') private textInput?: ElementRef<HTMLInputElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] || changes['contextKey']) {
      this.committed = this.value;
      this.writeDraft(this.value);
      this.error = '';
    }
  }

  get pickerHex(): string { return colorPickerHex(this.committed) ?? '#000000'; }
  get pickerHint(): boolean { return colorPickerHex(this.committed) === null; }
  get swatchColor(): string { return isCanvasColor(this.committed) && this.committed !== '' ? this.committed : 'transparent'; }
  get swatchMark(): string { return this.committed === '' ? '∅' : !isCanvasColor(this.committed) ? '?' : ''; }
  get currentDescription(): string { return this.committed === '' ? 'sem cor' : this.committed; }

  get paletteColors(): readonly string[] {
    const unique = new Set<string>();
    return (this.palette.length ? this.palette : NEUTRAL_COLORS).filter(color => {
      if (!this.allowed(color)) return false;
      const identity = colorPickerHex(color) ?? color.replace(/\s+/g, '').toLowerCase();
      if (unique.has(identity) || unique.size >= 12) return false;
      unique.add(identity);
      return true;
    });
  }

  edit(event: Event): void {
    if (this.disabled) return;
    this.draft = (event.target as HTMLInputElement).value;
    this.error = '';
  }

  commit(): void { this.choose(this.draft.trim()); }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); this.commit(); }
    if (event.key === 'Escape') {
      event.preventDefault(); this.writeDraft(this.committed); this.error = '';
    }
  }

  picker(event: Event): void { this.choose((event.target as HTMLInputElement).value); }

  choose(color: string): void {
    if (this.disabled) return;
    if (!this.allowed(color)) {
      this.error = 'Informe uma cor hexadecimal, RGB/RGBA ou um nome de cor válido.';
      return;
    }
    this.writeDraft(color);
    this.error = '';
    if (color === this.committed) return;
    this.committed = color;
    this.valueChange.emit(color);
  }

  private allowed(color: string): boolean {
    return isCanvasColor(color) && (this.allowEmpty || color !== '') && (this.allowTransparent || color !== 'transparent');
  }

  private writeDraft(value: string): void {
    this.draft = value;
    if (this.textInput) this.textInput.nativeElement.value = value;
  }
}
