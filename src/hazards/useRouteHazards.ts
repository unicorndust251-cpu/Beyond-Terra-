import { useEffect } from 'react';
import * as L from 'leaflet';
import type { DemStore } from '../science/molaDem';
import { routeHazardStore, usePlannedRoute, useRouteHazardReport, type HazardCode, type MarsCoordinate, type RouteCheckState } from '../shared';
import { CATEGORY_BY_CODE } from './categories';
import { NO_ALTERNATIVE, checkRoute, routeLegs, type DataState } from './routeCheck';
import { commHits, routeLineOfSight } from './env/envMap';
import type { EnvInputs } from './env/inputs';
import { HAZARD_PANES, type StructureData } from './structures';
import type { DuneData } from './dunes';

/**
 * Keeps the route's hazard report (shared with the planner's summary) up to date, and marks
 * the affected parts of the route on the map in both views. Highlights sit in the hazard
 * selection pane, under the planner's route line, so the route and its stops stay on top.
 */
export function useRouteHazards(
  map: L.Map,
  structures: DataState<StructureData>,
  slope: DataState<DemStore>,
  dunes: DataState<DuneData>,
  thresholdDeg: number,
  excluded: HazardCode[],
  comm: EnvInputs['comm'],
  active: HazardCode[],
) {
  const commKey = JSON.stringify(comm);
  const activeKey = active.join(',');
  const excludedKey = excluded.join(',');
  const route = usePlannedRoute();
  const report = useRouteHazardReport();

  useEffect(() => {
    if (!route || route.stops.length < 2) {
      routeHazardStore.set(null);
      return undefined;
    }
    let live = true;
    const signature = `${route.signature}|${thresholdDeg}|${excludedKey}`;
    routeHazardStore.set({
      signature,
      status: 'checking',
      hits: [],
      checks: [],
      slope: null,
      nearbyObservations: [],
      alternative: { available: false, message: NO_ALTERNATIVE },
    });
    const timer = window.setTimeout(() => {
      const excl = excludedKey ? (excludedKey.split(',') as HazardCode[]) : [];
      checkRoute(route, structures, slope, dunes, thresholdDeg, excl)
        .then(async (r) => {
          // C: terrain line of sight from the configured nodes (independent of what is shown)
          const cfg = JSON.parse(commKey) as EnvInputs['comm'];
          const ready = cfg.nodes.length > 0 && cfg.nodes.every((n) => n.antennaM != null) && cfg.crewAntennaM != null;
          const cat = CATEGORY_BY_CODE.C;
          const setC = (state: RouteCheckState, note: string) => {
            r.checks = r.checks.filter((c) => c.code !== 'C');
            r.checks.push({ code: 'C', name: cat.name, colour: cat.colour, state, note });
          };
          if (excl.includes('C')) setC('excluded', 'Excluded from route assessment by you.');
          else if (!ready) setC('no-geometry', 'Coverage not calculated — habitat/relay configuration required.');
          else if (slope.state !== 'ready') setC('unavailable', 'Terrain model required for line of sight (MOLA not loaded).');
          else {
            const segs = await routeLineOfSight(slope.data, route, cfg.nodes, cfg.crewAntennaM!);
            const hits = commHits(segs);
            r.hits = [...r.hits, ...hits].sort((a, b) => a.fromKm - b.fromKm);
            const blocked = hits.reduce((a, h) => a + h.toKm - h.fromKm, 0);
            const nodata = segs.filter((x) => x.state === 'no-data').reduce((a, x) => a + x.toKm - x.fromKm, 0);
            setC(
              'checked',
              `Terrain line of sight from ${cfg.nodes.length} configured node${cfg.nodes.length > 1 ? 's' : ''} (MOLA 3.7 km): blocked for about ${blocked.toFixed(1)} km${nodata ? `, no terrain data for ${nodata.toFixed(1)} km` : ''}. Not a radio-link assessment; orbital relays and Earth links not modelled.`,
            );
          }
          if (live) routeHazardStore.set(r);
        })
        .catch(() => live && routeHazardStore.set(null));
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [route, structures, slope, dunes, thresholdDeg, excludedKey, commKey]);

  useEffect(() => () => routeHazardStore.set(null), []);

  // Highlights: the legs with any finding get a faint ivory casing; each slope run its own
  // SL-coloured casing along exactly the cells crossed; each line crossing a small ×.
  useEffect(() => {
    if (!route || !report || report.status !== 'ready' || !report.hits.length) return undefined;
    const pane = HAZARD_PANES.selection.name;
    const legs = routeLegs(route);
    // The planner draws the route in the world copy nearest the view; use the same copy
    const shift = 360 * Math.round((map.getCenter().lng - legs[0].a[0]) / 360);
    const nearLon = (c: MarsCoordinate, ref: number) => c.longitudeEast + 360 * Math.round((ref - c.longitudeEast) / 360);
    const layers: L.Layer[] = [];
    // Display follows each category's switch; the report itself is unchanged
    const shown = report.hits.filter((h) => activeKey.split(',').includes(h.code));
    const affected = new Set(shown.map((h) => h.segmentIndex));
    for (const leg of legs) {
      if (!affected.has(leg.index)) continue;
      const ab = [L.latLng(leg.a[1], leg.a[0] + shift), L.latLng(leg.b[1], leg.b[0] + shift)];
      layers.push(L.polyline(ab, { pane, color: '#F3E5DC', weight: 14, opacity: 0.16, interactive: false, lineCap: 'round' }));
    }
    for (const h of shown) {
      const colour = CATEGORY_BY_CODE[h.code].colour;
      let ref = legs[h.segmentIndex].a[0] + shift;
      const pts = h.path.map((c) => {
        ref = nearLon(c, ref);
        return L.latLng(c.latitude, ref);
      });
      if (h.code === 'SL' || h.code === 'S' || h.code === 'C') {
        layers.push(L.polyline(pts, { pane, color: '#171413', weight: 11, opacity: 0.55, interactive: false, lineCap: 'butt' }));
        layers.push(L.polyline(pts, { pane, color: colour, weight: 8, opacity: 0.85, interactive: false, lineCap: 'butt' }));
      } else {
        for (const p of pts)
          layers.push(
            L.marker(p, {
              pane,
              interactive: false,
              keyboard: false,
              icon: L.divIcon({ className: 'hz-route-cross', html: `<span style="--hz-c:${colour}"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] }),
            }),
          );
      }
    }
    layers.forEach((l) => l.addTo(map));
    return () => layers.forEach((l) => l.remove());
  }, [map, route, report, activeKey]);
}
