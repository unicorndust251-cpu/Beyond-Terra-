import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GroundPerspectiveRequest } from '../shared';
import { imageCandidates, loadGroundCatalogue, matchImages, type GroundCatalogue, type ImageMatch, type MatchKind } from './catalogue';
import { fmtCoord, fmtKm } from './format';

interface Props {
  request: GroundPerspectiveRequest;
  /** Photograph to start on (when coming back from the map). */
  initialId?: string | null;
  onClose: () => void;
  /** Shows the capture point and the selected point on the map (only for located images). */
  onShowOnMap: (match: ImageMatch) => void;
}

const CONTEXT_LABEL: Record<GroundPerspectiveRequest['context'], string> = {
  'map-point': 'Selected map point',
  landmark: 'Landmark',
  start: 'Mission start',
  destination: 'Mission destination',
  checkpoint: 'Checkpoint',
  custom: 'Custom coordinates',
};

const KIND_LABEL: Record<MatchKind, string> = {
  nearby: 'Nearby documented imagery',
  regional: 'Regional reference imagery',
  'mission-area': 'Mission-area imagery · no capture coordinates',
};

const fmtDate = (iso: string) => `${new Date(iso).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
const ltst = (s: string | null) => s?.match(/M(\d{2}:\d{2}:\d{2})/)?.[1] ?? null;
const shortCamera = (c: string) => c.replace(/^(Left|Right) /, '').replace(/ Camera.*$/, '').replace(/Navigation \(Navcam\)/, 'Navcam');

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; catalogue: GroundCatalogue };

/** Ground Perspective: NASA rover photographs relevant to a selected point, with their provenance. */
export default function GroundPerspective({ request, initialId, onClose, onShowOnMap }: Props) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [rover, setRover] = useState<string | null>(null);
  const [camera, setCamera] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(initialId ?? null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    loadGroundCatalogue().then(
      (catalogue) => live && setLoad({ state: 'ready', catalogue }),
      (e) => live && setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => closeRef.current?.focus(), []);

  const result = useMemo(() => (load.state === 'ready' ? matchImages(load.catalogue, request.coordinate) : null), [load, request.coordinate]);
  const all = result?.matches ?? [];
  const rovers = [...new Set(all.map((m) => m.image.rover))];
  const cameras = [...new Set(all.filter((m) => !rover || m.image.rover === rover).map((m) => shortCamera(m.image.camera)))];
  const shown = all.filter((m) => (!rover || m.image.rover === rover) && (!camera || shortCamera(m.image.camera) === camera));
  const index = Math.max(0, shown.findIndex((m) => m.image.id === current));
  const match = shown[index] ?? null;
  const go = (by: number) => shown.length && setCurrent(shown[(index + by + shown.length) % shown.length].image.id);

  // Keyboard: Escape closes, arrows browse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLSelectElement)) go(1);
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLSelectElement)) go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const place = request.name ?? (request.context === 'custom' ? 'Custom location' : 'Selected point');
  const contextText = request.contextLabel ?? CONTEXT_LABEL[request.context];

  return (
    <div className="gp" role="dialog" aria-modal="true" aria-labelledby="gp-title">
      <header className="gp-head">
        <div className="gp-head__text">
          <p className="gp-eyebrow">Ground Perspective</p>
          <h2 id="gp-title">{place}</h2>
          <p className="gp-head__meta">
            <span className="gp-num">{fmtCoord(request.coordinate)}</span>
            <span className="gp-tag">{contextText}</span>
          </p>
        </div>
        <button ref={closeRef} type="button" className="gp-close" onClick={onClose} aria-label="Close Ground Perspective" title="Back (Esc)">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 6 8 8M14 6l-8 8" />
          </svg>
        </button>
      </header>

      {load.state === 'loading' && (
        <div className="gp-state" role="status">
          <span className="gp-spinner" aria-hidden="true" />
          Loading the NASA imagery catalogue…
        </div>
      )}
      {load.state === 'error' && (
        <div className="gp-state" role="alert">
          <p className="gp-state__title">The imagery catalogue could not be loaded.</p>
          <p className="gp-dim">{load.message}</p>
          <button type="button" className="gp-btn" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
        </div>
      )}
      {load.state === 'ready' && result && all.length === 0 && (
        <div className="gp-state gp-state--empty">
          <p className="gp-state__title">No verified NASA surface imagery is available for this location.</p>
          <p className="gp-dim">
            This catalogue holds {load.catalogue.images.length} verified photographs from{' '}
            {[...new Set(load.catalogue.images.map((i) => `${i.rover} (${load.catalogue.regions.find((r) => r.key === i.region)?.name ?? i.mission})`))].join(' and ')}.
            {result.nearestKm !== null && result.nearestImage && (
              <>
                {' '}
                The nearest was taken by {result.nearestImage.rover} {fmtKm(result.nearestKm)} from this point. It does not show this location, so it is
                not offered here.
              </>
            )}
          </p>
          <p className="gp-dim">Rover photographs exist only along the rovers’ own traverses. Orbital imagery of this place is on the map.</p>
          <button type="button" className="gp-btn" onClick={onClose}>
            Back to the map
          </button>
        </div>
      )}
      {load.state === 'ready' && match && result && (
        <div className="gp-body">
          <Viewer key={match.image.id} match={match} count={shown.length} index={index} onPrev={() => go(-1)} onNext={() => go(1)} />
          <aside className="gp-info" aria-label="About this photograph">
            <Context match={match} horizonKm={result.horizonKm} />
            <dl className="gp-facts">
              <div>
                <dt>Rover</dt>
                <dd>
                  {match.image.rover} · {match.image.mission}
                </dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{match.image.camera}</dd>
              </div>
              <div>
                <dt>Captured</dt>
                <dd className="gp-num">
                  {match.image.sol !== null ? `Sol ${match.image.sol}` : 'Sol not recorded'}
                  {match.image.earthDateUtc ? ` · ${fmtDate(match.image.earthDateUtc)}` : ' · Earth date not recorded'}
                  {ltst(match.image.localSolarTime) && ` · ${ltst(match.image.localSolarTime)} LMST`}
                </dd>
              </div>
              <div>
                <dt>Photographed from</dt>
                <dd>
                  {match.image.capture ? (
                    <>
                      <span className="gp-num">{fmtCoord(match.image.capture, 5)}</span>
                      <small>
                        Rover position{match.image.capture.site !== null ? ` at site ${match.image.capture.site}, drive ${match.image.capture.drive}` : ''} ·{' '}
                        <a href={match.image.capture.source} target="_blank" rel="noreferrer noopener">
                          NASA localization
                        </a>
                      </small>
                    </>
                  ) : (
                    <>
                      Not published
                      <small>{match.image.captureNote ?? 'No capture position is known for this image.'}</small>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Your point</dt>
                <dd className="gp-num">{fmtCoord(request.coordinate)}</dd>
              </div>
              {match.distanceKm !== null && (
                <div>
                  <dt>Separation</dt>
                  <dd className="gp-num">{fmtKm(match.distanceKm)} (great circle)</dd>
                </div>
              )}
            </dl>
            {match.image.description && <p className="gp-desc">{match.image.description}</p>}
            <p className="gp-credit">Image: {match.image.credit}</p>
            <div className="gp-links">
              <a href={match.image.sourceUrl} target="_blank" rel="noreferrer noopener">
                Original NASA record ↗
              </a>
              {match.image.fullResolutionUrl && (
                <a href={match.image.fullResolutionUrl} target="_blank" rel="noreferrer noopener">
                  Full-resolution image ↗
                </a>
              )}
            </div>
            {match.image.capture && (
              <button type="button" className="gp-btn gp-btn--primary" onClick={() => onShowOnMap(match)}>
                Show capture location on map
              </button>
            )}
            <p className="gp-note">
              A historical observation: it shows the ground where and when it was taken, not conditions at your mission time. It does not show every
              obstacle and does not establish that a route is safe.
              {match.image.metadataStatus === 'complete'
                ? ' Metadata verified; view orientation is not published.'
                : ` Not recorded for this image: ${match.image.missing.join(', ')}.`}
            </p>
          </aside>
          <nav className="gp-strip" aria-label="Photographs">
            {(rovers.length > 1 || cameras.length > 1) && (
              <div className="gp-filters">
                {rovers.length > 1 && (
                  <Chips label="Rover" options={rovers} value={rover} onChange={(v) => { setRover(v); setCamera(null); setCurrent(null); }} />
                )}
                {cameras.length > 1 && <Chips label="Camera" options={cameras} value={camera} onChange={(v) => { setCamera(v); setCurrent(null); }} />}
              </div>
            )}
            <ol className="gp-thumbs">
              {shown.map((m, i) => (
                <li key={m.image.id}>
                  <button
                    type="button"
                    className={`gp-thumb${i === index ? ' is-current' : ''}`}
                    aria-current={i === index}
                    aria-label={`${m.image.rover}, sol ${m.image.sol ?? 'unknown'}, ${m.image.camera}${m.distanceKm !== null ? `, ${fmtKm(m.distanceKm)} away` : ''}`}
                    onClick={() => setCurrent(m.image.id)}
                  >
                    <img src={m.image.thumbnailUrl ?? m.image.imageUrl} alt="" loading="lazy" decoding="async" />
                    <span className={`gp-thumb__kind gp-kind--${m.kind}`}>{m.distanceKm !== null ? fmtKm(m.distanceKm) : 'no position'}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      )}
    </div>
  );
}

function Context({ match, horizonKm }: { match: ImageMatch; horizonKm: number }) {
  const r = match.region?.name ?? 'the mission region';
  const text =
    match.kind === 'nearby'
      ? `Taken ${fmtKm(match.distanceKm!)} from your point, within the ~${horizonKm.toFixed(1)} km horizon distance from the rover’s mast camera: your point may be in view, depending on relief and where the camera pointed.`
      : match.kind === 'regional'
        ? `Taken ${fmtKm(match.distanceKm!)} from your point, in the same mission region (${r}). It shows the regional setting, not your site itself.`
        : `From ${match.image.rover}’s mission in ${r}. NASA has not published where the rover stood for this image, so no distance is given.`;
  return (
    <div className={`gp-context gp-kind--${match.kind}`}>
      <p className="gp-context__kind">{KIND_LABEL[match.kind]}</p>
      <p>{text}</p>
    </div>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="gp-chips" role="group" aria-label={label}>
      <button type="button" className={value === null ? 'is-on' : ''} aria-pressed={value === null} onClick={() => onChange(null)}>
        All
      </button>
      {options.map((o) => (
        <button key={o} type="button" className={value === o ? 'is-on' : ''} aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- image */

type ImgState = { state: 'loading' | 'ready' | 'error'; candidate: number };

/**
 * The photograph: fitted without distortion, zoomable (wheel, buttons, double-click) and
 * pannable when zoomed. Mounted once per photograph (keyed by its ID), so its loading state
 * always starts fresh.
 */
function Viewer({ match, count, index, onPrev, onNext }: { match: ImageMatch; count: number; index: number; onPrev: () => void; onNext: () => void }) {
  const urls = imageCandidates(match.image);
  const [img, setImg] = useState<ImgState>({ state: 'loading', candidate: 0 });
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const photo = useRef<HTMLImageElement>(null);

  // A cached photograph can finish loading before its load handler is attached
  useEffect(() => {
    const el = photo.current;
    if (el?.complete && el.naturalWidth > 0) setImg((s) => (s.state === 'loading' ? { ...s, state: 'ready' } : s));
  }, [img.candidate, retry]);

  const clamp = (v: { scale: number; x: number; y: number }) => {
    const el = stage.current;
    const scale = Math.min(5, Math.max(1, v.scale));
    if (!el || scale === 1) return { scale, x: 0, y: 0 };
    const mx = (el.clientWidth * (scale - 1)) / 2;
    const my = (el.clientHeight * (scale - 1)) / 2;
    return { scale, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };
  const zoom = (by: number) => setView((v) => clamp({ ...v, scale: v.scale * by }));

  // Wheel zoom (non-passive, so the page does not scroll)
  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (img.state !== 'ready') return;
      e.preventDefault();
      setView((v) => clamp({ ...v, scale: v.scale * Math.exp(-e.deltaY * 0.0015) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: ReactPointerEvent) => {
    if (view.scale === 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d) setView((v) => clamp({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const endDrag = () => (drag.current = null);

  const src = urls[img.candidate] ? `${urls[img.candidate]}${retry ? `?retry=${retry}` : ''}` : null;
  const fallback = img.candidate > 0;

  return (
    <section className="gp-stage-wrap" aria-label="Photograph">
      <div
        ref={stage}
        className={`gp-stage${view.scale > 1 ? ' is-zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setView((v) => clamp(v.scale > 1 ? { scale: 1, x: 0, y: 0 } : { ...v, scale: 2.5 }))}
      >
        {src && img.state !== 'error' && (
          <img
            key={src}
            ref={photo}
            className="gp-photo"
            src={src}
            alt={`${match.image.rover} ${match.image.camera} photograph, sol ${match.image.sol ?? 'unknown'}`}
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, opacity: img.state === 'ready' ? 1 : 0 }}
            onLoad={() => setImg((s) => ({ ...s, state: 'ready' }))}
            onError={() => setImg((s) => (s.candidate + 1 < urls.length ? { state: 'loading', candidate: s.candidate + 1 } : { ...s, state: 'error' }))}
          />
        )}
        {img.state === 'loading' && (
          <div className="gp-stage__msg" role="status">
            <span className="gp-spinner" aria-hidden="true" />
            Loading NASA photograph…
          </div>
        )}
        {img.state === 'error' && (
          <div className="gp-stage__msg" role="alert">
            <p>This NASA photograph could not be loaded.</p>
            <div className="gp-stage__actions">
              <button
                type="button"
                className="gp-btn"
                onClick={() => {
                  setRetry((r) => r + 1);
                  setImg({ state: 'loading', candidate: 0 });
                }}
              >
                Retry
              </button>
              <a className="gp-btn" href={match.image.sourceUrl} target="_blank" rel="noreferrer noopener">
                Open on NASA’s site ↗
              </a>
            </div>
          </div>
        )}
      </div>
      {count > 1 && (
        <>
          <button type="button" className="gp-nav gp-nav--prev" onClick={onPrev} aria-label="Previous photograph">
            ‹
          </button>
          <button type="button" className="gp-nav gp-nav--next" onClick={onNext} aria-label="Next photograph">
            ›
          </button>
        </>
      )}
      <div className="gp-stage__bar">
        <span className="gp-stage__count gp-num">
          {index + 1} / {count}
          {fallback && img.state === 'ready' && ' · lower-resolution copy shown'}
        </span>
        <span className="gp-zoom">
          <button type="button" onClick={() => zoom(1 / 1.5)} disabled={view.scale <= 1 || img.state !== 'ready'} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => zoom(1.5)} disabled={view.scale >= 5 || img.state !== 'ready'} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => setView({ scale: 1, x: 0, y: 0 })} disabled={view.scale === 1} aria-label="Reset zoom">
            ⟲
          </button>
        </span>
      </div>
    </section>
  );
}
