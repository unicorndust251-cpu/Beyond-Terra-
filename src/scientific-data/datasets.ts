import type { ScientificDataset } from '../shared';

/**
 * The numerical and mapped datasets terrain inspection reads, described in the shared
 * ScientificDataset form. All were checked against their source files on 2026-11-14 and
 * are bundled under public/data (their hosts send no CORS headers).
 */

export const MOLA_MEGDR: ScientificDataset = {
  identifier: 'MGS-M-MOLA-5-MEGDR-L3-V1.0:MEGT90N000EB',
  source: 'NASA PDS Geosciences Node',
  instrument: 'MGS MOLA (Mars Orbiter Laser Altimeter)',
  units: 'm',
  coverage: { kind: 'global' },
  resolution: { value: 3705, unit: 'm' },
  observationDate: { start: '1997-09-15', end: '2001-06-30' },
  limitations: [
    'Each value is the median of the laser shots in a 1/16° bin (3.7 km at the equator, narrower east–west towards the poles).',
    'About 5 % of bins hold no shot; their values are interpolated (shown per point).',
    'Shots are 160 m footprints about 300 m apart along track, with gaps of up to 12 km between tracks near the equator.',
  ],
};

export const MOLA_MEGDR_COUNTS: ScientificDataset = {
  identifier: 'MGS-M-MOLA-5-MEGDR-L3-V1.0:MEGC90N000EB',
  source: 'NASA PDS Geosciences Node',
  instrument: 'MGS MOLA',
  units: null,
  coverage: { kind: 'global' },
  resolution: { value: 3705, unit: 'm' },
  limitations: ['Stored as categories (0, 1, 2–4, 5–9, 10 or more shots per bin), not exact counts.'],
};

export const JEZERO_CTX_DTM: ScientificDataset = {
  identifier: 'JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0',
  source: 'USGS Astrogeology, Mars 2020 Terrain Relative Navigation products',
  instrument: 'MRO CTX (Context Camera) stereo DTM',
  units: 'm',
  coverage: { kind: 'regional', bounds: { south: 18.211, north: 18.7212, west: 77.1605, east: 77.699 } },
  resolution: { value: 20, unit: 'm' },
  limitations: [
    'Stereo-derived: features smaller than about three posts (60 m) are smoothed or absent.',
    'Tied to MOLA topography; values stored to the nearest 2 cm.',
    'Covers the western Jezero floor, the delta and the landing area only (about 32 × 30 km).',
  ],
};

export const GEOLOGIC_MAP: ScientificDataset = {
  identifier: 'USGS-SIM-3292:SIM3292_Global_Geology',
  source: 'USGS Astrogeology (Tanaka et al., 2014)',
  instrument: 'Compiled mainly from MGS MOLA topography and MO THEMIS infrared imagery',
  units: null,
  coverage: { kind: 'global' },
  resolution: { value: 1850, unit: 'm' },
  limitations: [
    'Mapped at 1:20,000,000: contacts are uncertain by kilometres and features smaller than tens of kilometres (such as Jezero’s delta) are not resolved.',
    'Units describe age and geologic setting, not rock composition.',
    'Looked up on a 32 px/deg raster of the published polygons.',
  ],
};
