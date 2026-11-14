import { TASKS } from '../data/science';
import { formatDuration, formatKm, locationName } from '../geo';
import type { MissionState } from '../model';
import { PLAYBACK_RATES, type ExplorationEngine, type ExplorationSnapshot } from './engine';

interface Props {
  engine: ExplorationEngine;
  x: ExplorationSnapshot;
  state: MissionState;
  /** The planner's own estimate, which playback never changes. */
  travelHours: number;
}

const rateLabel = (r: number) => {
  const perSecond = r / 60;
  return `×${r.toLocaleString()} (1 s ≈ ${perSecond >= 60 ? `${Math.round(perSecond / 60)} h` : `${Math.round(perSecond)} min`})`;
};

/** Start / Pause / Resume / Reset, playback speed, camera and progress for the route preview. */
export default function ExplorationPanel({ engine, x, state, travelHours }: Props) {
  const km = (m: number) => formatKm(m / 1000);
  const pct = x.lengthM > 0 ? Math.round((x.travelledM / x.lengthM) * 100) : 0;
  const reachedTasks = x.reached ? (state.tasks[x.reached.key] ?? []).map((t) => TASKS[t].name) : [];
  const standing = x.play !== 'playing';
  const stateLabel = x.routeChanged
    ? 'Paused: route changed'
    : { preview: 'Ready at START', playing: 'Walking', paused: x.pausedAtCheckpoint ? 'Paused at checkpoint' : 'Paused', arrived: 'Arrived' }[x.play];

  return (
    <section className="mp-xp" aria-label="Exploration preview">
      <div className="mp-xp__head">
        <h3>Exploration preview</h3>
        <span className={`mp-xp__state mp-xp__state--${x.play}`} role="status">
          {stateLabel}
        </span>
      </div>

      {x.loading && (
        <p className="mp-hint" role="status">
          Loading astronaut model{x.loadProgress !== null ? ` · ${Math.round(x.loadProgress * 100)}%` : '…'}
        </p>
      )}
      {x.error && <p className="mp-hint mp-hint--alert">{x.error}</p>}
      {!x.loading && !x.placeholder && x.figureDescription && <p className="mp-xp__credit">{x.figureDescription}. A 3D model, not real flight hardware.</p>}
      {!x.loading && x.placeholder && (
        <p className="mp-xp__badge" title={x.figureDescription ?? undefined}>
          Placeholder astronaut: procedural suit built in this project. No licensed rigged model is installed.
          {x.modelIssue && ` The rigged model could not be used: ${x.modelIssue}.`}
        </p>
      )}

      {x.routeChanged ? (
        <div className="mp-xp__notice" role="alert">
          <p>The route changed during the preview. The astronaut is paused where it was.</p>
          <div className="mp-xp__row">
            <button type="button" className="mp-btn mp-btn--small mp-btn--accent" disabled={!x.revisedRouteUsable} onClick={() => engine.restartOnRevised()}>
              Restart on revised route
            </button>
            <button type="button" className="mp-btn mp-btn--small" disabled={!x.revisedRouteUsable} onClick={() => engine.continueOnRevised()}>
              Continue on revised route
            </button>
          </div>
          {!x.revisedRouteUsable && <p className="mp-hint">Calculate the revised route first, or Reset.</p>}
        </div>
      ) : null}

      <div className="mp-xp__row">
        {x.play === 'playing' ? (
          <button type="button" className="mp-btn mp-btn--small mp-btn--accent" onClick={() => engine.pause()}>
            Pause
          </button>
        ) : x.play === 'paused' ? (
          <button type="button" className="mp-btn mp-btn--small mp-btn--accent" disabled={x.routeChanged} onClick={() => engine.resume()}>
            {x.pausedAtCheckpoint ? 'Continue' : 'Resume'}
          </button>
        ) : (
          <button
            type="button"
            className="mp-btn mp-btn--small mp-btn--accent"
            disabled={!x.hasPath || x.loading}
            title={x.hasPath ? undefined : 'Calculate a complete route first'}
            onClick={() => engine.start()}
          >
            {x.play === 'arrived' ? 'Start again' : 'Start Exploration'}
          </button>
        )}
        <button type="button" className="mp-btn mp-btn--small" disabled={x.play === 'preview' && !x.routeChanged} onClick={() => engine.reset()}>
          Reset
        </button>
        <button type="button" className="mp-btn mp-btn--small" onClick={() => engine.focus()}>
          Focus Astronaut
        </button>
      </div>
      {!x.hasPath && !x.routeChanged && <p className="mp-hint">Calculate a complete route to start the preview.</p>}

      <div className="mp-xp__settings">
        <label className="mp-xp__rate">
          <span>Playback speed</span>
          <select value={x.rate} onChange={(e) => engine.setRate(Number(e.target.value))}>
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>
                {rateLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="mp-check">
          <input type="checkbox" checked={x.follow} onChange={(e) => engine.setFollow(e.target.checked)} />
          <span>Follow Camera</span>
        </label>
        <label className="mp-check">
          <input type="checkbox" checked={x.pauseAtCheckpoints} onChange={(e) => engine.setPauseAtCheckpoints(e.target.checked)} />
          <span>Pause at Checkpoints</span>
        </label>
        <span className="mp-xp__orbit" role="group" aria-label="Inspect the astronaut from other angles">
          <span>View</span>
          <button type="button" className="mp-icon-btn" aria-label="Rotate view left" disabled={!standing || x.zoomedOut} onClick={() => engine.rotateView(-1)}>
            ‹
          </button>
          <button type="button" className="mp-icon-btn" aria-label="Map view" disabled={!standing || x.orbitStep === 0} onClick={() => engine.rotateView(0)}>
            ·
          </button>
          <button type="button" className="mp-icon-btn" aria-label="Rotate view right" disabled={!standing || x.zoomedOut} onClick={() => engine.rotateView(1)}>
            ›
          </button>
        </span>
      </div>

      {x.lengthM > 0 && (
        <>
          <div className="mp-xp__bar" role="progressbar" aria-label="Route progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <dl className="mp-xp__figures mp-num">
            <div>
              <dt>Progress</dt>
              <dd>{pct}%</dd>
            </div>
            <div>
              <dt>Travelled</dt>
              <dd>{km(x.travelledM)}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{km(Math.max(0, x.lengthM - x.travelledM))}</dd>
            </div>
            <div>
              <dt>Next</dt>
              <dd>{x.nextStop && x.play !== 'arrived' ? `${x.nextStop.label}` : '—'}</dd>
            </div>
          </dl>
        </>
      )}

      {x.reached && (
        <p className="mp-xp__reached" role="status">
          {x.play === 'arrived' ? (
            <strong>Exploration Preview Complete</strong>
          ) : (
            <>
              <strong>
                {x.reached.label} · {locationName(x.reached.name)}
              </strong>
              {reachedTasks.length > 0 && ` · Planned: ${reachedTasks.join(', ')}`}
            </>
          )}
        </p>
      )}

      <p className="mp-xp__scale">
        {x.zoomedOut
          ? 'Zoom in to view astronaut.'
          : x.displayScale !== null
            ? `Display scale ≈ ×${x.displayScale >= 10 ? Math.round(x.displayScale).toLocaleString() : x.displayScale.toFixed(1)}: drawn larger than life so it can be seen.`
            : ''}
      </p>
      <p className="mp-xp__note">
        Animation only, accelerated {rateLabel(x.rate).split(' ')[0]}: the planner's travel estimate ({formatDuration(travelHours)}) is unchanged.
        {state.travelMode === 'rover' && ' Travel mode is rover-assisted; the preview still shows a walking figure at that speed.'} An illustrative suited walk along
        the drawn line on a flat map: no terrain elevation, slopes or hazards are used, and playback does not show that the route is
        traversable or safe.
      </p>
    </section>
  );
}
