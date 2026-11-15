import { useCallback, useEffect, useRef, useState } from 'react';
import MarsBackdrop from '../components/MarsBackdrop';
import './HomePage.css';

/** intro: the astronaut intro covers the page; handoff: it is dissolving away; home: gone. */
export type HomePhase = 'intro' | 'handoff' | 'home';

interface Props {
  phase: HomePhase;
  /** Play the Mars reveal (a visit that did not come through the intro). */
  playReveal: boolean;
  reducedMotion: boolean;
  /** Push into the planet and dissolve, revealing the map underneath. */
  zooming: boolean;
  /** The final composition (planet and title) is in place. */
  onRevealed: () => void;
}

/** The rotating Mars with BEYOND TERRA across it, above the map it zooms into. */
export default function HomePage({ phase, playReveal, reducedMotion, zooming, onRevealed: notifyRevealed }: Props) {
  const [revealed, setRevealed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const interactive = phase === 'home';

  useEffect(() => {
    // `inert` keeps keyboard focus out of the page while the intro covers it
    if (contentRef.current) contentRef.current.inert = !interactive;
  }, [interactive]);

  const onRevealed = useCallback(() => {
    setRevealed(true);
    notifyRevealed();
  }, [notifyRevealed]);

  const classes = ['bt-home'];
  if (revealed) classes.push('is-revealed');
  if (reducedMotion || !playReveal) classes.push('is-quick');
  if (reducedMotion) classes.push('is-reduced');
  if (zooming) classes.push('is-zooming');

  return (
    <div className={classes.join(' ')}>
      <MarsBackdrop
        live={phase !== 'intro'}
        playReveal={playReveal}
        reducedMotion={reducedMotion}
        onRevealed={onRevealed}
      />

      {/* Hidden from assistive tech and keyboard while the intro covers it */}
      <div ref={contentRef} className="bt-home__content" aria-hidden={!interactive}>
        <main id="main">
          {/* The title itself is drawn in the 3D scene, in front of the planet */}
          <h1 className="sr-only">Beyond Terra</h1>
          <p className="sr-only">
            An interactive Mars exploration and mission-planning platform built on NASA mission data.
          </p>
        </main>
      </div>
    </div>
  );
}
