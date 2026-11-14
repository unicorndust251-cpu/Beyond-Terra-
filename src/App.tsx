import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import HomePage, { type HomePhase } from './pages/HomePage';
import ExplorePage from './pages/ExplorePage';
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

type Route = 'home' | 'explore';

function readRoute(): Route {
  return window.location.hash.startsWith('#/explore') ? 'explore' : 'home';
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onChange = () => {
      const next = readRoute();
      setRoute((prev) => {
        if (prev !== next) window.scrollTo(0, 0);
        return next;
      });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const [reducedMotion] = useState(prefersReducedMotion);
  const [introActive, setIntroActive] = useState(shouldPlayIntro);
  const [phase, setPhase] = useState<HomePhase>(() => (introActive ? 'intro' : 'home'));

  const onHandoff = useCallback(() => setPhase((p) => (p === 'intro' ? 'handoff' : p)), []);
  const onComplete = useCallback(() => {
    setPhase('home');
    setIntroActive(false);
  }, []);

  return (
    <>
      {route === 'explore' ? <ExplorePage /> : <HomePage phase={phase} reducedMotion={reducedMotion} />}
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
