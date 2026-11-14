import * as L from 'leaflet';

/**
 * Crisp tiles at fractional zoom and on high-density screens.
 *
 * Leaflet picks the tile level with Math.round(zoom), so at a zoom like 9.4 it shows
 * level-9 tiles magnified 1.32× (up to 1.41×). It also ignores devicePixelRatio, so on a
 * 2× screen every image pixel covers 2 × 2 device pixels. Both soften the imagery
 * without the source being any coarser.
 *
 * - The level switches up 0.2 earlier (round(zoom + 0.2)): magnification is at most
 *   2^0.3 ≈ 1.23× instead of 1.41×. A larger bias would be sharper still, but each step
 *   quadruples the tiles requested from Trek, which serves about one tile per second per
 *   connection over HTTP/1.1. The tile level stays within 1 of the map zoom, as Leaflet requires.
 * - On screens of 1.5× density or more, tiles are drawn at half size from one level deeper
 *   (what Leaflet's detectRetina does, but also lowering maxNativeZoom so no level beyond
 *   the product's deepest is requested).
 *
 * Nothing is sharpened: beyond a product's deepest level, tiles are still magnified.
 */
export const TILE_ZOOM_BIAS = 0.2;

export const HIGH_DENSITY = typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.5;

/** Tile size and level offset for this screen: 256 px tiles, or 128 px from one level deeper. */
export const SCREEN_TILE = HIGH_DENSITY ? { size: 128, levelOffset: 1 } : { size: 256, levelOffset: 0 };

/** Tile level Leaflet will use (before the screen offset) at a map zoom. */
export function sharpTileZoom(zoom: number): number {
  return Math.round(zoom + TILE_ZOOM_BIAS);
}

interface GridLayerInternals {
  _setView(center: L.LatLng, zoom: number, noPrune?: boolean, noUpdate?: boolean): void;
  _clampZoom(zoom: number): number;
  _sharpRawZoom?: number;
}

/** Applies the biased level choice to a layer (any GridLayer, including TileLayer). */
export function sharpenTileZoom<T extends L.GridLayer>(layer: T): T {
  const self = layer as unknown as GridLayerInternals;
  const proto = L.GridLayer.prototype as unknown as GridLayerInternals;
  // _setView hands _clampZoom round(zoom); keep the unrounded zoom for it
  self._setView = function (center, zoom, noPrune, noUpdate) {
    this._sharpRawZoom = zoom;
    try {
      proto._setView.call(this, center, zoom, noPrune, noUpdate);
    } finally {
      this._sharpRawZoom = undefined;
    }
  };
  // redraw() and _update() pass the map zoom itself. Rounding it here as well also stops
  // redraw() at a fractional zoom from requesting a fractional tile level.
  self._clampZoom = function (zoom) {
    return proto._clampZoom.call(this, sharpTileZoom(this._sharpRawZoom ?? zoom));
  };
  return layer;
}

/** TileLayer options for this screen: tile size, level offset and a matching maxNativeZoom. */
export function screenTileOptions(maxNativeZoom: number, minNativeZoom = 0): Partial<L.TileLayerOptions> {
  return {
    tileSize: SCREEN_TILE.size,
    zoomOffset: SCREEN_TILE.levelOffset,
    maxNativeZoom: maxNativeZoom - SCREEN_TILE.levelOffset,
    minNativeZoom: Math.max(0, minNativeZoom - SCREEN_TILE.levelOffset),
  };
}
