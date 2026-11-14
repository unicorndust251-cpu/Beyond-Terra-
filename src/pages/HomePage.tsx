import { useEffect, useRef, type CSSProperties } from 'react';
import MarsBackdrop, { type BackdropMode } from '../components/MarsBackdrop';
import SiteHeader from '../components/SiteHeader';
import './HomePage.css';

export type HomePhase = 'intro' | 'handoff' | 'home';

interface Props {
  phase: HomePhase;
  reducedMotion: boolean;
}

const BACKDROP: Record<HomePhase, BackdropMode> = {
  intro: 'standby',
  handoff: 'hero',
  home: 'home',
};

const FEATURES = [
  {
    title: 'Layered NASA data',
    body: 'Orbital imagery, elevation and terrain from NASA Mars missions, stacked in one view you can peel back layer by layer.',
  },
  {
    title: 'Science destinations',
    body: 'Sites chosen for what they can tell us, with the context an explorer needs on arrival: geology, terrain and why it matters.',
  },
  {
    title: 'Marswalk routes',
    body: 'Routes planned against slope, distance and hazards, from the landing site to the science and safely back again.',
  },
];

/** Staggered entrance delay for one element. */
const delay = (d: string) => ({ '--d': d }) as CSSProperties;

export default function HomePage({ phase, reducedMotion }: Props) {
  const revealed = phase === 'home';
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // `inert` keeps keyboard focus out of the page while the intro covers it
    if (contentRef.current) contentRef.current.inert = !revealed;
  }, [revealed]);
  return (
    <div className={`bt-home${revealed ? ' is-revealed' : ''}${reducedMotion ? ' is-still' : ''}`}>
      <MarsBackdrop mode={BACKDROP[phase]} reducedMotion={reducedMotion} />

      {/* Hidden from assistive tech and keyboard while the intro covers it */}
      <div ref={contentRef} className="bt-home__content" aria-hidden={!revealed}>
        <SiteHeader />

        <main id="main">
          <section className="bt-hero" aria-labelledby="hero-title">
            <div className="bt-hero__text">
              <p className="bt-eyebrow bt-rise" style={delay('0.25s')}>
                NASA mission data · Mars surface planning
              </p>
              <h1 id="hero-title" className="bt-hero__title bt-rise" style={delay('0.35s')}>
                Plan the first walks on&nbsp;Mars.
              </h1>
              <p className="bt-hero__lede bt-rise" style={delay('0.48s')}>
                Beyond Terra brings decades of NASA Mars exploration into one layered map, so a future crew can choose
                a destination, plan a safe route and know what to study along the way.
              </p>
              <div className="bt-hero__actions bt-rise" style={delay('0.6s')}>
                <a className="bt-button bt-button--primary" href="#/explore">
                  Explore Mars
                  <span aria-hidden="true">→</span>
                </a>
                <a className="bt-button bt-button--ghost" href="#about">
                  How it works
                </a>
              </div>
            </div>
          </section>

          <section id="about" className="bt-about" aria-labelledby="about-title">
            <div className="bt-about__inner">
              <h2 id="about-title" className="bt-about__title">
                What Beyond Terra is building
              </h2>
              <p className="bt-about__intro">
                The first astronauts on Mars will want the best map possible. Beyond Terra is designed to give them one
                integrated view of a location or route, built from data gathered by NASA science missions.
              </p>
              <ul className="bt-cards">
                {FEATURES.map((f) => (
                  <li key={f.title} className="bt-card">
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>

        <footer className="bt-footer">
          <p>
            Beyond Terra is a concept project for a NASA Mars exploration challenge. It is not an official NASA product.
            The opening sequence imagines a possible future and does not show existing NASA hardware.
          </p>
          <p className="bt-footer__credits">
            Globe imagery: Solar System Scope (CC BY 4.0), based on NASA data; relief from MOLA elevation data
            (NASA/GSFC). Typeface: Exo 2 (SIL Open Font License).
          </p>
        </footer>
      </div>
    </div>
  );
}
