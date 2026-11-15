import type { HazardCode } from '../shared';

/**
 * The hazard key. Colours, patterns and codes are project design choices, not NASA-issued
 * symbology, and none of them is a severity score: category, confidence and severity are
 * separate attributes, and colour never stands for severity. Green means a hazard category
 * or coverage, never "safe".
 *
 * Codes (L, S, …) are internal identifiers. The interface shows `name` and `short`.
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
  /** Mapped polygons from a documented source. */
  | 'mapped-polygons'
  /** Dated observation records only: no footprint is drawn. */
  | 'observations-only'
  /** Time-dependent or operational: needs a dated model or mission inputs, none loaded. */
  | 'no-dataset'
  /** Coverage indicator rather than a hazard. */
  | 'coverage';

/** The three groups the categories are shown in (plus the coverage indicator). */
export type CategoryGroup = 'terrain' | 'environment' | 'mission' | 'coverage';

/** What kind of information exists for a category in this project. */
export type Availability = 'mapped' | 'observations' | 'modelled' | 'none' | 'coverage';

export interface HazardCategory {
  code: HazardCode;
  /** Full display name. */
  name: string;
  /** One-line explanation shown under the name. */
  short: string;
  group: CategoryGroup;
  colour: string;
  pattern: PatternKind;
  patternLabel: string;
  description: string;
  mapping: MappingStatus;
  availability: Availability;
  /** What is drawn for this category on this map, or why nothing is. */
  mappingNote: string;
  /** Where its locations come from. Never invented coordinates. */
  locationBasis: string;
  /** Why the category can matter for a mission. */
  whyItMatters: string;
  /** What to check before proceeding. */
  checks: string[];
  /** What the crew can do: proposed precautions and responses. */
  responses: string[];
  /** Alternative approaches or mission options. */
  alternatives: string[];
  /** Uncertainty that remains, and what must NOT be concluded. */
  cautions: string[];
}

const c = (x: HazardCategory) => x;

export const CATEGORIES: HazardCategory[] = [
  c({
    code: 'L',
    name: 'Landslides & Rockfall',
    short: 'Observed slope-movement deposits and related terrain',
    group: 'terrain',
    colour: '#14532D',
    pattern: 'chevrons',
    patternLabel: 'Downslope chevrons',
    description: 'Mapped or imaged landslide deposits, source scarps and runout, and rockfall context.',
    mapping: 'observations-only',
    availability: 'observations',
    mappingNote: 'No landslide outlines are loaded. Its NASA records are shown as location markers (no extent).',
    locationBasis: 'Centres of NASA images',
    whyItMatters:
      'Landslide deposits mark slopes that have failed in the past and ground that may be blocky or uneven; source slopes and runout areas can obstruct access.',
    checks: [
      'Dated and repeat imagery of the source slope and the deposit.',
      'Slope from an elevation model fine enough for walking-scale decisions.',
      'Where the deposit and its source slope actually begin and end on the ground.',
    ],
    responses: [
      'Inspect the source slopes and the deposit remotely before planning access.',
      'Compare an assessed approach that stays outside the relevant mapped areas, once those areas are mapped.',
      'Send robotic or local reconnaissance before committing a crew.',
    ],
    alternatives: ['Observe another exposure of the same material.', 'Document the deposit remotely.'],
    cautions: [
      'An old deposit does not show that failure is imminent, nor that the slope is now stable.',
      'No setback distance can be derived from this record.',
    ],
  }),
  c({
    code: 'S',
    name: 'Sand & Dunes',
    short: 'Sandy surfaces requiring footing assessment',
    group: 'terrain',
    colour: '#A3E635',
    pattern: 'waves',
    patternLabel: 'Wavy lines',
    description: 'Dune fields and sand sheets mapped from orbit, and dunes seen in individual NASA images.',
    mapping: 'mapped-polygons',
    availability: 'mapped',
    mappingNote:
      'USGS Mars Global Digital Dune Database (MGD³) dune-field outlines, 65° N–65° S, mapped on 100 m/px THEMIS images: 547 fields, smallest ~1 km². Small fields are not in the database, so no outline does not mean no dunes. NASA dune records are shown as location markers.',
    locationBasis: 'USGS mapped dune-field outlines, plus centres of NASA images',
    whyItMatters: 'Loose sand can be soft and its ground strength is usually unknown from orbit; dune slopes can be steep locally.',
    checks: ['How firm the ground is (footing) along the planned line.', 'Local dune slopes and the extent of the field.'],
    responses: [
      'Investigate footing with local robotic reconnaissance before committing a crew.',
      'Compare an assessed approach around the field.',
    ],
    alternatives: ['Choose a science target with firmer, assessed access.'],
    cautions: [
      'Ground around a dune field is not automatically firm.',
      'Rover entrapment thresholds do not transfer to astronauts on foot.',
    ],
  }),
  c({
    code: 'B',
    name: 'Boulders & Rough Ground',
    short: 'Rocks and irregular terrain that may obstruct movement',
    group: 'terrain',
    colour: '#10B981',
    pattern: 'blocks',
    patternLabel: 'Irregular blocks',
    description: 'Resolved boulders, block fields, rough ground and boulder tracks.',
    mapping: 'observations-only',
    availability: 'observations',
    mappingNote: 'No boulder-field outlines are loaded. Its NASA records are shown as location markers (no extent).',
    locationBasis: 'Centres of NASA images',
    whyItMatters: 'Blocks narrow passages and slow travel; tracks show that some boulders have moved downslope.',
    checks: [
      'Passage width against suit and equipment clearance.',
      'The finest available imagery: obstacles smaller than the image resolution cannot be seen.',
    ],
    responses: ['Check passage width and equipment clearance before entering.', 'Compare an assessed corridor with fewer resolved blocks.'],
    alternatives: ['Sample another exposure of the same unit.'],
    cautions: ['Coarse imagery cannot show that small obstacles are absent.'],
  }),
  c({
    code: 'P',
    name: 'Pits & Depressions',
    short: 'Openings, steep edges and depressed terrain',
    group: 'terrain',
    colour: '#00BFA5',
    pattern: 'broken-hatch',
    patternLabel: 'Broken diagonal hatch',
    description: 'Pits, pit chains, collapse depressions and central pits.',
    mapping: 'mapped-lines',
    availability: 'mapped',
    mappingNote: 'USGS SIM 3292 “pit crater chain” lines are drawn as mapped axes. Individual pit records are shown as location markers (no extent).',
    locationBasis: 'USGS mapped lines, plus centres of NASA images',
    whyItMatters: 'Pits have steep or overhanging edges; their depth and edge stability are usually unknown.',
    checks: ['Edge stability, depth and wall slope.', 'Whether the mapped position is accurate at walking scale.'],
    responses: ['Inspect remotely from a distance.', 'Use a crossing only where one has been assessed; none is in this project.'],
    alternatives: ['Compare an assessed route around the mapped feature.', 'Document the pit remotely.'],
    cautions: [
      'No crossing, ladder, bridge or traversable floor is implied.',
      'A pit is not automatically an accessible cave or a radiation shelter.',
    ],
  }),
  c({
    code: 'F',
    name: 'Fractures & Fault Troughs',
    short: 'Broken ground and tectonic depressions',
    group: 'terrain',
    colour: '#22C55E',
    pattern: 'crosshatch',
    patternLabel: 'Crosshatching (areas) · solid line (mapped axes)',
    description: 'Mapped faults, grabens, fault-bounded troughs and fracture systems.',
    mapping: 'mapped-lines',
    availability: 'mapped',
    mappingNote:
      'USGS SIM 3292 “graben axis” lines (1:20,000,000) are drawn. Each is a trough axis, not a fault trace; trough width is not mapped, so no area is drawn.',
    locationBasis: 'USGS mapped lines, plus centres of NASA images',
    whyItMatters: 'Troughs and fractures can form steep walls and drops across a route.',
    checks: ['Local width, depth and wall slope of the trough.', 'Whether the mapped line is where the trough actually is, at walking scale.'],
    responses: ['Inspect remotely before approaching.', 'Use a crossing only where one has been assessed; none is in this project.'],
    alternatives: ['Plan a route that avoids the feature.', 'Document the trough remotely.'],
    cautions: ['Not every orbital line is a human-scale open crack.', 'No crossing coordinates are given: none has been assessed.'],
  }),
  c({
    code: 'G',
    name: 'Gullied Slopes',
    short: 'Slopes cut by channels and erosion',
    group: 'terrain',
    colour: '#6EE7B7',
    pattern: 'branches',
    patternLabel: 'Branching lines',
    description: 'Channelised, dissected slopes with gullies, typically on crater walls.',
    mapping: 'observations-only',
    availability: 'observations',
    mappingNote: 'No gully outlines are loaded. Its NASA records are shown as location markers (no extent).',
    locationBasis: 'Centres of NASA images',
    whyItMatters: 'Gullied slopes are steep and dissected, with loose deposits at their base.',
    checks: ['Local slope, and loose deposits at the base of the gullies.'],
    responses: ['Inspect the slope and its deposits before planning access.', 'Compare another assessed access point.'],
    alternatives: ['Document the gullies remotely.'],
    cautions: ['A gully does not show current flow, liquid water or recent activity unless a source states it.'],
  }),
  c({
    code: 'I',
    name: 'Ice & Frost',
    short: 'Observed or interpreted ice, with seasonal context',
    group: 'terrain',
    colour: '#5EEAD4',
    pattern: 'frost',
    patternLabel: 'Frost pattern',
    description: 'Exposed water ice, CO₂ frost, water frost or inferred buried ice.',
    mapping: 'observations-only',
    availability: 'observations',
    mappingNote: 'No ice or frost extents are loaded. Its NASA records are shown as location markers: dated observations, not current conditions.',
    locationBasis: 'Centres of NASA images',
    whyItMatters: 'Frost and ice change with season and time of day and can affect footing and equipment.',
    checks: ['The observation season and local time.', 'Current surface conditions and any evidence about traction.'],
    responses: ['Check the observation season against the planned date.', 'Check surface conditions before relying on the ground.'],
    alternatives: ['Change the timing where a dated observation supports it.', 'Consider another assessed approach.'],
    cautions: [
      'Ice is not immediately drinkable.',
      'Frost patches are not all slippery to the same degree; a past frost observation is not a current warning.',
    ],
  }),
  c({
    code: 'SL',
    name: 'Steep Slopes & Cliffs',
    short: 'Slope assessment derived from an elevation model',
    group: 'terrain',
    colour: '#22C55E',
    pattern: 'parallel',
    patternLabel: 'Parallel slope lines (distinct from fractures)',
    description: 'Cells whose slope, calculated from MOLA elevations, is above the limit you set.',
    mapping: 'derived-cells',
    availability: 'modelled',
    mappingNote: 'Derived from MOLA MEGDR 16 px/deg elevations (3.7 km cells), central differences. Shown from zoom 4.',
    locationBasis: 'Calculated from the MOLA elevation model; no fixed coordinates',
    whyItMatters: 'Steep ground affects footing, effort and equipment handling.',
    checks: [
      'Your own suit or rover slope limit: there is no universal safe walking angle.',
      'Finer elevation data: across a 3.7 km cell, local slopes can be much steeper.',
    ],
    responses: ['Compare the cell slope with your documented limit.', 'Consider a lower-gradient approach once one is assessed at finer resolution.'],
    alternatives: ['Choose a science target with gentler, assessed access.'],
    cautions: ['Slope alone does not determine footing.', 'Cells below the limit are not “safe”: they are only below the highlight limit.'],
  }),
  c({
    code: 'D',
    name: 'Dust Conditions',
    short: 'Dated dust observations and related concerns',
    group: 'environment',
    colour: '#D946EF',
    pattern: 'swirl',
    patternLabel: 'Dust / swirl pattern',
    description: 'Dust-devil tracks, dust devils and dust events, each from a dated observation.',
    mapping: 'observations-only',
    availability: 'observations',
    mappingNote: 'No dust extents are drawn: its NASA records are shown as location markers of past activity, and no current dust data is loaded.',
    locationBasis: 'Centres of NASA images',
    whyItMatters:
      'Dust reduces visibility and solar power and wears equipment; fine dust carried into a habitat raises contamination concerns, including perchlorates.',
    checks: ['Current dust reports for the planned date and time.', 'The mission’s dust-control and cleaning procedures.'],
    responses: [
      'Apply dust-control procedures to suits, tools and solar panels.',
      'Plan shorter tasks, or change the timing, when dust conditions are reported.',
    ],
    alternatives: ['Change the departure time.', 'Postpone the excursion.'],
    cautions: [
      'Historical tracks do not mean a dust devil is present now; tracks are not permanent hazardous corridors.',
      'A short detour may not escape a regional storm.',
      'Toxic exposure cannot be mapped from dust colour; no chemical concentration footprint is drawn.',
    ],
  }),
  c({
    code: 'V',
    name: 'Visibility & Shadows',
    short: "Shows available lighting, shadow and visibility information for the selected location and time. Poor lighting or reduced visibility may make obstacles harder to identify.",
    group: 'environment',
    colour: '#A78BFA',
    pattern: 'stripes',
    patternLabel: 'Shadow stripes',
    description: 'Dated or modelled lighting and shadow conditions.',
    mapping: 'no-dataset',
    availability: 'modelled',
    mappingNote: "Night side (Sun below the smooth horizon) for the planned time, calculated with NASA Mars24. Terrain shadows are checked only at a selected point (MOLA 3.7 km); no atmospheric visibility data is loaded.",
    locationBasis: "Calculated for the selected location and planned time; no fixed coordinates",
    whyItMatters: 'Shadow and low sun reduce visibility of obstacles.',
    checks: ["Solar elevation and azimuth at the planned time and place.","Whether nearby terrain blocks the Sun (terrain-aware horizon).","Atmospheric visibility (dust) for the planned time: no data loaded."],
    responses: ["Compare departure times.","Consider another assessed approach.","Postpone a task when the visibility it needs cannot be established."],
    alternatives: ['Choose an adequately lit, assessed approach.'],
    cautions: ['No permanent lighting area exists without a time and a criterion.'],
  }),
  c({
    code: 'T',
    name: 'Temperature Conditions',
    short: "Shows available air and surface-temperature information. Conditions can affect spacesuit and equipment operation; readings apply to their recorded location and time.",
    group: 'environment',
    colour: '#F472B6',
    pattern: 'thermal',
    patternLabel: 'Thermal pattern',
    description: 'Dated or modelled air and surface temperatures against equipment limits.',
    mapping: 'no-dataset',
    availability: 'none',
    mappingNote: "No temperature observations are loaded. Perseverance MEDA products (Jezero) were identified as the source but could not be retrieved, so nothing is drawn.",
    locationBasis: "Measurement location and time only (rover or lander site); no continuous temperature map",
    whyItMatters: 'Temperature extremes affect suits, batteries and instruments.',
    checks: ["Air and surface temperatures, separately, for the planned time from a cited source.","Equipment operating limits entered for the mission."],
    responses: ["Change the timing.","Shorten tasks.","Compare readings with equipment limits.","Postpone according to mission procedures."],
    alternatives: ['Change the timing of the excursion.'],
    cautions: ['No permanent temperature area exists without a time and a criterion.'],
  }),
  c({
    code: 'R',
    name: 'Radiation Conditions',
    short: "Shows available radiation measurements or model estimates. Exposure depends on time, shielding and the radiation environment.",
    group: 'environment',
    colour: '#E879F9',
    pattern: 'radiation',
    patternLabel: 'Radiation symbol with text',
    description: 'Measured or modelled radiation dose, with time and units.',
    mapping: 'no-dataset',
    availability: 'observations',
    mappingNote: "One measurement is shown at its site: Curiosity RAD, Gale crater, 2012–13 (about 210 µGy/day absorbed dose from galactic cosmic rays). It is not spread into a map.",
    locationBasis: "The measurement site only (Gale crater)",
    whyItMatters: 'Radiation dose accumulates with time outside shelter.',
    checks: ["A measurement or model for the planned place and time, with quantity and units.","Shielding available: atmospheric, terrain, habitat and suit."],
    responses: ["Consider a shorter exposure duration.","Consider postponing.","Return to an identified, assessed shielded shelter according to mission procedures."],
    alternatives: ['Shorten time outside shelter.'],
    cautions: ['Walking around a small patch does not avoid radiation.', 'An unassessed cave or pit is not a shelter.'],
  }),
  c({
    code: 'C',
    name: 'Communication Coverage',
    short: "Shows assessed or modelled communication availability between the crew, habitat and planned relays. Terrain and network configuration can affect the connection.",
    group: 'mission',
    colour: '#60A5FA',
    pattern: 'coverage',
    patternLabel: 'Coverage hatch',
    description: 'Modelled crew, habitat or Earth link coverage, with its assumptions.',
    mapping: 'no-dataset',
    availability: 'modelled',
    mappingNote: "Configured habitat, rover and relay antennas, and route stretches where MOLA terrain blocks line of sight to all of them. Line of sight is not a full radio-link assessment.",
    locationBasis: "Calculated from the habitat/relay positions you configure; no fixed coordinates",
    whyItMatters: 'Lost links affect coordination and safety procedures.',
    checks: ["Habitat, rover and relay positions, antenna heights and radio configuration.","Orbital relay passes and Earth contact windows (not modelled here)."],
    responses: ["Compare an assessed approach.","Use a planned relay.","Change the timing.","Revise the mission."],
    alternatives: ['Use an assessed corridor or a planned relay.'],
    cautions: ['Line of sight alone is not a radio-link assessment.'],
  }),
  c({
    code: 'N',
    name: 'Navigation Uncertainty',
    short: "Shows available positioning and map-coverage uncertainty. Poorly constrained locations may require additional navigation checks.",
    group: 'mission',
    colour: '#818CF8',
    pattern: 'uncertainty',
    patternLabel: 'Uncertainty pattern',
    description: 'Positional uncertainty of maps, imagery and navigation aids.',
    mapping: 'no-dataset',
    availability: 'none',
    mappingNote: "Draws the position uncertainty you state (from your positioning method) around each route stop. No uncertainty is estimated from the map itself.",
    locationBasis: "Route stops, with the uncertainty you state",
    whyItMatters: 'Position uncertainty grows without external references.',
    checks: ["The positioning method and its documented error.","Map registration and coverage gaps along the route."],
    responses: ["Local reconnaissance.","A better-observed approach.","Backup navigation information.","Reassess before proceeding."],
    alternatives: ['Shorten the excursion to stay near known references.'],
    cautions: ['Earth GPS is not available on Mars.'],
  }),
  c({
    code: 'E',
    name: 'Power & Battery Limits',
    short: "Shows mission energy constraints based on entered battery capacity, equipment consumption and operating duration.",
    group: 'mission',
    colour: '#FACC15',
    pattern: 'battery',
    patternLabel: 'Battery icon (operational panel)',
    description: 'Power available against power needed for the excursion.',
    mapping: 'no-dataset',
    availability: 'none',
    mappingNote: "An energy budget from the power and battery values you enter, with the planner’s task schedule. Shown as notes at route stops; never a map area.",
    locationBasis: "Route stops where scheduled equipment operates; no permanent location",
    whyItMatters: 'Power limits task duration and return margins.',
    checks: ["Usable energy, equipment power, operating hours, losses and reserve."],
    responses: ["Remove optional operations.","Shorten tasks.","Use planned support or charging.","Shorten the excursion."],
    alternatives: ['Split the excursion into shorter trips.'],
    cautions: ['No power figure is invented here.'],
  }),
  c({
    code: 'M',
    name: 'Load, Fatigue & Return Time',
    short: "Shows carried load and planned mission-duration constraints. Workload and return requirements depend on the route, tasks, equipment and stated assumptions.",
    group: 'mission',
    colour: '#CBD5E1',
    pattern: 'clock',
    patternLabel: 'Clock / backpack (operational panel)',
    description: 'Carried mass, task duration and return-time requirements.',
    mapping: 'no-dataset',
    availability: 'none',
    mappingNote: "Loads, travel and task times from the Mission Planner, with the break, contingency and return you enter. Shown as arrival times at route stops; never a map area.",
    locationBasis: "Route stops; no permanent location",
    whyItMatters: 'Loads and long tasks reduce margins for the return.',
    checks: ["Load per astronaut and on the rover; expected samples.","Travel, task, break and contingency time, and the return."],
    responses: ["Share suitable equipment.","Use planned cargo support.","Remove optional tasks or checkpoints.","Compare a shorter assessed route."],
    alternatives: ['Split the excursion into shorter trips.'],
    cautions: ['No minutes-per-kg penalty is invented.'],
  }),
  c({
    code: 'U',
    name: "Assessment Coverage",
    short: "Shows where relevant assessment data is available and where coverage is missing or insufficient. An area without a displayed hazard is not automatically safe.",
    group: 'coverage',
    colour: '#6B7280',
    pattern: 'grey-crosshatch',
    patternLabel: 'Grey crosshatching',
    description: 'Ground where the categories above have not been assessed at walking scale.',
    mapping: 'coverage',
    availability: 'coverage',
    mappingNote:
      'Hidden by default. When shown, it covers all terrain: only the derived slope cells and the 1:20,000,000 USGS lines have mapped coverage here, and nothing is assessed at walking scale.',
    locationBasis: 'All terrain: no walking-scale assessment exists in this project',
    whyItMatters: 'Unknown is not safe: unassessed ground needs assessment before any route can rely on it.',
    checks: ['Local imagery or reconnaissance of the ground you plan to cross.'],
    responses: ['Treat unassessed ground as unknown, never as clear.'],
    alternatives: ['Obtain local imagery or reconnaissance before planning through it.'],
    cautions: ['Absence of a mapped hazard here does not mean the ground is safe.'],
  }),
];

export const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((x) => [x.code, x])) as Record<HazardCode, HazardCategory>;

/** Display name for a code, safe for unexpected input (never prints "undefined"). */
export function categoryName(code: string | null | undefined): string {
  return (code && CATEGORY_BY_CODE[code as HazardCode]?.name) || 'Unknown category';
}

export const GROUPS: { id: CategoryGroup; title: string; intro: string }[] = [
  {
    id: 'terrain',
    title: 'Terrain Hazards',
    intro: 'Features of the ground itself: some are mapped, most are known only from individual NASA images.',
  },
  {
    id: 'environment',
    title: 'Environmental Conditions',
    intro: 'Conditions that change with time and place. The Sun is calculated for your planned time; one radiation measurement is shown at its site; no temperature data is loaded.',
  },
  {
    id: 'mission',
    title: 'Mission Constraints',
    intro: 'Limits from the mission plan and your inputs. Shown as notes at route stops and route findings, never as map areas.',
  },
  {
    id: 'coverage',
    title: 'Data Coverage',
    intro: 'Where nothing has been assessed. Unknown ground is never shown as clear.',
  },
];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  mapped: 'Mapped coverage',
  observations: 'Historical observations',
  modelled: 'Modelled information',
  none: 'No suitable data',
  coverage: 'Coverage indicator',
};

/** Categories with something to draw: mapped geometry, derived cells, coverage or observation location markers. */
export const DRAWABLE: HazardCode[] = ['L', 'S', 'B', 'P', 'F', 'G', 'I', 'D', 'SL', 'V', 'T', 'R', 'C', 'N', 'E', 'M', 'U'];

/** Categories with mapped extent (lines, outlines or cells), as opposed to location markers only. */
export const HAS_EXTENT: HazardCode[] = ['S', 'P', 'F', 'SL', 'U'];

/** Categories the planned route can be tested against (they have mapped or derived geometry). */
export const ROUTE_TESTABLE: HazardCode[] = ['S', 'F', 'P', 'SL'];

/**
 * Plain-language names for Simple mode. The scientific names (`name`) stay in Advanced mode
 * and in every Scientific Details section; classifications are unchanged.
 */
export const SIMPLE_NAME: Partial<Record<HazardCode, string>> = {
  L: 'Falling Rocks & Landslides',
  S: 'Sand & Dunes',
  B: 'Rocky Ground',
  P: 'Holes & Depressions',
  F: 'Cracks & Faults',
  G: 'Eroded Slopes',
  I: 'Ice & Frost',
  D: 'Dust',
  SL: 'Steep Slopes',
};

export function displayName(code: HazardCode, simple: boolean): string {
  return (simple && SIMPLE_NAME[code]) || CATEGORY_BY_CODE[code]?.name || 'Unknown category';
}

/** Terrain hazard categories shown in Simple mode, and its presentation groups. */
export const TERRAIN_CODES: HazardCode[] = ['L', 'S', 'B', 'P', 'F', 'G', 'I', 'D', 'SL'];
export const SIMPLE_GROUPS: { id: 'all' | 'rocky' | 'surface'; label: string; codes: HazardCode[] }[] = [
  { id: 'all', label: 'All hazards', codes: TERRAIN_CODES },
  { id: 'rocky', label: 'Rocky & steep terrain', codes: ['L', 'B', 'P', 'F', 'G', 'SL'] },
  { id: 'surface', label: 'Sand & surface conditions', codes: ['S', 'I', 'D'] },
];
