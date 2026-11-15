import { useEffect, useMemo } from 'react';
import * as L from 'leaflet';
import type { DemStore } from '../../science/molaDem';
import { toMapLatLng, type HazardCode, type MarsCoordinate, type MissionConstraintsSnapshot, type PlannedRoute } from '../../shared';
import { CATEGORY_BY_CODE } from '../categories';
import type { LoadState } from '../HazardsLayer';
import { parsePlannedUtc } from './time';
import { energyBudget, fmtMinutes, loadTimeline } from './calc';
import { NightLayer, RAD_REFERENCE, noteIcon, ringLatLngs, subsolarPoint } from './envMap';
import type { EnvInputs } from './inputs';

interface Args {
  map: L.Map;
  active: HazardCode[];
  plannedTime: string | null;
  shading: number;
  dem: LoadState<DemStore>;
  inputs: EnvInputs;
  snapshot: MissionConstraintsSnapshot | null;
  route: PlannedRoute | null;
}

/**
 * Map representations of the environmental and mission-constraint categories, on the shared
 * map (both views). Each is added only while its switch is on and removed when it is off;
 * data and inputs are kept either way. Nothing here is drawn without its data or inputs.
 */
export function useEnvLayers({ map, active, plannedTime, shading, inputs, snapshot, route }: Args) {
  const on = (c: HazardCode) => active.includes(c);
  const ms = parsePlannedUtc(plannedTime);

  // V: night side (Sun below the smooth horizon) for the planned time, and the subsolar point
  const night = useMemo(() => new NightLayer(), []);
  const vOn = on('V') && ms != null;
  useEffect(() => {
    if (!vOn) return undefined;
    night.addTo(map);
    const sub = subsolarPoint(ms!);
    const marker = L.marker(toMapLatLng(sub, map.getCenter().lng), {
      pane: 'markerPane',
      interactive: false,
      keyboard: false,
      icon: noteIcon(CATEGORY_BY_CODE.V.colour, ['Subsolar point', `at ${plannedTime!.replace('T', ' ')} UTC`], 'hz-note-pin--sun'),
    }).addTo(map);
    return () => {
      night.remove();
      marker.remove();
    };
  }, [map, night, vOn, ms, plannedTime]);
  useEffect(() => {
    if (ms != null) night.set(ms, shading);
  }, [night, ms, shading]);

  // R: the measurement site only (no area around it)
  const rOn = on('R');
  useEffect(() => {
    if (!rOn) return undefined;
    const m = L.marker(toMapLatLng(RAD_REFERENCE.at, map.getCenter().lng), {
      interactive: false,
      keyboard: false,
      icon: noteIcon(CATEGORY_BY_CODE.R.colour, ['RAD measurement (Curiosity)', `${RAD_REFERENCE.approx} ${RAD_REFERENCE.ratePerDay} ${RAD_REFERENCE.unit}, 2012–13`]),
    }).addTo(map);
    return () => {
      m.remove();
    };
  }, [map, rOn]);

  // C: the configured nodes (blocked route stretches are drawn with the route findings)
  const cOn = on('C');
  const nodesKey = JSON.stringify(inputs.comm.nodes);
  useEffect(() => {
    if (!cOn || !inputs.comm.nodes.length) return undefined;
    const layers = inputs.comm.nodes.map((n) =>
      L.marker(toMapLatLng(n.at, map.getCenter().lng), {
        interactive: false,
        keyboard: false,
        icon: noteIcon(CATEGORY_BY_CODE.C.colour, [`${n.name || n.kind} (${n.kind})`, n.antennaM != null ? `antenna ${n.antennaM} m` : 'antenna height missing'], 'hz-note-pin--node'),
      }).addTo(map),
    );
    return () => layers.forEach((l) => l.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, cOn, nodesKey]);

  // N: user-stated uncertainty around each route stop
  const nOn = on('N');
  const sigma = inputs.nav.uncertaintyM;
  const stopsKey = JSON.stringify(route?.stops.map((s) => s.coordinate) ?? []);
  useEffect(() => {
    if (!nOn || sigma == null || !route) return undefined;
    const cat = CATEGORY_BY_CODE.N;
    const layers = route.stops.map((s: { coordinate: MarsCoordinate }) =>
      L.polygon(ringLatLngs(s.coordinate, sigma, map.getCenter().lng), {
        pane: 'btHazardSelection',
        color: cat.colour,
        weight: 2,
        dashArray: '6 4',
        fillColor: cat.colour,
        fillOpacity: Math.min(0.25, shading),
        interactive: false,
      }).addTo(map),
    );
    return () => layers.forEach((l) => l.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, nOn, sigma, stopsKey, shading]);

  // E and M: notes at the route stops (timeline and scheduled energy)
  const eOn = on('E');
  const mOn = on('M');
  const notesKey = JSON.stringify([eOn, mOn, snapshot, inputs.energy, inputs.load]);
  useEffect(() => {
    if ((!eOn && !mOn) || !snapshot) return undefined;
    const energy = eOn ? energyBudget(snapshot, inputs) : null;
    const time = mOn ? loadTimeline(snapshot, inputs) : null;
    const limit = energy && energy.availableWh != null ? energy.availableWh - (energy.reserveWh ?? 0) : null;
    const layers = snapshot.stops.map((st, i) => {
      const lines: string[] = [];
      if (time) {
        const t = time.stops[i];
        lines.push(t.arriveMin == null ? 'Arrival time unknown (task time missing)' : i === 0 ? 'Departure +0 h 00 min' : `Arrive +${fmtMinutes(t.arriveMin)}`);
      }
      if (energy) {
        const wh = energy.byStop[i].cumulativeWh;
        const hasPower = Object.values(inputs.energy.items).some((v) => v.powerW != null);
        if (hasPower) lines.push(`Scheduled equipment energy by here: ${wh.toFixed(0)} Wh${limit != null && wh > limit ? ' (over budget)' : ''}`);
        else if (i === snapshot.stops.length - 1 && energy.remainingWh != null)
          lines.push(`Energy remaining at the end: ${energy.remainingWh.toFixed(0)} Wh (no scheduled equipment power entered)`);
        else if (energy.remainingWh == null) lines.push('Energy: enter equipment power and battery energy');
      }
      const colour = energy && limit != null && energy.byStop[i].cumulativeWh > limit ? '#F0A08A' : CATEGORY_BY_CODE[mOn ? 'M' : 'E'].colour;
      return L.marker(toMapLatLng(st.coordinate, map.getCenter().lng), {
        interactive: false,
        keyboard: false,
        icon: noteIcon(colour, lines, 'hz-note-pin--stop'),
      }).addTo(map);
    });
    return () => layers.forEach((l) => l.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, notesKey]);
}
