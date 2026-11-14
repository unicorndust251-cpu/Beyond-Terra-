import type { MarsCoordinate, MarsMapBridge } from '../../shared';
import { buildPath, nearestAlong, nextStopIndex, pathSignature, pointAt, type PathStop, type RoutePath } from './path';
import type { AstronautView, FigureResult } from './astronautView';

/**
 * Drives the route preview: one animation loop, the astronaut's position by distance along
 * the drawn route, its heading, gait, checkpoints and the follow camera. Not a simulation:
 * playback is an illustrative, accelerated walk along a line drawn on a flat map.
 */

export type PlayState = 'preview' | 'playing' | 'paused' | 'arrived';

export const PLAYBACK_RATES = [60, 300, 1200, 3600, 14400];
/** Only at whole-planet zoom is the figure swapped for a small marker. */
export const DETAIL_MIN_ZOOM = 4;
/** Zoom the camera moves to when the walk starts or the astronaut is focused. */
const WALK_ZOOM = 13;
const FLY_S = 1.6;

export interface ExplorationSnapshot {
  loading: boolean;
  loadProgress: number | null;
  figureDescription: string | null;
  placeholder: boolean;
  modelIssue: string | null;
  error: string | null;
  play: PlayState;
  /** The route changed while exploring: paused until the visitor decides. */
  routeChanged: boolean;
  revisedRouteUsable: boolean;
  travelledM: number;
  lengthM: number;
  nextStop: PathStop | null;
  /** The stop just reached (shown and highlighted). */
  reached: PathStop | null;
  pausedAtCheckpoint: boolean;
  rate: number;
  follow: boolean;
  pauseAtCheckpoints: boolean;
  zoomedOut: boolean;
  /** How much larger than life the figure is drawn, or null when not shown. */
  displayScale: number | null;
  orbitStep: number;
  hasPath: boolean;
}

/** Canvas size (CSS px), where the feet are in it, and how tall the 1.88 m figure is drawn. */
export const VIEW_SIZE: [number, number] = [96, 120];
export const FEET_AT: [number, number] = [48, 108];
export const FIGURE_PX = 86;
const SUITED_HEIGHT_M = 1.88;

const DEG = Math.PI / 180;
const MARS_R_M = 3_389_500;
const STRIDE_M = 1.0; // one gait cycle, two suited steps (illustrative)
const ACCEL_S = 1.0;
const DECEL_S = 1.4;

const ease = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class ExplorationEngine {
  private view: AstronautView | null = null;
  private host: HTMLDivElement;
  private handle: ReturnType<MarsMapBridge['addElement']> | null = null;
  private path: RoutePath | null = null;
  private pendingPath: RoutePath | null = null;
  private signature = '';
  private d = 0;
  private heading = 0;
  private walk = 0;
  private playTime = 0;
  private raf = 0;
  private idleTimer = 0;
  /** Follow panning waits until this time, so it never cuts a camera flight short. */
  private flightUntil = 0;
  /** Whether the planner's latest route can be explored (complete and calculated). */
  private usable = false;
  private last = 0;
  private listeners = new Set<() => void>();
  private snapshotAt = 0;
  private unsubs: Array<() => void> = [];
  private speedMs = 2 / 3.6;
  private reducedMotion = false;
  private disposed = false;
  snapshot: ExplorationSnapshot = {
    loading: true,
    loadProgress: null,
    figureDescription: null,
    placeholder: true,
    modelIssue: null,
    error: null,
    play: 'preview',
    routeChanged: false,
    revisedRouteUsable: false,
    travelledM: 0,
    lengthM: 0,
    nextStop: null,
    reached: null,
    pausedAtCheckpoint: false,
    rate: 300,
    follow: false,
    pauseAtCheckpoints: false,
    zoomedOut: false,
    displayScale: null,
    orbitStep: 0,
    hasPath: false,
  };

  constructor(
    private readonly bridge: MarsMapBridge,
    private readonly onHighlight: (stopKey: string | null) => void,
    /**
     * Where the clear part of the map is, in pixels from the map's centre (the planner and
     * route summary cover the rest). The camera puts the astronaut there.
     */
    private readonly clearAreaOffset: () => { x: number; y: number } = () => ({ x: 0, y: 0 }),
  ) {
    this.host = document.createElement('div');
    this.host.className = 'mp-astro';
    this.host.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('span');
    dot.className = 'mp-astro__dot';
    this.host.appendChild(dot);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!media?.matches;
    this.unsubs.push(this.bridge.onViewChange(() => this.onView()));
    this.unsubs.push(this.bridge.onUserPan(() => this.snapshot.follow && this.set({ follow: false })));
    const onVis = () => this.kick();
    document.addEventListener('visibilitychange', onVis);
    this.unsubs.push(() => document.removeEventListener('visibilitychange', onVis));
    void this.load();
  }

  private async load() {
    try {
      const mod = await import('./astronautView');
      const result: FigureResult = await mod.loadFigure((f) => this.set({ loadProgress: f }));
      if (this.disposed) {
        result.figure.dispose();
        return;
      }
      this.view = new mod.AstronautView(result.figure);
      this.host.appendChild(this.view.canvas);
      this.set({
        loading: false,
        loadProgress: null,
        figureDescription: result.figure.description,
        placeholder: result.figure.kind === 'placeholder',
        modelIssue: result.modelIssue ?? null,
      });
      this.place();
      this.kick();
    } catch (e) {
      this.set({ loading: false, error: `The astronaut could not be shown: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<ExplorationSnapshot>, force = true) {
    this.snapshot = { ...this.snapshot, ...patch };
    const now = performance.now();
    // Progress figures update a few times a second; state changes at once
    if (force || now - this.snapshotAt > 150) {
      this.snapshotAt = now;
      this.listeners.forEach((l) => l());
    }
  }

  /* ------------------------------------------------------------- route */

  /** The planner's stops (with locations) and whether the route is calculated. */
  setRoute(stops: PathStop[], calculated: boolean, speedKmh: number) {
    this.speedMs = Math.max(0.01, speedKmh / 3.6);
    const sig = pathSignature(stops) + calculated;
    if (sig === this.signature) return;
    this.signature = sig;
    const next = stops.length ? buildPath(stops) : null;
    const usable = !!next && stops.length >= 2 && calculated;
    this.usable = usable;
    const exploring = this.snapshot.play === 'playing' || this.snapshot.play === 'paused';

    if (!next) {
      // No start any more (route cleared): nothing to stand on
      this.path = null;
      this.pendingPath = null;
      this.d = 0;
      this.removeMarker();
      this.onHighlight(null);
      this.set({ play: 'preview', routeChanged: false, hasPath: false, travelledM: 0, lengthM: 0, nextStop: null, reached: null, pausedAtCheckpoint: false });
      return;
    }
    if (exploring && this.path && pathSignature(this.path.stops) !== pathSignature(stops)) {
      // Never swap the active path silently: pause and ask
      this.pendingPath = next;
      this.set({ play: 'paused', routeChanged: true, revisedRouteUsable: usable });
      return;
    }
    if (exploring && this.path) {
      // Same stops, only the calculation status changed
      this.set({ revisedRouteUsable: usable, hasPath: usable });
      return;
    }
    this.path = next;
    this.pendingPath = null;
    this.toStart();
    this.set({ hasPath: usable, routeChanged: false });
  }

  private toStart() {
    if (!this.path) return;
    this.d = 0;
    this.walk = 0;
    this.playTime = 0;
    this.heading = this.targetHeading(0) ?? this.heading;
    this.onHighlight(null);
    this.set({ play: 'preview', travelledM: 0, lengthM: this.path.lengthM, nextStop: this.path.stops[1] ?? null, reached: null, pausedAtCheckpoint: false });
    this.place();
    this.kick();
  }

  /* ---------------------------------------------------------- controls */

  start() {
    if (!this.path || !this.snapshot.hasPath) return;
    if (this.snapshot.play === 'arrived' || this.d > 0) this.toStart();
    this.view?.setOrbit(0);
    this.playTime = 0;
    // Bring the camera to the astronaut and follow it, so the walk is in view
    this.flyToAstronaut();
    this.set({ play: 'playing', orbitStep: 0, reached: null, pausedAtCheckpoint: false, follow: true });
    this.kick();
  }

  private flyToAstronaut() {
    if (!this.path) return;
    const view = this.bridge.getView();
    const zoom = Math.max(view.zoom, WALK_ZOOM);
    const here = pointAt(this.path, this.d);
    // Scale halves with each zoom level
    const mpp = this.metresPerPixel(here) * Math.pow(2, view.zoom - zoom);
    this.bridge.flyTo(this.centreFor(here, mpp), { zoom, durationSeconds: FLY_S });
    this.flightUntil = performance.now() + FLY_S * 1000 + 100;
  }

  /** The map centre that puts `c` in the clear part of the map (plate carrée: equal x/y scale). */
  private centreFor(c: MarsCoordinate, mpp: number): MarsCoordinate {
    const { x, y } = this.clearAreaOffset();
    const degPerPx = mpp / (DEG * MARS_R_M);
    return {
      latitude: Math.max(-89, Math.min(89, c.latitude + y * degPerPx)),
      longitudeEast: c.longitudeEast - x * degPerPx,
    };
  }

  pause() {
    if (this.snapshot.play === 'playing') this.set({ play: 'paused' });
  }

  resume() {
    if (this.snapshot.play !== 'paused' || this.snapshot.routeChanged) return;
    this.playTime = 0;
    this.set({ play: 'playing', pausedAtCheckpoint: false });
    this.kick();
  }

  reset() {
    if (this.pendingPath) this.path = this.pendingPath;
    this.pendingPath = null;
    this.set({ routeChanged: false, hasPath: this.usable });
    this.toStart();
  }

  /** After a route change: start again from the revised route's START. */
  restartOnRevised() {
    if (!this.pendingPath) return;
    this.path = this.pendingPath;
    this.pendingPath = null;
    this.set({ routeChanged: false, hasPath: this.snapshot.revisedRouteUsable });
    this.toStart();
    this.start();
  }

  /** After a route change: carry on from the nearest point of the revised route. */
  continueOnRevised() {
    if (!this.pendingPath || !this.path || !this.snapshot.revisedRouteUsable) return;
    const here = pointAt(this.path, this.d);
    this.path = this.pendingPath;
    this.pendingPath = null;
    this.d = nearestAlong(this.path, here);
    this.onHighlight(null);
    this.set({ routeChanged: false, hasPath: true, lengthM: this.path.lengthM, reached: null });
    this.place();
    this.resume();
  }

  setRate(rate: number) {
    this.set({ rate });
  }

  setFollow(follow: boolean) {
    this.set({ follow });
    if (follow) this.focus();
  }

  setPauseAtCheckpoints(v: boolean) {
    this.set({ pauseAtCheckpoints: v });
  }

  focus() {
    this.flyToAstronaut();
  }

  /** Inspection angle in 45° steps (only while standing). */
  rotateView(step: number) {
    if (this.snapshot.play === 'playing') return;
    const orbitStep = step === 0 ? 0 : (this.snapshot.orbitStep + step + 8) % 8;
    this.view?.setOrbit(((orbitStep > 4 ? orbitStep - 8 : orbitStep) * Math.PI) / 4);
    this.set({ orbitStep });
    this.kick();
  }

  /* -------------------------------------------------------------- frame */

  private metresPerPixel(at: MarsCoordinate): number {
    const a = this.bridge.project(at);
    const b = this.bridge.project({ latitude: Math.min(89.9, at.latitude + 0.01), longitudeEast: at.longitudeEast });
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    return px > 0 ? (0.01 * DEG * MARS_R_M) / px : Infinity;
  }

  /** Screen direction of the path ahead (clockwise from up), or null at the very end. */
  private targetHeading(at: number): number | null {
    if (!this.path || this.path.lengthM <= 0) return null;
    const here = pointAt(this.path, at);
    const look = Math.max(1, Math.min(40, this.metresPerPixel(here) * 10));
    const from = at >= this.path.lengthM - 1e-3 ? Math.max(0, at - look) : at;
    const to = Math.min(this.path.lengthM, from + look);
    if (to - from < 1e-6) return null;
    const a = this.bridge.project(pointAt(this.path, from));
    const b = this.bridge.project(pointAt(this.path, to));
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return null;
    return Math.atan2(b.x - a.x, -(b.y - a.y));
  }

  private onView() {
    if (!this.path) return;
    const here = pointAt(this.path, this.d);
    const zoomedOut = this.bridge.getView().zoom < DETAIL_MIN_ZOOM;
    const mpp = this.metresPerPixel(here);
    this.host.classList.toggle('is-zoomed-out', zoomedOut);
    this.set({ zoomedOut, displayScale: zoomedOut || !Number.isFinite(mpp) ? null : FIGURE_PX / (SUITED_HEIGHT_M / mpp) }, false);
    this.kick();
  }

  private place() {
    if (!this.path) return;
    const at = pointAt(this.path, this.d);
    if (!this.handle) {
      this.handle = this.bridge.addElement('mp:astronaut', at, this.host, { size: VIEW_SIZE, anchor: FEET_AT, behindMarkers: true });
      this.onView();
    } else {
      this.handle.setPosition(at);
    }
  }

  private removeMarker() {
    this.handle?.remove();
    this.handle = null;
  }

  /** Starts the loop if anything needs drawing; never runs two loops. */
  private kick() {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
    if (this.raf || this.disposed || document.hidden) return;
    // dt is clamped in tick, so resuming after a quiet spell never jumps
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed || document.hidden) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const s = this.snapshot;
    const path = this.path;
    if (!path || !this.handle) return;

    let speedFactor = 0;
    if (s.play === 'playing') {
      this.playTime += dt;
      const v = this.speedMs * s.rate; // map metres per playback second
      const stopAtCheckpoint = s.pauseAtCheckpoints ? path.stopAt[nextStopIndex(path, this.d)] : path.lengthM;
      const remainingS = (Math.min(stopAtCheckpoint, path.lengthM) - this.d) / v;
      speedFactor = Math.min(ease(Math.min(1, this.playTime / ACCEL_S)), Math.max(0.12, Math.sqrt(Math.max(0, remainingS) / DECEL_S)), 1);
      const before = this.d;
      this.d = Math.min(path.lengthM, this.d + v * speedFactor * dt);
      this.crossings(before);
      if (s.follow && this.snapshot.play !== 'arrived' && now > this.flightUntil) {
        const mpp = this.metresPerPixel(pointAt(path, this.d));
        // Keep a little of the route ahead in view
        this.bridge.panTo(this.centreFor(pointAt(path, Math.min(path.lengthM, this.d + mpp * 60)), mpp), { animate: false });
      }
      this.handle.setPosition(pointAt(path, this.d));
      this.set({ travelledM: this.d, nextStop: path.stops[nextStopIndex(path, this.d)] ?? null }, false);
    }

    // Walk blends in with speed and out on pause or arrival; turns are eased
    const targetWalk = this.snapshot.play === 'playing' ? speedFactor : 0;
    this.walk += (targetWalk - this.walk) * Math.min(1, dt * (targetWalk > this.walk ? 3 : 4));
    if (this.walk < 0.005) this.walk = 0;
    const want = this.targetHeading(this.d);
    if (want !== null) this.heading += wrapAngle(want - this.heading) * Math.min(1, dt * 5);

    const here = pointAt(path, this.d);
    const mpp = this.metresPerPixel(here);
    const screenSpeed = (this.speedMs * s.rate * speedFactor) / mpp; // px per second
    const stridePx = STRIDE_M * (FIGURE_PX / SUITED_HEIGHT_M);
    const cadenceHz = this.walk > 0 ? Math.min(1.4, Math.max(0.45, screenSpeed / stridePx)) : 0;

    if (this.view && !s.zoomedOut) {
      this.view.setHeading(this.heading);
      this.view.render(dt, { walk: this.walk, cadenceHz, idleMotion: !this.reducedMotion });
    }

    const moving = this.snapshot.play === 'playing' || this.walk > 0 || !!this.view?.orbiting;
    // At rest: a slow loop for breathing only; nothing at all with reduced motion or zoomed out
    // Panning the map above fires view events that may already have queued the next frame
    // (through kick); never queue a second one, or loops would multiply
    if (this.raf) return;
    if (moving) this.raf = requestAnimationFrame(this.tick);
    else if (!this.reducedMotion && !s.zoomedOut && this.view && !this.idleTimer) this.idleTimer = window.setTimeout(() => this.kick(), 1000 / 15);
  };

  /** Checkpoints and the destination reached between `before` and the current distance. */
  private crossings(before: number) {
    const path = this.path!;
    for (let i = 1; i < path.stops.length; i++) {
      const at = path.stopAt[i];
      if (!(before < at && this.d >= at - 1e-6)) continue;
      const stop = path.stops[i];
      this.onHighlight(stop.key);
      if (i === path.stops.length - 1) {
        this.d = path.lengthM;
        this.set({ play: 'arrived', reached: stop, travelledM: this.d, nextStop: null, follow: this.snapshot.follow });
        return;
      }
      if (this.snapshot.pauseAtCheckpoints) {
        this.d = at;
        this.set({ play: 'paused', reached: stop, pausedAtCheckpoint: true, travelledM: this.d });
        return;
      }
      this.set({ reached: stop });
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.idleTimer);
    this.unsubs.forEach((u) => u());
    this.removeMarker();
    this.view?.dispose();
    this.view = null;
    this.listeners.clear();
  }
}
