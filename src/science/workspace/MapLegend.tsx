import { ELEVATION_SCALE, SLOPE_SCALE, cssGradient, legendPercent } from '../colorScales';

export type LegendMode = 'elevation' | 'slope';

/**
 * The key of the elevation or slope layer on screen, and nothing else. Hidden when neither
 * is on; geology has its own legend (geology/GeologyLegend). The colours come from the same
 * scales the tiles are drawn with.
 */
export default function MapLegend({ mode, blended }: { mode: LegendMode; blended: boolean }) {
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
