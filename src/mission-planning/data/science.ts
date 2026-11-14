/**
 * Field tasks and mission objectives for the planner (the equipment menu is in
 * equipment.ts). Task minutes are DEMO ESTIMATES used only when no equipment is assigned
 * to the task; once equipment is assigned, the task's time comes from that equipment.
 */

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
  /** Demo estimate (minutes at one stop) for a task with no equipment assigned. */
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

export const TASK_IDS = Object.keys(TASKS) as TaskId[];

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
  /** Equipment menu ids. */
  suggestedEquipment: string[];
}

export const OBJECTIVES: Objective[] = [
  { id: 'sample-collection', name: 'Geological sample collection', description: 'Collect rock and regolith samples with their context recorded.', suggestedEquipment: ['tongs', 'scoop', 'sample-containers', 'geo-hammer'] },
  { id: 'mineral-investigation', name: 'Mineral investigation', description: 'Identify minerals and chemistry in place.', suggestedEquipment: ['mineral-analyzer', 'hand-lens', 'camera'] },
  { id: 'surface-imaging', name: 'Surface imaging', description: 'Image sites at context and close-up scales.', suggestedEquipment: ['camera', 'scale-ref', 'tripod'] },
  { id: 'environmental', name: 'Environmental measurements', description: 'Record temperature, dust and atmospheric conditions.', suggestedEquipment: ['env-package'] },
  { id: 'subsurface', name: 'Subsurface investigation', description: 'Profile buried layers along short transects.', suggestedEquipment: ['gpr', 'probe', 'mapping-tablet'] },
  { id: 'formation-documentation', name: 'Geological formation documentation', description: 'Document outcrops, layering and structures.', suggestedEquipment: ['camera', 'scale-ref', 'brush'] },
];
