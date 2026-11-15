import type { HazardCode } from '../shared';

/**
 * The hazard key. Colours, patterns and codes are project design choices, not NASA-issued
 * symbology, and none of them is a severity score: category, confidence and severity are
 * separate attributes, and colour never stands for severity. Green means a hazard category
 * or coverage, never "safe".
 */

export type PatternKind =
  | 'chevrons'
  | 'waves'
  | 'blocks'
  | 'broken-hatch'
  | 'crosshatch'
  | 'branches'
  | 'frost'
  | 'swirl'
  | 'parallel'
  | 'stripes'
  | 'thermal'
  | 'radiation'
  | 'coverage'
  | 'uncertainty'
  | 'battery'
  | 'clock'
  | 'grey-crosshatch';

/** How a category is (or is not) represented on this map. */
export type MappingStatus =
  /** Real geometry from a documented source is drawn. */
  | 'mapped-lines'
  | 'derived-cells'
  /** The category exists in the catalogue only: no footprint is drawn. */
  | 'catalogue-only'
  /** Time-dependent or operational: needs a dated model or mission inputs, none loaded. */
  | 'no-dataset'
  /** Coverage indicator rather than a hazard. */
  | 'coverage';

export interface HazardCategory {
  code: HazardCode;
  name: string;
  colour: string;
  pattern: PatternKind;
  patternLabel: string;
  description: string;
  mapping: MappingStatus;
  /** What is drawn for this category on this map, or why nothing is. */
  mappingNote: string;
  /** What the category can mean for a mission (shown as "why it may matter"). */
  whyItMatters: string;
  precautions: string[];
  alternatives: string[];
  /** What must NOT be concluded from a record of this category. */
  cautions: string[];
}

const c = (x: HazardCategory) => x;

export const CATEGORIES: HazardCategory[] = [
  c({
    code: 'L',
    name: 'Landslide deposits / slope movement / rockfall context',
    colour: '#14532D',
    pattern: 'chevrons',
    patternLabel: 'Downslope chevrons',
    description: 'Mapped or imaged landslide deposits, source scarps and runout, and rockfall context.',
    mapping: 'catalogue-only',
    mappingNote: 'No landslide outlines are loaded. Landslide records are observation centres only.',
    whyItMatters:
      'Landslide deposits mark slopes that have failed in the past and ground that may be blocky or uneven; source slopes and runout areas can obstruct access.',
    precautions: [
      'Review dated and repeat imagery of the source slope and deposit before planning access.',
      'Check slope from an elevation model of adequate resolution, and plan local reconnaissance before committing a crew.',
    ],
    alternatives: [
      'Compare an approach that stays outside mapped source and runout areas, once those are mapped.',
      'Observe another exposure of the same material, or document the deposit remotely.',
    ],
    cautions: [
      'An old deposit does not show that failure is imminent, nor that the slope is now stable.',
      'No setback distance can be derived from this record.',
    ],
  }),
  c({
    code: 'S',
    name: 'Sand dunes / sand sheets',
    colour: '#A3E635',
    pattern: 'waves',
    patternLabel: 'Wavy lines',
    description: 'Dunes, ripples and sand sheets observed in orbital images.',
    mapping: 'catalogue-only',
    mappingNote: 'No dune-field outlines are loaded. Dune records are observation centres only.',
    whyItMatters: 'Loose sand can be soft and its ground strength is usually unknown from orbit; dune slopes can be steep locally.',
    precautions: [
      'Use local robotic reconnaissance to test ground before committing to unassessed sand.',
      'Plan to avoid committing a crew to sand whose strength has not been assessed.',
    ],
    alternatives: ['Compare an assessed route around the dune field.', 'Choose a different science target with firmer, assessed access.'],
    cautions: [
      'Ground around a dune field is not automatically firm.',
      'Rover entrapment thresholds do not transfer to astronauts on foot.',
    ],
  }),
  c({
    code: 'B',
    name: 'Boulders / rough ground',
    colour: '#10B981',
    pattern: 'blocks',
    patternLabel: 'Irregular blocks',
    description: 'Resolved boulders, block fields, rough ground and boulder tracks.',
    mapping: 'catalogue-only',
    mappingNote: 'No boulder-field outlines are loaded. Boulder records are observation centres only.',
    whyItMatters: 'Blocks narrow passages and slow travel; tracks show that some boulders have moved downslope.',
    precautions: [
      'Inspect passage width against suit and equipment clearance.',
      'Use the finest available imagery: obstacles smaller than the image resolution cannot be seen.',
    ],
    alternatives: ['Compare an assessed corridor with fewer resolved blocks.', 'Sample another exposure of the same unit.'],
    cautions: ['Coarse imagery cannot show that small obstacles are absent.'],
  }),
  c({
    code: 'P',
    name: 'Pits / steep depressions',
    colour: '#00BFA5',
    pattern: 'broken-hatch',
    patternLabel: 'Broken diagonal hatch',
    description: 'Pits, pit chains, collapse depressions and central pits.',
    mapping: 'mapped-lines',
    mappingNote: 'USGS SIM 3292 "pit crater chain" lines are drawn as mapped axes. Individual pit records are observation centres only.',
    whyItMatters: 'Pits have steep or overhanging edges; their depth and edge stability are usually unknown.',
    precautions: ['Prefer remote observation until a local assessment of edges and depth exists.'],
    alternatives: ['Compare an assessed route around the mapped feature.', 'Document the pit remotely from a distance.'],
    cautions: [
      'No crossing, ladder, bridge or traversable floor is implied.',
      'A pit is not automatically an accessible cave or a radiation shelter.',
    ],
  }),
  c({
    code: 'F',
    name: 'Fractures / fault troughs',
    colour: '#22C55E',
    pattern: 'crosshatch',
    patternLabel: 'Crosshatching (areas) · solid line (mapped axes)',
    description: 'Mapped faults, grabens, fault-bounded troughs and fracture systems.',
    mapping: 'mapped-lines',
    mappingNote: 'USGS SIM 3292 "graben axis" lines (1:20,000,000) are drawn. Each is a trough axis, not a fault trace; trough width is not mapped, so no area is drawn.',
    whyItMatters: 'Troughs and fractures can form steep walls and drops across a route.',
    precautions: ['Establish local width, depth and wall slope before planning any crossing.'],
    alternatives: ['Compare an assessed crossing point, once one exists.', 'Plan a route that avoids the feature, and document it remotely.'],
    cautions: [
      'Not every orbital line is a human-scale open crack.',
      'No crossing coordinates are given: none has been assessed.',
    ],
  }),
  c({
    code: 'G',
    name: 'Gullied slopes',
    colour: '#6EE7B7',
    pattern: 'branches',
    patternLabel: 'Branching lines',
    description: 'Channelised, dissected slopes with gullies, typically on crater walls.',
    mapping: 'catalogue-only',
    mappingNote: 'No gully outlines are loaded. Gully records are observation centres only.',
    whyItMatters: 'Gullied slopes are steep and dissected, with loose deposits at their base.',
    precautions: ['Inspect local slope and deposits before planning access.'],
    alternatives: ['Compare another assessed access point.', 'Document the gullies remotely.'],
    cautions: ['A gully does not show current flow, liquid water or recent activity unless a source states it.'],
  }),
  c({
    code: 'I',
    name: 'Ice / seasonal frost',
    colour: '#5EEAD4',
    pattern: 'frost',
    patternLabel: 'Frost pattern',
    description: 'Exposed water ice, CO₂ frost, water frost or inferred buried ice.',
    mapping: 'catalogue-only',
    mappingNote: 'No ice or frost extents are loaded. Frost records are dated observations, not current conditions.',
    whyItMatters: 'Frost and ice change with season and time of day and can affect footing and equipment.',
    precautions: ['Review the observation season, local time, terrain and any traction evidence.'],
    alternatives: ['Consider another assessed approach.', 'Consider changed timing where a dated observation supports it.'],
    cautions: [
      'Ice is not immediately drinkable.',
      'Frost patches are not all slippery to the same degree; a past frost observation is not a current warning.',
    ],
  }),
  c({
    code: 'D',
    name: 'Dust conditions / historical dust-devil observations',
    colour: '#D946EF',
    pattern: 'swirl',
    patternLabel: 'Dust / swirl pattern',
    description: 'Dust-devil tracks, dust devils and dust events, each from a dated observation.',
    mapping: 'catalogue-only',
    mappingNote: 'No dust extents are drawn: tracks record past activity, and no current dust data is loaded.',
    whyItMatters: 'Dust reduces visibility and solar power and wears equipment; fine dust carried into a habitat raises contamination concerns, including perchlorates.',
    precautions: [
      'Apply the mission\'s dust-control, cleaning and inspection procedures to suits, tools and solar panels.',
      'Shorten tasks, change timing or return, according to mission procedures, when dust conditions are reported.',
    ],
    alternatives: ['Change departure time.', 'Postpone the excursion.'],
    cautions: [
      'Historical tracks do not mean a dust devil is present now; tracks are not permanent hazardous corridors.',
      'A short detour may not escape a regional storm.',
      'Toxic exposure cannot be mapped from dust colour; no chemical concentration footprint is drawn.',
    ],
  }),
  c({
    code: 'SL',
    name: 'Derived steep-slope / cliff assessment',
    colour: '#22C55E',
    pattern: 'parallel',
    patternLabel: 'Parallel slope lines (distinct from F)',
    description: 'Cells whose slope, calculated from MOLA MEGDR elevations, meets the threshold set below.',
    mapping: 'derived-cells',
    mappingNote: 'Derived from MOLA MEGDR 16 px/deg elevations (3.7 km bins), central differences. Shown from zoom 4.',
    whyItMatters: 'Steep ground affects footing, effort and equipment handling.',
    precautions: [
      'Compare the slope with your own suit or rover limits: there is no universal astronaut-safe slope.',
      'At a 3.7 km baseline, local slopes can be far steeper than the cell value.',
    ],
    alternatives: ['Consider a lower-gradient approach once assessed at finer resolution.'],
    cautions: ['Slope alone does not determine footing.', 'Cells below the threshold are not "safe": they are below a display threshold.'],
  }),
  c({
    code: 'V',
    name: 'Visibility / lighting / shadow',
    colour: '#A78BFA',
    pattern: 'stripes',
    patternLabel: 'Shadow stripes',
    description: 'Dated or modelled lighting and shadow conditions.',
    mapping: 'no-dataset',
    mappingNote: 'No dated lighting model is loaded, so nothing is drawn.',
    whyItMatters: 'Shadow and low sun reduce visibility of obstacles.',
    precautions: ['Use dated local or modelled illumination for the planned time.'],
    alternatives: ['Compare departure times.', 'Choose an adequately lit, assessed approach.'],
    cautions: ['No permanent lighting polygon exists without a time and a criterion.'],
  }),
  c({
    code: 'T',
    name: 'Thermal operating concern',
    colour: '#F472B6',
    pattern: 'thermal',
    patternLabel: 'Thermal pattern',
    description: 'Dated or modelled air and surface temperatures against equipment limits.',
    mapping: 'no-dataset',
    mappingNote: 'No dated temperature model is loaded, so nothing is drawn.',
    whyItMatters: 'Temperature extremes affect suits, batteries and instruments.',
    precautions: ['Show air and surface temperatures separately, with time and units, from a cited source.'],
    alternatives: ['Compare departure times.'],
    cautions: ['No permanent thermal polygon exists without a time and a criterion.'],
  }),
  c({
    code: 'R',
    name: 'Radiation condition',
    colour: '#E879F9',
    pattern: 'radiation',
    patternLabel: 'Radiation symbol with text',
    description: 'Measured or modelled radiation dose, with time and units.',
    mapping: 'no-dataset',
    mappingNote: 'No radiation measurements or model are loaded, so nothing is drawn.',
    whyItMatters: 'Radiation dose accumulates with time outside shelter.',
    precautions: ['Use measured or modelled dose with time, units and limitations.'],
    alternatives: ['Postpone.', 'Return to an identified, assessed shielded shelter.'],
    cautions: ['Walking around a small patch does not avoid radiation.', 'An unassessed cave or pit is not a shelter.'],
  }),
  c({
    code: 'C',
    name: 'Modelled communication coverage concern',
    colour: '#60A5FA',
    pattern: 'coverage',
    patternLabel: 'Coverage hatch',
    description: 'Modelled crew, habitat or Earth link coverage, with its assumptions.',
    mapping: 'no-dataset',
    mappingNote: 'No communication model or relay infrastructure is defined, so nothing is drawn.',
    whyItMatters: 'Lost links affect coordination and safety procedures.',
    precautions: ['Distinguish crew, habitat and Earth links; any future infrastructure is a mission assumption.'],
    alternatives: ['Consider an assessed corridor, a planned relay, or offline maps.'],
    cautions: ['Line of sight alone is not a radio-link assessment.'],
  }),
  c({
    code: 'N',
    name: 'Navigation uncertainty',
    colour: '#818CF8',
    pattern: 'uncertainty',
    patternLabel: 'Uncertainty pattern',
    description: 'Positional uncertainty of maps, imagery and navigation aids.',
    mapping: 'no-dataset',
    mappingNote: 'No navigation model is defined, so nothing is drawn.',
    whyItMatters: 'Position uncertainty grows without external references.',
    precautions: ['Carry offline maps and state the positional accuracy of each source.'],
    alternatives: ['Plan an assessed corridor with recognisable landmarks.'],
    cautions: ['Earth GPS is not available on Mars.'],
  }),
  c({
    code: 'E',
    name: 'Power constraint',
    colour: '#FACC15',
    pattern: 'battery',
    patternLabel: 'Battery icon (operational panel)',
    description: 'Power available against power needed for the excursion.',
    mapping: 'no-dataset',
    mappingNote: 'An operational constraint, not a place: it belongs to the mission plan, not the map.',
    whyItMatters: 'Power limits task duration and return margins.',
    precautions: ['Check power needs against the mission plan, including the return leg.'],
    alternatives: ['Remove optional tasks.', 'Use rover support or a shorter assessed route.'],
    cautions: ['No power figure is invented here.'],
  }),
  c({
    code: 'M',
    name: 'Load / fatigue / return-time constraint',
    colour: '#CBD5E1',
    pattern: 'clock',
    patternLabel: 'Clock / backpack (operational panel)',
    description: 'Carried mass, task duration and return-time requirements.',
    mapping: 'no-dataset',
    mappingNote: 'An operational constraint, not a place: it belongs to the mission plan, not the map.',
    whyItMatters: 'Loads and long tasks reduce margins for the return.',
    precautions: ['Keep equipment mass in kg; Mars weight is mass × 3.71 N/kg.'],
    alternatives: ['Share suitable equipment.', 'Use rover cargo support.', 'Shorten or remove optional tasks.'],
    cautions: ['No minutes-per-kg penalty is invented.'],
  }),
  c({
    code: 'U',
    name: 'Inadequate assessment coverage',
    colour: '#6B7280',
    pattern: 'grey-crosshatch',
    patternLabel: 'Grey crosshatching',
    description: 'Ground where the categories above have not been assessed at walking scale.',
    mapping: 'coverage',
    mappingNote:
      'Off by default. When on, it covers all terrain: no category except the derived slope cells and the 1:20,000,000 USGS lines has any mapped coverage here, and none is assessed at walking scale.',
    whyItMatters: 'Unknown is not safe: unassessed ground needs assessment before any route can rely on it.',
    precautions: ['Treat unassessed ground as unknown, never as clear.'],
    alternatives: ['Obtain local imagery or reconnaissance before planning through it.'],
    cautions: ['Absence of a mapped hazard here does not mean the ground is safe.'],
  }),
];

export const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((x) => [x.code, x])) as Record<HazardCode, HazardCategory>;

export const MAPPING_LABEL: Record<MappingStatus, string> = {
  'mapped-lines': 'Mapped lines',
  'derived-cells': 'Derived cells',
  'catalogue-only': 'Catalogue only',
  'no-dataset': 'No dataset',
  coverage: 'Coverage',
};

/** Categories whose geometry can be drawn on this map. */
export const DRAWABLE: HazardCode[] = ['F', 'P', 'SL', 'U'];
