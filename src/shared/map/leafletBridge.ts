import * as L from 'leaflet';
import { createTrekLayer } from '../../map/marsTrek';
import { fromMapLatLng, normalizeLongitudeEast, toMapLatLng } from '../coordinates';
import type { CoordinateBounds, MarsCoordinate } from '../types';
import './bridge.css';
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

/** A map pin with a short symbol in its head. Text is set as text, never as HTML. */
function pinIcon(symbol: string, color: string): L.DivIcon {
  const pin = document.createElement('div');
  pin.className = 'bt-map-pin';
  pin.style.setProperty('--pin', color);
  const label = document.createElement('span');
  label.textContent = symbol.slice(0, 2);
  pin.appendChild(label);
  return L.divIcon({ html: pin, className: 'bt-map-pin-host', iconSize: [28, 36], iconAnchor: [14, 36] });
}

/** The card a marker opens on click: a title and plain-text lines. */
function detailsCard(details: { title: string; lines: string[] }): HTMLElement {
  const card = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'bt-map-card__title';
  title.textContent = details.title;
  card.appendChild(title);
  details.lines.forEach((line) => {
    const p = document.createElement('p');
    p.textContent = line;
    card.appendChild(p);
  });
  return card;
}

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
      // A camera flight still under way would otherwise carry on and override the framing
      map.stop();
      map.fitBounds(L.latLngBounds(sw, [bounds.north, sw[1] + (east - bounds.west)]), {
        animate: !options.reducedMotion(),
      });
    },

    addMarker(id, coordinate, opts: MarkerOptions = {}): MapOverlayHandle {
      const color = opts.color ?? DEFAULT_COLOR;
      const at = toMapLatLng(coordinate, map.getCenter().lng);
      // A marker with its own action or card does not also count as a map click
      const ownsClick = !!(opts.onClick || opts.details);
      let marker: L.Marker | L.CircleMarker;
      let tooltipOffset: L.PointExpression = [0, -8];
      if (opts.symbol) {
        marker = L.marker(at, { icon: pinIcon(opts.symbol, color), bubblingMouseEvents: !ownsClick, riseOnHover: true });
        tooltipOffset = [0, -34];
      } else {
        marker = L.circleMarker(at, {
          radius: 7,
          color: '#171413',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
          bubblingMouseEvents: !ownsClick,
        });
      }
      if (opts.label) marker.bindTooltip(opts.label, { direction: 'top', offset: tooltipOffset, className: 'bt-map-tip' });
      // The card replaces the hover label while it is open
      if (opts.label && opts.details) {
        marker.on('popupopen', () => marker.closeTooltip());
      }
      if (opts.details) {
        marker.bindPopup(detailsCard(opts.details), {
          className: 'bt-map-card',
          offset: opts.symbol ? [0, -30] : [0, -4],
          autoPanPadding: [24, 24],
        });
      }
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
