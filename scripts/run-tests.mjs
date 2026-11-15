// Runs the project's *.test.ts files: each is bundled in memory with esbuild (already
// installed with Vite) and executed in Node. A test file exports `results`, a list of
// { name, ok, detail }. Exits non-zero if any check fails.
import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.test\.ts$/.test(n) ? [p] : [];
  });

let failed = 0;
let total = 0;
const tmp = mkdtempSync(join(tmpdir(), 'bt-tests-'));
try {
  for (const file of files(SRC)) {
    const out = await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
    const path = join(tmp, `${total}.mjs`);
    writeFileSync(path, out.outputFiles[0].text);
    const { results } = await import(pathToFileURL(path).href);
    console.log(`\n${relative(SRC, file)}`);
    for (const r of results) {
      total++;
      if (!r.ok) failed++;
      console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : `  (${r.detail})`}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${total - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
