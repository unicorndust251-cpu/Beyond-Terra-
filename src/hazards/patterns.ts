import type { HazardCode } from '../shared';
import { CATEGORY_BY_CODE, type PatternKind } from './categories';

/**
 * Category patterns, drawn once into small repeating canvases. The same tiles fill shaded
 * cells on the map and the swatches in the key, so the two always match.
 */

const TILE = 16;

function draw(ctx: CanvasRenderingContext2D, kind: PatternKind, colour: string) {
  const s = TILE;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  switch (kind) {
    case 'chevrons':
      ctx.beginPath();
      ctx.moveTo(3, 5);
      ctx.lineTo(8, 10);
      ctx.lineTo(13, 5);
      ctx.stroke();
      break;
    case 'waves':
      for (const y of [4, 12]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(4, y - 3, 4, y - 3, 8, y);
        ctx.bezierCurveTo(12, y + 3, 12, y + 3, 16, y);
        ctx.stroke();
      }
      break;
    case 'blocks':
      ctx.fillRect(2, 3, 4, 3);
      ctx.fillRect(9, 9, 5, 4);
      ctx.fillRect(10, 2, 3, 3);
      break;
    case 'broken-hatch':
      line(0, 8, 4, 4);
      line(8, 0, 6, 2);
      line(8, 16, 12, 12);
      line(16, 8, 14, 10);
      break;
    case 'crosshatch':
      line(0, 0, s, s);
      line(s, 0, 0, s);
      break;
    case 'branches':
      line(8, 16, 8, 8);
      line(8, 8, 3, 2);
      line(8, 8, 13, 2);
      break;
    case 'frost':
      line(8, 3, 8, 13);
      line(3, 8, 13, 8);
      line(4.5, 4.5, 11.5, 11.5);
      line(11.5, 4.5, 4.5, 11.5);
      break;
    case 'swirl':
      ctx.beginPath();
      ctx.arc(8, 8, 5, 0.3, Math.PI * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(8, 8, 2, 0, Math.PI * 1.2);
      ctx.stroke();
      break;
    case 'parallel':
      // Lines across the slope, distinct from the F crosshatch
      line(0, 4, s, 4);
      line(0, 12, s, 12);
      break;
    case 'stripes':
      ctx.lineWidth = 3;
      line(0, s, s, 0);
      break;
    case 'thermal':
      ctx.beginPath();
      ctx.moveTo(4, 14);
      ctx.bezierCurveTo(1, 9, 7, 7, 4, 2);
      ctx.moveTo(11, 14);
      ctx.bezierCurveTo(8, 9, 14, 7, 11, 2);
      ctx.stroke();
      break;
    case 'radiation':
      ctx.beginPath();
      ctx.arc(8, 8, 1.6, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.arc(8, 8, 6, a - 0.5, a + 0.5);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'coverage':
      ctx.setLineDash([3, 3]);
      line(0, s, s, 0);
      line(0, 0, s, s);
      break;
    case 'uncertainty':
      ctx.font = 'bold 11px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 8, 9);
      break;
    case 'battery':
      ctx.strokeRect(3, 5, 9, 6);
      ctx.fillRect(12, 7, 2, 2);
      ctx.fillRect(4.5, 6.5, 4, 3);
      break;
    case 'clock':
      ctx.beginPath();
      ctx.arc(8, 8, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      line(8, 8, 8, 4.5);
      line(8, 8, 10.5, 9.5);
      break;
    case 'grey-crosshatch':
      ctx.lineWidth = 1;
      line(0, 0, s, s);
      line(s, 0, 0, s);
      line(s / 2, 0, s, s / 2);
      line(0, s / 2, s / 2, s);
      break;
  }
}

const tiles = new Map<string, HTMLCanvasElement>();

/** A repeating pattern tile for a category, at a pixel ratio. */
export function patternTile(code: HazardCode, ratio = 1): HTMLCanvasElement {
  const key = `${code}@${ratio}`;
  let canvas = tiles.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    const cat = CATEGORY_BY_CODE[code];
    draw(ctx, cat.pattern, cat.colour);
    tiles.set(key, canvas);
  }
  return canvas;
}

const urls = new Map<HazardCode, string>();

/** Swatch image for the key: the category's fill, pattern and outline. */
export function swatchUrl(code: HazardCode): string {
  let url = urls.get(code);
  if (!url) {
    const ratio = 2;
    const size = 28;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    const cat = CATEGORY_BY_CODE[code];
    ctx.fillStyle = '#171413';
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = cat.colour;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ctx.createPattern(patternTile(code, ratio), 'repeat')!;
    ctx.save();
    ctx.scale(1 / ratio, 1 / ratio);
    ctx.fillRect(0, 0, size * ratio, size * ratio);
    ctx.restore();
    ctx.strokeStyle = cat.colour;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    url = canvas.toDataURL();
    urls.set(code, url);
  }
  return url;
}
