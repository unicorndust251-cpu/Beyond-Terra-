import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import HomePage, { type HomePhase } from './pages/HomePage';
import MarsTrekSection from './components/MarsTrekSection';
import MapReturnBar from './explore/MapReturnBar';
import { prefersReducedMotion, shouldPlayIntro } from './intro/introGate';
import { useMapBridge } from './shared';
// Starts tracking the inspected location (globe landmark or map point) from page load
import './shared/focus';
import { applyMarkerTheme } from './shared/landmarks/markerTheme';
import { landmarkCoordinate, type Landmark } from './shared/landmarks';

// Landmark marker colours for every view, from the one shared theme
applyMarkerTheme();

// The intro is loaded separately, so the website itself never waits for it
const AstronautIntro = lazy(() => import('./intro/AstronautIntro'));
// The landmark globe loads when first opened from the map
const ExplorePage = lazy(() => import('./explore/ExplorePage'));
// The Mars Dashboard loads when first opened
const DashboardPage = lazy(() => import('./dashboard/DashboardPage'));

/** If the intro's code cannot load or crashes, go straight to the website. */
class IntroBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Stage = 'globe' | 'zooming' | 'map';

/** How long the finished globe holds before zooming into the map (ms). */
const GLOBE_HOLD_MS = 200;
/** Length of the push into the planet (matches .bt-home.is-zooming in HomePage.css). */
const GLOBE_ZOOM_MS = 1000;
/** Longest the intro may cover the site before the website is shown regardless (ms). */
const INTRO_WATCHDOG_MS = 25000;

/** Map zoom for a landmark: closer for craters, wider for plains, basins and polar caps. */
function mapZoomFor(l: Landmark): number {
  if (/Crater/.test(l.name)) return 8;
  if (/Planitia|Planum|Valles Marineris|Formation|Eridania|Mensae|Labyrinthus/.test(l.name)) return 5.5;
  return 6.5;
}

/**
 * Where the clear part of the map is (not under the planner, the route summary or the top
 * bar), in pixels from the map's centre, so a landmark lands where it can be seen and clicked.
 */
function clearAreaOffset(): { x: number; y: number } {
  const map = document.querySelector('.leaflet-container')?.getBoundingClientRect();
  if (!map) return { x: 0, y: 0 };
  const panel = document.querySelector('.mp-panel.is-open')?.getBoundingClientRect();
  const summary = document.querySelector('.mp-sum')?.getBoundingClientRect();
  const phone = window.innerWidth <= 640;
  let left = map.left;
  let top = map.top + 56;
  let bottom = map.bottom - 24;
  const right = map.right - 64;
  if (panel && !phone) left = Math.max(left, panel.right + 12);
  if (panel && phone) top = Math.max(top, panel.bottom + 12);
  if (summary) bottom = Math.min(bottom, summary.top - 12);
  if (bottom - top < 80 || right - left < 80) return { x: 0, y: 0 };
  // The pin stands above its point: aim the point a little below the middle
  return { x: (left + right) / 2 - (map.left + map.width / 2), y: (top + bottom) / 2 + 18 - (map.top + map.height / 2) };
}

/** The map is plate carrée (EPSG:4326 transform): 0.703125° per pixel at zoom 0, halving per level. */
const degreesPerPixel = (zoom: number) => 0.703125 / Math.pow(2, zoom);

export default function App() {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [introActive, setIntroActive] = useState(shouldPlayIntro);
  const [phase, setPhase] = useState<HomePhase>(() => (introActive ? 'intro' : 'home'));
  // The intro already shows the Mars reveal on the tablet; without it, the
  // globe plays the reveal full-screen.
  const [playReveal] = useState(!introActive);

  // globe → (hold) → zooming into Mars → map
  const [stage, setStage] = useState<Stage>('globe');
  const [globeReady, setGlobeReady] = useState(false);

  // Over the map, the landmark globe can be opened; both stay mounted once opened, so the
  // globe keeps its selection and the map keeps the whole Marswalk plan
  const [overlay, setOverlay] = useState<'explore' | 'dashboard' | null>(null);
  const exploring = overlay === 'explore';
  const [exploreMounted, setExploreMounted] = useState(false);
  const [dashboardMounted, setDashboardMounted] = useState(false);
  const [mapRevealStarted, setMapRevealStarted] = useState(false);
  // Each Explore on Mars Trek is a numbered request, so choosing the same landmark again flies again
  const [flyRequest, setFlyRequest] = useState<{ landmark: Landmark; n: number } | null>(null);
  const bridge = useMapBridge();
  const flown = useRef(0);

  const onHandoff = useCallback(() => setPhase((p) => (p === 'intro' ? 'handoff' : p)), []);
  const onComplete = useCallback(() => {
    setPhase('home');
    setIntroActive(false);
  }, []);
  const onGlobeRevealed = useCallback(() => setGlobeReady(true), []);

  // Watchdog: whatever happens inside the intro, the website appears. The intro normally
  // ends in about 2.6 s (plus loading, which it gives up on after 12 s).
  useEffect(() => {
    if (!introActive) return undefined;
    const timer = window.setTimeout(onComplete, INTRO_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [introActive, onComplete]);

  // Hold on the finished globe, then zoom into the map
  useEffect(() => {
    if (stage !== 'globe' || phase !== 'home' || !globeReady) return undefined;
    const timer = window.setTimeout(() => setStage('zooming'), GLOBE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [stage, phase, globeReady]);

  // Once the globe has dissolved, remove it so its WebGL rendering stops
  useEffect(() => {
    if (stage !== 'zooming') return undefined;
    const timer = window.setTimeout(() => setStage('map'), reducedMotion ? 450 : GLOBE_ZOOM_MS);
    return () => window.clearTimeout(timer);
  }, [stage, reducedMotion]);

  // Explore on Mars Trek: fly the map to the landmark (after the map's own reveal has begun)
  useEffect(() => {
    if (overlay || !flyRequest || !bridge || !mapRevealStarted || flown.current === flyRequest.n) return;
    flown.current = flyRequest.n;
    const c = landmarkCoordinate(flyRequest.landmark);
    const zoom = mapZoomFor(flyRequest.landmark);
    const { x, y } = clearAreaOffset();
    const d = degreesPerPixel(zoom);
    // Only the camera is offset; the landmark's marker stays at its stored coordinate
    const centre = { latitude: Math.max(-85, Math.min(85, c.latitude + y * d)), longitudeEast: c.longitudeEast - x * d };
    bridge.flyTo(centre, { zoom, durationSeconds: 2.4 });
  }, [overlay, flyRequest, bridge, mapRevealStarted]);

  const openExplore = () => {
    setExploreMounted(true);
    setOverlay('explore');
  };
  const openDashboard = () => {
    setDashboardMounted(true);
    setOverlay('dashboard');
  };

  return (
    <>
      {/* The map waits underneath, out of focus, loading while the globe is shown */}
      <MarsTrekSection load={phase !== 'intro'} revealed={stage !== 'globe'} onRevealStarted={() => setMapRevealStarted(true)} />
      {stage === 'map' && !overlay && <MapReturnBar visitedGlobe={exploreMounted} onOpenGlobe={openExplore} onOpenDashboard={openDashboard} />}
      {exploreMounted && (
        <Suspense fallback={null}>
          <ExplorePage
            active={exploring}
            onExploreOnMap={(l) => {
              setFlyRequest((r) => ({ landmark: l, n: (r?.n ?? 0) + 1 }));
              setOverlay(null);
            }}
            onOpenPlanner={() => setOverlay(null)}
            onOpenDashboard={openDashboard}
          />
        </Suspense>
      )}
      {dashboardMounted && (
        <Suspense fallback={null}>
          <DashboardPage active={overlay === 'dashboard'} onOpenMap={() => setOverlay(null)} onOpenExplore={openExplore} />
        </Suspense>
      )}
      {stage !== 'map' && (
        <HomePage
          phase={phase}
          playReveal={playReveal}
          reducedMotion={reducedMotion}
          zooming={stage === 'zooming'}
          onRevealed={onGlobeRevealed}
        />
      )}
      {introActive && (
        <IntroBoundary onError={onComplete}>
          <Suspense fallback={<div className="bt-intro-placeholder" />}>
            <AstronautIntro onHandoff={onHandoff} onComplete={onComplete} />
          </Suspense>
        </IntroBoundary>
      )}
    </>
  );
}
