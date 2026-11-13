// Erzeugte Dateien neu schreiben (plattformunabhängig, auch unter Windows):
//   node scripts/erzeugen.mjs wiki          → website/httpdocs/wiki/ aus docs/wiki/
//   node scripts/erzeugen.mjs schaufenster  → docs/beispiele/rz-verbund.json
import { spawnSync } from 'node:child_process';

const jobs = {
  wiki: { env: 'WIKI', test: 'src/wiki/wiki.test.ts' },
  schaufenster: { env: 'SCHAUFENSTER', test: 'src/ui/showcase.test.ts' },
};
const job = jobs[process.argv[2]];
if (!job) {
  console.error(`Aufruf: node scripts/erzeugen.mjs ${Object.keys(jobs).join('|')}`);
  process.exit(2);
}
const result = spawnSync('npx', ['vitest', 'run', job.test], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, [job.env]: '1' } });
process.exit(result.status ?? 1);
