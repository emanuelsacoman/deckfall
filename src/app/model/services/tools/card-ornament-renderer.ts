import Konva from 'konva';
import { CardCanvasElement, CardOrnamentMotif, CanvasStyle, EmblemProperties } from '../../interfaces/Cards/card-canvas';

type FrameElement = Extract<CardCanvasElement, { type: 'frame' }>;
type EmblemElement = Extract<CardCanvasElement, { type: 'emblem' }>;

// Fixed vector silhouettes, authored in a 100 × 100 viewbox. They do not depend on
// emoji fonts, downloaded artwork or executable SVG supplied by a document.
const MOTIFS: Record<CardOrnamentMotif, { silhouette: string; engraving: string }> = {
  flame: {
    silhouette: 'M51 4 C66 24 53 30 68 42 C73 32 76 27 76 20 C95 47 90 73 73 86 C50 104 19 89 15 67 C11 49 24 41 27 28 C32 39 29 49 38 52 C49 39 35 28 51 4 Z',
    engraving: 'M48 87 C29 77 34 64 45 52 C43 66 56 65 56 50 C72 66 70 79 58 88 M53 20 C60 35 48 37 53 47'
  },
  leaf: {
    silhouette: 'M16 83 C-1 50 31 12 88 9 C83 51 72 81 40 87 C29 91 23 84 16 83 Z M17 78 L9 94 L18 96 L28 82 Z',
    engraving: 'M19 81 C43 63 65 35 82 16 M31 70 L28 48 M43 56 L39 34 M55 42 L53 23 M33 69 L54 71 M47 53 L69 51 M61 37 L77 31'
  },
  crystal: {
    silhouette: 'M50 5 L79 24 L91 63 L50 96 L10 63 L22 24 Z',
    engraving: 'M50 5 L34 28 L38 66 L50 96 L63 66 L67 28 Z M22 24 L34 28 L67 28 L79 24 M10 63 L38 66 L63 66 L91 63 M34 28 L50 19 L67 28 M50 19 L50 83'
  },
  sun: {
    silhouette: 'M50 2 L57 21 L72 9 L73 30 L94 26 L82 44 L99 50 L81 58 L94 75 L73 72 L72 93 L57 80 L50 99 L42 81 L26 94 L27 73 L6 75 L19 58 L1 50 L20 42 L7 25 L28 28 L27 7 L43 21 Z',
    engraving: 'M50 28 C79 28 79 73 50 73 C21 73 21 28 50 28 Z M50 35 C70 35 70 66 50 66 C30 66 30 35 50 35 Z'
  },
  moon: {
    silhouette: 'M70 8 C33 -3 7 24 11 54 C15 87 52 102 80 84 C90 78 94 71 96 63 C78 78 51 70 41 51 C31 31 44 12 70 8 Z',
    engraving: 'M26 28 C12 53 27 80 52 85 M58 25 L62 36 L73 40 L62 44 L58 55 L54 44 L43 40 L54 36 Z M82 11 L84 17 L91 19 L84 21 L82 28 L80 21 L74 19 L80 17 Z'
  },
  skull: {
    silhouette: 'M50 8 C25 8 10 23 11 46 C12 61 22 64 29 70 L30 88 L40 91 L43 85 L47 92 L54 92 L57 85 L61 91 L72 88 L73 70 C83 65 91 59 91 44 C91 21 75 8 50 8 Z',
    engraving: 'M26 41 C40 33 44 49 40 58 C25 62 21 50 26 41 Z M61 40 C77 35 80 51 72 58 C57 62 54 48 61 40 Z M49 56 L43 69 L57 69 Z M35 77 L65 77 M40 78 L40 88 M49 78 L49 90 M58 78 L58 88 M26 27 C41 17 58 16 73 27'
  },
  heart: {
    silhouette: 'M50 92 C35 78 8 60 8 36 C8 10 36 6 50 28 C64 6 92 10 92 36 C92 60 65 78 50 92 Z',
    engraving: 'M21 40 C18 25 32 19 41 31 M50 79 C69 63 80 52 81 38'
  },
  sword: {
    silhouette: 'M50 3 L63 24 L57 61 L80 66 L77 75 L58 72 L56 87 L62 92 L56 98 L44 98 L38 92 L44 87 L42 72 L23 75 L20 66 L43 61 L37 24 Z',
    engraving: 'M50 10 L50 61 M42 28 L50 20 L58 28 M28 68 L44 66 L56 66 L72 68 M47 75 L53 79 M47 81 L52 85 M45 92 L55 92'
  },
  shield: {
    silhouette: 'M50 5 C65 14 78 17 91 17 L87 54 C85 74 69 87 50 97 C31 87 15 74 13 54 L9 17 C24 17 38 12 50 5 Z',
    engraving: 'M50 15 C62 21 72 24 80 24 L77 52 C75 67 64 78 50 86 C36 78 25 67 23 52 L20 24 C31 23 41 20 50 15 Z M50 25 L50 74 M32 47 L68 47'
  },
  drop: {
    silhouette: 'M50 3 C46 22 16 40 16 64 C16 85 32 97 50 97 C70 97 85 82 84 63 C82 41 59 25 50 3 Z',
    engraving: 'M45 28 C37 44 24 50 25 66 C25 76 32 82 40 83 M57 85 C67 82 74 76 75 65'
  },
  bolt: {
    silhouette: 'M49 3 L83 3 L61 37 L83 37 L29 98 L40 58 L17 58 Z',
    engraving: 'M53 12 L34 48 L52 48 L43 72 M52 47 L68 43'
  },
  star: {
    silhouette: 'M50 3 L63 34 L97 37 L71 59 L79 94 L50 75 L21 94 L29 59 L3 37 L37 34 Z',
    engraving: 'M50 12 L50 55 L13 41 M50 55 L28 84 M50 55 L73 84 M50 55 L86 41 M40 43 L60 43 L66 58 L50 68 L34 58 Z'
  }
};

const SHIELD = 'M50 3 C66 12 81 16 94 16 L90 55 C88 77 70 91 50 101 C30 91 12 77 10 55 L6 16 C21 16 36 11 50 3 Z';

/** Keeps derived colors compatible with the hex/RGB colors accepted by the canvas model. */
function tint(color: string, amount: number): string {
  if (!color) return 'transparent';
  let channels: number[];
  if (/^#[0-9a-f]{3,8}$/i.test(color)) {
    let hex = color.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(value => value + value).join('');
    channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
    if (hex.length === 8) channels.push(parseInt(hex.slice(6, 8), 16) / 255);
  } else if (/^rgba?\(/i.test(color)) channels = color.match(/[\d.]+/g)!.map(Number);
  else return color; // transparent remains transparent; invalid colors are rejected before rendering.
  const target = amount < 0 ? 0 : 255;
  const rgb = channels.slice(0, 3).map(value => Math.round(value + (target - value) * Math.abs(amount)));
  return `rgba(${rgb.join(',')},${channels[3] ?? 1})`;
}

function metallic(color: string, size: number, relief = 1) {
  color = color || 'transparent';
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: size * 0.3, y: size },
    fillLinearGradientColorStops: [0, tint(color, 0.66 * relief), 0.2, tint(color, 0.15 * relief),
      0.46, tint(color, -0.38 * relief), 0.53, tint(color, 0.32 * relief), 0.76, color, 1, tint(color, -0.65 * relief)]
  };
}

function shadow(properties: CanvasStyle) {
  return { shadowColor: properties.shadowColor, shadowBlur: properties.shadowBlur,
    shadowOffsetX: properties.shadowOffsetX, shadowOffsetY: properties.shadowOffsetY };
}

function roundedPath(x: number, y: number, width: number, height: number, radius: number, reverse = false): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width, bottom = y + height;
  return reverse
    ? `M${x + r} ${y} Q${x} ${y} ${x} ${y + r} V${bottom - r} Q${x} ${bottom} ${x + r} ${bottom} H${right - r} Q${right} ${bottom} ${right} ${bottom - r} V${y + r} Q${right} ${y} ${right - r} ${y} Z`
    : `M${x + r} ${y} H${right - r} Q${right} ${y} ${right} ${y + r} V${bottom - r} Q${right} ${bottom} ${right - r} ${bottom} H${x + r} Q${x} ${bottom} ${x} ${bottom - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}

function ringPath(width: number, height: number, radius: number, outer: number, inner: number): string {
  return roundedPath(outer, outer, width - 2 * outer, height - 2 * outer, radius - outer)
    + roundedPath(inner, inner, width - 2 * inner, height - 2 * inner, radius - inner, true);
}

function randomSource(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = Math.imul(value ^ value >>> 15, value | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function bevelPath(group: Konva.Group, data: string, metal: string, strokeWidth: number, size: number): void {
  group.add(new Konva.Path({ data, ...metallic(metal, size), stroke: tint(metal, -0.7), strokeWidth, lineJoin: 'round', listening: false }));
  group.add(new Konva.Path({ data, x: -strokeWidth * 0.22, y: -strokeWidth * 0.25, fillEnabled: false,
    stroke: tint(metal, 0.7), strokeWidth: strokeWidth * 0.3, opacity: 0.8, lineJoin: 'round', listening: false }));
}

function motif(group: Konva.Group, kind: CardOrnamentMotif, size: number, color: string, relief = 1): void {
  const glyph = new Konva.Group({ scaleX: size / 100, scaleY: size / 100, listening: false });
  const paths = MOTIFS[kind];
  glyph.add(new Konva.Path({ name: 'ornament-motif', data: paths.silhouette,
    ...metallic(color, 100, relief), stroke: tint(color, -0.75 * relief), strokeWidth: 2 * relief,
    shadowColor: '#000000', shadowBlur: 2 * relief, shadowOffsetY: 2 * relief, listening: false }));
  if (relief > 0) {
    glyph.add(new Konva.Path({ data: paths.silhouette, x: -0.6 * relief, y: -0.8 * relief, fillEnabled: false,
      stroke: tint(color, 0.75 * relief), strokeWidth: 0.9 * relief, listening: false }));
    glyph.add(new Konva.Path({ data: paths.engraving, fillEnabled: false, stroke: tint(color, -0.65 * relief),
      strokeWidth: 2 * relief, lineCap: 'round', lineJoin: 'round', listening: false }));
    glyph.add(new Konva.Path({ data: paths.engraving, x: -0.4, y: -0.6, fillEnabled: false,
      stroke: tint(color, 0.55 * relief), strokeWidth: 0.7 * relief, lineCap: 'round', listening: false }));
  }
  group.add(glyph);
}

function jewel(group: Konva.Group, x: number, y: number, size: number, color: string, metal: string): void {
  const jewel = new Konva.Group({ x, y, scaleX: size / 100, scaleY: size / 100, listening: false });
  bevelPath(jewel, 'M50 2 L98 50 L50 98 L2 50 Z', metal, 5, 100);
  jewel.add(new Konva.Path({ data: 'M50 15 L85 50 L50 85 L15 50 Z', ...metallic(color, 100), stroke: tint(color, -0.6), strokeWidth: 3, listening: false }));
  jewel.add(new Konva.Path({ data: 'M50 15 L50 50 L15 50 Z', fill: tint(color, 0.65), opacity: 0.6, listening: false }));
  jewel.add(new Konva.Path({ data: 'M50 50 L85 50 L50 85 Z', fill: tint(color, -0.65), opacity: 0.6, listening: false }));
  group.add(jewel);
}

/** Render a hollow frame. Every decorative mark is clipped to the same ring. */
export function drawFrame(group: Konva.Group, element: FrameElement): void {
  const p = element.properties, width = element.width, height = element.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const shortest = Math.min(width, height);
  const band = Math.max(0.5, Math.min(p.borderWidth, shortest * 0.22));
  const radius = Math.max(0, Math.min(p.cornerRadius, shortest / 2));
  const outline = ringPath(width, height, radius, 0, band);
  // The transparent opening must also be hollow on Konva's hit canvas: users
  // can select artwork underneath without hiding the decorative frame first.
  group.add(new Konva.Path({ name: 'element-hit-area', data: outline, fill: 'transparent' }));
  const frame = new Konva.Group({ name: 'ornament-frame', listening: false });
  frame.add(new Konva.Path({ name: 'ornament-base', data: outline, ...metallic(p.fill, height, 0.45), ...shadow(p), listening: false }));
  const details = new Konva.Group({ name: 'ornament-details', listening: false,
    clipFunc: () => [new Path2D(outline), 'evenodd'] });
  frame.add(details);
  const addBand = (outer: number, inner: number, color: string): void => {
    details.add(new Konva.Path({ data: ringPath(width, height, radius, band * outer, band * inner),
      ...metallic(color, height), listening: false }));
  };
  addBand(0, 0.045, tint(p.stroke, -0.8));
  addBand(0.05, 0.15, tint(p.stroke, 0.25));
  addBand(0.15, 0.21, tint(p.stroke, -0.55));
  addBand(0.75, 0.8, tint(p.fill, -0.8));
  addBand(0.81, 0.94, tint(p.stroke, 0.25));
  addBand(0.95, 1, tint(p.stroke, -0.85));
  if (p.strokeWidth > 0) {
    const strokeWidth = Math.min(p.strokeWidth, band * 0.16);
    details.add(new Konva.Rect({ x: strokeWidth / 2, y: strokeWidth / 2, width: width - strokeWidth,
      height: height - strokeWidth, cornerRadius: Math.max(0, radius - strokeWidth / 2),
      stroke: p.stroke, strokeWidth, dash: p.borderStyle === 'dashed' ? [4 * strokeWidth, 2 * strokeWidth]
        : p.borderStyle === 'dotted' ? [0.001, 2 * strokeWidth] : [],
      lineCap: p.borderStyle === 'dotted' ? 'round' : 'butt', listening: false }));
  }
  const random = randomSource(p.seed);
  const detail = Math.max(0, Math.min(12, Math.floor(p.detail)));
  if (p.frameStyle !== 'minimal' && detail > 0) {
    // Aggregate the fine scratches into two paths: detail does not allocate a
    // canvas cache, and node counts stay bounded even for extremely long frames.
    let etching = '';
    for (let index = 0; index < detail * 20; index++) {
      const horizontal = index % 2 === 0, side = random() > 0.5;
      const position = random() * (horizontal ? width : height);
      const inset = band * (0.24 + random() * 0.46), length = band * (0.03 + random() * 0.13);
      const x = horizontal ? position : side ? width - inset : inset;
      const y = horizontal ? side ? height - inset : inset : position;
      etching += `M${x} ${y} l${horizontal ? length : length * 0.35} ${horizontal ? length * 0.35 : length} `;
    }
    details.add(new Konva.Path({ name: 'ornament-etching', data: etching, stroke: tint(p.fill, -0.7),
      strokeWidth: Math.max(0.15, band * 0.014), opacity: 0.45, listening: false }));
    details.add(new Konva.Path({ data: etching, y: -band * 0.01, stroke: tint(p.fill, 0.75),
      strokeWidth: Math.max(0.1, band * 0.007), opacity: 0.3, listening: false }));
    const margin = Math.min(Math.max(radius, band * 3), shortest * 0.4);
    for (const edge of [{ x: margin, y: 0, length: width - 2 * margin, rotation: 0 },
      { x: width, y: margin, length: height - 2 * margin, rotation: 90 },
      { x: width - margin, y: height, length: width - 2 * margin, rotation: 180 },
      { x: 0, y: height - margin, length: height - 2 * margin, rotation: 270 }]) {
      if (edge.length < band * 2) continue;
      const rail = new Konva.Group({ x: edge.x, y: edge.y, rotation: edge.rotation, listening: false });
      const count = Math.min(detail * 2, Math.floor(edge.length / (band * 1.05)));
      let runes = '';
      for (let index = 0; index < count; index++) {
        const x = edge.length * (index + 0.5) / count, y = band * 0.49;
        const s = band * (p.frameStyle === 'runic' ? 0.19 : 0.13);
        const branch = random() > 0.5 ? 1 : -1;
        runes += `M${x} ${y - s} V${y + s} M${x - s * 0.6} ${y - s * branch} L${x} ${y} L${x + s * 0.6} ${y - s * branch} `;
        if (random() > 0.45) runes += `M${x - s * 0.65} ${y + s * branch * 0.4} L${x + s * 0.65} ${y - s * branch * 0.4} `;
      }
      rail.add(new Konva.Path({ name: 'ornament-runes', data: runes, stroke: tint(p.accentColor, -0.4),
        strokeWidth: band * 0.04, lineCap: 'round', listening: false }));
      rail.add(new Konva.Path({ data: runes, x: -band * 0.012, y: -band * 0.014, stroke: tint(p.accentColor, 0.35),
        strokeWidth: band * 0.018, lineCap: 'round', listening: false }));
      details.add(rail);
    }
  }
  if (p.frameStyle === 'ornate') {
    const span = 180 + Math.round(random() * 110);
    const curl = 105 + Math.round(random() * 55);
    const cornerPath = `M4 4 H${span} L${span - 39} 27 H87 C54 27 27 54 27 87 V${span - 39} L4 ${span} Z`;
    const scroll = random() > 0.5
      ? `M35 ${curl + 30} C77 ${curl - 6} 12 99 42 59 C68 24 ${curl - 2} 65 ${curl + 27} 35 M35 123 C56 125 65 100 44 88 C28 79 40 65 53 69 M123 35 C125 56 100 65 88 44 C79 28 65 40 69 53 M45 ${curl + 42} Q28 ${curl + 47} 22 ${curl + 60} M${curl + 42} 45 Q${curl + 47} 28 ${curl + 60} 22`
      : `M35 ${curl + 30} C59 ${curl + 6} 19 92 40 61 C61 19 ${curl + 6} 59 ${curl + 30} 35 M38 116 C66 106 68 74 43 71 C29 71 29 86 43 88 M116 38 C106 66 74 68 71 43 C71 29 86 29 88 43 M30 ${curl + 37} L24 ${curl + 59} L45 ${curl + 44} M${curl + 37} 30 L${curl + 59} 24 L${curl + 44} 45`;
    const jewelSize = 23 + random() * 14;
    for (const { x, y, sx, sy } of [{ x: 0, y: 0, sx: 1, sy: 1 }, { x: width, y: 0, sx: -1, sy: 1 },
      { x: 0, y: height, sx: 1, sy: -1 }, { x: width, y: height, sx: -1, sy: -1 }]) {
      const corner = new Konva.Group({ x, y, scaleX: sx * band / 100, scaleY: sy * band / 100, listening: false });
      bevelPath(corner, cornerPath, p.stroke, 3, 180);
      if (detail > 0) {
        corner.add(new Konva.Path({ data: scroll, stroke: tint(p.stroke, -0.75), strokeWidth: 4, lineCap: 'round', listening: false }));
        corner.add(new Konva.Path({ data: scroll, x: -0.8, y: -0.8, stroke: tint(p.stroke, 0.7), strokeWidth: 1.5, lineCap: 'round', listening: false }));
        jewel(corner, 14, 14, jewelSize, p.gemColor, p.stroke);
      }
      details.add(corner);
    }
    // A tapered central crest belongs to the frame rather than the artwork.
    const wingSpan = 130 + Math.round(random() * 75);
    const crestData = `M-${wingSpan} 20 L-92 20 L-60 38 L-32 30 L0 12 L32 30 L60 38 L92 20 L${wingSpan} 20 L${wingSpan - 41} 39 L78 43 L45 72 L0 94 L-45 72 L-78 43 L-${wingSpan - 41} 39 Z`;
    for (const { x, y, rotation } of [{ x: width / 2, y: 0, rotation: 0 }, { x: width / 2, y: height, rotation: 180 }]) {
      const crest = new Konva.Group({ x, y, rotation, scaleX: band / 100, scaleY: band / 100, listening: false });
      bevelPath(crest, crestData, p.stroke, 3, 100);
      const icon = new Konva.Group({ x: -28, y: 30, listening: false });
      motif(icon, p.motif, 56, p.accentColor); crest.add(icon);
      if (detail > 0) crest.add(new Konva.Path({ data: 'M-115 30 C-75 19 -70 58 -44 59 M115 30 C75 19 70 58 44 59',
        stroke: tint(p.stroke, 0.6), strokeWidth: 1.4, listening: false }));
      details.add(crest);
    }
    if (detail > 0 && height > band * 12) {
      const position = height * (0.37 + random() * 0.26);
      const iconSize = band * (0.58 + random() * 0.12);
      for (const x of [band * 0.5 - iconSize / 2, width - band * 0.5 - iconSize / 2]) {
        const icon = new Konva.Group({ x, y: position - iconSize / 2, listening: false });
        motif(icon, p.motif, iconSize, p.accentColor); details.add(icon);
      }
    }
  } else if (p.frameStyle === 'runic') {
    for (const x of [band * 0.19, width - band * 0.81]) for (const y of [band * 0.19, height - band * 0.81]) {
      jewel(details, x, y, band * 0.62, p.gemColor, p.stroke);
    }
    for (const y of [band * 0.17, height - band * 0.83]) {
      const icon = new Konva.Group({ x: width / 2 - band * 0.33, y, listening: false });
      motif(icon, p.motif, band * 0.66, p.accentColor); details.add(icon);
    }
  } else {
    jewel(details, width / 2 - band * 0.26, band * 0.24, band * 0.52, p.gemColor, p.stroke);
    jewel(details, width / 2 - band * 0.26, height - band * 0.76, band * 0.52, p.gemColor, p.stroke);
  }
  group.add(frame);
}

/** A scalable badge, with an independently editable icon and enamel face. */
export function drawEmblem(group: Konva.Group, element: EmblemElement): void {
  const p: EmblemProperties = element.properties;
  const size = Math.min(element.width, element.height);
  if (!Number.isFinite(size) || size <= 0) return;
  const relief = Math.max(0, Math.min(1, p.relief));
  const emblem = new Konva.Group({ name: 'ornament-emblem', x: (element.width - size) / 2,
    y: (element.height - size) / 2, scaleX: size / 100, scaleY: size / 100, listening: false });
  if (p.container === 'medallion') {
    emblem.add(new Konva.Circle({ x: 50, y: 50, radius: 48, ...metallic(p.stroke, 100, relief),
      stroke: p.stroke, strokeWidth: Math.min(5, p.strokeWidth * 100 / size), ...shadow(p), listening: false }));
    emblem.add(new Konva.Circle({ x: 50, y: 50, radius: 43, ...metallic(p.fill, 100, relief * 0.45),
      stroke: tint(p.stroke, 0.75 * relief), strokeWidth: 1.3, listening: false }));
    emblem.add(new Konva.Circle({ x: 50, y: 50, radius: 39, fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: { x: -13, y: -16 }, fillRadialGradientEndPoint: { x: 5, y: 8 },
      fillRadialGradientStartRadius: 0, fillRadialGradientEndRadius: 58,
      fillRadialGradientColorStops: [0, tint(p.gemColor, 0.25 * relief), 0.52, p.gemColor || 'transparent', 1, tint(p.gemColor, -0.82 * relief)],
      stroke: tint(p.stroke, -0.75 * relief), strokeWidth: 3, listening: false }));
    emblem.add(new Konva.Arc({ x: 50, y: 50, innerRadius: 39.5, outerRadius: 40.4,
      angle: 155, rotation: 195, fill: tint(p.stroke, 0.65 * relief), listening: false }));
    // Eight small studs around the bezel keep their shape at all resolutions.
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      emblem.add(new Konva.Circle({ x: 50 + Math.cos(angle) * 44.5, y: 50 + Math.sin(angle) * 44.5, radius: 1,
        fill: tint(p.stroke, -0.65 * relief), listening: false }));
    }
  } else if (p.container === 'shield') {
    const shield = new Konva.Group({ x: 2, y: -1, scaleX: 0.96, scaleY: 0.96, listening: false });
    shield.add(new Konva.Path({ data: SHIELD, ...metallic(p.stroke, 100, relief), stroke: p.stroke,
      strokeWidth: Math.min(5, p.strokeWidth * 100 / size), ...shadow(p), listening: false }));
    const rim = new Konva.Group({ x: 5, y: 5, scaleX: 0.9, scaleY: 0.88, listening: false });
    rim.add(new Konva.Path({ data: SHIELD, ...metallic(p.fill, 100, relief * 0.45), listening: false }));
    shield.add(rim);
    const face = new Konva.Group({ x: 9, y: 10, scaleX: 0.82, scaleY: 0.8, listening: false });
    face.add(new Konva.Path({ data: SHIELD, ...metallic(p.gemColor, 100, relief),
      stroke: tint(p.stroke, -0.7 * relief), strokeWidth: 3, listening: false }));
    shield.add(face);
    shield.add(new Konva.Path({ data: SHIELD, fillEnabled: false, stroke: tint(p.stroke, 0.7 * relief), strokeWidth: 1, listening: false }));
    emblem.add(shield);
  }
  const iconSize = p.container === 'plain' ? 88 : 58;
  const icon = new Konva.Group({ x: (100 - iconSize) / 2, y: (100 - iconSize) / 2,
    ...(p.container === 'plain' ? shadow(p) : {}), listening: false });
  motif(icon, p.motif, iconSize, p.accentColor, relief);
  emblem.add(icon);
  group.add(emblem);
}
