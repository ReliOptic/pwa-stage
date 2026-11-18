// Inspect specific angles of an actual Open/Close sweep. Only the inspection
// clock is stepped. The renderer, guest, hardware and compositor are live.
const { app, BrowserWindow, webContents } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const output = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'duo-focus-'));
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'duo-focus-profile-')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, description) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await sleep(45);
  }
  throw Error('Timed out waiting for ' + description);
}

// Fine contour lines make a local loss of focus measurable on either face.
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0;font:18px system-ui;background:#f6f3e9;color:#113f3a}
header,footer{padding:16px 22px}h1{margin:8px 0;font:36px Georgia}.chart{height:72vh;position:relative;
background:repeating-radial-gradient(ellipse at 15% 28%,#d7eee2 0 4px,#326b62 4.5px 6px,#e2f1e8 7px 11px)}
.chart span{position:absolute;left:12%;top:35%;background:#113f3a;color:white;padding:10px 16px;border-radius:16px}</style>
<header>Marin County<h1>Coastal survey</h1></header><div class="chart"><span>Point Reyes</span></div><footer>Elevation contours · 10 metres</footer>
<script>window.visitToken=Math.random()</script>`;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fixture);
});

function differenceAt(a, b, point, viewportWidth) {
  const { width } = a.getSize();
  const ratio = width / viewportWidth;
  const x = Math.round(point.x * ratio), y = Math.round(point.y * ratio);
  const first = a.toBitmap(), second = b.toBitmap();
  let difference = 0;
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      const index = 4 * ((y + dy) * width + x + dx);
      for (let c = 0; c < 3; c++) difference += Math.abs(first[index + c] - second[index + c]);
    }
  }
  return difference / (15 * 15 * 3);
}

server.listen(0, '127.0.0.1', async () => {
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    fs.writeFileSync(path.join(app.getPath('userData'), 'simulator-state-v2.json'), JSON.stringify({
      selectedDeviceId: 'iphone-duo-folded', currentUrl: url, scale: 0.85, hudCollapsed: true
    }));
    require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname, '../../dist-electron/index.js'));
    await app.whenReady();
    const win = await until(() => BrowserWindow.getAllWindows()[0], 'window');
    win.show(); win.focus();
    const shell = win.webContents, evaluate = code => shell.executeJavaScript(code);
    const guest = await until(() => webContents.getAllWebContents().find(w => w.getType() === 'webview' && w.getURL() === url && !w.isLoading()), 'fixture');
    const token = await guest.executeJavaScript('window.visitToken');
    const click = async selector => {
      const point = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect();
        const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
        if(!el.contains(document.elementFromPoint(x,y))) throw Error('Obscured control'); return {x,y}; })()`);
      for (const type of ['mouseDown','mouseUp']) shell.sendInputEvent({type,...point,button:'left',clickCount:1});
    };
    await until(() => evaluate("!!document.querySelector('.duo-3d-stage-root[data-motion-ready]') && document.querySelector('.duo-hinge-slider')?.value==='0'"), 'prepared cover');
    if (await evaluate("document.querySelector('.duo-bottom-minibar').dataset.motion==='reduced'")) await click('.duo-enable-motion');
    await until(() => evaluate("document.querySelector('.duo-bottom-minibar').dataset.motion==='full'"), 'full motion');

    await evaluate(`(() => {
      const stage=document.querySelector('.duo-3d-stage-root');
      const nativeRAF=window.requestAnimationFrame.bind(window);
      const clock=window.focusClock={stop:null,now:performance.now(),last:-1};
      document.querySelector('.duo-fold-toggle').addEventListener('click',()=>{clock.now=performance.now();clock.last=-1},true);
      window.requestAnimationFrame=cb=>nativeRAF(real=>{
        if(real!==clock.last){
          clock.last=real;
          if(clock.stop===null || stage.dataset.motionFrame!==String(clock.stop)) clock.now+=6;
        }
        cb(clock.now);
      });
      const marker=document.createElement('div');
      marker.id='focus-fence';marker.style.cssText='position:fixed;top:0;left:0;width:8px;height:8px;z-index:2147483647;pointer-events:none';
      document.body.append(marker);
      const control=document.createElement('style');
      control.textContent='.focus-control .duo-focus-source{filter:none!important}';
      document.head.append(control);
    })()`);
    const capture = async (control) => {
      await evaluate(`document.body.classList.toggle('focus-control',${control});document.querySelector('#focus-fence').style.background='${control ? 'red' : 'lime'}'`);
      let previous;
      return until(async () => {
        const image = await shell.capturePage(), px = image.toBitmap(), i = (2 * image.getSize().width + 2) * 4;
        if (!(control ? px[i+2]>250 && px[i+1]<5 : px[i+1]>250 && px[i+2]<5)) return false;
        // The native guest and the masked mirror can submit after the shell.
        const {width,height}=image.getSize();
        const strip=image.crop({x:0,y:Math.floor(height*0.42),width,height:36}).toBitmap();
        const stable=previous?.equals(strip);
        previous=strip;
        return stable && image;
      }, 'composited ' + (control ? 'control' : 'focus'));
    };
    const samples = [];
    for (const opening of [true,false]) {
      const angles = opening ? [72,108,126,144] : [144,126,108,72];
      await evaluate('focusClock.stop='+angles[0]/3);
      await click('.duo-fold-toggle');
      for (const angle of angles) {
        await evaluate('focusClock.stop='+angle/3);
        await until(() => evaluate(`document.querySelector('.duo-3d-stage-root').dataset.motionFrame==='${angle/3}'`), angle+'°');
        if (angle !== 126) await until(async () =>
          await guest.executeJavaScript('screen.width') === (angle < 126 ? 466 : 951), 'emulated screen width');
        await until(() => evaluate("!document.querySelector('.duo-anchored-blur') || !!document.querySelector('.duo-focus-source .guest-mirror-ready')"), 'live blurred surface');
        const before = await capture(false);
        const expectedWidth = await evaluate("document.querySelector('.duo-slice-primary webview').clientWidth");
        const guestSize = await until(async () => {
          const size = await guest.executeJavaScript('({layoutWidth:innerWidth,screenWidth:screen.width})');
          return Math.abs(size.layoutWidth - expectedWidth) <= 1 && size;
        }, 'guest reflow');

        const size = await evaluate(`(() => {
          const plane=document.querySelector('.duo-slice-primary > .duo-slice-inner-viewport');
          const blur=plane.querySelector('.duo-anchored-blur');
          const xStops=blur ? [...blur.style.maskImage.matchAll(/([-\\d.]+)px/g)].map(m=>Number(m[1])) : [];
          function point(x){const p=document.createElement('i');p.style.cssText='position:absolute;width:0;height:0;top:345px;left:'+x+'px';plane.append(p);
            const r=p.getBoundingClientRect();p.remove();return {x:r.x,y:r.y}}
          return {face:blur?.dataset.face, radius:blur?parseFloat(blur.querySelector('.duo-focus-source').style.filter.slice(5)):0,
            moving:point(xStops.length?(xStops[0]+xStops[1])/2:250), held:point(820), viewportWidth:innerWidth};
        })()`);
        const control = await capture(true);
        const moving = differenceAt(before, control, size.moving, size.viewportWidth);
        const held = differenceAt(before, control, size.held, size.viewportWidth);
        samples.push({direction:opening?'open':'close',angle,...guestSize,...size,movingDifference:moving,heldDifference:held});
        console.log(JSON.stringify(samples.at(-1)));
        fs.writeFileSync(path.join(output,(opening?'open-':'close-')+angle+'.png'), before.toPNG());
        assert(held < 1, 'Held display lost focus at '+angle+'°');
        if (angle === 144) assert.equal(size.radius,0);
        else {
          assert.equal(size.face, angle < 90 ? 'cover' : 'innerLeft');
          assert(moving > 2, 'No visible blur on the moving glass at '+angle+'°');
          if (angle === 126) assert.equal(size.radius,7);
        }
      }
      await evaluate("document.body.classList.remove('focus-control');focusClock.stop=null");
      await until(() => evaluate(`document.querySelector('.duo-bottom-minibar').dataset.target==='paused' && document.querySelector('.duo-hinge-slider').value==='${opening?180:0}'`), 'resting endpoint');
    }
    const held = [];
    await click('.duo-settings');
    const rect=await until(()=>evaluate(`(()=>{const el=document.querySelector('.duo-hinge-slider'),r=el.getBoundingClientRect();
      return r.width>0 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el && r.toJSON()})()`), 'revealed angle control');
    await capture(false);
    const point = deg => ({x:Math.round(rect.x+10+(rect.width-20)*deg/180),y:Math.round(rect.y+rect.height/2)});
    shell.sendInputEvent({type:'mouseDown',...point(123),button:'left',clickCount:1});
    for (const degrees of [124,125,126,127,126,125]) {
      shell.sendInputEvent({type:'mouseMove',...point(degrees),button:'left',modifiers:['leftButtonDown']});
      await until(() => evaluate(`Number(document.querySelector('.duo-hinge-slider').value)===${degrees}`), degrees+' degrees while dragging');
      const width=degrees<126?466:951;
      await until(async () => await guest.executeJavaScript('screen.width')===width,'actual guest profile '+width);
      held.push({degrees,screenWidth:await guest.executeJavaScript('screen.width'),guestId:guest.id,tokenRetained:await guest.executeJavaScript('window.visitToken')===token});
    }
    await until(() => evaluate("!!document.querySelector('.duo-anchored-blur[data-face=innerLeft]')"), 'dragged focus');
    shell.sendInputEvent({type:'mouseUp',...point(125),button:'left',clickCount:1});
    await until(() => evaluate("!document.querySelector('.duo-anchored-blur')"),'released glass');
    // Read after a native paint, so releasing cannot switch the profile back.
    await capture(false);
    assert.equal(await guest.executeJavaScript('screen.width'),466);
    fs.writeFileSync(path.join(output,'handoff-profile.json'),JSON.stringify(held,null,2));
    console.log('GUEST PROFILE', JSON.stringify(held));
    assert.equal(token, await guest.executeJavaScript('window.visitToken'));
    assert.equal(webContents.getAllWebContents().filter(w=>w.getType()==='webview').length, 1);
    fs.writeFileSync(path.join(output,'focus.json'), JSON.stringify(samples,null,2));
    console.log('PASS focus: painted cover, inner and held glass in both directions');
    app.exit(0);
  } catch (e) {
    console.error(e);
    const w=BrowserWindow.getAllWindows()[0];
    if(w) console.error('Focus inspection state', await w.webContents.executeJavaScript(`({
      angle:document.querySelector('.duo-hinge-slider')?.value,
      target:document.querySelector('.duo-bottom-minibar')?.dataset.target,
      mode:document.querySelector('.duo-bottom-minibar')?.dataset.motion,
      frame:document.querySelector('.duo-3d-stage-root')?.dataset.motionFrame
    })`));
    app.exit(1);
  }
});
