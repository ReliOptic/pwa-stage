// Exact public-file allowlist and checksum check. No network access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(dir+'/'+e.name) : [dir+'/'+e.name]);
}
const files = [...walk('public'), 'src/vendor/three.module.js'].sort();
const current = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const manifest = path.join(__dirname, 'asset-manifest.json');
if (process.argv.includes('--write')) fs.writeFileSync(manifest, JSON.stringify(current,null,2)+'\n');
else {
  const expected = JSON.parse(fs.readFileSync(manifest));
  const changed = [...new Set([...Object.keys(expected), ...files])].filter(p => expected[p] !== current[p]);
  if (changed.length) throw Error('Asset register needs review: '+changed.join(', '));
  console.log(`Verified ${files.length} registered assets and notices.`);
}
