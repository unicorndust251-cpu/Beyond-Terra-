/**
 * The legend of the USGS Geologic Map of Mars (Tanaka et al., 2014, SIM 3292): one record
 * per unit code, 44 in all, used for every swatch, list entry and click result.
 *
 * Codes are case-sensitive and kept exactly: a lowercase "l" means Late (never "1" or "I").
 * Colours are approximate samples from the published PDF. Each was checked on 2026-11-15
 * against the NASA Mars Trek rendering this map draws (median of the tile pixels at least
 * ~6 km inside each unit): 41 agree within a few RGB steps; for eHv, lHv and eHt the PDF
 * samples differed clearly, so those swatches use the colour the map actually shows.
 */

export type GeologyGroup = 'Lowland' | 'Impact' | 'Polar' | 'Basin' | 'Volcanic' | 'Apron' | 'Transition' | 'Highland';

export interface GeologyUnit {
  code: string;
  group: GeologyGroup;
  name: string;
  colour: string;
  description: string;
  source: string;
  /** Anything a reader should know about this record */
  note?: string;
}

export const GEOLOGY_SOURCE = {
  citation: 'USGS Geologic Map of Mars, SIM 3292, Tanaka and others, 2014.',
  url: 'https://pubs.usgs.gov/sim/3292/',
  version: 'SIM 3292 (2014), 1:20,000,000 · GIS database SIM3292_Global_Geology',
  colours: 'Display colours approximated from the published map.',
  limitation:
    'Regional geological context mapped at 1:20,000,000. Unit contacts are uncertain by kilometres, and the map does not resolve individual rocks, footsteps or local walking obstacles.',
  meaning: 'Colours identify mapped geological units and age assignments. They do not show elevation, curvature, mineral concentration or hazard severity.',
};

const SRC = 'USGS SIM 3292 (Tanaka et al., 2014)';
const TREK_NOTE = (pdf: string) => `Swatch matches the map tiles; the PDF sample supplied was ${pdf}.`;

const u = (code: string, group: GeologyGroup, colour: string, name: string, description: string, note?: string): GeologyUnit => ({
  code,
  group,
  name,
  colour,
  description,
  source: SRC,
  ...(note ? { note } : {}),
});

export const GEOLOGY_UNITS: GeologyUnit[] = [
  u('mAl', 'Lowland', '#BEC131', 'Middle Amazonian lowland', 'Hummocky to undulating northern plains.'),
  u('lHl', 'Lowland', '#8DC73F', 'Late Hesperian lowland', 'Plains with locally lobate or troughed margins.'),

  u('AHi', 'Impact', '#FFF200', 'Amazonian and Hesperian impact', 'Mapped impact craters and surrounding ejecta.'),

  u('lApc', 'Polar', '#DAF1FD', 'Late Amazonian polar cap', 'Residual polar ice and associated surface material.'),
  u('lApd', 'Polar', '#FFE9BB', 'Late Amazonian polar dunes', 'Wind-shaped polar sand dunes.'),
  u('Apu', 'Polar', '#9CB4BE', 'Amazonian polar undivided', 'Layered polar plateau deposits.'),
  u('Ap', 'Polar', '#009CCB', 'Amazonian polar', 'Plains-forming polar deposits.'),
  u('Hp', 'Polar', '#009BB2', 'Hesperian polar', 'Polar deposits with ridges and depressions.'),
  u('Hpu', 'Polar', '#83AEBE', 'Hesperian polar undivided', 'Layered plateau-forming deposits.'),
  u('Hpe', 'Polar', '#0089D0', 'Hesperian polar edifice', 'Polar shields and cones with depressions.'),

  u('eAb', 'Basin', '#99D4C0', 'Early Amazonian basin', 'Basin-floor plains with hummocky and troughed textures.'),
  u('lHb', 'Basin', '#9FB39F', 'Late Hesperian basin', 'Basin-floor deposits, locally finely layered.'),
  u('eHb', 'Basin', '#49A2AE', 'Early Hesperian basin', 'Plains-forming basin deposits.'),
  u('HNb', 'Basin', '#6DA69F', 'Hesperian and Noachian basin', 'Older low-lying basin deposits.'),

  u('lAv', 'Volcanic', '#FABFB8', 'Late Amazonian volcanic', 'Extensive flows with lobate margins.'),
  u('lAvf', 'Volcanic', '#CCB1A8', 'Late Amazonian volcanic field', 'Flows from shields and fissure vents.'),
  u('Av', 'Volcanic', '#F8AB9F', 'Amazonian volcanic', 'Rugged, hummocky or pitted volcanic plains.'),
  u('AHv', 'Volcanic', '#F7966B', 'Amazonian and Hesperian volcanic', 'Stacked, gently sloping flows.'),
  u('lHv', 'Volcanic', '#CC9E8F', 'Late Hesperian volcanic', 'Extensive lobate lava-flow deposits.', TREK_NOTE('#C17D98')),
  u('lHvf', 'Volcanic', '#CC9E90', 'Late Hesperian volcanic field', 'Flows associated with low shields and fissures.'),
  u('eHv', 'Volcanic', '#B27AB5', 'Early Hesperian volcanic', 'Plains-forming flows with lobate scarps.', TREK_NOTE('#957799')),
  u('lNv', 'Volcanic', '#8882BE', 'Late Noachian volcanic', 'Older volcanic plains with subdued flow margins.'),
  u('Ave', 'Volcanic', '#CC7C5B', 'Amazonian volcanic edifice', 'Large shield-like volcanic structures.'),
  u('Hve', 'Volcanic', '#F37021', 'Hesperian volcanic edifice', 'Volcanic structures built from flows and other volcanic deposits.'),
  u('Nve', 'Volcanic', '#C9252B', 'Noachian volcanic edifice', 'Ancient, degraded volcanic structures.'),

  u('lAa', 'Apron', '#FFD800', 'Late Amazonian apron', 'Ribbed and knobby deposits interpreted as glacial moraines.'),
  u('Aa', 'Apron', '#EFD114', 'Amazonian apron', 'Landslide and gravity-spreading deposits.'),
  u('ANa', 'Apron', '#BDA632', 'Amazonian and Noachian apron', 'Older knobs and mesas associated with younger, ice-rich apron material.'),

  u('AHtu', 'Transition', '#E8E3D8', 'Amazonian and Hesperian transition undivided', 'Irregular, locally layered plateaus.'),
  u('Htu', 'Transition', '#DBD5D3', 'Hesperian transition undivided', 'Irregular layered plateaus.'),
  u('lHt', 'Transition', '#FFCB04', 'Late Hesperian transition', 'Relatively smooth plains with small knobs and mesas.'),
  u('eHt', 'Transition', '#E0B024', 'Early Hesperian transition', 'Undulating or rugged plains with scattered knobs.', TREK_NOTE('#CCA638')),
  u('Ht', 'Transition', '#FFDEA3', 'Hesperian transition', 'Knobs, mesas, aprons and plains within canyons and chaotic terrain.'),
  u('Hto', 'Transition', '#ABE1FA', 'Hesperian transition outflow', 'Plains locally dissected by branching channel systems.'),
  u('HNt', 'Transition', '#FAA619', 'Hesperian and Noachian transition', 'Mixed knobs, mesas, aprons and plains.'),

  u('HNhu', 'Highland', '#CBC3C0', 'Hesperian and Noachian highland undivided', 'Light-toned, layered mound-forming deposits.'),
  u('Nhu', 'Highland', '#B6ABA7', 'Noachian highland undivided', 'Layered canyon walls, high plains and channel-floor exposures.'),
  u('eHh', 'Highland', '#E9CBB0', 'Early Hesperian highland', 'Relatively smooth high plains.'),
  u('lNh', 'Highland', '#CEAF88', 'Late Noachian highland', 'Mostly plains-forming terrain, rugged in places.'),
  u('mNh', 'Highland', '#CD9E81', 'Middle Noachian highland', 'Uneven to rolling terrain, commonly layered in crater walls.'),
  u('eNh', 'Highland', '#BA8860', 'Early Noachian highland', 'Rugged terrain with strong relief.'),
  u('Nhe', 'Highland', '#A62B4E', 'Noachian highland edifice', 'Irregular elevated structures with troughs and peaks.'),
  u('mNhm', 'Highland', '#A1A498', 'Middle Noachian highland massif', 'High-relief mountain blocks separated by troughs and valleys.'),
  u('eNhm', 'Highland', '#8E8F83', 'Early Noachian highland massif', 'Ancient high-relief mountain blocks.'),
];

export const GEOLOGY_GROUPS: { group: GeologyGroup; note?: string }[] = [
  { group: 'Lowland' },
  { group: 'Impact' },
  { group: 'Polar' },
  { group: 'Basin' },
  { group: 'Volcanic' },
  { group: 'Apron', note: 'An apron is material extending outward from a slope or elevated feature.' },
  { group: 'Transition', note: 'Transition units occur around highland–lowland margins and dissected terrain.' },
  { group: 'Highland' },
];

/** Exact, case-sensitive lookup. */
export const UNIT_BY_CODE = new Map(GEOLOGY_UNITS.map((x) => [x.code, x]));

const PERIOD: Record<string, string> = { A: 'Amazonian', H: 'Hesperian', N: 'Noachian' };
const EPOCH: Record<string, string> = { e: 'Early', m: 'Middle', l: 'Late' };

/** "Late Amazonian", "Amazonian and Hesperian", … read from the code's leading letters. */
export function ageAssignment(code: string): string {
  const m = /^([eml]?)([AHN]+)/.exec(code);
  if (!m) return 'Not stated in the code';
  const periods = [...m[2]].map((p) => PERIOD[p]);
  const span = periods.length > 1 ? `${periods.slice(0, -1).join(', ')} and ${periods[periods.length - 1]}` : periods[0];
  return m[1] ? `${EPOCH[m[1]]} ${span}` : span;
}

export function searchUnits(query: string): GeologyUnit[] {
  const q = query.trim();
  if (!q) return GEOLOGY_UNITS;
  const lower = q.toLowerCase();
  // An exact-case code match ranks first, then any code or name containing the text
  const exact = GEOLOGY_UNITS.filter((x) => x.code === q);
  const rest = GEOLOGY_UNITS.filter((x) => !exact.includes(x) && (x.code.toLowerCase().includes(lower) || x.name.toLowerCase().includes(lower)));
  return [...exact, ...rest];
}
