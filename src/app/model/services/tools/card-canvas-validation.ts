import { CARD_IMAGE_TYPES, CARD_LIMITS } from '../../interfaces/Cards/card';
import {
  CARD_CANVAS_CONFIG, CARD_FONTS, AttributeProperties, BarProperties, CardBinding,
  CardCanvasAsset, CardCanvasBackground, CardCanvasData, CardCanvasElement,
  CanvasStyle, ImageProperties, ShapeProperties, TextProperties
} from '../../interfaces/Cards/card-canvas';

type Fields = Record<string, unknown>;
const STYLE_FIELDS = ['fill', 'stroke', 'strokeWidth', 'borderStyle', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY'];
const TEXT_APPEARANCE_FIELDS = ['textDecoration', 'verticalAlign'];
const ELEMENT_FIELDS = ['id', 'name', 'type', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible', 'locked', 'properties'];
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const ATTRIBUTE_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;
const ASSET_PATH_PATTERN = /^(cards\/[a-zA-Z0-9_-]{1,128}\/(art|assets)|templates\/[a-zA-Z0-9_-]{1,128}\/assets)\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/;

export function validateCardDocumentSize(value: unknown): void {
  let json: string | undefined;
  try { json = JSON.stringify(value); } catch { throw new Error('O documento contém dados que não podem ser serializados.'); }
  if (json === undefined || new TextEncoder().encode(json).byteLength > CARD_CANVAS_CONFIG.maxBytes) {
    throw new Error('O documento deve ocupar no máximo 128 KiB. Reduza o conteúdo ou os elementos.');
  }
}

export function validateCardCanvas(value: unknown): CardCanvasData {
  validateCardDocumentSize(value);
  const data = fields(value, 'canvas', ['version', 'width', 'height', 'background', 'elements', 'assets']);
  if (data['version'] !== CARD_CANVAS_CONFIG.version) throw new Error('Versão do canvas não suportada.');
  const assets = array(data['assets'], 'assets', CARD_CANVAS_CONFIG.maxAssets).map(validateCanvasAsset);
  ensureUnique(assets.map(asset => asset.id), 'asset');
  const assetIds = new Set(assets.map(asset => asset.id));
  const elements = array(data['elements'], 'elementos', CARD_CANVAS_CONFIG.maxElements)
    .map(element => validateElement(element, assetIds));
  ensureUnique(elements.map(element => element.id), 'elemento');
  return {
    version: 1,
    width: finite(data['width'], 'largura do canvas', CARD_CANVAS_CONFIG.minDimension, CARD_CANVAS_CONFIG.maxDimension),
    height: finite(data['height'], 'altura do canvas', CARD_CANVAS_CONFIG.minDimension, CARD_CANVAS_CONFIG.maxDimension),
    background: validateBackground(data['background'], assetIds), elements, assets
  };
}

export function validateCanvasAsset(value: unknown): CardCanvasAsset {
  const data = fields(value, 'asset', ['id', 'storagePath', 'fileName', 'contentType', 'size']);
  const path = data['storagePath'];
  if (path !== null && (typeof path !== 'string' || !ASSET_PATH_PATTERN.test(path))) {
    throw new Error('Caminho do asset inválido. Use o namespace de cartas ou templates.');
  }
  const contentType = text(data['contentType'], 'tipo do asset', 100);
  if (!CARD_IMAGE_TYPES.some(type => type === contentType)) throw new Error('O asset deve ser uma imagem PNG, JPEG ou WebP.');
  const size = finite(data['size'], 'tamanho do asset', 1, CARD_LIMITS.imageBytes);
  if (!Number.isInteger(size)) throw new Error('O tamanho do asset deve ser inteiro.');
  return {
    id: id(data['id']), storagePath: path as string | null,
    fileName: text(data['fileName'], 'nome do arquivo', 255, false), contentType, size
  };
}

export function isCardCanvasAssetPath(path: string): boolean {
  return ASSET_PATH_PATTERN.test(path);
}

export function isCanvasColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '' || value === 'transparent' || /^(black|white|red|green|blue|gray|grey|yellow)$/.test(value)) return true;
  if (/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/.test(value)) return true;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/.exec(value);
  return rgb !== null && rgb.slice(1, 4).every(channel => Number(channel) <= 255)
    && (value.startsWith('rgba(') ? rgb[4] !== undefined : rgb[4] === undefined);
}

function validateElement(value: unknown, assetIds: Set<string>): CardCanvasElement {
  const data = fields(value, 'elemento', ELEMENT_FIELDS);
  const base = {
    id: id(data['id']), name: text(data['name'], 'nome do elemento', 120),
    x: finite(data['x'], 'posição X', -8192, 8192), y: finite(data['y'], 'posição Y', -8192, 8192),
    width: finite(data['width'], 'largura do elemento', 8, 8192), height: finite(data['height'], 'altura do elemento', 8, 8192),
    rotation: finite(data['rotation'], 'rotação', -360, 360), opacity: finite(data['opacity'], 'opacidade', 0, 1),
    visible: bool(data['visible'], 'visibilidade'), locked: bool(data['locked'], 'bloqueio')
  };
  switch (data['type']) {
    case 'text': case 'icon': return { ...base, type: data['type'], properties: validateText(data['properties']) };
    case 'rect': case 'circle': case 'line': return { ...base, type: data['type'], properties: validateShape(data['properties']) };
    case 'image': case 'artwork': return { ...base, type: data['type'], properties: validateImage(data['properties'], assetIds) };
    case 'attribute': return { ...base, type: 'attribute', properties: validateAttribute(data['properties']) };
    case 'bar': return { ...base, type: 'bar', properties: validateBar(data['properties']) };
    default: throw new Error('Tipo de elemento desconhecido.');
  }
}

function style(data: Fields): CanvasStyle {
  return {
    fill: color(data['fill']), stroke: color(data['stroke']), shadowColor: color(data['shadowColor']),
    strokeWidth: finite(data['strokeWidth'], 'espessura da borda', 0, 64),
    ...(hasField(data, 'borderStyle') ? { borderStyle: choice(data['borderStyle'], ['solid', 'dashed', 'dotted'] as const, 'estilo da borda') } : {}),
    shadowBlur: finite(data['shadowBlur'], 'desfoque da sombra', 0, 100),
    shadowOffsetX: finite(data['shadowOffsetX'], 'sombra X', -100, 100),
    shadowOffsetY: finite(data['shadowOffsetY'], 'sombra Y', -100, 100)
  };
}

function validateText(value: unknown): TextProperties {
  const data = fields(value, 'texto', [...STYLE_FIELDS, ...TEXT_APPEARANCE_FIELDS, 'text', 'binding', 'fontFamily', 'fontSize', 'fontStyle', 'align', 'letterSpacing', 'lineHeight']);
  const binding = data['binding'];
  if (binding !== null && (typeof binding !== 'string' ||
      (!['name', 'description', 'rarity', 'type', 'subtype'].includes(binding) && !/^attributes\.[a-z][a-z0-9_-]{0,39}$/.test(binding)))) {
    throw new Error('Binding inválido. Use um campo conhecido ou attributes.<chave>.');
  }
  return {
    ...style(data), text: text(data['text'], 'texto', 5000), binding: binding as CardBinding | null,
    ...font(data), ...textAppearance(data), letterSpacing: finite(data['letterSpacing'], 'espaçamento das letras', -20, 100),
    lineHeight: finite(data['lineHeight'], 'altura de linha', 0.5, 5)
  };
}

function validateShape(value: unknown): ShapeProperties {
  const data = fields(value, 'forma', [...STYLE_FIELDS, 'cornerRadius', 'fillMode', 'gradientColor', 'gradientAngle']);
  return {
    ...style(data), cornerRadius: finite(data['cornerRadius'], 'raio dos cantos', 0, 4096),
    fillMode: choice(data['fillMode'], ['solid', 'gradient'], 'preenchimento'),
    gradientColor: color(data['gradientColor']), gradientAngle: finite(data['gradientAngle'], 'ângulo do gradiente', -360, 360)
  };
}

function validateImage(value: unknown, assetIds: Set<string>): ImageProperties {
  const data = fields(value, 'imagem', [...STYLE_FIELDS, 'assetId', 'binding', 'fit', 'crop', 'zoom', 'offsetX', 'offsetY', 'mask', 'cornerRadius', 'filter', 'flipX', 'flipY', 'brightness', 'contrast', 'saturation', 'hue']);
  const crop = fields(data['crop'], 'crop', ['x', 'y', 'width', 'height']);
  const rect = {
    x: finite(crop['x'], 'crop X', 0, 1), y: finite(crop['y'], 'crop Y', 0, 1),
    width: finite(crop['width'], 'largura do crop', 0, 1), height: finite(crop['height'], 'altura do crop', 0, 1)
  };
  if (rect.width <= 0 || rect.height <= 0) throw new Error('As dimensões do crop precisam ser positivas.');
  if (rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) throw new Error('O crop deve permanecer dentro da imagem.');
  if (data['binding'] !== null && data['binding'] !== 'art') throw new Error('Binding de imagem inválido.');
  return {
    ...style(data), assetId: assetReference(data['assetId'], assetIds), binding: data['binding'] as 'art' | null,
    fit: choice(data['fit'], ['cover', 'contain', 'fill'], 'ajuste da imagem'), crop: rect,
    zoom: finite(data['zoom'], 'zoom da imagem', 0.1, 10),
    offsetX: finite(data['offsetX'], 'deslocamento da imagem X', -1, 1), offsetY: finite(data['offsetY'], 'deslocamento da imagem Y', -1, 1),
    mask: choice(data['mask'], ['none', 'rounded', 'ellipse'], 'máscara'),
    cornerRadius: finite(data['cornerRadius'], 'raio dos cantos', 0, 4096),
    filter: choice(data['filter'], ['none', 'grayscale', 'sepia'], 'filtro'),
    ...(hasField(data, 'flipX') ? { flipX: bool(data['flipX'], 'espelhamento horizontal') } : {}),
    ...(hasField(data, 'flipY') ? { flipY: bool(data['flipY'], 'espelhamento vertical') } : {}),
    ...(hasField(data, 'brightness') ? { brightness: finite(data['brightness'], 'brilho da imagem', -1, 1) } : {}),
    ...(hasField(data, 'contrast') ? { contrast: finite(data['contrast'], 'contraste da imagem', -100, 100) } : {}),
    ...(hasField(data, 'saturation') ? { saturation: finite(data['saturation'], 'saturação da imagem', -1, 1) } : {}),
    ...(hasField(data, 'hue') ? { hue: finite(data['hue'], 'matiz da imagem', -180, 180) } : {})
  };
}

function validateAttribute(value: unknown): AttributeProperties {
  const data = fields(value, 'atributo visual', [...STYLE_FIELDS, ...TEXT_APPEARANCE_FIELDS, 'attributeKey', 'labelMode', 'suffix', 'showIcon', 'fontFamily', 'fontSize', 'fontStyle', 'align']);
  return {
    ...style(data), ...font(data), ...textAppearance(data), attributeKey: attributeKey(data['attributeKey']),
    labelMode: choice(data['labelMode'], ['label-value', 'value', 'label'], 'modo do rótulo'),
    suffix: text(data['suffix'], 'sufixo', 40), showIcon: bool(data['showIcon'], 'ícone')
  };
}

function validateBar(value: unknown): BarProperties {
  const data = fields(value, 'barra', [...STYLE_FIELDS, 'attributeKey', 'trackColor', 'showValue', 'cornerRadius', 'fontFamily', 'fontSize']);
  return {
    ...style(data), attributeKey: attributeKey(data['attributeKey']), trackColor: color(data['trackColor']),
    showValue: bool(data['showValue'], 'valor da barra'), cornerRadius: finite(data['cornerRadius'], 'raio dos cantos', 0, 4096),
    fontFamily: fontFamily(data['fontFamily']), fontSize: finite(data['fontSize'], 'tamanho da fonte', 6, 256)
  };
}

function validateBackground(value: unknown, assetIds: Set<string>): CardCanvasBackground {
  const data = fields(value, 'background', ['kind', 'color', 'color2', 'angle', 'assetId']);
  return {
    kind: choice(data['kind'], ['solid', 'gradient', 'image', 'texture'], 'background'),
    color: color(data['color']), color2: color(data['color2']), angle: finite(data['angle'], 'ângulo do background', -360, 360),
    assetId: assetReference(data['assetId'], assetIds)
  };
}

function font(data: Fields): Pick<TextProperties, 'fontFamily' | 'fontSize' | 'fontStyle' | 'align'> {
  return {
    fontFamily: fontFamily(data['fontFamily']), fontSize: finite(data['fontSize'], 'tamanho da fonte', 6, 256),
    fontStyle: choice(data['fontStyle'], ['normal', 'bold', 'italic', 'bold italic'], 'estilo da fonte'),
    align: choice(data['align'], ['left', 'center', 'right'], 'alinhamento')
  };
}

function textAppearance(data: Fields): Pick<TextProperties, 'textDecoration' | 'verticalAlign'> {
  return {
    ...(hasField(data, 'textDecoration') ? {
      textDecoration: choice(data['textDecoration'], ['none', 'underline', 'line-through', 'underline line-through'] as const, 'decoração do texto')
    } : {}),
    ...(hasField(data, 'verticalAlign') ? { verticalAlign: choice(data['verticalAlign'], ['top', 'middle', 'bottom'] as const, 'alinhamento vertical') } : {})
  };
}

function hasField(data: Fields, key: string): boolean { return Object.prototype.hasOwnProperty.call(data, key); }

function fields(value: unknown, label: string, allowed: string[]): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Formato inválido: ${label}.`);
  const result = value as Fields;
  if (Object.keys(result).some(key => !allowed.includes(key))) throw new Error(`Campo desconhecido em ${label}.`);
  return result;
}
function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`A lista de ${label} permite até ${maximum} itens.`);
  return value as unknown[];
}
function text(value: unknown, label: string, maximum: number, empty = true): string {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim())) throw new Error(`Texto inválido: ${label}.`);
  return value;
}
function finite(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Valor inválido: ${label}.`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Valor inválido: ${label}.`);
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`Opção inválida: ${label}.`);
  return value as T;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('ID de elemento ou asset inválido.');
  return value;
}
function attributeKey(value: unknown): string {
  if (value === '') return '';
  if (typeof value !== 'string' || !ATTRIBUTE_PATTERN.test(value)) throw new Error('Chave do atributo visual inválida.');
  return value;
}
function color(value: unknown): string {
  if (!isCanvasColor(value)) throw new Error('Cor inválida. Use uma cor hexadecimal ou RGB válida.');
  return value;
}
function fontFamily(value: unknown): string {
  return choice(value, CARD_FONTS, 'fonte');
}
function assetReference(value: unknown, assetIds: Set<string>): string | null {
  if (value === null) return null;
  const assetId = id(value);
  if (!assetIds.has(assetId)) throw new Error(`O asset ${assetId} referenciado no canvas não existe.`);
  return assetId;
}
function ensureUnique(ids: string[], kind: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`IDs de ${kind} repetidos.`);
}
