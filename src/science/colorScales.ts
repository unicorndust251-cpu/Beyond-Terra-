/**
 * Continuous colour scales. The map tiles and the legend read the same lookup table,
 * so the legend shows exactly the colours that are drawn.
 */

export interface ColorScale {
  id: string;
  /** Value at the bottom and top of the scale; values beyond are drawn in the end colours */
  domain: [number, number];
  unit: string;
  ticks: number[];
  formatTick(v: number): string;
  /** 256 × RGB */
  lut: Uint8ClampedArray;
}

function buildLut(stops: string[]): Uint8ClampedArray {
  const rgb = stops.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1);
    const a = Math.min(rgb.length - 2, Math.floor(t));
    const f = t - a;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(rgb[a][c] + (rgb[a + 1][c] - rgb[a][c]) * f);
  }
  return lut;
}

// Matplotlib viridis and inferno at tenths: perceptually uniform and colour-vision-deficiency safe
const VIRIDIS = ['#440154', '#482475', '#414487', '#355f8d', '#2a788e', '#21918c', '#22a884', '#44bf70', '#7ad151', '#bddf26', '#fde725'];
const INFERNO = ['#000004', '#160b39', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746', '#fcffa4'];

/**
 * Elevation: −8 to +12 km above the MOLA areoid. That spans nearly all of Mars; only the
 * deepest part of Hellas (to −8.18 km) and the summits of Tharsis and Olympus Mons (to
 * +21.17 km) lie outside and are drawn in the end colours. The readout gives their values.
 */
export const ELEVATION_SCALE: ColorScale = {
  id: 'elevation',
  domain: [-8000, 12000],
  unit: 'km',
  ticks: [-8000, -4000, 0, 4000, 8000, 12000],
  formatTick: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v / 1000)}`,
  lut: buildLut(VIRIDIS),
};

/** Slope: 0 to 30°, steeper drawn in the top colour. */
export const SLOPE_SCALE: ColorScale = {
  id: 'slope',
  domain: [0, 30],
  unit: '°',
  ticks: [0, 5, 10, 15, 20, 25, 30],
  formatTick: (v) => String(v),
  lut: buildLut(INFERNO),
};

/** Index into the lookup table (0…255) for a value. */
export function lutIndex(scale: ColorScale, v: number): number {
  const [a, b] = scale.domain;
  const t = (v - a) / (b - a);
  return Math.max(0, Math.min(255, Math.round(t * 255)));
}

/** CSS gradient drawn from the lookup table itself. */
export function cssGradient(scale: ColorScale, direction = 'to right'): string {
  const parts: string[] = [];
  for (let k = 0; k <= 32; k++) {
    const i = Math.round((k / 32) * 255);
    const [r, g, b] = [scale.lut[i * 3], scale.lut[i * 3 + 1], scale.lut[i * 3 + 2]];
    parts.push(`rgb(${r} ${g} ${b}) ${((k / 32) * 100).toFixed(2)}%`);
  }
  return `linear-gradient(${direction}, ${parts.join(', ')})`;
}
