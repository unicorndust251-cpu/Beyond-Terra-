import { useEffect } from 'react';
import { useMapBridge, type MarsCoordinate } from '../shared';
import { routeStatus, routeStops, type MissionState } from './model';
import { formatCoordinate } from './geo';

/** Overlay ids are prefixed so they never collide with other modules' drawings. */
const ID = 'mp:';

const STOP_COLOURS = {
  start: '#8FB996', // muted green: departure
  destination: '#B87860', // terracotta: arrival
  checkpoint: '#D6A38B', // copper glow
};

/**
 * Draws the planned stops and route on the map through the shared bridge. The route is
 * dashed until calculated, then solid. Works without any scientific layer.
 */
export function useMapSync(state: MissionState) {
  const bridge = useMapBridge();
  const stops = routeStops(state);
  const status = routeStatus(state);
  const key = JSON.stringify(stops.map((s) => [s.key, s.location?.coordinate ?? null])) + status;

  useEffect(() => {
    if (!bridge) return undefined;
    const handles = stops
      .filter((s) => s.location)
      .map((s) => {
        const colour =
          s.key === 'start' ? STOP_COLOURS.start : s.key === 'destination' ? STOP_COLOURS.destination : STOP_COLOURS.checkpoint;
        const name = s.location!.name ? ` · ${s.location!.name}` : '';
        return bridge.addMarker(`${ID}${s.key}`, s.location!.coordinate, {
          color: colour,
          label: `${s.label}${name} — ${formatCoordinate(s.location!.coordinate, 2)}`,
        });
      });

    const points: MarsCoordinate[] = stops.filter((s) => s.location).map((s) => s.location!.coordinate);
    if (points.length >= 2) {
      handles.push(
        bridge.drawRoute(`${ID}route`, points, {
          color: '#E8C2AD',
          weight: status === 'calculated' ? 3 : 2,
          dashed: status !== 'calculated',
        }),
      );
    }
    return () => handles.forEach((h) => h.remove());
    // `key` captures every stop and the status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, key]);
}
