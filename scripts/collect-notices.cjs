// Copy verbatim runtime licence notices from locked, installed dependencies.
const fs = require('node:fs');
const path = require('node:path');
const lock = require('../package-lock.json');
const out = path.join(__dirname, '../public/licenses');
fs.mkdirSync(out, {recursive:true});
for (const [name, pkg] of Object.entries(lock.packages)) {
  if (!name || pkg.dev) continue;
  const dir = path.join(__dirname, '..', name);
  const notice = fs.readdirSync(dir).find(n => /^licen[sc]e(?:\.txt|\.md)?$/i.test(n));
  if (!notice) throw Error('Missing notice: ' + name);
  const target = name.replace(/^node_modules\//, '').replaceAll('/', '_');
  fs.copyFileSync(path.join(dir, notice), path.join(out, target + '.txt'));
}
for (const file of ['LICENSE', 'LICENSES.chromium.html']) {
  fs.copyFileSync(path.join(__dirname, '../node_modules/electron/dist', file), path.join(out, 'electron-' + file));
}
