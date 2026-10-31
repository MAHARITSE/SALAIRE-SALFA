// Lance toutes les suites et conserve un code de sortie non nul si l'une échoue.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(__dirname).filter(f => /^test-.*\.cjs$/.test(f)).sort();
const failed = [];
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    failed.push(file);
  }
}
console.log(`\n${files.length - failed.length}/${files.length} suites réussies.`);
if (failed.length) console.error(`Échecs : ${failed.join(', ')}`);
process.exitCode = failed.length ? 1 : 0;
