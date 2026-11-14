import type { CoordinateBounds, MarsCoordinate, SelectedLocation } from '../types';

/**
 * The contract between the feature modules and the map. Mission planning and scientific
 * data use the map only through this interface, never Leaflet directly, so neither
 * depends on how the map is implemented and neither can disturb the other's drawings.
 *
 * All coordinates are MarsCoordinate (planetocentric, east-positive, −180…180).
 */

/** Something drawn on the map; remove() takes it off again. */
export interface MapOverlayHandle {
  readonly id: string;
  remove(): void;
}

export interface RouteHandle extends MapOverlayHandle {
  /** Replaces the route's points (e.g. while it is being edited). */
  setPoints(points: MarsCoordinate[]): void;
}

export interface LayerHandle extends MapOverlayHandle {
  setOpacity(opacity: number): void;
  setVisible(visible: boolean): void;
}

export interface MarkerOptions {
  /** Tooltip text shown on hover. */
  label?: string;
  /** Any CSS colour. */
  color?: string;
  /** One or two characters shown inside a pin (e.g. "S", "D", "2") instead of a plain dot. */
  symbol?: string;
  /** Plain-text card opened by clicking the marker. */
  details?: { title: string; lines: string[] };
  onClick?: () => void;
  /** Draws attention to the marker (e.g. the stop a route preview has reached). */
  highlight?: boolean;
}

/** An element placed on the map at a coordinate, moving with pans and zooms. */
export interface ElementHandle extends MapOverlayHandle {
  setPosition(coordinate: MarsCoordinate): void;
}

export interface ElementOptions {
  /** Element size in CSS pixels. */
  size: [number, number];
  /** The pixel of the element that sits on the coordinate (e.g. a figure's feet). */
  anchor: [number, number];
  /** Drawn beneath other markers so their pins and labels stay readable. */
  behindMarkers?: boolean;
}

export interface RouteOptions {
  color?: string;
  weight?: number;
  dashed?: boolean;
}

/** A NASA Mars Trek WMTS product to show as a layer. */
export interface TrekLayerRequest {
  /** Trek product identifier (from its WMTSCapabilities.xml). */
  product: string;
  ext: 'jpg' | 'png';
  /** Deepest zoom the product actually has. */
  maxNativeZoom: number;
  /** Regional products: only request tiles inside this box. */
  bounds?: CoordinateBounds;
  opacity?: number;
  /** Stacking order among added layers (Trek base imagery is 1–3). */
  zIndex?: number;
}

export interface MapView {
  center: MarsCoordinate;
  zoom: number;
  bounds: CoordinateBounds;
}

export interface MarsMapBridge {
  /** Called when the visitor clicks or taps a point (not after a drag). Returns an unsubscribe. */
  onLocationSelect(listener: (location: SelectedLocation) => void): () => void;
  getView(): MapView;
  /** Moves the camera. `zoom` defaults to the current one; reduced motion jumps instead of flying. */
  flyTo(coordinate: MarsCoordinate, options?: { zoom?: number; durationSeconds?: number }): void;
  fitBounds(bounds: CoordinateBounds): void;
  /** A point marker. Adding an `id` that exists replaces it. */
  addMarker(id: string, coordinate: MarsCoordinate, options?: MarkerOptions): MapOverlayHandle;
  /** A route through the points, in order, drawn the short way across ±180°. */
  drawRoute(id: string, points: MarsCoordinate[], options?: RouteOptions): RouteHandle;
  /** Places a caller-made element on the map (for custom renderings such as a 3D figure). */
  addElement(id: string, coordinate: MarsCoordinate, element: HTMLElement, options: ElementOptions): ElementHandle;
  /**
   * Where a coordinate is on screen (pixels from the map's top-left), using the map's own
   * projection and the world copy nearest the view. East is +x, south is +y.
   */
  project(coordinate: MarsCoordinate): { x: number; y: number };
  /** Moves the camera without changing the zoom. */
  panTo(coordinate: MarsCoordinate, options?: { animate?: boolean }): void;
  /** Called after the view moves or zooms. Returns an unsubscribe. */
  onViewChange(listener: (view: MapView) => void): () => void;
  /** Called when the visitor starts dragging the map. Returns an unsubscribe. */
  onUserPan(listener: () => void): () => void;
  /** An additional Mars Trek tile layer above the base imagery. */
  addTrekLayer(id: string, layer: TrekLayerRequest): LayerHandle;
}
