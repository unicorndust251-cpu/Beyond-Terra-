import * as L from 'leaflet';
import { createTrekLayer } from '../../map/marsTrek';
import { fromMapLatLng, normalizeLongitudeEast, toMapLatLng } from '../coordinates';
import type { CoordinateBounds, MarsCoordinate } from '../types';
import type {
  LayerHandle,
  MapOverlayHandle,
  MapView,
  MarkerOptions,
  MarsMapBridge,
  RouteHandle,
  RouteOptions,
  TrekLayerRequest,
} from './MarsMapBridge';

const DEFAULT_COLOR = '#D6A38B'; // copper glow

/** The bridge over the Leaflet map in src/map, plus `destroy()` for when the map goes away. */
export interface LeafletMarsMapBridge extends MarsMapBridge {
  destroy(): void;
}

export function createLeafletBridge(map: L.Map, options: { reducedMotion: () => boolean }): LeafletMarsMapBridge {
  const overlays = new Map<string, L.Layer>();

  const put = (id: string, layer: L.Layer) => {
    overlays.get(id)?.remove();
    overlays.set(id, layer.addTo(map));
  };
  const take = (id: string, layer: L.Layer) => {
    if (overlays.get(id) === layer) overlays.delete(id);
    layer.remove();
  };
  /** Each point in the world copy nearest the previous one, starting near the view. */
  const unwrap = (points: MarsCoordinate[]): [number, number][] => {
    let near = map.getCenter().lng;
    return points.map((p) => {
      const ll = toMapLatLng(p, near);
      near = ll[1];
      return ll;
    });
  };

  return {
    onLocationSelect(listener) {
      const onClick = (e: L.LeafletMouseEvent) => listener({ coordinate: fromMapLatLng(e.latlng), source: 'map-click' });
      map.on('click', onClick);
      return () => {
        map.off('click', onClick);
      };
    },

    getView(): MapView {
      const b = map.getBounds();
      const wraps = b.getEast() - b.getWest() >= 360;
      return {
        center: fromMapLatLng(map.getCenter()),
        zoom: map.getZoom(),
        bounds: {
          south: b.getSouth(),
          north: b.getNorth(),
          west: wraps ? -180 : normalizeLongitudeEast(b.getWest()),
          east: wraps ? 180 : normalizeLongitudeEast(b.getEast()),
        },
      };
    },

    flyTo(coordinate, opts = {}) {
      const target = toMapLatLng(coordinate, map.getCenter().lng);
      const zoom = opts.zoom ?? map.getZoom();
      map.stop();
      if (options.reducedMotion() || opts.durationSeconds === 0) map.setView(target, zoom, { animate: false });
      else map.flyTo(target, zoom, { duration: opts.durationSeconds ?? 1.8, easeLinearity: 0.15 });
    },

    fitBounds(bounds: CoordinateBounds) {
      const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
      const sw = toMapLatLng({ latitude: bounds.south, longitudeEast: bounds.west }, map.getCenter().lng);
      map.fitBounds(L.latLngBounds(sw, [bounds.north, sw[1] + (east - bounds.west)]), {
        animate: !options.reducedMotion(),
      });
    },

    addMarker(id, coordinate, opts: MarkerOptions = {}): MapOverlayHandle {
      const color = opts.color ?? DEFAULT_COLOR;
      const marker = L.circleMarker(toMapLatLng(coordinate, map.getCenter().lng), {
        radius: 7,
        color: '#171413',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
        // A marker with its own action does not also count as a map click
        bubblingMouseEvents: !opts.onClick,
      });
      if (opts.label) marker.bindTooltip(opts.label, { direction: 'top', offset: [0, -8] });
      if (opts.onClick) marker.on('click', opts.onClick);
      put(id, marker);
      return { id, remove: () => take(id, marker) };
    },

    drawRoute(id, points, opts: RouteOptions = {}): RouteHandle {
      const line = L.polyline(unwrap(points), {
        color: opts.color ?? DEFAULT_COLOR,
        weight: opts.weight ?? 3,
        dashArray: opts.dashed ? '6 8' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      });
      put(id, line);
      return {
        id,
        remove: () => take(id, line),
        setPoints: (next) => line.setLatLngs(unwrap(next)),
      };
    },

    addTrekLayer(id, req: TrekLayerRequest): LayerHandle {
      const b = req.bounds;
      const layer = createTrekLayer({
        key: id,
        product: req.product,
        ext: req.ext,
        credit: '',
        maxNativeZoom: req.maxNativeZoom,
        bounds: b
          ? [
              [b.south, b.west],
              [b.north, b.east < b.west ? b.east + 360 : b.east],
            ]
          : undefined,
        zIndex: req.zIndex ?? 10,
      });
      let opacity = req.opacity ?? 1;
      layer.setOpacity(opacity);
      put(id, layer);
      return {
        id,
        remove: () => take(id, layer),
        setOpacity: (o) => {
          opacity = o;
          layer.setOpacity(o);
        },
        setVisible: (v) => layer.setOpacity(v ? opacity : 0),
      };
    },

    destroy() {
      overlays.forEach((layer) => layer.remove());
      overlays.clear();
    },
  };
}
