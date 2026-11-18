// Run with Electron. Keep intermediate full-size PNGs outside the source tree.
const {app, BrowserWindow} = require('electron');
const {buildSync} = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, {recursive: true});
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'duo-render-')));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  try {
    buildSync({entryPoints: [path.join(root, 'src/utils/duo-3d-engine.util.ts')],
      outfile: path.join(output, 'rig.js'), bundle: true, format: 'iife', globalName: 'Rig'});
    const hardware = pathToFileURL(path.join(root, 'public/duo-3d/duo-3d-bundle.js')).href;
    const scene = path.join(output, 'stage.html');
    fs.writeFileSync(scene, `<canvas></canvas><script src="${hardware}"></script><script src="./rig.js"></script>`);
    const win = new BrowserWindow({width: 991, height: 718, webPreferences: {backgroundThrottling: false}});
    await win.loadFile(scene);
    const evaluate = script => win.webContents.executeJavaScript(script);
    await evaluate("window.engine = new Rig.Duo3DHardwareEngine(document.querySelector('canvas')); true");
    for (const pass of ['night', 'white', 'aperture']) {
      if (pass === 'aperture') {
        // Depth-test only the display materials against the rest of the assembly.
        await evaluate(`engine.renderer.toneMapping = THREE.NoToneMapping;
          for (const mesh of engine.asset.meshes) {
            mesh.material = new THREE.MeshBasicMaterial({color: mesh.material.isMeshPhysicalMaterial ? 0xffffff : 0, side: THREE.FrontSide});
          } true`);
      }
      for (let angle = 0; angle <= 180; angle += 3) {
        const params = {stageWidth:991, stageHeight:718, foldAngleDeg:angle, posture:'open',
          orbitDeg:0, pitchDeg:0, zoom:1, finish:pass === 'white' ? 'white' : 'night', transitioning:true};
        const url = await evaluate(`engine.renderFrame(${JSON.stringify(params)}); document.querySelector('canvas').toDataURL()`);
        fs.writeFileSync(path.join(output, `${pass}-${angle}.png`), Buffer.from(url.split(',')[1], 'base64'));
      }
    }
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
