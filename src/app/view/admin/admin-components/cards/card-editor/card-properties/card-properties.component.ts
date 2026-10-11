import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { CARD_IMAGE_TYPES } from '../../../../../../model/interfaces/Cards/card';
import {
  AttributeProperties, BarProperties, CARD_CANVAS_CONFIG, CARD_FONTS, CanvasStyle,
  CardBinding, CardCanvasElement, EditorAssetSelection, FontStyle, ImageProperties, ShapeProperties, TextProperties
} from '../../../../../../model/interfaces/Cards/card-canvas';
import { CardEditorStateService } from '../../../../../../model/services/tools/card-editor-state.service';
import { isCanvasColor } from '../../../../../../model/services/tools/card-canvas-validation';
import { editorImageError } from '../element-library/element-library.component';

type TextElement = Extract<CardCanvasElement, { type: 'text' | 'icon' }>;
type ShapeElement = Extract<CardCanvasElement, { type: 'rect' | 'circle' | 'line' }>;
type ImageElement = Extract<CardCanvasElement, { type: 'image' | 'artwork' }>;

@Component({
  selector: 'app-card-properties', standalone: true,
  templateUrl: './card-properties.component.html', styleUrl: './card-properties.component.css'
})
export class CardPropertiesComponent {
  readonly state = inject(CardEditorStateService);
  readonly fonts = CARD_FONTS;
  readonly config = CARD_CANVAS_CONFIG;
  readonly imageTypes = CARD_IMAGE_TYPES.join(',');
  readonly inputError = signal('');
  readonly bindings = computed(() => [
    { key: 'name', label: 'Nome da carta' }, { key: 'description', label: 'Descrição' },
    { key: 'rarity', label: 'Raridade' }, { key: 'type', label: 'Tipo' }, { key: 'subtype', label: 'Subtipo' },
    ...this.state.data().attributes.map(attribute => ({ key: `attributes.${attribute.key}`, label: attribute.label }))
  ]);
  @Output() readonly assetSelected = new EventEmitter<EditorAssetSelection>();

  value(event: Event): string { return (event.target as HTMLInputElement | HTMLSelectElement).value; }
  checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  textElement(): TextElement | null {
    const element = this.state.selectedElement();
    return element?.type === 'text' || element?.type === 'icon' ? element : null;
  }
  shapeElement(): ShapeElement | null {
    const element = this.state.selectedElement();
    return element?.type === 'rect' || element?.type === 'circle' || element?.type === 'line' ? element : null;
  }
  imageElement(): ImageElement | null {
    const element = this.state.selectedElement();
    return element?.type === 'image' || element?.type === 'artwork' ? element : null;
  }
  attributeElement(): Extract<CardCanvasElement, { type: 'attribute' }> | null {
    const element = this.state.selectedElement(); return element?.type === 'attribute' ? element : null;
  }
  barElement(): Extract<CardCanvasElement, { type: 'bar' }> | null {
    const element = this.state.selectedElement(); return element?.type === 'bar' ? element : null;
  }
  patchText(patch: Partial<TextProperties>): void {
    const element = this.textElement(); if (element && !element.locked && !this.state.busy()) this.state.updateElement({ ...element, properties: { ...element.properties, ...patch } });
  }
  patchShape(patch: Partial<ShapeProperties>): void {
    const element = this.shapeElement(); if (element && !element.locked && !this.state.busy()) this.state.updateElement({ ...element, properties: { ...element.properties, ...patch } });
  }
  patchImage(patch: Partial<ImageProperties>): void {
    const element = this.imageElement(); if (element && !element.locked && !this.state.busy()) this.state.updateElement({ ...element, properties: { ...element.properties, ...patch } });
  }
  patchAttribute(patch: Partial<AttributeProperties>): void {
    const element = this.attributeElement(); if (element && !element.locked && !this.state.busy()) this.state.updateElement({ ...element, properties: { ...element.properties, ...patch } });
  }
  patchBar(patch: Partial<BarProperties>): void {
    const element = this.barElement(); if (element && !element.locked && !this.state.busy()) this.state.updateElement({ ...element, properties: { ...element.properties, ...patch } });
  }
  baseName(event: Event): void {
    const element = this.state.selectedElement();
    if (element && !element.locked && !this.state.busy()) this.state.patchElement(element.id, { name: this.value(event).slice(0, 120) });
  }
  baseNumber(key: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity', event: Event, min: number, max: number): void {
    const element = this.state.selectedElement(); const value = this.number(event, min, max);
    if (element && !element.locked && !this.state.busy() && value !== null) this.state.patchElement(element.id, { [key]: value });
  }
  styleColor(key: 'fill' | 'stroke' | 'shadowColor', event: Event): void {
    const color = this.color(event); if (color !== null) this.patchStyle({ [key]: color });
  }
  styleNumber(key: 'strokeWidth' | 'shadowBlur' | 'shadowOffsetX' | 'shadowOffsetY', event: Event, min: number, max: number): void {
    const value = this.number(event, min, max); if (value !== null) this.patchStyle({ [key]: value });
  }
  textNumber(key: 'fontSize' | 'letterSpacing' | 'lineHeight', event: Event, min: number, max: number): void {
    const value = this.number(event, min, max); if (value !== null) this.patchText({ [key]: value });
  }
  shapeNumber(key: 'cornerRadius' | 'gradientAngle', event: Event, min: number, max: number): void {
    const value = this.number(event, min, max); if (value !== null) this.patchShape({ [key]: value });
  }
  imageNumber(key: 'zoom' | 'offsetX' | 'offsetY' | 'cornerRadius', event: Event, min: number, max: number): void {
    const value = this.number(event, min, max); if (value !== null) this.patchImage({ [key]: value });
  }
  attributeNumber(event: Event): void { const value = this.number(event, 6, 256); if (value !== null) this.patchAttribute({ fontSize: value }); }
  barNumber(key: 'fontSize' | 'cornerRadius', event: Event, min: number, max: number): void {
    const value = this.number(event, min, max); if (value !== null) this.patchBar({ [key]: value });
  }
  setFontStyle(event: Event): void {
    const style = this.value(event);
    if (style !== 'normal' && style !== 'bold' && style !== 'italic' && style !== 'bold italic') return;
    const fontStyle: FontStyle = style; this.patchText({ fontStyle }); this.patchAttribute({ fontStyle });
  }
  setAlign(event: Event): void {
    const align = this.value(event);
    if (align === 'left' || align === 'center' || align === 'right') { this.patchText({ align }); this.patchAttribute({ align }); }
  }
  setBinding(event: Event): void {
    const value = this.value(event);
    if (!value) this.patchText({ binding: null });
    else if (this.bindings().some(binding => binding.key === value)) this.patchText({ binding: value as CardBinding });
  }
  setCrop(key: keyof ImageProperties['crop'], event: Event): void {
    const element = this.imageElement(); const value = this.number(event, key === 'width' || key === 'height' ? 0.001 : 0, 1);
    if (!element || value === null) return;
    const crop = { ...element.properties.crop, [key]: value };
    if (crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) {
      this.inputError.set('O recorte deve ter tamanho positivo e permanecer dentro da imagem.'); return;
    }
    this.patchImage({ crop });
  }
  setFit(event: Event): void { const fit = this.value(event); if (fit === 'cover' || fit === 'contain' || fit === 'fill') this.patchImage({ fit }); }
  setMask(event: Event): void { const mask = this.value(event); if (mask === 'none' || mask === 'rounded' || mask === 'ellipse') this.patchImage({ mask }); }
  setFilter(event: Event): void { const filter = this.value(event); if (filter === 'none' || filter === 'grayscale' || filter === 'sepia') this.patchImage({ filter }); }
  setImageBinding(event: Event): void { this.patchImage({ binding: this.checked(event) ? 'art' : null }); }
  setFillMode(event: Event): void { const fillMode = this.value(event); if (fillMode === 'solid' || fillMode === 'gradient') this.patchShape({ fillMode }); }
  setLabelMode(event: Event): void { const labelMode = this.value(event); if (labelMode === 'label-value' || labelMode === 'value' || labelMode === 'label') this.patchAttribute({ labelMode }); }
  extraColor(target: 'gradientColor' | 'trackColor', event: Event): void {
    const color = this.color(event); if (color === null) return;
    if (target === 'gradientColor') this.patchShape({ gradientColor: color }); else this.patchBar({ trackColor: color });
  }
  backgroundKind(event: Event): void {
    const kind = this.value(event);
    if (kind === 'solid' || kind === 'gradient' || kind === 'image' || kind === 'texture') this.state.updateCanvasSettings({ background: { kind } });
  }
  backgroundColor(key: 'color' | 'color2', event: Event): void {
    const color = this.color(event); if (color !== null) this.state.updateCanvasSettings({ background: { [key]: color } });
  }
  backgroundAngle(event: Event): void {
    const angle = this.number(event, -360, 360); if (angle !== null) this.state.updateCanvasSettings({ background: { angle } });
  }
  dimension(key: 'width' | 'height', event: Event): void {
    const value = this.number(event, this.config.minDimension, this.config.maxDimension);
    if (value !== null && Number.isInteger(value)) this.state.updateCanvasSettings({ [key]: value });
    else this.inputError.set('As dimensões da carta precisam ser números inteiros.');
  }
  upload(event: Event): void {
    if (this.state.busy() || this.state.selectedElement()?.locked) return;
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.inputError.set(editorImageError(file) ?? '');
    if (this.inputError()) return;
    this.assetSelected.emit({ elementId: this.imageElement()?.id ?? null, file });
  }
  assetName(assetId: string | null): string { return this.state.canvas().assets.find(asset => asset.id === assetId)?.fileName ?? 'Nenhuma imagem selecionada'; }
  private patchStyle(patch: Partial<CanvasStyle>): void {
    this.patchText(patch); this.patchShape(patch); this.patchImage(patch); this.patchAttribute(patch); this.patchBar(patch);
  }
  private number(event: Event, min: number, max: number): number | null {
    const raw = this.value(event); const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < min || value > max) {
      this.inputError.set(`Informe um número entre ${min} e ${max}.`); return null;
    }
    this.inputError.set(''); return value;
  }
  private color(event: Event): string | null {
    const color = this.value(event).trim();
    if (!isCanvasColor(color)) { this.inputError.set('Use uma cor hexadecimal, RGB, transparent ou deixe vazio.'); return null; }
    this.inputError.set(''); return color;
  }
}
