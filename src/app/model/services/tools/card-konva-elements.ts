import Konva from 'konva';
import {
  attributeRange, CardCanvasElement, CanvasStyle, ImageProperties, ShapeProperties
} from '../../interfaces/Cards/card-canvas';
import { CardDataInput } from '../../interfaces/Cards/card';
import { renderText } from './card-canvas-factory';

export function gradient(width: number, height: number, angle: number, color: string, color2: string) {
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians), dy = Math.sin(radians);
  const distance = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: width / 2 - dx * distance, y: height / 2 - dy * distance },
    fillLinearGradientEndPoint: { x: width / 2 + dx * distance, y: height / 2 + dy * distance },
    fillLinearGradientColorStops: [0, color, 1, color2]
  };
}

function style(properties: CanvasStyle) {
  return {
    fill: properties.fill, stroke: properties.stroke, strokeWidth: properties.strokeWidth,
    shadowColor: properties.shadowColor, shadowBlur: properties.shadowBlur,
    shadowOffsetX: properties.shadowOffsetX, shadowOffsetY: properties.shadowOffsetY,
    listening: false
  };
}

export function elementText(element: CardCanvasElement, data: CardDataInput): string {
  if (element.type === 'text' || element.type === 'icon') {
    return renderText(element.properties.text, element.properties.binding, data);
  }
  if (element.type === 'attribute' || element.type === 'bar') {
    const attribute = data.attributes.find(item => item.key === element.properties.attributeKey);
    if (!attribute) return '—';
    if (element.type === 'bar') return `${attribute.label} ${attribute.value}`;
    const properties = element.properties;
    const icon = properties.showIcon && attribute.icon ? `${attribute.icon} ` : '';
    const value = `${attribute.value}${properties.suffix}`;
    return icon + (properties.labelMode === 'value' ? value : properties.labelMode === 'label' ? attribute.label : `${attribute.label} ${value}`);
  }
  return '';
}

function shapeStyle(element: CardCanvasElement, properties: ShapeProperties) {
  return {
    ...style(properties),
    ...(properties.fillMode === 'gradient'
      ? gradient(element.width, element.height, properties.gradientAngle, properties.fill, properties.gradientColor)
      : { fillPriority: 'color' })
  };
}

export function imageLayout(image: HTMLImageElement, width: number, height: number, properties: ImageProperties) {
  const region = {
    x: Math.max(0, Math.min(1, properties.crop.x)) * image.naturalWidth,
    y: Math.max(0, Math.min(1, properties.crop.y)) * image.naturalHeight,
    width: Math.max(1, Math.min(properties.crop.width, 1 - properties.crop.x) * image.naturalWidth),
    height: Math.max(1, Math.min(properties.crop.height, 1 - properties.crop.y) * image.naturalHeight)
  };
  const offsetX = Math.max(-1, Math.min(1, properties.offsetX));
  const offsetY = Math.max(-1, Math.min(1, properties.offsetY));
  if (properties.fit === 'contain') {
    const scale = Math.min(width / region.width, height / region.height) * properties.zoom;
    const targetWidth = region.width * scale, targetHeight = region.height * scale;
    return { crop: region, width: targetWidth, height: targetHeight,
      x: (width - targetWidth) / 2 * (1 + offsetX), y: (height - targetHeight) / 2 * (1 + offsetY) };
  }
  let cropWidth = region.width, cropHeight = region.height;
  if (properties.fit === 'cover') {
    const ratio = width / height;
    if (cropWidth / cropHeight > ratio) cropWidth = cropHeight * ratio;
    else cropHeight = cropWidth / ratio;
  }
  const zoom = Math.max(1, properties.zoom);
  cropWidth /= zoom; cropHeight /= zoom;
  return {
    x: 0, y: 0, width, height,
    crop: { x: region.x + (region.width - cropWidth) / 2 * (1 + offsetX),
      y: region.y + (region.height - cropHeight) / 2 * (1 + offsetY), width: cropWidth, height: cropHeight }
  };
}

function addImage(group: Konva.Group, element: Extract<CardCanvasElement, { type: 'image' | 'artwork' }>, image?: HTMLImageElement): void {
  const properties = element.properties;
  const width = element.width, height = element.height;
  const radius = Math.min(properties.cornerRadius, width / 2, height / 2);
  const mask = new Konva.Group({ listening: false, clipFunc: context => {
    context.beginPath();
    if (properties.mask === 'ellipse') context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    else if (properties.mask === 'rounded') context.roundRect(0, 0, width, height, radius);
    else context.rect(0, 0, width, height);
    context.closePath();
  } });
  mask.add(new Konva.Rect({ width, height, fill: properties.fill, listening: false }));
  if (image) {
    const shape = new Konva.Image({ image, ...imageLayout(image, width, height, properties), listening: false });
    if (properties.filter !== 'none') {
      shape.filters([properties.filter === 'grayscale' ? Konva.Filters.Grayscale : Konva.Filters.Sepia]);
      shape.cache();
    }
    mask.add(shape);
  } else {
    mask.add(new Konva.Text({ name: 'editor-placeholder', width, height, align: 'center', verticalAlign: 'middle',
      text: properties.assetId ? 'Imagem indisponível' : 'Adicione uma imagem', fontSize: Math.min(24, width / 10), fill: '#5c6370', listening: false }));
  }
  group.add(mask);
  const border = properties.mask === 'ellipse'
    ? new Konva.Ellipse({ x: width / 2, y: height / 2, radiusX: width / 2, radiusY: height / 2, ...style(properties), fill: 'transparent' })
    : new Konva.Rect({ width, height, cornerRadius: properties.mask === 'rounded' ? radius : 0, ...style(properties), fill: 'transparent' });
  group.add(border);
}

export function drawElement(group: Konva.Group, element: CardCanvasElement, data: CardDataInput, image?: HTMLImageElement): void {
  group.destroyChildren();
  group.add(new Konva.Rect({ name: 'element-hit-area', width: element.width, height: element.height, fill: 'transparent' }));
  const properties = element.properties;
  switch (element.type) {
    case 'text': case 'icon': {
      group.add(new Konva.Text({ ...style(element.properties), text: elementText(element, data),
        width: element.width, height: element.height, fontFamily: element.properties.fontFamily,
        fontSize: element.properties.fontSize, fontStyle: element.properties.fontStyle, align: element.properties.align,
        letterSpacing: element.properties.letterSpacing, lineHeight: element.properties.lineHeight, wrap: 'word' }));
      break;
    }
    case 'rect':
      group.add(new Konva.Rect({ ...shapeStyle(element, element.properties), width: element.width, height: element.height, cornerRadius: element.properties.cornerRadius }));
      break;
    case 'circle':
      group.add(new Konva.Ellipse({ ...shapeStyle(element, element.properties), x: element.width / 2, y: element.height / 2, radiusX: element.width / 2, radiusY: element.height / 2 }));
      break;
    case 'line':
      group.add(new Konva.Line({ ...shapeStyle(element, element.properties), points: [0, 0, element.width, element.height], lineCap: 'round' }));
      break;
    case 'image': case 'artwork': addImage(group, element, image); break;
    case 'attribute': {
      const attribute = data.attributes.find(item => item.key === element.properties.attributeKey);
      group.add(new Konva.Text({ ...style(properties), fill: attribute?.color ?? properties.fill, text: elementText(element, data),
        width: element.width, height: element.height, fontFamily: element.properties.fontFamily,
        fontSize: element.properties.fontSize, fontStyle: element.properties.fontStyle, align: element.properties.align, verticalAlign: 'middle' }));
      break;
    }
    case 'bar': {
      const attribute = data.attributes.find(item => item.key === element.properties.attributeKey);
      const range = attribute ? attributeRange(attribute) : { min: 0, max: 100 };
      const proportion = !attribute || range.max <= range.min ? 0 : Math.min(1, Math.max(0, (attribute.value - range.min) / (range.max - range.min)));
      group.add(new Konva.Rect({ ...style(properties), fill: element.properties.trackColor, width: element.width, height: element.height, cornerRadius: element.properties.cornerRadius }));
      group.add(new Konva.Rect({ width: element.width * proportion, height: element.height, fill: attribute?.color ?? properties.fill,
        cornerRadius: element.properties.cornerRadius, listening: false }));
      if (element.properties.showValue) group.add(new Konva.Text({ width: element.width, height: element.height,
        text: elementText(element, data), fontFamily: element.properties.fontFamily, fontSize: element.properties.fontSize,
        fill: '#ffffff', align: 'center', verticalAlign: 'middle', listening: false }));
      break;
    }
  }
}
