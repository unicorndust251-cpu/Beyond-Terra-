/**
 * Landmark marker colours and glow: the one place they are defined. Markers on the Explore
 * globe, the landmark pin on the Mars Trek map and the landmark accents in panels all read
 * this theme (CSS through the custom properties set by applyMarkerTheme, JS through
 * activeMarkerTheme). Hazard, geology and curvature colours are separate and unaffected.
 *
 * To switch every landmark marker to blue, set ACTIVE_MARKER_THEME = 'blue'.
 */

export interface MarkerTheme {
  /** Word used in on-screen hints, e.g. "select an orange marker". */
  name: string;
  default: string;
  hover: string;
  selected: string;
  /** Dark outline around the core, for contrast on bright terrain. */
  outline: string;
  /** Halo strength (alpha of the soft ring), kept low. */
  haloAlpha: number;
}

export const MARKER_THEMES = {
  orange: { name: 'orange', default: '#C76532', hover: '#E58A4B', selected: '#F2AF72', outline: '#1E120C', haloAlpha: 0.28 },
  blue: { name: 'blue', default: '#3B82C4', hover: '#60A5FA', selected: '#93C5FD', outline: '#0B1624', haloAlpha: 0.28 },
} satisfies Record<string, MarkerTheme>;

export type MarkerThemeId = keyof typeof MARKER_THEMES;

/** The theme in use: one at a time. */
export const ACTIVE_MARKER_THEME: MarkerThemeId = 'orange';

export function markerTheme(id: MarkerThemeId = ACTIVE_MARKER_THEME): MarkerTheme {
  return MARKER_THEMES[id];
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** The theme as CSS custom properties (--bt-landmark-*). */
export function markerThemeVars(id: MarkerThemeId = ACTIVE_MARKER_THEME): Record<string, string> {
  const t = MARKER_THEMES[id];
  return {
    '--bt-landmark': t.default,
    '--bt-landmark-hover': t.hover,
    '--bt-landmark-selected': t.selected,
    '--bt-landmark-outline': t.outline,
    '--bt-landmark-halo': rgba(t.default, t.haloAlpha),
    '--bt-landmark-halo-selected': rgba(t.selected, t.haloAlpha + 0.08),
  };
}

/** Sets the theme's custom properties on the document root (once, at start-up). */
export function applyMarkerTheme(id: MarkerThemeId = ACTIVE_MARKER_THEME, root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(markerThemeVars(id))) root.style.setProperty(k, v);
  root.dataset.markerTheme = id;
}
