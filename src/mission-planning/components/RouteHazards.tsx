import {
  patchHazardState,
  removeMissionHazardNote,
  requestHazardFocus,
  useMissionHazardNotes,
  useRouteHazardReport,
} from '../../shared';
import { formatKm } from '../geo';

/**
 * The route's hazard findings, read from the shared report the hazards module writes.
 * The planner does no hazard calculation itself and works unchanged without the report.
 */
export default function RouteHazards() {
  const report = useRouteHazardReport();
  const notes = useMissionHazardNotes();

  return (
    <section className="mp-hz" aria-label="Mapped hazards on this route">
      <h3 className="mp-hz__title">Mapped hazards on this route</h3>
      {!report ? (
        <p className="mp-hz__muted">Hazard layers are not loaded, so the route has not been tested.</p>
      ) : report.status === 'checking' ? (
        <p className="mp-hz__muted" role="status">
          Testing the route against the mapped layers…
        </p>
      ) : (
        <>
          {report.hits.length ? (
            <ol className="mp-hz__hits">
              {report.hits.map((h) => (
                <li key={h.id} className="mp-hz__hit">
                  <span className="mp-hz__dot" style={{ background: h.colour }} aria-hidden="true" />
                  <div>
                    <p className="mp-hz__name">{h.title}</p>
                    <p className="mp-data">
                      {h.segmentLabel} ·{' '}
                      {h.fromKm === h.toKm ? `at ~${formatKm(h.fromKm)}` : `~${formatKm(h.fromKm)} to ${formatKm(h.toKm)}`} from the start
                    </p>
                    <p className="mp-hz__detail">{h.detail}</p>
                  </div>
                  <button type="button" className="mp-btn mp-btn--small" onClick={() => requestHazardFocus(h.at)}>
                    Show on map
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>The route line does not meet any mapped trough line or steep-slope cell.</p>
          )}

          {report.slope && (
            <p className="mp-data mp-hz__slope">
              Slope cells under the line (≥ {report.slope.thresholdDeg}° counts as steep): {formatKm(report.slope.steepKm)} steep ·{' '}
              {formatKm(report.slope.belowKm)} below · {formatKm(report.slope.unavailableKm)} no data
            </p>
          )}

          <p className="mp-hz__callout">
            {report.alternative.message} Routing needs walking-scale terrain data that this project does not have, so no detour is
            proposed.
          </p>

          {report.nearbyObservations.length > 0 && (
            <div className="mp-hz__block">
              <p className="mp-hz__label">NASA observations near the line (centres within 10 km; extents not mapped)</p>
              <ul className="mp-hz__plain">
                {report.nearbyObservations.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="mp-link"
                      onClick={() => patchHazardState({ view: 'hazards', selection: { kind: 'observation', id: o.id } })}
                    >
                      {o.id} · {o.title}
                    </button>{' '}
                    <span className="mp-data">{o.distanceKm.toFixed(1)} km</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="mp-hz__checks">
            <summary>What was and was not tested</summary>
            <ul className="mp-hz__plain">
              {report.checks.map((c) => (
                <li key={c.code}>
                  <span className="mp-hz__dot mp-hz__dot--sm" style={{ background: c.colour }} aria-hidden="true" />{' '}
                  <strong>{c.name}</strong>: {c.state === 'checked' ? 'Tested' : c.state === 'unavailable' ? 'Unavailable' : c.state === 'excluded' ? 'Excluded by you' : 'Not tested'}. {c.note}
                </li>
              ))}
            </ul>
          </details>
          <p className="mp-hz__muted">
            A route that meets no mapped hazard is not shown to be safe: most categories have no mapped extent, and nothing here
            is assessed at walking scale.
          </p>
        </>
      )}

      {notes.length > 0 && (
        <div className="mp-hz__block">
          <p className="mp-hz__label">Hazard records saved to this mission</p>
          <ul className="mp-hz__plain">
            {notes.map((n) => (
              <li key={n.id} className="mp-hz__note">
                {n.title}
                <span className="mp-hz__muted"> · {n.status}</span>
                <button type="button" className="mp-link" onClick={() => removeMissionHazardNote(n.id)} aria-label={`Remove ${n.title} from the mission`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
