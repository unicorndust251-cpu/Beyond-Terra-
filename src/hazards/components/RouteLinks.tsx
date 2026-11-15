import { useEffect, useRef } from 'react';
import {
  removeMissionHazardNote,
  saveMissionHazardNote,
  useMissionHazardNotes,
  usePlannedRoute,
  useRouteHazardReport,
  type MissionHazardNote,
  type RouteHazardHit,
} from '../../shared';
import { NO_ALTERNATIVE } from '../routeCheck';

/** A button in the information view's action row. */
export interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  /** Why the action is unavailable; set means disabled. */
  disabled?: string;
  pressed?: boolean;
}

/** What the selected record is, for matching it against the route report. */
export type RouteMatch =
  | { kind: 'line'; id: string }
  | { kind: 'dune'; id: string }
  | { kind: 'slope'; bounds: { south: number; north: number; west: number; east: number } }
  | { kind: 'observation'; id: string }
  | { kind: 'point' };

const fmtKm = (km: number) => (km < 10 ? km.toFixed(2) : km.toFixed(1));

/** Liang–Barsky: does the segment a→b (lon, lat; any world copy) touch the box? */
function segmentTouchesBox(a: [number, number], b: [number, number], box: { south: number; north: number; west: number; east: number }) {
  const mid = (box.west + box.east) / 2;
  const shift = 360 * Math.round((mid - a[0]) / 360);
  const x0 = a[0] + shift;
  const x1 = b[0] + 360 * Math.round((x0 - b[0]) / 360);
  const dx = x1 - x0;
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x0 - box.west) && clip(dx, box.east - x0) && clip(-dy, a[1] - box.south) && clip(dy, box.north - a[1]);
}

function matchingHits(hits: RouteHazardHit[], match: RouteMatch): RouteHazardHit[] {
  if (match.kind === 'line' || match.kind === 'dune') return hits.filter((h) => h.featureId === match.id);
  if (match.kind === 'slope')
    return hits.filter(
      (h) =>
        h.code === 'SL' &&
        segmentTouchesBox([h.path[0].longitudeEast, h.path[0].latitude], [h.path[1].longitudeEast, h.path[1].latitude], match.bounds),
    );
  return [];
}

/** Section G: how the planner's route meets the selected record. */
export function RouteInteraction({ match }: { match: RouteMatch }) {
  const route = usePlannedRoute();
  const report = useRouteHazardReport();

  if (!route || route.stops.length < 2) {
    return <p>No route is planned. Set a start and destination in the Mission Planner and the route will be tested against the mapped layers.</p>;
  }
  if (!report || report.status === 'checking') return <p role="status">Testing the planned route against the mapped layers…</p>;

  const status = route.status === 'calculated' ? 'calculated route' : 'route being drawn (not yet calculated)';

  if (match.kind === 'observation') {
    const near = report.nearbyObservations.find((o) => o.id === match.id);
    return (
      <>
        <p>
          {near
            ? `The observation centre is about ${fmtKm(near.distanceKm)} km from the ${status}.`
            : `The observation centre is more than 10 km from the ${status}.`}
        </p>
        <p className="hz-muted">With no mapped boundary, no route can be said to avoid or cross this feature.</p>
      </>
    );
  }
  if (match.kind === 'point') return <p className="hz-muted">Select a mapped record to see whether the {status} meets it.</p>;

  const hits = matchingHits(report.hits, match);
  if (!hits.length) {
    return (
      <>
        <p>The {status} line does not {match.kind === 'line' ? 'cross this mapped line' : match.kind === 'dune' ? 'enter this mapped dune field' : 'pass through this cell'}.</p>
        <p className="hz-muted">This is a test against mapped geometry only, not a statement that the route is safe.</p>
      </>
    );
  }
  return (
    <>
      <p>The {status} meets this {match.kind === 'line' ? 'mapped line' : match.kind === 'dune' ? 'mapped dune field' : 'cell'}:</p>
      <ul className="hz-list">
        {hits.map((h) => (
          <li key={h.id}>
            {h.segmentLabel}:{' '}
            {h.fromKm === h.toKm
              ? `crossing about ${fmtKm(h.fromKm)} km from the start`
              : `from about ${fmtKm(h.fromKm)} to ${fmtKm(h.toKm)} km from the start${h.code === 'SL' ? ' (part of a steep run)' : ' (inside the outline)'}`}
            {h.path.length > 1 && h.code !== 'SL' ? ` (${h.path.length} crossings)` : ''}
          </li>
        ))}
      </ul>
      <p className="hz-muted">Along-route distances are great-circle estimates on the IAU sphere; positions are uncertain by kilometres at these data scales.</p>
    </>
  );
}

/** Compare Alternative and Save to Mission, which depend on the planner's route. */
export function useMissionActions(note: Omit<MissionHazardNote, 'savedAt'> | null): Action[] {
  const route = usePlannedRoute();
  const notes = useMissionHazardNotes();
  const saved = !!note && notes.some((n) => n.id === note.id);
  const hasRoute = !!route && route.stops.length >= 2;
  return [
    {
      label: 'Compare Alternative Route',
      disabled: hasRoute
        ? `${NO_ALTERNATIVE} No routable terrain data (slopes and obstacles at walking scale) is available in this project.`
        : 'No route is planned in the Mission Planner, so there is nothing to compare.',
    },
    note
      ? {
          label: saved ? 'Remove from Mission' : 'Save to Mission',
          pressed: saved,
          onClick: () => (saved ? removeMissionHazardNote(note.id) : saveMissionHazardNote(note)),
        }
      : { label: 'Save to Mission', disabled: 'No single record is selected at this point.' },
  ];
}

/** Full-size view of a NASA source image, with its caveats. */
export function ImageViewer({ src, alt, caption, sourceUrl, onClose }: { src: string; alt: string; caption: string; sourceUrl: string; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    // Capture phase, so Escape closes the viewer and not the information view behind it
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="hz-viewer" role="dialog" aria-modal="true" aria-label={alt} tabIndex={-1} ref={ref} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <figure className="hz-viewer__fig">
        <img src={src} alt={alt} />
        <figcaption>
          <span>{caption}</span>
          <span className="hz-muted">Contextual imagery from the source page: not georeferenced or aligned to this map.</span>
          <span className="hz-viewer__links">
            <a href={src} target="_blank" rel="noreferrer">
              Open full image
            </a>
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              Source page
            </a>
            <button type="button" className="hz-btn" onClick={onClose}>
              Close
            </button>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
