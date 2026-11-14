import { useEffect } from 'react';
import { useMapBridge, type MarsCoordinate } from '../shared';
import { routeStatus, routeStops, type MissionState, type RouteStop } from './model';
import { formatLatitude, formatLongitude, locationName } from './geo';

/** Overlay ids are prefixed so they never collide with other modules' drawings. */
const ID = 'mp:';

export const STOP_COLOURS = {
  start: '#8FB996', // muted green: departure
  destination: '#B87860', // terracotta: arrival
  checkpoint: '#D6A38B', // copper glow
};

/** The letter or number on a stop's pin: S, D, or the checkpoint's position. */
export function stopSymbol(stop: RouteStop, checkpointIndex: number): string {
  if (stop.key === 'start') return 'S';
  if (stop.key === 'destination') return 'D';
  return String(checkpointIndex + 1);
}

function stopColour(stop: RouteStop): string {
  if (stop.key === 'start') return STOP_COLOURS.start;
  if (stop.key === 'destination') return STOP_COLOURS.destination;
  return STOP_COLOURS.checkpoint;
}

/**
 * Draws the planned stops and route on the map through the shared bridge. Each stop is a
 * lettered pin whose card (on click) gives its role, name and coordinates. The route is
 * dashed until calculated, then solid. Works without any scientific layer.
 */
export function useMapSync(state: MissionState) {
  const bridge = useMapBridge();
  const stops = routeStops(state);
  const status = routeStatus(state);
  const key = JSON.stringify(stops.map((s) => [s.key, s.location ?? null])) + status;

  useEffect(() => {
    if (!bridge) return undefined;
    let checkpoint = -1;
    const handles = stops.map((s) => {
      if (s.key !== 'start' && s.key !== 'destination') checkpoint++;
      if (!s.location) return null;
      const { coordinate, name } = s.location;
      return bridge.addMarker(`${ID}${s.key}`, coordinate, {
        color: stopColour(s),
        symbol: stopSymbol(s, checkpoint),
        label: `${s.label} · ${locationName(name)}`,
        details: {
          title: s.label,
          lines: [locationName(name), `Latitude ${formatLatitude(coordinate)}`, `Longitude ${formatLongitude(coordinate)}`],
        },
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
    return () => handles.forEach((h) => h?.remove());
    // `key` captures every stop and the status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, key]);
}
