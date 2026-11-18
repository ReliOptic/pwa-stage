// Actual compositor verification, including out-of-process guests. No screenshot mocks.
const { app, BrowserWindow, webContents, screen } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const out = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-visual-'));
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-visual-data-')));
app.commandLine.appendSwitch('force-device-scale-factor', process.env.SIMULATOR_VISUAL_DPR || '2');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (fn, attempts = 200) => {
  for (let i = 0; i < attempts; i++) { if (await fn()) return; await sleep(80); }
  throw Error('Timed out waiting for a loaded page or settled posture');
};

// Runs in the shell. The aperture polygon is clipped to each leaf before projection.
function readGeometry() {
  const rect = element => element.getBoundingClientRect().toJSON();
  const slab = document.querySelector('.iphone-screen');
  if (slab) {
    const r = rect(slab), css = getComputedStyle(slab), scale = r.width / slab.offsetWidth;
    const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => parseFloat(css[k]) * scale);
    const polygon = [];
    const centers = [[r.left + radii[0], r.top + radii[0]], [r.right - radii[1], r.top + radii[1]], [r.right - radii[2], r.bottom - radii[2]], [r.left + radii[3], r.bottom - radii[3]]];
    centers.forEach(([x, y], corner) => {
      for (let i = 0; i <= 32; i++) {
        const a = (180 + corner * 90 + i * 90 / 32) * Math.PI / 180;
        polygon.push([x + radii[corner] * Math.cos(a), y + radii[corner] * Math.sin(a)]);
      }
    });
    const img = document.querySelector('.hardware-skin img');
    return { dpr: devicePixelRatio, polygons: [polygon], screen: r, skinLoaded: !img || (img.complete && img.naturalWidth > 0) };
  }
  const stage = rect(document.querySelector('.duo-3d-stage-root'));
  const polygons = Array.from(document.querySelectorAll('.duo-interactive-slice')).filter(e => getComputedStyle(e).display !== 'none').map(e => {
    const inner = e.querySelector('.duo-slice-inner-viewport');
    const css = getComputedStyle(inner), transform = new DOMMatrix(getComputedStyle(e).transform);
    const w = parseFloat(css.width), h = parseFloat(css.height), left = parseFloat(css.left), top = parseFloat(css.top);
    let polygon = Array.from(css.clipPath.matchAll(/([-\d.]+)%\s+([-\d.]+)%/g), m => [Number(m[1]) * w / 100 + left, Number(m[2]) * h / 100 + top]);
    for (const [axis, bound, sign] of [[0, 0, 1], [0, parseFloat(getComputedStyle(e).width), -1], [1, 0, 1], [1, parseFloat(getComputedStyle(e).height), -1]]) {
      const clipped = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const ai = (a[axis] - bound) * sign >= 0, bi = (b[axis] - bound) * sign >= 0;
        if (ai) clipped.push(a);
        if (ai !== bi) { const t = (bound - a[axis]) / (b[axis] - a[axis]); clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
      }
      polygon = clipped;
    }
    return polygon.map(([x, y]) => {
      const p = transform.transformPoint(new DOMPoint(x, y));
      return [stage.x + p.x / p.w, stage.y + p.y / p.w];
    });
  });
  return { dpr: devicePixelRatio, polygons, angle: Number(document.querySelector('.duo-hinge-slider').value) };
}

function auditPixels(image, geometry) {
  const { width, height } = image.getSize(), pixels = image.toBitmap(), dpr = geometry.dpr;
  const polygons = geometry.polygons.map(p => p.map(([x, y]) => [x * dpr, y * dpr]));
  assert(polygons.every(p => p.length >= 4), 'Every visible screen must have an aperture');
  const green = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const i = (y * width + x) * 4, [b, g, r, a] = pixels.subarray(i, i + 4);
    return a > 100 && g > 70 && g > r * 1.5 && g > b * 1.2;
  };
  const inside = (x, y, p) => {
    let result = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) result = !result;
    }
    return result;
  };
  let samples = 0, leaks = 0, painted = 0;
  for (const p of polygons) {
    const area = p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      // One sample per output pixel, two pixels outside (allows antialiasing).
      const nx = Math.sign(area) * dy / len * 2, ny = -Math.sign(area) * dx / len * 2;
      for (let j = 0; j < Math.ceil(len); j++) {
        const t = (j + 0.5) / Math.ceil(len), x = a[0] + t * dx + nx, y = a[1] + t * dy + ny;
        if (polygons.some(poly => inside(x, y, poly))) continue;
        samples++; if (green(x, y)) leaks++;
      }
    }
  }
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
    if (green(x, y) && polygons.some(p => inside(x, y, p))) painted++;
  }
  const paintedLeaves = polygons.map(p => {
    // Area centroid, not vertex average: rounded-edge tessellation has many
    // vertices beside the system rail and only two beside the straight hinge.
    let area = 0, sx = 0, sy = 0;
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length], cross = a[0] * b[1] - b[0] * a[1];
      area += cross; sx += (a[0] + b[0]) * cross; sy += (a[1] + b[1]) * cross;
    });
    const cx = sx / (3 * area), cy = sy / (3 * area);
    let hits = 0;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (green(cx + x, cy + y)) hits++;
    return hits > 40;
  });
  return { width, height, samples, leaks, painted, paintedLeaves, toleranceOutputPixels: 2 };
}

const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><style>*{box-sizing:border-box}html,body{margin:0;background:var(--field,#fff);color:#14252f;font:16px system-ui}main{padding:100px 28px;min-height:100vh;background:repeating-linear-gradient(0deg,transparent 0 31px,#edf0f1 31px 32px),repeating-linear-gradient(90deg,transparent 0 31px,#edf0f1 31px 32px)}h1{font-size:32px;margin:0}aside{position:fixed;inset:0;border:1px solid #f000a0;pointer-events:none}</style><main><h1>Display alignment</h1><p>32 pt calibration grid<br>White field · 1 pt boundary</p></main><aside></aside>`);
});
setTimeout(() => app.exit(2), 900000);
server.listen(0, '127.0.0.1', async () => {
  const site = `http://127.0.0.1:${server.address().port}/`;
  process.env.SIMULATOR_DEFAULT_URL = site;
  await app.whenReady();
  // Give the autosizer sufficient room for 1:1 portraits even on a small CI display.
  const originalDisplay = screen.getPrimaryDisplay.bind(screen);
  screen.getPrimaryDisplay = () => ({ ...originalDisplay(), workAreaSize: { width: 2560, height: 1800 }, workArea: { x: 0, y: 0, width: 2560, height: 1800 } });
  require(path.resolve(__dirname, '../../dist-electron/index.js'));
  try {
    await wait(() => BrowserWindow.getAllWindows().length > 0);
    const win = BrowserWindow.getAllWindows()[0];
    win.show(); win.focus(); win.webContents.setBackgroundThrottling(false);
    const js = code => win.webContents.executeJavaScript(code);
    const guests = () => webContents.getAllWebContents().filter(w => w.getType() === 'webview');
    const loaded = () => guests().some(w => w.getURL() === site && !w.isLoading());
    await wait(loaded);
    const { value: initial } = await js('window.simulatorBridge.getInitialPayload()');
    let state = initial.state;
    const report = [];
    const capture = async () => { await sleep(350); return win.webContents.capturePage(); };
    const snap = async name => {
      await sleep(900);
      const geometry = await js(`(${readGeometry.toString()})()`);
      assert.notEqual(geometry.skinLoaded, false, 'Hardware artwork must be loaded');
      // A color round trip is a compositor fence: dom-ready/slider values alone
      // cannot prove that an out-of-process guest or its mirror has painted.
      await Promise.all(guests().map(w => w.executeJavaScript('document.documentElement.style.setProperty("--field", "#14df8b")')));
      let probe, pixels;
      let consecutive = 0;
      try {
        await wait(async () => {
          probe = await capture(); pixels = auditPixels(probe, geometry);
          consecutive = pixels.painted > 100 && pixels.paintedLeaves.every(Boolean) && pixels.leaks === 0 ? consecutive + 1 : 0;
          return consecutive >= 2;
        }, 40);
      } catch (error) {
        if (probe) fs.writeFileSync(path.join(out, name + '-failed.png'), probe.toPNG());
        throw Error(name + ': ' + error.message + ' ' + JSON.stringify(pixels));
      }
      fs.writeFileSync(path.join(out, name + '-mask.png'), probe.toPNG());
      report.push({ name, ...geometry, pixels });
      fs.writeFileSync(path.join(out, 'visual.json'), JSON.stringify(report, null, 2));
      assert.equal(pixels.leaks, 0, `${name}: guest pixels outside the display aperture`);
      await Promise.all(guests().map(w => w.executeJavaScript('document.documentElement.style.removeProperty("--field")')));
      let white;
      await wait(async () => { white = await capture(); return auditPixels(white, geometry).painted === 0; }, 40);
      fs.writeFileSync(path.join(out, name + '.png'), white.toPNG());
      console.log('VISUAL_PASS ' + name + ' ' + JSON.stringify(pixels));
    };
    const slabs = initial.presets.filter(p => !p.hinge.enabled && !p.id.startsWith('iphone-duo')).map(p => p.id);
    const cases = [...slabs.flatMap(id => ['portrait','landscape'].map(orientation => [id, orientation])), ['iphone-duo-unfolded', 'portrait']];
    for (const [id, orientation] of cases) {
      state = { ...state, selectedDeviceId: id, orientation, shellMode: 'pwa-standalone', pwaStatusBarStyle: 'black-translucent', currentUrl: site, scale: 1, hudCollapsed: true };
      await js('window.simulatorBridge.updateSimulatorState(' + JSON.stringify(state) + ')');
      win.webContents.send('simulator:external-state', state);
      await sleep(1000); await wait(loaded); await snap(id + '-' + orientation);
    }
    const postures = [['closed', 'Cover Display (5.4″ · 466×678pt)', 0], ['book', 'Book Mode Free-Stop (100°)', 100], ['table', 'Tabletop Mode (108° Split)', 108], ['stand', 'Tent / Stand Mode (70°)', 70], ['portrait', 'Inner Portrait (669×951pt)', 180]];
    const guestId = guests()[0].id;
    for (const [name, title, angle] of postures) {
      await js('document.querySelector("button[aria-label=\'Posture and finish\']").click()');
      await js('document.querySelector(' + JSON.stringify('button[title=' + JSON.stringify(title) + ']') + ').click()');
      await wait(() => js('Number(document.querySelector(".duo-hinge-slider").value) === ' + angle));
      assert.equal(guests().length, 1); assert.equal(guests()[0].id, guestId);
      await snap('duo-' + name);
    }
    console.log('VISUAL_CAPTURES ' + report.length);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
