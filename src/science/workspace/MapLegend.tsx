import { ELEVATION_SCALE, SLOPE_SCALE, cssGradient, legendPercent } from '../colorScales';

export type LegendMode = 'elevation' | 'slope' | 'geology';

/**
 * The key of the coloured data layer on screen, and nothing else. Hidden when no data
 * layer is on. The colours come from the same scales the tiles are drawn with.
 */
export default function MapLegend({ mode, blended }: { mode: LegendMode; blended: boolean }) {
  if (mode === 'geology') {
    return (
      <figure className="bt-legend bt-legend--note" aria-label="Geologic units key">
        <figcaption>
          <span className="bt-legend__title">Geologic units</span>
          <span className="bt-legend__unit">USGS colours</span>
        </figcaption>
        <p>
          Click the map to read a unit.{' '}
          <a href="https://pubs.usgs.gov/sim/3292/pdf/sim3292_map.pdf" target="_blank" rel="noreferrer">
            Full key
          </a>
        </p>
      </figure>
    );
  }
  const scale = mode === 'elevation' ? ELEVATION_SCALE : SLOPE_SCALE;
  return (
    <figure className="bt-legend" aria-label={`${mode === 'elevation' ? 'Elevation' : 'Slope'} colour key`}>
      <figcaption>
        <span className="bt-legend__title">{mode === 'elevation' ? 'Elevation' : 'Slope'}</span>
        <span className="bt-legend__unit">{mode === 'elevation' ? 'km · MOLA areoid' : 'degrees'}</span>
      </figcaption>
      <div className="bt-legend__bar" style={{ background: cssGradient(scale) }} />
      <div className="bt-legend__ticks" aria-hidden="true">
        {scale.ticks.map((t) => (
          <span key={t} style={{ left: `${legendPercent(scale, t)}%` }}>
            {scale.formatTick(t)}
          </span>
        ))}
      </div>
      {blended && <p className="bt-legend__blend">Colours blended on screen</p>}
    </figure>
  );
}
