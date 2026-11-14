/**
 * Continuous colour scales, defined by value stops and interpolated linearly in sRGB
 * between them. The map tiles read a lookup table built from the stops; the legend is a
 * CSS gradient through the same stops at the same positions (CSS gradients also
 * interpolate in sRGB), so the legend shows exactly the colours that are drawn.
 */

export interface ColorStop {
  value: number;
  color: string;
}

export interface ColorScale {
  id: string;
  /** Value at the bottom and top of the scale; values beyond are drawn in the end colours */
  domain: [number, number];
  unit: string;
  stops: ColorStop[];
  ticks: number[];
  formatTick(v: number): string;
  /** lutSize × RGB, evenly spaced over the domain */
  lut: Uint8ClampedArray;
  lutSize: number;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
}

/** Interpolated colour of a value between the stops (clamped to the end colours). */
export function colorAt(stops: ColorStop[], v: number): [number, number, number] {
  if (v <= stops[0].value) return hexToRgb(stops[0].color);
  for (let k = 1; k < stops.length; k++) {
    if (v <= stops[k].value) {
      const a = stops[k - 1];
      const b = stops[k];
      const f = (v - a.value) / (b.value - a.value);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      return [0, 1, 2].map((c) => Math.round(ca[c] + (cb[c] - ca[c]) * f)) as [number, number, number];
    }
  }
  return hexToRgb(stops[stops.length - 1].color);
}

function makeScale(def: Omit<ColorScale, 'domain' | 'lut'>): ColorScale {
  const domain: [number, number] = [def.stops[0].value, def.stops[def.stops.length - 1].value];
  const lut = new Uint8ClampedArray(def.lutSize * 3);
  for (let i = 0; i < def.lutSize; i++) {
    const v = domain[0] + ((domain[1] - domain[0]) * i) / (def.lutSize - 1);
    lut.set(colorAt(def.stops, v), i * 3);
  }
  return { ...def, domain, lut };
}

const evenStops = (colors: string[], a: number, b: number): ColorStop[] =>
  colors.map((color, k) => ({ value: a + ((b - a) * k) / (colors.length - 1), color }));

const kmTick = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v / 1000)}`;

/**
 * Elevation above the MOLA areoid, in metres; legend in kilometres. Palette and stops as
 * specified for Beyond Terra (−8 to +16 km). The MEGDR spans −8.18 to +21.17 km: the
 * deepest part of Hellas is drawn in the −8 km colour, and the summits above +16 km
 * (Olympus, Ascraeus and Arsia Mons) in the +16 km colour. The readout gives their values.
 *
 * The table has one entry per 10 m, so every stop falls exactly on an entry.
 */
export const ELEVATION_SCALE: ColorScale = makeScale({
  id: 'elevation',
  unit: 'km',
  stops: [
    { value: -8000, color: '#49415E' }, // deep purple
    { value: -6000, color: '#6679AD' }, // slate blue
    { value: -4000, color: '#65BCD5' }, // cyan blue
    { value: -2000, color: '#75D4AE' }, // mint green
    { value: 0, color: '#E5DB76' }, // yellow
    { value: 2000, color: '#E9AE70' }, // warm orange
    { value: 4000, color: '#DF7C79' }, // coral
    { value: 6000, color: '#CD919E' }, // dusty pink
    { value: 8000, color: '#B69A95' }, // rose taupe
    { value: 12000, color: '#CBC7C4' }, // pale grey
    { value: 16000, color: '#F4F0EB' }, // near white
  ],
  ticks: [-8000, -4000, 0, 4000, 8000, 12000, 16000],
  formatTick: kmTick,
  lutSize: 2401,
});

// Matplotlib inferno at tenths: perceptually uniform and colour-vision-deficiency safe
const INFERNO = ['#000004', '#160b39', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746', '#fcffa4'];

/** Slope: 0 to 30°, steeper drawn in the top colour. */
export const SLOPE_SCALE: ColorScale = makeScale({
  id: 'slope',
  unit: '°',
  stops: evenStops(INFERNO, 0, 30),
  ticks: [0, 5, 10, 15, 20, 25, 30],
  formatTick: (v) => String(v),
  lutSize: 256,
});

/** Index into the lookup table for a value (clamped). Multiply by 3 for the RGB offset. */
export function lutIndex(scale: ColorScale, v: number): number {
  const [a, b] = scale.domain;
  const i = Math.round(((v - a) / (b - a)) * (scale.lutSize - 1));
  return i < 0 ? 0 : i >= scale.lutSize ? scale.lutSize - 1 : i;
}

/** Position of a value along the legend bar, 0…100 %. */
export function legendPercent(scale: ColorScale, v: number): number {
  const [a, b] = scale.domain;
  return ((v - a) / (b - a)) * 100;
}

/** CSS gradient through the scale's own stops, at their own positions. */
export function cssGradient(scale: ColorScale, direction = 'to right'): string {
  const parts = scale.stops.map((s) => `${s.color} ${legendPercent(scale, s.value).toFixed(3)}%`);
  return `linear-gradient(${direction}, ${parts.join(', ')})`;
}
