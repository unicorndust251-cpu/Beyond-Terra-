/**
 * The exact NASA products behind each scientific layer, as verified against the
 * services on 2026-11-14 (GetCapabilities documents and PDS labels).
 */
export const DATASETS = {
  imagery: {
    shortName: 'Viking MDIM 2.1',
    products: [
      'Mars_Viking_MDIM21_ClrMosaic_global_232m',
      'Jezero_CTX_BlockAdj_dd',
      'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
    ],
    access: 'NASA Mars Trek WMTS (RESTful), https://trek.nasa.gov/tiles/Mars/EQ/',
    crs: 'Equirectangular, Mars 2000 sphere (IAU2000:49900), planetocentric, −180…180° E',
    resolution: 'Viking 232 m/px source, 326 m/px at Trek’s deepest level (7); CTX and HiRISE regional (Jezero)',
    licence: 'NASA imagery, public domain; credit NASA/USGS, NASA/JPL-Caltech/MSSS, NASA/JPL-Caltech/UArizona',
  },
  ctxGlobal: {
    shortName: 'CTX global mosaic',
    products: ['CTX_beta01_uncontrolled_5m_Caltech (Murray Lab, beta01)'],
    access:
      'Listed by Mars Trek; tiles from Esri, https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer (CORS open, 512-px tiles, levels 0–12 with data)',
    crs: 'Geographic, Mars 2000 sphere (wkid 104971), origin −180°, 90°',
    resolution: '5 m/px source, 5.1 m/px at level 12',
    licence: 'NASA/JPL/MSSS/Caltech Murray Lab/Esri; uncontrolled (frames may be offset from true positions)',
  },
  mola: {
    shortName: 'MGS MOLA MEGDR',
    dataSetId: 'MGS-M-MOLA-5-MEGDR-L3-V1.0',
    products: ['MEGT90N000CB (4 px/deg, 14.8 km/px)', 'MEGT90N000EB (16 px/deg, 3.7 km/px)'],
    access:
      'PDS Geosciences Node, https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/ (no CORS: bundled via scripts/prepare-mola.mjs)',
    crs: 'Simple cylindrical, sphere R = 3396.0 km, planetocentric, east-positive 0…360° (re-ordered to −180…180°)',
    vertical: 'Metres above the MOLA areoid (GMM3 / mgm1025, degree and order 50): planetary radius − areoid radius',
    resolution: '4 and 16 px/deg; median of MOLA shots per bin, interpolated where a bin has none',
    licence: 'NASA PDS data, public domain; credit NASA/GSFC MOLA Science Team (Smith et al.)',
  },
  relief: {
    shortName: 'MOLA–HRSC blended DEM hillshade',
    products: ['Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw'],
    access: 'NASA Mars Trek WMTS (RESTful), JPEG tiles, levels 0–8',
    crs: 'Equirectangular, −180…180° E, same tile matrix set as the Viking mosaic (default028mm)',
    resolution: '200 m/px',
    licence: 'NASA/USGS (MOLA: NASA/GSFC; HRSC: ESA/DLR/FU Berlin)',
  },
} as const;
