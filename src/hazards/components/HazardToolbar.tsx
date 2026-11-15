import { useEffect, useId, useMemo, useRef, useState } from "react";
import { locationCoordinate, searchLocations } from "../../science/locations";
import {
  fromEast360,
  patchHazardState,
  toMapLatLng,
  useHazardState,
} from "../../shared";
import { categoryName } from "../categories";
import {
  formatCoord,
  looksLikeCoordinate,
  parseCoordinateText,
} from "../coordinateInput";
import type { HazardContext } from "../HazardsLayer";
import { searchObservations } from "../observations";

/**
 * The Hazards view's top bar: find a place or observation, go to typed coordinates, and
 * set the date and time the excursion is planned for.
 */
export default function HazardToolbar({ ctx }: { ctx: HazardContext }) {
  const [more, setMore] = useState(false);
  return (
    <div className="hz-toolbar" role="search" aria-label="Find a location">
      <SearchBox ctx={ctx} />
      {(
        <button
          type="button"
          className="hz-tb-morebtn"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
        >
          Coordinates &amp; time
        </button>
      )}
      {(
        <div className={`hz-tb-extra${more ? " is-open" : ""}`}>
          <CoordinateEntry ctx={ctx} />
          <PlannedTime />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ search */

function SearchBox({ ctx }: { ctx: HazardContext }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const coordinate = looksLikeCoordinate(q) ? parseCoordinateText(q) : null;
  const places = useMemo(
    () => (q.trim() && !coordinate ? searchLocations(q).slice(0, 4) : []),
    [q, coordinate],
  );
  const records = useMemo(
    () => (q.trim() && !coordinate ? searchObservations(q).slice(0, 6) : []),
    [q, coordinate],
  );

  useEffect(() => {
    const onDown = (e: PointerEvent) =>
      !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const done = () => {
    setOpen(false);
    setQ("");
  };
  const goPlace = (i: number) => {
    const loc = places[i];
    ctx.map.setView(
      toMapLatLng(locationCoordinate(loc), ctx.map.getCenter().lng),
      Math.max(ctx.map.getZoom(), 6),
    );
    done();
  };

  return (
    <div className="hz-tb-search" ref={box}>
      <label htmlFor={id} className="sr-only">
        Search places and hazard observations, or type coordinates
      </label>
      <svg className="hz-tb-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.2 13.2 3.8 3.8" />
      </svg>
      <input
        id={id}
        type="text"
        value={q}
        placeholder="Search places or observations (e.g. Ganges, H001, 8.6 S 315.7 E)"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={open && !!q.trim()}
        aria-controls={`${id}-results`}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") return setOpen(false);
          if (e.key !== "Enter") return;
          if (coordinate?.ok) {
            ctx.inspectPoint(coordinate.coordinate, { centre: true });
            done();
          } else if (records[0]) {
            ctx.focusObservation(records[0].id);
            done();
          } else if (places[0]) goPlace(0);
        }}
      />
      {open && q.trim() && (
        <div className="hz-tb-results" id={`${id}-results`}>
          {coordinate && !coordinate.ok && (
            <p className="hz-error" role="alert">
              {coordinate.error}
            </p>
          )}
          {coordinate?.ok && (
            <button
              type="button"
              className="hz-result"
              onClick={() => {
                ctx.inspectPoint(coordinate.coordinate, { centre: true });
                done();
              }}
            >
              <span className="hz-result__title">
                Check hazards at{" "}
                {formatCoord(
                  coordinate.coordinate,
                  Math.max(coordinate.latDecimals, coordinate.lonDecimals),
                )}
              </span>
              <span className="hz-result__meta">
                Typed coordinate ·{" "}
                {coordinate.east360.toFixed(
                  Math.max(coordinate.lonDecimals, 0),
                )}
                ° E (0–360)
              </span>
            </button>
          )}
          {places.length > 0 && <p className="hz-tb-group">Places</p>}
          {places.map((loc, i) => (
            <button
              key={loc.id}
              type="button"
              className="hz-result"
              onClick={() => goPlace(i)}
            >
              <span className="hz-result__title">{loc.name}</span>
              <span className="hz-result__meta">
                {loc.category} · {formatCoord(locationCoordinate(loc), 2)} ·
                centres the map
              </span>
            </button>
          ))}
          {records.length > 0 && (
            <p className="hz-tb-group">Hazard observations</p>
          )}
          {records.map((o) => (
            <button
              key={o.id}
              type="button"
              className="hz-result"
              onClick={() => {
                ctx.focusObservation(o.id);
                done();
              }}
            >
              <span className="hz-result__title">
                <span className="hz-id">{o.id}</span> {o.name}
              </span>
              <span className="hz-result__meta">
                {categoryName(o.categories[0])} · {o.centreText.latitude},{" "}
                {o.centreText.longitude}
              </span>
            </button>
          ))}
          {!coordinate && places.length === 0 && records.length === 0 && (
            <p className="hz-muted hz-tb-empty">
              Nothing matches “{q.trim()}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- coordinates */

function CoordinateEntry({ ctx }: { ctx: HazardContext }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const latId = useId();
  const lonId = useId();
  const go = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (lat.trim() === "" || !Number.isFinite(la) || la < -90 || la > 90)
      return setError("Latitude must be between −90 (S) and 90 (N).");
    if (lon.trim() === "" || !Number.isFinite(lo) || lo < 0 || lo > 360)
      return setError("Longitude must be between 0 and 360 °E.");
    setError(null);
    ctx.inspectPoint(fromEast360(la, lo), { centre: true });
  };
  return (
    <form
      className="hz-tb-coords"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      aria-label="Go to coordinates"
    >
      <label htmlFor={latId}>Lat °N</label>
      <input
        id={latId}
        inputMode="decimal"
        value={lat}
        placeholder="−8.6"
        onChange={(e) => setLat(e.target.value.replace("−", "-"))}
        aria-describedby={error ? `${latId}-err` : undefined}
      />
      <label htmlFor={lonId}>Lon °E</label>
      <input
        id={lonId}
        inputMode="decimal"
        value={lon}
        placeholder="315.7"
        onChange={(e) => setLon(e.target.value.replace("−", "-"))}
      />
      <button type="submit" className="hz-btn hz-btn--sm">
        Go
      </button>
      {error && (
        <p className="hz-tb-err" id={`${latId}-err`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/* ------------------------------------------------------------ planned time */

function PlannedTime() {
  const { plannedTime } = useHazardState();
  const id = useId();
  return (
    <div className="hz-tb-time">
      <label htmlFor={id}>Planned date & time (UTC)</label>
      <input
        id={id}
        type="datetime-local"
        value={plannedTime ?? ""}
        onChange={(e) =>
          patchHazardState({ plannedTime: e.target.value || null })
        }
        title="Recorded for the plan. No dated dust, lighting, temperature or radiation data is loaded, so it changes no layer yet."
      />
    </div>
  );
}
