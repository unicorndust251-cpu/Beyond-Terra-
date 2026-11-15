// The hazard table lines up with the 46-landmark catalogue, by number and by name.
import { LANDMARKS, landmarkHazards } from './index';
import { LANDMARK_HAZARDS } from './hazards.data';

export const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

check('46 hazard rows', LANDMARK_HAZARDS.length === 46, String(LANDMARK_HAZARDS.length));
check('Numbers 1–46, each once', LANDMARK_HAZARDS.map((h) => h.n).join() === Array.from({ length: 46 }, (_, i) => i + 1).join());
// The table shortens a few names (e.g. "Syrtis Major", "Medusae Fossae", "Eridania region"):
// its first word must match the catalogue name's first word
const mismatched = LANDMARKS.filter((l) => {
  const h = landmarkHazards(l);
  return !h || h.tableName.split(/[\s/]/)[0] !== l.name.split(/[\s/]/)[0];
}).map((l) => `${l.n} ${l.name} ≠ ${landmarkHazards(l)?.tableName}`);
check('Every row names the same landmark as the catalogue', mismatched.length === 0, mismatched.join('; '));
check('Every row has concerns and a response', LANDMARK_HAZARDS.every((h) => h.concerns.length > 20 && h.response.length > 20));
check('Concerns are distinct per landmark', new Set(LANDMARK_HAZARDS.map((h) => h.concerns)).size === 46);
check('Every row has a group source', LANDMARKS.every((l) => !!landmarkHazards(l)?.source.url.startsWith('https://')));
check('No tracking parameters in source links', LANDMARKS.every((l) => !landmarkHazards(l)!.source.url.includes('utm_')));
