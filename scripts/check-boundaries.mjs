// Fails if a module imports from a module it must not depend on:
//   mission-planning  ↛ scientific-data
//   scientific-data   ↛ mission-planning
//   shared            ↛ mission-planning, scientific-data
// The two feature modules exchange information only through src/shared.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const RULES = {
  'mission-planning': ['scientific-data'],
  'scientific-data': ['mission-planning'],
  shared: ['mission-planning', 'scientific-data'],
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const problems = [];
for (const [module, forbidden] of Object.entries(RULES)) {
  for (const file of files(join(SRC, module))) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] ?? m[2];
      for (const target of forbidden) {
        if (new RegExp(`(^|/)${target}(/|$)`).test(spec)) {
          problems.push(`${relative(SRC, file)} imports '${spec}' (${module} must not depend on ${target})`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error('Module boundary violations:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Module boundaries OK');
