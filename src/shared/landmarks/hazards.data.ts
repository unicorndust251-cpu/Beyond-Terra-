// Landmark-level hazard concerns and proposed responses, copied verbatim from the project's
// "46 landmarks … potential astronaut hazards and proposed responses" table (supplied
// 2026-11-15), keyed by catalogue number. Do not edit by hand.
//
// As that table states: the hazards are "concerns to assess locally", and the responses are
// "planning proposals — not approved astronaut emergency procedures or calculated safe routes".

export interface LandmarkHazardRecord {
  n: number;
  /** Name as written in the table (checked against the catalogue by number in tests). */
  tableName: string;
  concerns: string;
  response: string;
  group: 1 | 2 | 3 | 4 | 5;
}

export interface HazardGroupSource {
  label: string;
  url: string;
  note: string;
}

/** The source the table cites for each group of rows (it does not support every claim in every row). */
export const HAZARD_GROUP_SOURCES: Record<1 | 2 | 3 | 4 | 5, HazardGroupSource> = {
  1: {
    label: 'NASA Science: Tharsis volcano',
    url: 'https://science.nasa.gov/resource/tharsis-volcano/',
    note: 'NASA documents the Tharsis volcanoes, Valles Marineris, Jezero’s lake/delta setting, Gale’s environmental record and major impact basins. Its ice research identifies particular investigated areas—not uniformly accessible ice throughout entire plains.',
  },
  2: {
    label: 'NASA JPL: PIA04740 Noctis Labyrinthus',
    url: 'https://www.jpl.nasa.gov/images/pia04740-noctis-labyrinthus/',
    note: 'NASA imagery documents faulting, collapse and landslides in Noctis, volcanic structures in Tharsis, pits near Arsia/Pavonis and fault-bounded depressions around Alba. Polar investigations require seasonal context.',
  },
  3: {
    label: 'NASA Science: Four finalist landing site candidates for Mars Science Laboratory',
    url: 'https://science.nasa.gov/resource/four-finalist-landing-site-candidates-for-mars-science-laboratory/',
    note: 'NASA sources support the clay-rich candidate sites, Spirit’s altered materials, Meridiani’s water evidence, Deuteronilus ice-rich aprons and the erodible Medusae deposits. Hazards proposed for the large lowland regions still require local verification.',
  },
  4: {
    label: 'NASA Technical Reports Server: 20240000500',
    url: 'https://ntrs.nasa.gov/citations/20240000500',
    note: 'NASA sources support Nili Planum’s catchment context, the Eridania hydrothermal interpretation, Abalos Mensa research, Abalos Undae dunes, Acheron deformation and Abus’s channel geometry. The Abalos Colles entry is a proposed investigation, not a claim of a verified mineral discovery or mapped astronaut hazard.',
  },
  5: {
    label: 'NASA Science: Fractures in carbonate-bearing rocks at Mars’ Huygens basin',
    url: 'https://science.nasa.gov/resource/fractures-in-carbonate-bearing-rocks-at-mars-huygens-basin/',
    note: 'NASA documents Huygens’s specific mineral-bearing exposures, Holden/Eberswalde water-related deposits, Opportunity’s crater investigations, northern crater ice and Cerberus–Athabasca relationships.',
  },
};

export const LANDMARK_HAZARDS: LandmarkHazardRecord[] = [
  { n: 1, group: 1, tableName: 'Olympus Mons', concerns: 'Lava-covered slopes, summit depressions and major scarps. Assess steep edges, broken rock and long return distances.', response: 'Choose a small, accessible lava exposure instead of attempting a summit traverse. Inspect local slopes and avoid unassessed caldera edges.' },
  { n: 2, group: 1, tableName: 'Valles Marineris', concerns: 'Deep canyons, cliffs, slide deposits and local dunes. Assess falling material, difficult access and obstructed communications.', response: 'Observe cliff layers from an assessed position; compare another accessible exposure. Do not assume an old landslide deposit is stable.' },
  { n: 3, group: 1, tableName: 'Jezero Crater', concerns: 'Crater floor, delta deposits, rocky outcrops, sand and crater-rim slopes. Assess footing, loose ground and steep approaches.', response: 'Select a local science target, inspect its approach using orbital and rover imagery, and compare another exposure if access is difficult.' },
  { n: 4, group: 1, tableName: 'Gale Crater', concerns: 'Rocky plains, dunes, layered slopes and ridges around Mount Sharp. Assess sharp rocks, sand and demanding climbs.', response: 'Prefer assessed corridors and accessible outcrops. Use remote imaging for steep layers rather than climbing directly toward them.' },
  { n: 5, group: 1, tableName: 'Hellas Planitia', concerns: 'Broad basin-floor terrain, local dunes, crater rims and variable relief. Assess soft material and local obstacles.', response: 'Select one mapped sector; compare local routes rather than treating the whole basin floor as flat or easy.' },
  { n: 6, group: 1, tableName: 'Argyre Planitia', concerns: 'Basin plains, rough margins, craters and sediment-covered ground. Assess steep approaches and poorly characterised surfaces.', response: 'Target an accessible deposit outside rugged basin margins; use reconnaissance before choosing a descent.' },
  { n: 7, group: 1, tableName: 'Utopia Planitia', concerns: 'Plains with craters, local boulders and ice-related landforms. Assess rough patches and uncertain ground conditions.', response: 'Survey the exact work area before walking or drilling. Keep ice evidence separate from a claim that the surface can support equipment.' },
  { n: 8, group: 1, tableName: 'Elysium Planitia', concerns: 'Lava-derived plains with regolith, craters and local rock concentrations. Assess small obstacles and uneven surfaces.', response: 'Use local imagery to identify an assessed corridor. Do not extend conditions at InSight’s landing site across the whole plain.' },
  { n: 9, group: 1, tableName: 'Arcadia Planitia', concerns: 'Plains and locally ice-related terrain. Ground strength, buried ice depth and small-scale obstacles need assessment.', response: 'Begin with radar/probe reconnaissance at a selected site. Compare another work area if footing or subsurface conditions remain uncertain.' },
  { n: 10, group: 2, tableName: 'Planum Boreum', concerns: 'Ice-rich plateau, troughs, scarps and nearby dunes. Assess seasonal frost, steep edges, cold and lighting.', response: 'Select a season and accessible observation area using relevant data. Observe steep sections remotely; do not assume ice is walkable.' },
  { n: 11, group: 2, tableName: 'Planum Australe', concerns: 'Polar plateau, scarps and seasonally changing icy surfaces. Assess cold, illumination and seasonal surface change.', response: 'Choose a locally assessed work area and observation window; postpone if required thermal or surface conditions are unresolved.' },
  { n: 12, group: 2, tableName: 'Elysium Mons', concerns: 'Volcanic slopes, summit terrain and flow surfaces. Assess slope, roughness and access.', response: 'Sample an accessible flank exposure instead of approaching the summit or steep margins.' },
  { n: 13, group: 2, tableName: 'Arsia Mons', concerns: 'Lava slopes, summit depression and locally documented pits. Assess steep edges and broken volcanic surfaces.', response: 'Map the exact approach; inspect pits remotely and avoid entering unassessed openings. A pit is not automatically a usable shelter.' },
  { n: 14, group: 2, tableName: 'Pavonis Mons', concerns: 'Shield slopes, lava terrain and locally observed pits. Assess pit edges and difficult footing.', response: 'Choose an accessible lava unit; use remote inspection for pit science rather than approaching an uncertain edge.' },
  { n: 15, group: 2, tableName: 'Ascraeus Mons', concerns: 'Extensive volcanic slopes and summit-collapse terrain. Assess rough ground and demanding traverses.', response: 'Select a limited flank investigation with a feasible return route; avoid an unnecessary summit objective.' },
  { n: 16, group: 2, tableName: 'Alba Mons', concerns: 'Volcanic surfaces and fault-bounded troughs in parts of the surrounding region. Assess fracture crossings and local scarps.', response: 'Investigate an accessible flow exposure and compare routes avoiding mapped troughs.' },
  { n: 17, group: 2, tableName: 'Noctis Labyrinthus', concerns: 'Interconnected canyons, pits, fractured plateaus and landslide terrain. Assess cliffs, route dead ends and obstructed links.', response: 'Select an assessed plateau observation site or accessible exposure; do not navigate by simply following a visually open canyon.' },
  { n: 18, group: 3, tableName: 'Mawrth Vallis', concerns: 'Layered outcrops and eroded valley terrain. Assess scarp access, loose fragments and uneven footing.', response: 'Compare accessible exposures of the same layers; document steep sections remotely.' },
  { n: 19, group: 3, tableName: 'Oxia Planum', concerns: 'Ancient plains with exposed bedrock, erosional features and local loose cover. Exact hazards need local mapping.', response: 'Identify a locally assessed outcrop and approach; preserve sample context and use another exposure if access is uncertain.' },
  { n: 20, group: 3, tableName: 'Gusev Crater', concerns: 'Basaltic plains, hills, outcrops and locally soft soil. Assess uncertain ground strength and rough approaches.', response: 'Scout loose ground before entry; select another accessible exposure if the surface crust conceals weak material.' },
  { n: 21, group: 3, tableName: 'Meridiani Planum', concerns: 'Bedrock exposures, sand ripples, dunes and craters. Assess soft sand and crater-wall access.', response: 'Compare exposed-bedrock approaches and avoid unassessed ripple crossings. Use another outcrop when possible.' },
  { n: 22, group: 3, tableName: 'Chryse Planitia', concerns: 'Lowland plains with local rocks, craters and sediment cover. Assess obstacles at the actual worksite.', response: 'Use historical imagery as context, then assess the intended corridor with suitable local-resolution data.' },
  { n: 23, group: 3, tableName: 'Acidalia Planitia', concerns: 'Plains containing locally pitted, cratered or fractured terrain. A plain is not uniformly smooth.', response: 'Choose a well-mapped local sector and inspect depressions and fractures before committing equipment.' },
  { n: 24, group: 3, tableName: 'Amazonis Planitia', concerns: 'Broad plains with variable cover and local rough features. Assess weakly resolved obstacles and long travel distances.', response: 'Limit the Marswalk to a mapped local target; use reconnaissance rather than treating a smooth orbital appearance as proof of easy travel.' },
  { n: 25, group: 3, tableName: 'Deuteronilus Mensae', concerns: 'Mesas, debris aprons, fretted valleys and locally collapsed scarps. Assess rough debris and steep margins.', response: 'Survey apron surfaces and work away from unassessed scarps; consider remote radar observations instead of walking onto uncertain material.' },
  { n: 26, group: 3, tableName: 'Medusae Fossae', concerns: 'Eroded ridges, troughs and loose material in the broader formation. Assess weak-looking surfaces, dust and confusing relief.', response: 'Choose a locally assessed exposure, compare access around ridges and apply sample/dust-control measures.' },
  { n: 27, group: 3, tableName: 'Nili Fossae', concerns: 'Fault troughs, exposed units, rocky slopes and variable cover. Assess fractures and access to outcrops.', response: 'Target accessible exposures outside steep trough walls; use remote spectroscopy where direct access is unassessed.' },
  { n: 28, group: 4, tableName: 'Nili Planum', concerns: 'Plateau terrain, exposed units and locally incised valleys. Assess escarpments, rough ground and limited access.', response: 'Choose a local exposure with an assessed approach; compare another exposure of the same unit rather than crossing an unassessed valley.' },
  { n: 29, group: 4, tableName: 'Syrtis Major', concerns: 'Dark volcanic plains, flow surfaces and volcanic structures. Assess rough lava and local scarps.', response: 'Select a mapped flow contact or accessible outcrop; avoid assuming dark terrain has one composition or one walking condition.' },
  { n: 30, group: 4, tableName: 'Isidis Planitia', concerns: 'Basin plains and rugged margins. Assess local craters, loose cover and steep boundary terrain.', response: 'Choose an accessible basin-floor or margin target and compare assessed approaches; avoid direct unassessed rim crossings.' },
  { n: 31, group: 4, tableName: 'Eridania region / ancient basin', concerns: 'Ancient basin deposits, exposed blocks and younger volcanic surfaces in studied areas. Assess rough access and local slopes.', response: 'Target the actual mapped mineral-bearing exposure; compare accessible equivalents or remote spectroscopy. Do not treat the entire named region as one hydrothermal deposit.' },
  { n: 32, group: 4, tableName: 'Abalos Colles', concerns: 'Hilly polar-region terrain; exact surface materials and obstacles require site-specific confirmation.', response: 'Obtain local imagery and terrain data first. Choose an accessible observation point; do not transfer hazards from nearby Abalos features automatically.' },
  { n: 33, group: 4, tableName: 'Abalos Mensa', concerns: 'Layered terrain with documented steep marginal scarps. Assess edge access and seasonal surface conditions.', response: 'Observe layers from an assessed position away from unassessed scarps; compare another accessible exposure.' },
  { n: 34, group: 4, tableName: 'Abalos Undae', concerns: 'Dunes, sand sheets and locally gullied crater rims. Assess sand mobility, footing and seasonal frost.', response: 'Prefer an assessed observation corridor outside dunes; use repeat imaging rather than entering an unassessed dune field.' },
  { n: 35, group: 4, tableName: 'Acheron Fossae', concerns: 'Fractured/faulted terrain, trough walls and slope streaks. Assess crossings and steep approaches.', response: 'Inspect trough geometry and compare an assessed route around it; a slope streak alone does not establish an imminent landslide.' },
  { n: 36, group: 4, tableName: 'Abus Vallis', concerns: 'Channel floor, banks and surrounding terrain. Assess bank slopes and locally accumulated loose material.', response: 'Examine the channel from an assessed bank or accessible section. Do not assume a channel floor is a continuous walking corridor.' },
  { n: 37, group: 5, tableName: 'Huygens Crater', concerns: 'Impact terrain, fractured outcrops and steep crater-related slopes. Assess loose blocks and difficult access.', response: 'Target the specific mapped mineral exposure—not an arbitrary crater-centre point. Compare accessible fragments/exposures with recorded geological context.' },
  { n: 38, group: 5, tableName: 'Holden Crater', concerns: 'Fans, deposits, crater slopes and incised terrain. Assess broken access routes and local loose ground.', response: 'Choose an accessible fan/deposit section; inspect any proposed crossing and consider another exposure.' },
  { n: 39, group: 5, tableName: 'Eberswalde Crater', concerns: 'Eroded delta deposits, channels, scarps and crater terrain. Assess steep delta edges and uncertain footing.', response: 'Study an assessed delta exposure from outside steep sections; compare another accessible portion of the deposit.' },
  { n: 40, group: 5, tableName: 'Victoria Crater', concerns: 'Scalloped rim, promontories, slopes and sand-covered interior. Assess rim edges and descent/return difficulty.', response: 'Begin with rim-based imaging; enter only through an assessed approach with a feasible return. Rover access does not automatically establish astronaut access.' },
  { n: 41, group: 5, tableName: 'Endeavour Crater', concerns: 'Segmented rim hills, outcrops and surrounding rippled plains. Assess steep approaches and loose cover.', response: 'Select an accessible rim segment or outcrop; compare another exposure rather than climbing the most direct slope.' },
  { n: 42, group: 5, tableName: 'Korolev Crater', concerns: 'Ice-bearing crater interior and crater slopes. Assess cold, seasonal conditions, edge access and unmeasured traction.', response: 'Prefer remote ice mapping initially; select a locally assessed approach and observation season before surface work.' },
  { n: 43, group: 5, tableName: 'Louth Crater', concerns: 'Ice mound, crater floor and slopes. Assess transitions between ice and regolith and seasonal conditions.', response: 'Survey the ice margin and footing before contact; use remote measurements if safe access remains unassessed.' },
  { n: 44, group: 5, tableName: 'Cerberus Fossae', concerns: 'Steep-sided troughs, faulted surfaces and locally documented slope deposits. Assess edges, rockfall context and crossings.', response: 'Stay on an assessed approach outside uncertain edges, inspect remotely and avoid inventing a crossing over the trough.' },
  { n: 45, group: 5, tableName: 'Athabasca Valles', concerns: 'Channel terrain, lava surfaces, plates/ridges and local sand. Assess roughness, fractures and discontinuous access.', response: 'Compare mapped corridors and inspect obstacles locally. Do not assume a channel’s apparent direction supplies a traversable route.' },
  { n: 46, group: 5, tableName: 'Mangala Valles', concerns: 'Channel system with banks, terraces and locally fractured surrounding ground. Assess steep access and rough channel surfaces.', response: 'Target an accessible channel exposure; compare an assessed approach avoiding steep banks and unassessed fractures.' },
];

/** Shown with every entry: the table's own framing. */
export const HAZARD_FRAMING =
  'Concerns to assess locally: a large region can contain many different surfaces, and NASA observations do not establish that every part has the same hazard. Responses are planning proposals — not approved astronaut emergency procedures or calculated safe routes.';

export const NO_CALCULATED_ALTERNATIVE =
  'No alternative route has been calculated. Route coordinates and extra distance or time are shown only after a real route calculation using suitable local data.';
