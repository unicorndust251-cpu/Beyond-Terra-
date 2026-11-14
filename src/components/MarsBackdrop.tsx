import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { gsap } from 'gsap';
import { getQuality, isWebGLAvailable, loadMarsImages, sharedSeconds } from '../three/assets';
import { heroLayout, homeLayout, lerpLayout, MarsHero } from '../three/marsHero';
import { createRenderer, renderPixelRatio, viewportSize } from '../three/renderSettings';
import './MarsBackdrop.css';

export type BackdropMode = 'standby' | 'hero' | 'home';

interface Props {
  /**
   * standby: built and warmed up, not animating (the intro is covering it)
   * hero:    rotating at the hero framing, exactly as the intro's full-screen view
   * home:    glides into the homepage composition
   */
  mode: BackdropMode;
  reducedMotion: boolean;
}

/**
 * The homepage's own rotating Mars. It uses the same scene as the intro, without the
 * title, and works on its own: the site never depends on the intro having played.
 */
export default function MarsBackdrop({ mode, reducedMotion }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const apiRef = useRef<{ setMode: (m: BackdropMode) => void } | null>(null);
  const [fallback, setFallback] = useState(() => !isWebGLAvailable());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (fallback) return;
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
    const pixelRatio = renderPixelRatio(quality);
    renderer.setPixelRatio(pixelRatio);

    let hero: MarsHero | null = null;
    let disposed = false;
    let looping = false;
    const layoutT = { value: modeRef.current === 'home' && reducedMotion ? 1 : 0 };
    // A still planet when the visitor prefers reduced motion
    const stillSeconds = 5.5;

    const applyLayout = () => {
      if (!hero) return;
      const { width, height } = viewportSize();
      hero.setLayout(lerpLayout(heroLayout(width, height), homeLayout(width, height), layoutT.value));
    };

    const draw = () => {
      if (!hero) return;
      // Covered by the content below the fold: no need to draw
      if (window.scrollY > window.innerHeight * 1.2 && modeRef.current === 'home') return;
      applyLayout();
      hero.render(reducedMotion ? stillSeconds : sharedSeconds());
      hero.present();
    };

    const setLooping = (on: boolean) => {
      if (on === looping) return;
      looping = on;
      if (on) gsap.ticker.add(draw);
      else gsap.ticker.remove(draw);
    };

    const setMode = (m: BackdropMode) => {
      modeRef.current = m;
      if (!hero) return;
      if (m === 'home') {
        if (reducedMotion) {
          layoutT.value = 1;
        } else {
          gsap.to(layoutT, { value: 1, duration: 1.8, ease: 'power3.inOut', overwrite: true });
        }
      } else {
        layoutT.value = 0;
      }
      // With reduced motion, draw on demand only
      setLooping(m !== 'standby' && !reducedMotion);
      if (reducedMotion || m === 'standby') draw();
    };
    apiRef.current = { setMode };

    const resize = () => {
      if (!hero) return;
      const { width, height } = viewportSize();
      renderer.setSize(width, height);
      hero.setSize(width, height, pixelRatio);
      draw();
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    window.addEventListener('resize', resize);

    loadMarsImages()
      .then((images) => {
        if (disposed) return;
        hero = new MarsHero(renderer, images, { title: false, quality });
        resize();
        setMode(modeRef.current);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFallback(true);
      });

    return () => {
      disposed = true;
      apiRef.current = null;
      setLooping(false);
      gsap.killTweensOf(layoutT);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      hero?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [fallback, reducedMotion]);

  useEffect(() => {
    modeRef.current = mode;
    apiRef.current?.setMode(mode);
  }, [mode]);

  return (
    <div
      ref={hostRef}
      className={`bt-backdrop${ready ? ' is-ready' : ''}${fallback ? ' is-fallback' : ''}${mode === 'home' ? ' is-home' : ''}`}
      aria-hidden="true"
    >
      {fallback && <div className="bt-backdrop__planet" />}
    </div>
  );
}
