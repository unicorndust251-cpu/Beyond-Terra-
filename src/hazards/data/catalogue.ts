import type { HazardCode } from '../../shared';

/**
 * The 60 hazard observation records, as supplied (ID, place, latitude, east longitude,
 * observed feature, category, NASA source page). Coordinates are kept as text so their
 * stated precision survives; numbers are parsed from that text.
 *
 * Each coordinate is the centre of a NASA image or observation. It is NOT a hazard
 * boundary, vertex, incident point or alert, and nothing in this module draws an area
 * from it. Every record has geometry = null and mappingStatus 'observation-centre-only'.
 *
 * Latitudes are given with N/S, longitudes east-positive 0–360°. NASA Photojournal pages
 * state THEMIS/HiRISE centres in planetocentric degrees; the map uses planetocentric
 * latitude too, so no conversion is applied (the convention is declared per record).
 */

export interface CatalogueRow {
  id: string;
  place: string;
  /** As supplied, e.g. "8.6° S" */
  latText: string;
  /** As supplied, east longitude, e.g. "315.7° E" */
  lonText: string;
  feature: string;
  categories: HazardCode[];
  url: string;
}

const PJ = 'https://science.nasa.gov/photojournal/';
const RES = 'https://science.nasa.gov/resource/';

const r = (
  id: string,
  place: string,
  latText: string,
  lonText: string,
  feature: string,
  categories: HazardCode[],
  url: string,
): CatalogueRow => ({ id, place, latText, lonText, feature, categories, url });

export const CATALOGUE: CatalogueRow[] = [
  r('H001', 'Ganges Chasma', '8.6° S', '315.7° E', 'Large landslide deposits', ['L'], `${PJ}pj-landslides/`),
  r('H002', 'Coprates Chasma', '12.6° S', '296.9° E', 'Landslide within canyon', ['L'], `${PJ}pj-landslide/`),
  r('H003', 'Valles Marineris—grooved deposit', '11.8° S', '292.5° E', 'Grooves across landslide surface', ['L'], `${PJ}landslide-surface/`),
  r('H004', 'Tithonium Chasma', '4.2° S', '270.7° E', 'Landslide from northern canyon wall', ['L'], `${PJ}larger-landslide/`),
  r('H005', 'Aeolis Mensae', '5.5° S', '146.0° E', 'Two landslides', ['L'], `${PJ}landslide-2/`),
  r('H006', 'Noachis Terra—unnamed crater', '31.3° S', '349.0° E', 'Three landslides inside crater', ['L'], `${PJ}pj-landslides-2/`),
  r('H007', 'Kasei channel wall', '27.9° N', '303.6° E', 'Collapsed channel-wall material', ['L'], `${PJ}kasei-landslide/`),
  r('H008', 'Valles Marineris—additional site', '13.2° S', '301.3° E', 'Canyon landslide deposits', ['L'], `${PJ}pj-landslides-6/`),
  r('H009', 'Crater southeast of Millochau', '24.4° S', '87.5° E', 'Crater-wall landslide', ['L'], `${PJ}crater-landslide/`),
  r('H010', 'Montevallo Crater', '15.8° N', '305.9° E', 'Landslide on inner rim', ['L'], `${PJ}pj-crater-landslide/`),
  r('H011', 'Aurorae Chaos', '6.7° S', '328.8° E', 'Landslide deposits', ['L'], `${PJ}pj-landslides-3/`),
  r('H012', 'Capri Chasma', '8.70795° S', '318.685° E', 'Overlapping landslide deposits', ['L'], `${PJ}capri-chasma-landslides/`),
  r('H013', 'Hellas Basin dune field', '47.9° S', '61.3° E', 'Dark sand dunes', ['S'], `${PJ}dunes-in-hellas/`),
  r('H014', 'Crater southeast of Campbell', '57.3° S', '168.7° E', 'Crater-floor dunes', ['S'], `${PJ}dunes-4/`),
  r('H015', 'Terra Cimmeria—site A', '12.6° S', '123.8° E', 'Dunes inside unnamed crater', ['S'], `${PJ}pj-dunes-16/`),
  r('H016', 'Crater near Meridiani Planum', '2.5° S', '351.7° E', 'Small dark dunes', ['S'], `${PJ}pj-dunes-29/`),
  r('H017', 'Noachis Terra—site A', '43.3° S', '17.9° E', 'Dark crater dunes', ['S'], `${PJ}pj-dunes-2/`),
  r('H018', 'Bunge Crater', '33.4° S', '311.2° E', 'Crater-floor dunes', ['S'], `${PJ}pj-dunes-5/`),
  r('H019', 'Terra Cimmeria—site B', '9.8° S', '129.0° E', 'Dunes in degraded crater', ['S'], `${PJ}pj-dunes-12/`),
  r('H020', 'Noachis Terra—site B', '48.766° S', '34.0294° E', 'Sand sheet and dunes', ['S'], `${PJ}pj-crater-dune-40/`),
  r('H021', 'Hale Crater', '35.8° S', '322.8° E', 'Dunes on western crater floor', ['S'], `${PJ}pj-dunes-8/`),
  r('H022', 'Plains west of Hellas', '44.7° S', '38.4° E', 'Individual dark dunes', ['S'], `${PJ}pj-dunes-13/`),
  r('H023', 'Crater southeast of Mutch', '3.1° S', '307.5° E', 'Dune field', ['S'], `${PJ}pj-dunes/`),
  r('H024', 'Lowell Crater', '51.8° S', '277.1° E', 'Crater-floor dunes', ['S'], `${PJ}pj-dunes-7/`),
  r('H025', 'Southern crater dune field', '42.7° S', '38.0° E', 'Dunes with differing shapes', ['S'], `${RES}dune-symmetry-inside-martian-crater/`),
  r('H026', 'Hill in Utopia Planitia', '41.0° N', '152.7° E', 'Boulders on hilltop', ['B'], `${PJ}mars-boulders-on-a-hill-in-utopia-planitia/`),
  r('H027', 'Large-boulder observation', '2.66° S', '83.54° E', 'Very large exposed boulders', ['B'], `${PJ}big-boulder/`),
  r('H028', 'Athabasca Vallis', '9.5° N', '156.3° E', 'Boulder-bearing ancient flood megaripples', ['B'], `${PJ}megaripples-in-athabasca-vallis/`),
  r('H029', 'Southern crater—boulder tracks', '35.8° S', '201.6° E', 'Tracks recording boulder movement', ['B'], `${PJ}rolling-stones-make-new-boulder-tracks/`),
  r('H030', 'Cydnus Rupes / northern Utopia', '55.5° N', '130.9° E', 'Boulder-strewn plain', ['B'], `${PJ}boulder-strewn-plain-in-northern-utopia-planitia/`),
  r('H031', 'Arabia Terra—central-pit crater', '16.7° N', '350.0° E', 'Pit within impact crater', ['P'], `${PJ}pit-crater/`),
  r('H032', 'Pavonis Mons flank', '0.5° S', '248.6° E', 'Pit interpreted as possible lava-tube skylight', ['P'], `${PJ}martian-pit-feature-found-by-seventh-graders/`),
  r('H033', 'Coprates Catena', '15.7° S', '299.5° E', 'Pit chain containing dunes', ['P'], `${PJ}pj-coprates-catena/`),
  r('H034', 'Terra Cimmeria—peak/pit crater', '38.0765° S', '171.308° E', 'Central peak and pit', ['P'], `${PJ}crater-centers/`),
  r('H035', 'Unnamed pit crater', '28.4965° S', '349.805° E', 'Crater pit', ['P'], `${PJ}pit-crater-2/`),
  r('H036', 'Shalbatana Vallis', '1.6° N', '316.1° E', 'Steep cliffs and large channel-floor pit', ['P'], `${PJ}shalbatana-vallis/`),
  r('H037', 'Southern central-pit crater', '27.2598° S', '347.826° E', 'Central crater depression', ['P'], `${PJ}central-pit-crater/`),
  r('H038', 'Terra Sabaea—central-pit crater', '22.3358° N', '61.2019° E', 'Central pit', ['P'], `${PJ}central-pit-crater-2/`),
  r('H039', 'Northern central-pit crater', '38.5523° N', '137.201° E', 'Central pit', ['P'], `${PJ}central-pit-crater-3/`),
  r('H040', 'Tractus Catena', '23.8° N', '256.2° E', 'Chain of pit craters', ['P'], `${PJ}pit-craters-of-tractus-catena/`),
  r('H041', 'Mangala–Memnonia Fossae', '20.5° S', '205.2° E', 'Fracture systems', ['F'], `${PJ}fractures/`),
  r('H042', 'Echus Montes', '9.03514° N', '283.246° E', 'Curved and linear fractures', ['F'], `${PJ}fractures-3/`),
  r('H043', 'Claritas Fossae', '41.4612° S', '258.678° E', 'Fractures controlling channel paths', ['F'], `${PJ}fractures-and-channels/`),
  r('H044', 'Cerberus Fossae', '9.58809° N', '159.803° E', 'Fault-bounded troughs / grabens', ['F'], `${PJ}pj-cerberus-fossae-27/`),
  r('H045', 'Sirenum Fossae', '25.6345° S', '220.325° E', 'Down-dropped fault blocks', ['F'], `${PJ}pj-sirenum-fossae-2-15/`),
  r('H046', 'Cydonia Mensae', '34.6129° N', '347.121° E', 'Fractured terrain', ['F'], `${PJ}cydonia-mensae/`),
  r('H047', 'Aram Chaos', '1.7° N', '340.0° E', 'Heavily fractured chaotic terrain', ['F'], `${PJ}aram-chaos/`),
  r('H048', 'Tempe Fossae', '45.6711° N', '290.748° E', 'Tectonic cliff and fractured ground', ['F'], `${PJ}tempe-fossae-2/`),
  r('H049', 'Alba Mons tectonic terrain', '36.4426° N', '262.063° E', 'Fault-bounded depressions', ['F'], `${PJ}alba-mons-tectonics/`),
  r('H050', 'Acheron Fossae', '38.2569° N', '225.828° E', 'Fractured, faulted and deformed terrain', ['F'], `${PJ}pj-acheron-fossae-10/`),
  r('H051', 'Tempe Terra crater', '36.3° N', '292.8° E', 'Numerous crater-rim gullies', ['G'], `${PJ}pj-gullies/`),
  r('H052', 'Noachis Terra crater', '34.5477° S', '37.3545° E', 'Large gullies on inner rim', ['G'], `${PJ}crater-gullies/`),
  r('H053', 'Terra Sirenum crater', '51.9° S', '216.3° E', 'Interior-rim gullies', ['G'], `${PJ}pj-gullies-4/`),
  r('H054', 'Northern plains crater', '63.7° N', '291.6° E', 'Gullied crater rim', ['G'], `${PJ}gullied-crater/`),
  r('H055', 'Asimov Crater', '47.1395° S', '5.72787° E', 'Gullies on depression slopes', ['G'], `${PJ}pj-gullies-14/`),
  r('H056', 'Southern ice-exposing pit', '56.6° S', '114.1° E', 'Steep scarp exposing subsurface water ice', ['I', 'P'], `${PJ}pit-where-a-scarp-exposes-an-underground-deposit-of-martian-ice/`),
  r('H057', 'Terra Sirenum—morning frost', '36.3327° S', '198.274° E', 'Frost observed on shaded crater rim, 1 February 2020', ['I'], `${PJ}morning-frost-false-color/`),
  r('H058', 'Terra Sirenum—seasonal frost', '38.9° S', '195.9° E', 'Winter frost observed by CRISM, 25 November 2006', ['I'], `${PJ}seasonal-frost-in-terra-sirenum/`),
  r('H059', 'Southern dust-devil track field', '61.4° S', '120.2° E', 'Tracks showing past dust-devil activity', ['D'], `${PJ}dust-devils/`),
  r('H060', 'Southern dust-devil observation', '68.6° S', '11.4° E', 'Dust devil photographed on 15 June 2009', ['D'], `${RES}martian-dust-devil-with-track-and-shadow/`),
];
