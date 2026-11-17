// Real pointer/keyboard input and compositor evidence for interruptible folding.
const { app, BrowserWindow, webContents, screen } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const out = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-motion-'));
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-motion-data-')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = async fn => {
  for (let i = 0; i < 200; i++) { if (await fn()) return; await sleep(50); }
  throw Error('Hinge did not reach expected state');
};
const fixture = `<!doctype html><meta name="viewport" content="width=device-width"><style>
body{margin:0;background:#f6f4ef;color:#242624;font:20px system-ui;padding:28px}h1{font-size:42px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px}.tile{background:#c6d1c0;border-radius:24px;height:130px;padding:18px}.tile:nth-child(2n){background:#e4c3a3}
</style><small>LOCAL INTERACTION TEST</small><h1>Display continuity</h1><p>One page. One session.</p><input aria-label="Retained text" value="Kept through every fold"><div class="grid">${Array.from({length:9},(_,i)=>`<div class="tile">${i+1}</div>`).join('')}</div><script>window.sessionToken=Math.random()</script>`;
const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
const watchdog = setTimeout(() => app.exit(2), 220000);
server.listen(0, '127.0.0.1', async () => {
  process.env.SIMULATOR_DEFAULT_URL = `http://127.0.0.1:${server.address().port}/`;
  require(path.resolve(__dirname, '../../dist-electron/index.js'));
  await app.whenReady();
  try {
    await wait(() => BrowserWindow.getAllWindows().length > 0);
    const win = BrowserWindow.getAllWindows()[0], shell = win.webContents;
    await wait(() => shell.executeJavaScript('!!window.simulatorBridge'));
    const initial = await shell.executeJavaScript('window.simulatorBridge.getInitialPayload()');
    const display = screen.getDisplayNearestPoint(win.getBounds());
    const originalGetDisplay = screen.getDisplayNearestPoint;
    screen.getDisplayNearestPoint = () => ({...display, workAreaSize:{width:2560,height:1800}});
    win.webContents.send('simulator:external-state', {...initial.value.state, selectedDeviceId:'iphone-duo-folded', scale:0.7, hudCollapsed:true});
    const state = () => shell.executeJavaScript(`(() => {const bar=document.querySelector('.duo-bottom-minibar'),slider=document.querySelector('.duo-hinge-slider');return bar&&{angle:Number(slider.value),target:bar.dataset.target,posture:bar.dataset.posture,rect:slider.getBoundingClientRect().toJSON()}})()`);
    await wait(async () => (await state())?.angle === 0);
    await wait(() => webContents.getAllWebContents().some(w=>w.getType()==='webview' && w.getURL().startsWith(process.env.SIMULATOR_DEFAULT_URL) && !w.isLoading()));
    const guests = () => webContents.getAllWebContents().filter(w=>w.getType()==='webview');
    const guest = guests()[0], token = await guest.executeJavaScript('window.sessionToken');
    const click = async (selector, slow=false) => {
      const r = await shell.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
      const event = {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2),button:'left',clickCount:1,modifiers:slow?['shift']:[]};
      shell.sendInputEvent({type:'mouseDown',...event}); shell.sendInputEvent({type:'mouseUp',...event});
    };
    const settled = angle => wait(async()=>{const s=await state();return s.angle===angle&&s.target==='paused'});
    const toggle = async slow => { await click('.duo-fold-toggle', slow); await sleep(80); };
    const checkpoints = [];
    // A double activation before the next animation frame must reverse the
    // pending destination on either side of halfway, not restart the same trip.
    for (const angle of [0,180]) {
      await settled(angle);
      checkpoints.push({case:'rapid reversal',...await state()});
      await shell.executeJavaScript(`(() => {const b=document.querySelector('.duo-fold-toggle');b.click();b.click()})()`);
      await settled(angle);
      if(angle===0){await toggle(false);await settled(180);}
    }
    // Start then pause in the same input turn so this checks intent even on
    // throttled/headless CI renderers, without relying on an arbitrary sleep.
    await shell.executeJavaScript(`(() => {document.querySelector('.duo-fold-toggle').click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))})()`);
    await wait(async()=>(await state()).target==='paused');
    const stopped = (await state()).angle; await sleep(200);
    assert.equal((await state()).angle, stopped, 'Escape must hold its angle');
    await click('.duo-pause-btn');
    await wait(async()=>(await state()).target!=='paused');
    let s = await state(), r=s.rect;
    const scrubPosture=s.posture;
    const y=Math.round(r.y+r.height/2), x=value=>Math.round(r.x+10+(r.width-20)*value/180);
    const scrubbed=[];
    for(const angle of [8,16,30,90,160,172]) {
      shell.sendInputEvent({type:'mouseDown',x:x(s.angle),y,button:'left',clickCount:1});
      shell.sendInputEvent({type:'mouseMove',x:x(angle),y,button:'left',modifiers:['leftButtonDown']});
      shell.sendInputEvent({type:'mouseUp',x:x(angle),y,button:'left',clickCount:1});
      // The first grab catches a moving thumb; its exact coordinate can move
      // between IPC and pointer dispatch. Subsequent drags start at rest.
      await wait(async()=>angle===8 ? (await state()).target==='paused' : Math.abs((await state()).angle-angle)<2);
      s=await state(); scrubbed.push(s);
      assert.equal(s.posture,scrubPosture); assert.equal(s.target,'paused');
    }
    const released=(await state()).angle; await sleep(200); assert.equal((await state()).angle,released);
    // Native range keyboard semantics remain usable.
    win.focus();
    shell.sendInputEvent({type:'keyDown',keyCode:'Home'}); shell.sendInputEvent({type:'keyUp',keyCode:'Home'}); await settled(0);
    shell.sendInputEvent({type:'keyDown',keyCode:'End'}); shell.sendInputEvent({type:'keyUp',keyCode:'End'}); await settled(180);
    const sizes=await shell.executeJavaScript(`Array.from(document.querySelectorAll('.duo-fold-toggle,.duo-pause-btn,.duo-hinge-slider')).map(e=>({class:e.className,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))`);
    assert(sizes.every(r=>r.height>=32)); assert(sizes.find(r=>r.class==='duo-hinge-slider').width>150);
    // Drain compositor work from the drag sweep before recording. A green
    // overlay round trip proves both halves have actually painted the guest.
    const countGreen = image => {
      const {width,height}=image.getSize(),pixels=image.toBitmap(),counts=[0,0];
      for(let y=Math.round(height*.15);y<height*.65;y+=4)for(let x=Math.round(width*.18);x<width*.82;x+=4){
        const i=(y*width+x)*4,[b,g,r]=pixels.subarray(i,i+3);
        if(g>160&&r<80&&b<80)counts[x<width/2?0:1]++;
      }
      return counts;
    };
    await guest.executeJavaScript(`(()=>{const e=document.createElement('div');e.id='paint-fence';e.style.cssText='position:fixed;inset:0;background:#00ff00;z-index:2147483647';document.body.append(e)})()`);
    await wait(async()=>countGreen(await shell.capturePage()).every(n=>n>100));
    await guest.executeJavaScript(`document.querySelector('#paint-fence').remove()`);
    await wait(async()=>countGreen(await shell.capturePage()).every(n=>n===0));
    fs.writeFileSync(path.join(out,'motion-controls.png'),(await shell.capturePage()).toPNG());
    const frames=[];
    if(process.env.SIMULATOR_RECORD_MOTION==='1') {
      fs.mkdirSync(path.join(out,'frames'),{recursive:true});
      // 8x playback supplies inspectable moving frames on software rendering.
      for(const destination of [0,180]) {
        await toggle(true); const started=Date.now();
        let previousHash='',stable=0,settledFrames=0;
        do {
          const image=await shell.capturePage(), snapshot=await state();
          const name=`frame-${String(frames.length).padStart(4,'0')}.png`;
          const png=image.toPNG(), hash=createHash('sha256').update(png).digest('hex');
          if(snapshot.target==='paused'){settledFrames++;stable=hash===previousHash?stable+1:0;}
          previousHash=hash;
          fs.writeFileSync(path.join(out,'frames',name),png);
          frames.push({name,destination,ms:Date.now()-started,...snapshot});
          await sleep(60);
        } while(settledFrames<4 || stable<2);
      }
    }
    assert.equal(guests().length,1); assert.equal(guests()[0].id,guest.id);
    assert.equal(await guest.executeJavaScript('window.sessionToken'),token);
    assert.equal(await guest.executeJavaScript('document.querySelector("input").value'),'Kept through every fold');
    // OS reduced-motion preference uses an immediate, deterministic endpoint.
    await shell.debugger.attach('1.3');
    await shell.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await toggle(false); await settled(0); shell.debugger.detach();
    fs.writeFileSync(path.join(out,'motion.json'),JSON.stringify({checkpoints,scrubbed,sizes,guestId:guest.id,token,frames,reducedMotion:true},null,2));
    screen.getDisplayNearestPoint=originalGetDisplay;
    console.log('PASS motion: reverse, pause, drag, keyboard, guest continuity, reduced motion');
    clearTimeout(watchdog); app.exit(0);
  } catch(error) {const w=BrowserWindow.getAllWindows()[0];if(w){fs.writeFileSync(path.join(out,'failure.png'),(await w.webContents.capturePage()).toPNG());console.log('FAILED STATE',await w.webContents.executeJavaScript('({angle:document.querySelector(".duo-hinge-slider")?.value,target:document.querySelector(".duo-bottom-minibar")?.dataset.target,focus:document.activeElement?.tagName})'));}console.error(error);app.exit(1);}
});
