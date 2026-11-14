import type { TaskId } from './science';

/**
 * The equipment menu. Every number here is a DEMO ESTIMATE of a plausible order for
 * hand-carried field equipment, shown as "Demo estimate — editable". None is a NASA
 * specification, and items named "concept" are not existing EVA hardware. Where a value
 * comes from a published specification, record it with `source` (none do yet). Rover
 * instrument specifications must not be presented as astronaut-portable packages.
 */

export type EquipCategory =
  | 'geological'
  | 'subsurface'
  | 'documentation'
  | 'navigation'
  | 'communication'
  | 'support'
  | 'storage';

/** The menu's groups, in order; "Custom equipment" lists what the user adds. */
export const MENU_GROUPS: { id: EquipCategory | 'custom'; label: string }[] = [
  { id: 'geological', label: 'Geological investigation' },
  { id: 'subsurface', label: 'Subsurface investigation' },
  { id: 'documentation', label: 'Geological formation documentation' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'communication', label: 'Communication' },
  { id: 'support', label: 'Mission support' },
  { id: 'storage', label: 'Sample storage' },
  { id: 'custom', label: 'Custom equipment' },
];

export const CATEGORY_LABELS: Record<EquipCategory, string> = Object.fromEntries(
  MENU_GROUPS.filter((g) => g.id !== 'custom').map((g) => [g.id, g.label]),
) as Record<EquipCategory, string>;

/** How categories roll up in the mass summary. Sample storage is kept separate. */
export type MassGroup = 'science' | 'navcomm' | 'support' | 'storage';

export const MASS_GROUP_OF: Record<EquipCategory, MassGroup> = {
  geological: 'science',
  subsurface: 'science',
  documentation: 'science',
  navigation: 'navcomm',
  communication: 'navcomm',
  support: 'support',
  storage: 'storage',
};

export const MASS_GROUP_LABELS: Record<MassGroup, string> = {
  science: 'Scientific equipment',
  navcomm: 'Navigation and communication',
  support: 'Other mission support',
  storage: 'Sample storage equipment',
};

export interface CatalogItem {
  id: string;
  name: string;
  category: EquipCategory;
  purpose: string;
  /** Checkpoint tasks the item can be used for. */
  tasks: TaskId[];
  /** Demo estimates: unit mass (kg), and setup / operating per use / packing (minutes). */
  demo: { unitMassKg: number; setupMin: number; operatingMin: number; packingMin: number };
  /** Needs an astronaut's continuous attention while operating (default). */
  attended?: boolean;
  /** Published source of the values, when there is one. */
  source?: string;
}

export const CATALOG: CatalogItem[] = [
  // Geological investigation
  { id: 'geo-hammer', name: 'Geological hammer', category: 'geological', purpose: 'Break rock to expose fresh, unweathered surfaces and free samples.', tasks: ['rock-sampling'], demo: { unitMassKg: 1.0, setupMin: 1, operatingMin: 5, packingMin: 1 } },
  { id: 'scoop', name: 'Scoop', category: 'geological', purpose: 'Collect loose regolith and fine-grained samples.', tasks: ['regolith-sampling'], demo: { unitMassKg: 0.4, setupMin: 1, operatingMin: 5, packingMin: 1 } },
  { id: 'tongs', name: 'Sampling tongs', category: 'geological', purpose: 'Pick up rock samples without touching them with gloves.', tasks: ['rock-sampling'], demo: { unitMassKg: 0.5, setupMin: 1, operatingMin: 3, packingMin: 1 } },
  { id: 'brush', name: 'Brush', category: 'geological', purpose: 'Clear dust from rock surfaces before imaging or analysis.', tasks: ['closeup-imaging', 'formation-documentation'], demo: { unitMassKg: 0.2, setupMin: 0, operatingMin: 3, packingMin: 0 } },
  { id: 'hand-lens', name: 'Hand lens', category: 'geological', purpose: 'Magnified inspection of grains, crystals and textures.', tasks: ['closeup-imaging'], demo: { unitMassKg: 0.1, setupMin: 0, operatingMin: 3, packingMin: 0 } },
  { id: 'core-sampler', name: 'Core sampler', category: 'geological', purpose: 'Take short cores that preserve layering in regolith or soft rock.', tasks: ['regolith-sampling'], demo: { unitMassKg: 3.0, setupMin: 5, operatingMin: 15, packingMin: 5 } },
  { id: 'powered-drill', name: 'Powered drill (concept)', category: 'geological', purpose: 'Drill cores from hard rock below the weathered surface.', tasks: ['rock-sampling'], demo: { unitMassKg: 6.0, setupMin: 10, operatingMin: 20, packingMin: 8 } },
  { id: 'mineral-analyzer', name: 'Mineral-analysis instrument (concept)', category: 'geological', purpose: 'Identify minerals and chemistry in place. Not a rover instrument repackaged: a hypothetical handheld unit.', tasks: ['spectral-measurement', 'chemical-analysis'], demo: { unitMassKg: 3.0, setupMin: 3, operatingMin: 10, packingMin: 2 } },
  // Subsurface investigation
  { id: 'gpr', name: 'Ground-penetrating radar (concept)', category: 'subsurface', purpose: 'Profile buried layers and ice along a short transect.', tasks: ['gpr-transect'], demo: { unitMassKg: 6.0, setupMin: 10, operatingMin: 30, packingMin: 10 } },
  { id: 'probe', name: 'Probe', category: 'subsurface', purpose: 'Test the depth and firmness of the regolith at a point.', tasks: ['regolith-sampling', 'gpr-transect'], demo: { unitMassKg: 1.0, setupMin: 1, operatingMin: 5, packingMin: 1 } },
  // Geological formation documentation
  { id: 'camera', name: 'Camera', category: 'documentation', purpose: 'Context, panoramic and close-up images of sites and outcrops.', tasks: ['panoramic-imaging', 'formation-documentation', 'closeup-imaging'], demo: { unitMassKg: 2.0, setupMin: 2, operatingMin: 10, packingMin: 2 } },
  { id: 'scale-ref', name: 'Scale/colour reference', category: 'documentation', purpose: 'Gives images a size scale and calibrated colours.', tasks: ['formation-documentation', 'closeup-imaging'], demo: { unitMassKg: 0.3, setupMin: 1, operatingMin: 1, packingMin: 1 } },
  { id: 'tripod', name: 'Tripod', category: 'documentation', purpose: 'Steadies the camera for panoramas and time series.', tasks: ['panoramic-imaging'], demo: { unitMassKg: 1.5, setupMin: 3, operatingMin: 0, packingMin: 3 }, attended: false },
  // Navigation
  { id: 'mapping-tablet', name: 'Mapping tablet', category: 'navigation', purpose: 'Position, route and site notes on a map.', tasks: [], demo: { unitMassKg: 1.2, setupMin: 0, operatingMin: 2, packingMin: 0 } },
  // Communication
  { id: 'radio-kit', name: 'Radio and communication accessories', category: 'communication', purpose: 'Voice and data link with the crew and habitat.', tasks: [], demo: { unitMassKg: 1.0, setupMin: 0, operatingMin: 0, packingMin: 0 } },
  // Mission support
  { id: 'lights', name: 'Lights', category: 'support', purpose: 'Illumination for shadowed outcrops and low-sun work.', tasks: [], demo: { unitMassKg: 0.8, setupMin: 1, operatingMin: 0, packingMin: 1 } },
  { id: 'batteries', name: 'Batteries (spare set)', category: 'support', purpose: 'Spare power for instruments and lights.', tasks: [], demo: { unitMassKg: 1.5, setupMin: 0, operatingMin: 0, packingMin: 0 } },
  { id: 'tool-carrier', name: 'Tool carrier', category: 'support', purpose: 'Holds and protects tools between stops.', tasks: [], demo: { unitMassKg: 2.0, setupMin: 0, operatingMin: 0, packingMin: 0 } },
  { id: 'env-package', name: 'Environmental sensor package (concept)', category: 'support', purpose: 'Records temperature, pressure, dust and radiation at a site.', tasks: ['environmental-reading', 'dust-observation'], demo: { unitMassKg: 1.5, setupMin: 3, operatingMin: 10, packingMin: 2 }, attended: false },
  // Sample storage
  { id: 'sample-containers', name: 'Sample containers', category: 'storage', purpose: 'Sealed, labelled containers that keep each sample and its context separate.', tasks: ['rock-sampling', 'regolith-sampling'], demo: { unitMassKg: 2.0, setupMin: 0, operatingMin: 1, packingMin: 1 } },
];

export function catalogItem(id: string | null): CatalogItem | undefined {
  return id ? CATALOG.find((c) => c.id === id) : undefined;
}
