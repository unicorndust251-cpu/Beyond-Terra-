/**
 * Scientific equipment, field tasks and mission objectives for the planner.
 *
 * Every mass and duration here is an EXAMPLE PLANNING ASSUMPTION, chosen to be of a
 * plausible order for hand-carried field equipment. None is a NASA specification, and
 * none of these items is approved for Mars EVA use. Items named "concept" do not exist as
 * EVA hardware. Users can edit every assumed mass in the planner.
 */

export type EquipmentCategory =
  | 'geological'
  | 'imaging'
  | 'mineral-chemical'
  | 'environmental'
  | 'subsurface'
  | 'support';

/** How an item's mass is grouped in the loadout. */
export type MassGroup = 'science' | 'sample-storage' | 'supplies';

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  geological: 'Geological investigation',
  imaging: 'Scientific imaging',
  'mineral-chemical': 'Mineral and chemical investigation',
  environmental: 'Environmental investigation',
  subsurface: 'Subsurface investigation',
  support: 'Mission support',
};

export const MASS_GROUP_LABELS: Record<MassGroup, string> = {
  science: 'Scientific equipment',
  'sample-storage': 'Sample storage',
  supplies: 'Other carried supplies',
};

export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  massGroup: MassGroup;
  purpose: string;
  /** Example assumption (kg), not a specification. */
  assumedMassKg: number;
  /** Tasks this item enables. */
  tasks: TaskId[];
}

export const EQUIPMENT: EquipmentItem[] = [
  { id: 'geo-hammer', name: 'Geological hammer (concept)', category: 'geological', massGroup: 'science', purpose: 'Break off fresh rock surfaces and chip samples from outcrops.', assumedMassKg: 1.0, tasks: ['rock-sampling'] },
  { id: 'sampling-tools', name: 'Rock sampling tools', category: 'geological', massGroup: 'science', purpose: 'Scoop, tongs and rake for collecting rocks and regolith without contamination.', assumedMassKg: 1.5, tasks: ['rock-sampling', 'regolith-sampling'] },
  { id: 'sample-containers', name: 'Sample collection containers', category: 'geological', massGroup: 'sample-storage', purpose: 'Sealed, labelled containers that keep each sample and its context separate.', assumedMassKg: 2.0, tasks: ['rock-sampling', 'regolith-sampling'] },
  { id: 'geo-doc-kit', name: 'Geological documentation kit', category: 'geological', massGroup: 'science', purpose: 'Scale bar, colour reference and field notes to record where and how samples sat.', assumedMassKg: 0.6, tasks: ['formation-documentation', 'rock-sampling'] },
  { id: 'science-camera', name: 'Scientific camera', category: 'imaging', massGroup: 'science', purpose: 'Calibrated context and panoramic images of sites and outcrops.', assumedMassKg: 2.0, tasks: ['panoramic-imaging', 'formation-documentation'] },
  { id: 'closeup-imager', name: 'Close-up imaging equipment', category: 'imaging', massGroup: 'science', purpose: 'Hand-lens scale images of grains, textures and layering.', assumedMassKg: 1.2, tasks: ['closeup-imaging'] },
  { id: 'spectrometer', name: 'Portable spectrometer (concept)', category: 'mineral-chemical', massGroup: 'science', purpose: 'Identify minerals at an outcrop from their reflected-light spectra.', assumedMassKg: 2.5, tasks: ['spectral-measurement'] },
  { id: 'chem-analyzer', name: 'Portable chemical analysis instrument (concept)', category: 'mineral-chemical', massGroup: 'science', purpose: 'Measure elemental composition of rock and soil in place.', assumedMassKg: 3.0, tasks: ['chemical-analysis'] },
  { id: 'env-package', name: 'Environmental sensor package', category: 'environmental', massGroup: 'science', purpose: 'Record pressure, humidity and radiation at the site.', assumedMassKg: 1.5, tasks: ['environmental-reading'] },
  { id: 'thermometer', name: 'Temperature measurement instrument', category: 'environmental', massGroup: 'science', purpose: 'Measure ground and air temperature.', assumedMassKg: 0.4, tasks: ['environmental-reading'] },
  { id: 'dust-sensor', name: 'Dust observation instrument', category: 'environmental', massGroup: 'science', purpose: 'Measure airborne dust and deposition.', assumedMassKg: 0.8, tasks: ['dust-observation'] },
  { id: 'gpr', name: 'Portable ground-penetrating radar (concept)', category: 'subsurface', massGroup: 'science', purpose: 'Profile buried layers and ice along a short transect.', assumedMassKg: 6.0, tasks: ['gpr-transect'] },
  { id: 'navigation', name: 'Navigation equipment', category: 'support', massGroup: 'supplies', purpose: 'Position and heading along the traverse.', assumedMassKg: 0.6, tasks: [] },
  { id: 'communication', name: 'Communication equipment', category: 'support', massGroup: 'supplies', purpose: 'Voice and data link with the crew and habitat.', assumedMassKg: 1.0, tasks: [] },
  { id: 'extra-supplies', name: 'Additional scientific supplies', category: 'support', massGroup: 'supplies', purpose: 'Spare containers, labels, cleaning and calibration items.', assumedMassKg: 1.5, tasks: [] },
];

export type TaskId =
  | 'rock-sampling'
  | 'regolith-sampling'
  | 'formation-documentation'
  | 'panoramic-imaging'
  | 'closeup-imaging'
  | 'spectral-measurement'
  | 'chemical-analysis'
  | 'environmental-reading'
  | 'dust-observation'
  | 'gpr-transect';

export interface TaskType {
  id: TaskId;
  name: string;
  /** Example assumption (minutes at one stop), not an operational figure. */
  assumedMinutes: number;
}

export const TASKS: Record<TaskId, TaskType> = {
  'rock-sampling': { id: 'rock-sampling', name: 'Rock sample collection', assumedMinutes: 20 },
  'regolith-sampling': { id: 'regolith-sampling', name: 'Regolith sample collection', assumedMinutes: 15 },
  'formation-documentation': { id: 'formation-documentation', name: 'Geological formation documentation', assumedMinutes: 20 },
  'panoramic-imaging': { id: 'panoramic-imaging', name: 'Panoramic site imaging', assumedMinutes: 10 },
  'closeup-imaging': { id: 'closeup-imaging', name: 'Close-up imaging', assumedMinutes: 10 },
  'spectral-measurement': { id: 'spectral-measurement', name: 'Mineral spectral measurement', assumedMinutes: 15 },
  'chemical-analysis': { id: 'chemical-analysis', name: 'Chemical analysis', assumedMinutes: 25 },
  'environmental-reading': { id: 'environmental-reading', name: 'Environmental measurements', assumedMinutes: 10 },
  'dust-observation': { id: 'dust-observation', name: 'Dust observation', assumedMinutes: 10 },
  'gpr-transect': { id: 'gpr-transect', name: 'Ground-penetrating radar transect', assumedMinutes: 30 },
};

export type ObjectiveId =
  | 'sample-collection'
  | 'mineral-investigation'
  | 'surface-imaging'
  | 'environmental'
  | 'subsurface'
  | 'formation-documentation';

export interface Objective {
  id: ObjectiveId;
  name: string;
  description: string;
  suggestedEquipment: string[];
}

export const OBJECTIVES: Objective[] = [
  { id: 'sample-collection', name: 'Geological sample collection', description: 'Collect rock and regolith samples with their context recorded.', suggestedEquipment: ['sampling-tools', 'sample-containers', 'geo-hammer', 'geo-doc-kit'] },
  { id: 'mineral-investigation', name: 'Mineral investigation', description: 'Identify minerals and chemistry in place.', suggestedEquipment: ['spectrometer', 'chem-analyzer', 'closeup-imager'] },
  { id: 'surface-imaging', name: 'Surface imaging', description: 'Image sites at context and close-up scales.', suggestedEquipment: ['science-camera', 'closeup-imager'] },
  { id: 'environmental', name: 'Environmental measurements', description: 'Record temperature, dust and atmospheric conditions.', suggestedEquipment: ['env-package', 'thermometer', 'dust-sensor'] },
  { id: 'subsurface', name: 'Subsurface investigation', description: 'Profile buried layers along short transects.', suggestedEquipment: ['gpr', 'navigation'] },
  { id: 'formation-documentation', name: 'Geological formation documentation', description: 'Document outcrops, layering and structures.', suggestedEquipment: ['science-camera', 'geo-doc-kit'] },
];

export function equipmentById(id: string): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

/** Equipment that enables a task. */
export function equipmentForTask(task: TaskId): EquipmentItem[] {
  return EQUIPMENT.filter((e) => e.tasks.includes(task));
}
