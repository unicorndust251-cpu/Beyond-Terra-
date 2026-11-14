import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import HomePage, { type HomePhase } from './pages/HomePage';
import MarsTrekSection from './components/MarsTrekSection';
import { prefersReducedMotion, shouldPlayIntro } from './intro/introGate';

// The intro is loaded separately, so the website itself never waits for it
const AstronautIntro = lazy(() => import('./intro/AstronautIntro'));

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
const GLOBE_HOLD_MS = 2500;
/** Length of the push into the planet (matches .bt-home.is-zooming in HomePage.css). */
const GLOBE_ZOOM_MS = 1700;

export default function App() {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [introActive, setIntroActive] = useState(shouldPlayIntro);
  const [phase, setPhase] = useState<HomePhase>(() => (introActive ? 'intro' : 'home'));
  // The intro already shows the four-second Mars reveal on the tablet; without it, the
  // globe plays the reveal full-screen.
  const [playReveal] = useState(!introActive);

  // globe → (hold) → zooming into Mars → map
  const [stage, setStage] = useState<Stage>('globe');
  const [globeReady, setGlobeReady] = useState(false);

  const onHandoff = useCallback(() => setPhase((p) => (p === 'intro' ? 'handoff' : p)), []);
  const onComplete = useCallback(() => {
    setPhase('home');
    setIntroActive(false);
  }, []);
  const onGlobeRevealed = useCallback(() => setGlobeReady(true), []);

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

  return (
    <>
      {/* The map waits underneath, out of focus, loading while the globe is shown */}
      <MarsTrekSection load={phase !== 'intro'} revealed={stage !== 'globe'} />
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
