import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { gsap } from 'gsap';
import {
  getQuality,
  isWebGLAvailable,
  loadMarsImages,
  loadTitleFont,
  onLargeMarsColor,
  sharedSeconds,
} from '../three/assets';
import { addHeroReveal, hiddenReveal, REVEAL_SETTLED_AT } from '../three/heroReveal';
import { heroLayout, MarsHero, REVEAL_COMPLETE } from '../three/marsHero';
import { createRenderer, renderPixelRatio, viewportSize } from '../three/renderSettings';
import './MarsBackdrop.css';

interface Props {
  /**
   * false: built and warmed up, but not animating (the intro is covering it).
   * true:  rotating continuously at the hero framing.
   */
  live: boolean;
  /** Play the four-second reveal when it goes live (a visit without the astronaut intro). */
  playReveal: boolean;
  reducedMotion: boolean;
  /** The final composition is in place: the credit line may appear. */
  onRevealed: () => void;
}

/**
 * The homepage's rotating Mars with the BEYOND TERRA title: the same scene the intro shows
 * on the tablet, at the same framing, rotation and lighting. It works on its own, so the
 * site never depends on the intro having played.
 */
export default function MarsBackdrop({ live, playReveal, reducedMotion, onRevealed }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(live);
  const playRevealRef = useRef(playReveal);
  const revealedRef = useRef(onRevealed);
  revealedRef.current = onRevealed;
  const apiRef = useRef<{ setLive: (on: boolean) => void } | null>(null);
  const [fallback, setFallback] = useState(() => !isWebGLAvailable());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (fallback) {
      revealedRef.current();
      return;
    }
    const host = hostRef.current!;
    const canvas = document.createElement('canvas');
    canvas.className = 'bt-backdrop__canvas';
    host.appendChild(canvas);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createRenderer(canvas);
    } catch {
      canvas.remove();
      setFallback(true);
      return;
    }
    const quality = getQuality();
    const pixelRatio = renderPixelRatio();
    renderer.setPixelRatio(pixelRatio);

    let hero: MarsHero | null = null;
    let disposed = false;
    let looping = false;
    let revealTl: gsap.core.Timeline | null = null;
    let revealed = false;
    let stopUpgrade = () => {};
    // A still planet when the visitor prefers reduced motion
    const stillSeconds = 8;

    const markRevealed = () => {
      if (revealed) return;
      revealed = true;
      revealedRef.current();
    };

    const draw = () => {
      if (!hero) return;
      hero.render(reducedMotion ? stillSeconds : sharedSeconds());
      hero.present();
    };

    const setLooping = (on: boolean) => {
      if (on === looping) return;
      looping = on;
      if (on) gsap.ticker.add(draw);
      else gsap.ticker.remove(draw);
    };

    const setLive = (on: boolean) => {
      liveRef.current = on;
      if (!hero) return;
      if (on && !revealed) {
        if (playRevealRef.current && !reducedMotion) {
          Object.assign(hero.reveal, hiddenReveal());
          revealTl = addHeroReveal(gsap.timeline(), hero.reveal);
          revealTl.call(markRevealed, undefined, REVEAL_SETTLED_AT);
        } else {
          Object.assign(hero.reveal, REVEAL_COMPLETE);
          markRevealed();
        }
      }
      // With reduced motion, draw on demand only
      setLooping(on && !reducedMotion);
      draw();
    };
    apiRef.current = { setLive };

    const resize = () => {
      if (!hero) return;
      const { width, height } = viewportSize();
      renderer.setSize(width, height);
      hero.setSize(width, height, pixelRatio);
      hero.setLayout(heroLayout(width, height));
      draw();
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    window.addEventListener('resize', resize);

    Promise.all([loadMarsImages(), loadTitleFont()])
      .then(([images]) => {
        if (disposed) return;
        hero = new MarsHero(renderer, images, { title: true, quality });
        resize();
        setLive(liveRef.current);
        setReady(true);
        stopUpgrade = onLargeMarsColor((image) => {
          hero?.setColorImage(image);
          draw();
        });
      })
      .catch(() => {
        if (!disposed) setFallback(true);
      });

    return () => {
      disposed = true;
      stopUpgrade();
      apiRef.current = null;
      setLooping(false);
      revealTl?.kill();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      hero?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [fallback, reducedMotion]);

  useEffect(() => {
    liveRef.current = live;
    apiRef.current?.setLive(live);
  }, [live]);

  return (
    <div
      ref={hostRef}
      className={`bt-backdrop${ready ? ' is-ready' : ''}${fallback ? ' is-fallback' : ''}`}
      aria-hidden="true"
    >
      {fallback && (
        <>
          <div className="bt-backdrop__planet" />
          <p className="bt-backdrop__title">Beyond Terra</p>
        </>
      )}
    </div>
  );
}
