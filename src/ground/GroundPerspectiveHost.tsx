import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { closeGroundPerspective, openGroundPerspective, useGroundPerspectiveRequest, useMapBridge, type GroundPerspectiveRequest, type MapOverlayHandle, type MarsCoordinate } from '../shared';
import type { ImageMatch } from './catalogue';
import { fmtCoord, fmtKm } from './format';
import './ground.css';

// The viewer and its catalogue load the first time Ground Perspective is opened
const GroundPerspective = lazy(() => import('./GroundPerspective'));

interface Props {
  /** True while the globe, dashboard or intro covers the map. */
  mapHidden: boolean;
  /** Brings the map to the front (closes the globe or dashboard). */
  onShowMap: () => void;
  /** Moves the map camera so both points are in the clear part of the map. */
  onFrame: (a: MarsCoordinate, b: MarsCoordinate) => void;
}

/**
 * Mounts Ground Perspective when it is requested, and shows a photograph's capture point and
 * the selected point on the map on request. The map reference is temporary: it is drawn with
 * its own overlay ids (gp:) and removed with Clear; the mission route is never touched.
 */
export default function GroundPerspectiveHost({ mapHidden, onShowMap, onFrame }: Props) {
  const request = useGroundPerspectiveRequest();
  const bridge = useMapBridge();
  const [reference, setReference] = useState<{ request: GroundPerspectiveRequest; match: ImageMatch } | null>(null);
  const [startOn, setStartOn] = useState<string | null>(null);
  const handles = useRef<MapOverlayHandle[]>([]);
  const [refBox, setRefBox] = useState<{ left: number; right: number; bottom: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Remember what opened the viewer, to return focus there
  const open = !!request;
  useEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  const clearReference = () => {
    handles.current.forEach((h) => h.remove());
    handles.current = [];
    setReference(null);
  };
  useEffect(() => () => handles.current.forEach((h) => h.remove()), []);

  // Keep the reference bar in the clear part of the map: beside the planner panel (when it
  // sits at the side) and above the route summary
  const showingRef = !!reference && !request && !mapHidden;
  useEffect(() => {
    if (!showingRef) return undefined;
    const place = () => {
      const w = window.innerWidth;
      const panel = document.querySelector('.mp-panel.is-open')?.getBoundingClientRect();
      const sum = document.querySelector('.mp-sum')?.getBoundingClientRect();
      const side = panel && w > 640 && panel.right < w * 0.6;
      const left = side ? panel.right + 12 : 12;
      const right = 12;
      const overSummary = sum && sum.height > 0 && sum.top < window.innerHeight && sum.right > left && sum.left < w - right;
      setRefBox({ left, right, bottom: overSummary ? Math.max(12, window.innerHeight - sum.top + 10) : 18 });
    };
    place();
    const timer = window.setInterval(place, 500);
    window.addEventListener('resize', place);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', place);
    };
  }, [showingRef]);

  const close = () => {
    closeGroundPerspective();
    setStartOn(null);
    const el = opener.current;
    window.requestAnimationFrame(() => el?.isConnected && el.focus());
  };

  const showOnMap = (match: ImageMatch) => {
    const capture = match.image.capture;
    if (!request || !capture || !bridge) return;
    clearReference();
    const selected = request.coordinate;
    const name = request.name ?? 'Selected point';
    handles.current = [
      bridge.drawRoute('gp:separation', [selected, capture], { color: '#E8C2AD', weight: 2, dashed: true }),
      bridge.addMarker('gp:selected', selected, {
        symbol: '◎',
        color: '#B87860',
        label: `Your point: ${name}`,
        details: { title: `Your point: ${name}`, lines: [fmtCoord(selected), 'The location you opened Ground Perspective for.'] },
      }),
      bridge.addMarker('gp:capture', capture, {
        symbol: '◉',
        color: '#E8C2AD',
        label: `Photograph taken here (${match.image.rover}, sol ${match.image.sol ?? '?'})`,
        details: {
          title: `${match.image.rover} photograph, sol ${match.image.sol ?? 'unknown'}`,
          lines: [fmtCoord(capture, 5), 'Rover position NASA published for this image.', match.distanceKm !== null ? `${fmtKm(match.distanceKm)} from your point` : ''].filter(Boolean),
        },
      }),
    ];
    setReference({ request, match });
    closeGroundPerspective();
    onShowMap();
    // Frame both points once the map is in front and its panels have settled
    window.setTimeout(() => onFrame(selected, capture), 80);
  };

  return (
    <>
      {request && (
        <Suspense fallback={<div className="gp gp--loading" aria-hidden="true" />}>
          <GroundPerspective request={request} initialId={startOn} onClose={close} onShowOnMap={showOnMap} />
        </Suspense>
      )}
      {reference && !request && !mapHidden && (
        <div className="gp-ref" role="status" style={refBox ?? undefined}>
          <span className="gp-ref__key">
            <i className="gp-ref__dot gp-ref__dot--capture" aria-hidden="true" />
            <span className="gp-ref__long">Photograph taken here</span>
            <span className="gp-ref__short">Photo</span>
            <i className="gp-ref__dot gp-ref__dot--selected" aria-hidden="true" />
            <span className="gp-ref__long">Your point</span>
            <span className="gp-ref__short">You</span>
          </span>
          {reference.match.distanceKm !== null && <span className="gp-ref__km">{fmtKm(reference.match.distanceKm)} apart</span>}
          <button
            type="button"
            onClick={() => {
              setStartOn(reference.match.image.id);
              openGroundPerspective(reference.request);
            }}
          >
            <span className="gp-ref__long">Back to photo</span>
            <span className="gp-ref__short">Photo ↩</span>
          </button>
          <button type="button" onClick={clearReference}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}
