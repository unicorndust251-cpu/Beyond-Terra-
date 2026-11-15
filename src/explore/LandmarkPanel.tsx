import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  COORDINATE_CONVENTION,
  formatLandmarkCoordinates,
  GENERAL_SOURCES,
  HAZARD_FRAMING,
  landmarkHazards,
  LANDMARKS,
  NO_CALCULATED_ALTERNATIVE,
  type Landmark,
  type LandmarkSource,
} from '../shared/landmarks';
import LandmarkThumb, { THUMB_CREDIT } from './LandmarkThumb';
import { useUiMode } from '../shared';

interface Props {
  landmark: Landmark;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onExploreOnMap: (landmark: Landmark) => void;
  /** Go to the map with this landmark selected for the mission plan. */
  onPlanHere?: (landmark: Landmark) => void;
}

/**
 * Cautions quoted from Reference A's scope statement. Shown where they apply to the card's
 * own text, not as generic filler.
 */
const CAUTIONS: Array<{ when: RegExp; text: string }> = [
  { when: /./, text: 'Approximate centres are for finding features, not navigation precision.' },
  { when: /./, text: 'A regional marker is not a local sampling site.' },
  { when: /habitab/i, text: 'Habitability does not mean life has been found.' },
  { when: /mineral|clay|carbonate|sulfate|silica|ice|water/i, text: 'Mineral evidence does not mean usable water.' },
];

/** Sentences or clauses in the card's own text that state uncertainty or competing ideas. */
function qualifiers(l: Landmark): string[] {
  const text = [l.importance, l.investigation, l.terrain].join(' ');
  const parts = text.split(/(?<=[.;])\s+/);
  return parts.filter((p) => /uncertaint|without assuming|qualified|competing|proposed|debated|interpret|require additional evidence|may differ|not every/i.test(p));
}

function SourceLink({ s }: { s: LandmarkSource }) {
  return (
    <li>
      <a href={s.url} target="_blank" rel="noreferrer noopener">
        {s.label}
      </a>
      <span className="ex-src__pub"> · {s.publisher}</span>
    </li>
  );
}

function Section({ id, title, children, defaultOpen = false }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="ex-sec" open={defaultOpen} id={id}>
      <summary>{title}</summary>
      <div className="ex-sec__body">{children}</div>
    </details>
  );
}

/** Preview card, then the full Scientific Importance panel, for one landmark. */
export default function LandmarkPanel({ landmark: l, expanded, onExpand, onSelect, onClose, onExploreOnMap, onPlanHere }: Props) {
  const simple = useUiMode() === 'simple';
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const i = LANDMARKS.findIndex((x) => x.id === l.id);
  const prev = LANDMARKS[(i + LANDMARKS.length - 1) % LANDMARKS.length];
  const next = LANDMARKS[(i + 1) % LANDMARKS.length];
  const coords = formatLandmarkCoordinates(l);
  const q = qualifiers(l);
  const hazards = landmarkHazards(l);
  const cautions = CAUTIONS.filter((c) => c.when.test(`${l.importance} ${l.investigation} ${l.terrain}`));

  useEffect(() => {
    setCopied(false);
  }, [l.id]);

  // Keep keyboard users in the panel when it expands
  useEffect(() => {
    if (expanded) heading.current?.focus();
  }, [expanded, l.id]);

  const copy = async () => {
    const text = `${l.name}: ${coords} (latitude ${l.latitude}, east longitude ${l.longitudeEast360}; ${COORDINATE_CONVENTION})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      window.prompt('Copy the coordinates:', text);
    }
  };

  return (
    <article className={`ex-panel${expanded ? ' is-expanded' : ''}`} aria-labelledby="ex-panel-title">
      <header className="ex-panel__head">
        <div>
          <p className="ex-panel__cat">
            {String(l.n).padStart(2, '0')} · {l.category}
          </p>
          <h2 id="ex-panel-title" ref={heading} tabIndex={-1}>
            {l.name}
          </h2>
          {(!simple || expanded) && (
            <p className="ex-panel__coords">
              {coords}
              <button type="button" className="ex-link" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </p>
            )}
        </div>
        <button type="button" className="ex-icon" aria-label="Close landmark" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="ex-panel__scroll">
        {!expanded && <LandmarkThumb landmark={l} />}
        {!expanded && (
          <>
            <p className="ex-panel__summary">
              <span className="ex-panel__k">What it is</span>
              {l.terrain}
            </p>
            <p className="ex-panel__summary">
              <span className="ex-panel__k">Why scientists study it</span>
              {l.importance}
            </p>
          </>
        )}
        {l.qualification && (
          <p className="ex-panel__qual">
            <strong>About this coordinate:</strong> {l.qualification}
          </p>
        )}

        {expanded && (
          <div className="ex-secs">
            <Section id="ex-why" title="A · Why scientists care" defaultOpen>
              <p>{l.importance}</p>
              <p className="ex-note">Scientific significance as summarised in the reference; interpretations are not settled facts.</p>
            </Section>
            <Section id="ex-evidence" title="B · Scientific evidence" defaultOpen>
              <h4>Observed or mapped (regional context)</h4>
              <p>{l.terrain}</p>
              <p className="ex-note">Regional context: a particular mapped location may differ.</p>
              <h4>Sources for this landmark</h4>
              {l.claimSources.length ? (
                <ul className="ex-src">
                  {l.claimSources.map((s) => (
                    <SourceLink key={s.url} s={s} />
                  ))}
                </ul>
              ) : (
                <p className="ex-note">The reference does not yet attach a claim-specific source to this landmark.</p>
              )}
            </Section>
            <Section id="ex-investigate" title="C · What could be investigated?" defaultOpen>
              <p>{l.investigation}</p>
              <p className="ex-note">A proposed investigation, not a completed one.</p>
            </Section>
            <Section id="ex-open" title="D · Unanswered questions and limits">
              {l.qualification || q.length ? (
                <ul className="ex-list">
                  {l.qualification && <li>{l.qualification}</li>}
                  {q.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="ex-note">The reference lists no open questions specific to this landmark.</p>
              )}
              <h4>Cautions from the reference</h4>
              <ul className="ex-list">
                {cautions.map((c) => (
                  <li key={c.text}>{c.text}</li>
                ))}
              </ul>
            </Section>
            <Section id="ex-hazards" title="E · Possible mission hazards">
              {hazards ? (
                <>
                  <p>{hazards.concerns}</p>
                  <p className="ex-note">{HAZARD_FRAMING}</p>
                </>
              ) : (
                <p className="ex-note">No hazard concerns are recorded for this landmark.</p>
              )}
            </Section>
            <Section id="ex-response" title="F · Proposed response">
              {hazards ? (
                <>
                  <p>{hazards.response}</p>
                  <p className="ex-note">A planning proposal: reconnaissance, a different approach, remote observation, another target or postponement. Not an approved astronaut procedure.</p>
                </>
              ) : (
                <p className="ex-note">No proposed response is recorded for this landmark.</p>
              )}
            </Section>
            <Section id="ex-alternative" title="G · Calculated alternative">
              <p>{NO_CALCULATED_ALTERNATIVE}</p>
            </Section>
            <Section id="ex-sources" title="H · Sources and imagery">
              <h4>Coordinate</h4>
              <ul className="ex-src">
                <li>
                  <a href={l.coordinateSource} target="_blank" rel="noreferrer noopener">
                    USGS/IAU Gazetteer feature page
                  </a>
                  <span className="ex-src__pub"> · USGS</span>
                </li>
              </ul>
              <p className="ex-note">
                {COORDINATE_CONVENTION}. Latitude {l.latitude}, east longitude {l.longitudeEast360}.
              </p>
              {l.claimSources.length > 0 && (
                <>
                  <h4>Science</h4>
                  <ul className="ex-src">
                    {l.claimSources.map((s) => (
                      <SourceLink key={s.url} s={s} />
                    ))}
                  </ul>
                </>
              )}
              {hazards && (
                <>
                  <h4>Hazard summaries</h4>
                  <ul className="ex-src">
                    <SourceLink s={{ label: hazards.source.label, url: hazards.source.url, publisher: 'NASA' }} />
                  </ul>
                  <p className="ex-note">Cited for this group of landmark summaries; it does not support every statement for every landmark. {hazards.source.note}</p>
                </>
              )}
              <h4>General</h4>
              <ul className="ex-src">
                {GENERAL_SOURCES.map((s) => (
                  <SourceLink key={s.url} s={s} />
                ))}
              </ul>
              <h4>Imagery</h4>
              <LandmarkThumb landmark={l} />
              <p className="ex-note">
                No mission image with spacecraft, instrument and date is supplied for this landmark yet. {THUMB_CREDIT}
              </p>
            </Section>
          </div>
        )}
      </div>

      <footer className="ex-panel__actions">
        <button type="button" className="ex-btn" onClick={() => onExploreOnMap(l)} title="Fly the Mars Trek map to this landmark">
          View on Map
        </button>
        {onPlanHere && (
          <button type="button" className="ex-btn ex-btn--ghost" onClick={() => onPlanHere(l)} title="Open the Mission Planner with this landmark ready to set as start, destination or checkpoint">
            Plan Mission Here
          </button>
        )}
        {expanded ? (
          <button type="button" className="ex-btn ex-btn--ghost" onClick={() => onExpand(false)}>
            Back to preview
          </button>
        ) : (
          <button type="button" className="ex-btn ex-btn--ghost" onClick={() => onExpand(true)}>
            Scientific details
          </button>
        )}
        <div className="ex-panel__nav">
          <button type="button" className="ex-link" onClick={() => onSelect(prev.id)} aria-label={`Previous landmark: ${prev.name}`}>
            ‹ Previous
          </button>
          <span>
            {i + 1} / {LANDMARKS.length}
          </span>
          <button type="button" className="ex-link" onClick={() => onSelect(next.id)} aria-label={`Next landmark: ${next.name}`}>
            Next ›
          </button>
        </div>
      </footer>
    </article>
  );
}
