import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MarsMapHandle } from '../map/MarsMap';
import './MarsTrekSection.css';

// Leaflet and the map load separately, after the introduction, so they never slow it down
const MarsMap = lazy(() => import('./MarsMapWithFeatures'));

interface Props {
  /** Mount the map (underneath the globe, out of focus) so its tiles load in advance. */
  load: boolean;
  /** Bring the map into focus and descend onto Jezero Crater. */
  revealed: boolean;
}

/** Zoom levels above the orbital view of Jezero where the map waits: most of the planet. */
const START_LEVELS_ABOVE = 6.5;
/** Seconds for the descent from the whole planet onto Jezero. */
export const MAP_DESCENT_SECONDS = 2.8;

/**
 * If the map's code cannot load (a dropped connection, or a stale tab after a deploy or
 * a dependency change), show that here instead of taking the whole page down.
 */
class MapLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="bt-trek__failed" role="alert">
        <p>The Mars Trek map could not load.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

/**
 * The NASA Mars Trek map (Leaflet + Trek's WMTS tiles), full screen, underneath the globe.
 * It mounts out of focus high above the planet; when revealed, the globe has zoomed away
 * and the map sharpens and descends onto Jezero Crater.
 */
export default function MarsTrekSection({ load, revealed }: Props) {
  const [mounted, setMounted] = useState(load);
  const handleRef = useRef<MarsMapHandle | null>(null);
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const done = useRef(false);

  useEffect(() => {
    if (load) setMounted(true);
  }, [load]);

  // Reveal once both the request and the map exist (the map's code may still be loading)
  const tryReveal = useCallback(() => {
    if (done.current || !revealedRef.current || !handleRef.current?.getMap()) return false;
    done.current = true;
    handleRef.current.reveal({ duration: MAP_DESCENT_SECONDS });
    return true;
  }, []);

  useEffect(() => {
    if (!revealed || tryReveal()) return undefined;
    const timer = window.setInterval(() => {
      if (tryReveal()) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [revealed, tryReveal]);

  const setHandle = useCallback(
    (handle: MarsMapHandle | null) => {
      handleRef.current = handle;
      tryReveal();
    },
    [tryReveal],
  );

  return (
    <section className="bt-trek" aria-label="Map of Mars from NASA Mars Trek" aria-hidden={!revealed}>
      {mounted && (
        <MapLoadBoundary>
          <Suspense fallback={null}>
            <MarsMap ref={setHandle} awaitReveal startLevelsAbove={START_LEVELS_ABOVE} />
          </Suspense>
        </MapLoadBoundary>
      )}
    </section>
  );
}
