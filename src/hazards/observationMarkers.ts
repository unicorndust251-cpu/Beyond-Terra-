import * as L from 'leaflet';
import type { HazardCode } from '../shared';
import { CATEGORY_BY_CODE } from './categories';
import { OBSERVATIONS, type HazardObservationRecord } from './observations';

/**
 * Location markers for the 60 NASA observation records. Each is a fixed-size symbol at the
 * record's stated centre: it marks where an image was taken and has no geographic extent.
 * It is never drawn as a circle, square or shaded area around the centre.
 */
export class ObservationMarkers {
  private group = L.layerGroup();
  private markers = new Map<string, L.Marker>();
  private shown = new Set<string>();

  constructor(
    private readonly map: L.Map,
    private readonly onSelect: (id: string) => void,
  ) {
    this.group.addTo(map);
  }

  /** Show a record when any of its categories is shown; markers follow the view's world copy. */
  update(active: HazardCode[], interactive: boolean, selected: string | null) {
    this.group.clearLayers();
    this.markers.clear();
    this.shown.clear();
    const near = this.map.getCenter().lng;
    for (const o of OBSERVATIONS) {
      if (!o.categories.some((c) => active.includes(c))) continue;
      const m = this.marker(o, near, interactive, selected === o.id);
      this.markers.set(o.id, m);
      this.shown.add(o.id);
      m.addTo(this.group);
    }
  }

  /** Records whose marker is on the map (any world copy). */
  get count() {
    return this.shown.size;
  }

  /** Records whose marker lies in the current view. */
  countInView(): number {
    const b = this.map.getBounds();
    let n = 0;
    for (const m of this.markers.values()) if (b.contains(m.getLatLng())) n++;
    return n;
  }

  remove() {
    this.group.remove();
  }

  private marker(o: HazardObservationRecord, near: number, interactive: boolean, selected: boolean) {
    const cat = CATEGORY_BY_CODE[o.categories[0]];
    const lon = o.observationCentre.longitudeEast + 360 * Math.round((near - o.observationCentre.longitudeEast) / 360);
    const m = L.marker([o.observationCentre.latitude, lon], {
      interactive,
      keyboard: interactive,
      title: interactive ? `${o.id} · ${o.name}: observation location (boundary not mapped)` : undefined,
      alt: `${o.id} ${o.name}`,
      icon: L.divIcon({
        className: `hz-obs-pin${selected ? ' is-selected' : ''}`,
        html: `<span style="--c:${cat.colour}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: selected ? 1000 : 0,
    });
    if (interactive) m.on('click', () => this.onSelect(o.id));
    return m;
  }
}
