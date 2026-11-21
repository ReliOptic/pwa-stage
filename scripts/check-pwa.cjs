// Start the installation check from the project's terminal or a CI job.
const { parseArgs } = require('node:util');
const { existsSync, mkdtempSync } = require('node:fs');
const { rm } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const usage = `npm run pwa:check -- <preview-url> [options]

  --device <id>       Device preset (default: iphone-17-pro)
  --browser <name>    safari, chrome, or both (default: both)
  --language <tag>    Website language, e.g. ar-EG
  --timezone <zone>   IANA time zone, e.g. Africa/Cairo
  --out <directory>   Parent for per-run HTML and JSON (default: pwa-stage-reports)
  --list-devices      Print available device IDs
  --help              Show this help

Exit codes: 0 passed, 1 project check failed, 2 usage or runner error.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, options: {
      device:{type:'string',default:'iphone-17-pro'}, browser:{type:'string',default:'both'},
      language:{type:'string',default:''}, timezone:{type:'string',default:''},
      out:{type:'string',default:'pwa-stage-reports'}, 'list-devices':{type:'boolean'}, help:{type:'boolean',short:'h'}
    }
  });
  if (values.help) { console.log(usage); return 0; }
  const root = path.resolve(__dirname, '..');
  const entry = path.join(root, 'dist-electron/check-pwa.js');
  if (!existsSync(entry) || !existsSync(path.join(root,'dist/index.html'))) throw Error('Build PWA Stage first with npm run build.');
  if (values['list-devices']) {
    const { DEVICE_PRESETS } = require('../dist-electron/config/device-presets.config');
    for (const preset of DEVICE_PRESETS) console.log(preset.id + '  ' + preset.name);
    return 0;
  }
  if (positionals.length !== 1) throw Error(usage);
  if (!['safari','chrome','both'].includes(values.browser)) throw Error('Choose safari, chrome, or both for --browser.');
  if (!values.out.trim()) throw Error('Choose a directory for --out.');
  const binary = require('electron');
  const { stageRequest } = require('../dist-electron/services/journey-planner');
  const { regionLanguage, regionTimeZone } = require('../dist-electron/utils/region.util');
  const request = stageRequest({
    addresses: positionals, devices: [values.device],
    browsers: values.browser === 'both' ? ['ios-safari','ios-chrome'] : ['ios-'+values.browser]
  });
  const language = regionLanguage(values.language), timeZone = regionTimeZone(values.timezone);
  if (language === null || timeZone === null) throw Error('Use a supported BCP 47 language and IANA time zone.');
  const output = path.resolve(process.env.INIT_CWD || process.cwd(), values.out);
  const switches = [];
  if (process.platform === 'linux') {
    switches.push('--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      // Electron's headless display otherwise clamps hidden windows to 1 × 1.
      switches.push('--ozone-platform=headless','--ozone-override-screen-size=1920,1200');
    }
  }
  const profile = mkdtempSync(path.join(os.tmpdir(),'pwa-stage-check-'));
  try {
    const child = spawn(binary,[...switches,entry],{stdio:'inherit',env:{
      ...process.env, PWA_STAGE_CHECK:JSON.stringify({request,language,timeZone,output,profile})
    }});
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT',interrupt);
    process.once('SIGTERM',terminate);
    try {
      return await new Promise((resolve,reject) => {
        child.once('error',reject);
        child.once('close',(code,signal)=>resolve(code ?? (signal==='SIGINT' ? 130 : signal==='SIGTERM' ? 143 : 2)));
      });
    } finally {
      process.off('SIGINT',interrupt);
      process.off('SIGTERM',terminate);
    }
  } finally {
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
}
main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=2;});
