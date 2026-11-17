// Real Electron regressions. Run after npm run build. Fixtures are loopback-only.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const output = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-stage-evidence-'));
fs.mkdirSync(output, { recursive: true });
const binary = process.env.SIMULATOR_ELECTRON_BINARY || require('electron');
const results = [];
for (const name of process.env.SIMULATOR_VISUAL_ONLY === '1' ? ['visual'] : ['runtime', 'home', 'duo', 'flows']) {
  const args = ['--enable-unsafe-swiftshader'];
  if (process.platform === 'linux') {
    // CI hosts may expose an unusable Mesa/GL device. Select the software
    // renderer explicitly instead of relying on a failed GPU initialization.
    args.push('--use-gl=angle', '--use-angle=swiftshader');
    if (!process.env.DISPLAY) args.push('--ozone-platform=headless');
    if (process.getuid?.() === 0 || process.env.SIMULATOR_TEST_NO_SANDBOX === '1') args.push('--no-sandbox'); // restricted CI container only; never a product flag
  }
  args.push(path.join(__dirname, name + '.cjs'));
  const result = spawnSync(binary, args, {
    env: { ...process.env, SIMULATOR_TEST_OUTPUT: output },
    encoding: 'utf8', timeout: name === 'visual' ? 245000 : 65000, maxBuffer: 8 * 1024 * 1024
  });
  const log = (result.stdout || '') + (result.stderr || '');
  fs.writeFileSync(path.join(output, name + '.log'), log);
  const passed = result.status === 0;
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) console.error(log.slice(-6000));
}
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log('Electron evidence: ' + output);
process.exitCode = results.every(result => result.passed) ? 0 : 1;
