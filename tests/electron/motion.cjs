// Real pointer/keyboard input and compositor evidence for interruptible folding.
const { app, BrowserWindow, webContents } = require('electron');
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
  fs.writeFileSync(path.join(app.getPath('userData'), 'simulator-state-v2.json'), JSON.stringify({
    selectedDeviceId: 'iphone-duo-folded', currentUrl: process.env.SIMULATOR_DEFAULT_URL,
    scale: 0.7, hudCollapsed: true
  }));
  require(path.resolve(__dirname, '../../dist-electron/index.js'));
  await app.whenReady();
  try {
    await wait(() => BrowserWindow.getAllWindows().length > 0);
    const win = BrowserWindow.getAllWindows()[0], shell = win.webContents;
    await wait(() => shell.executeJavaScript('!!window.simulatorBridge'));
    win.show();
    win.focus();
    const reducedBySystem = await shell.executeJavaScript("matchMedia('(prefers-reduced-motion: reduce)').matches");
    console.log('Default desktop motion preference:', reducedBySystem ? 'reduced' : 'normal', 'window:', win.getBounds());
    const state = () => shell.executeJavaScript(`(() => {const bar=document.querySelector('.duo-bottom-minibar'),slider=document.querySelector('.duo-hinge-slider');return bar&&{angle:Number(slider.value),target:bar.dataset.target,posture:bar.dataset.posture,rect:slider.getBoundingClientRect().toJSON()}})()`);
    await wait(async () => (await state())?.angle === 0);
    await wait(() => webContents.getAllWebContents().some(w=>w.getType()==='webview' && w.getURL().startsWith(process.env.SIMULATOR_DEFAULT_URL) && !w.isLoading()));
    const guests = () => webContents.getAllWebContents().filter(w=>w.getType()==='webview');
    const guest = guests()[0], token = await guest.executeJavaScript('window.sessionToken');
    const click = async (selector, slow=false) => {
      let r;
      await wait(async () => {
        r = await shell.executeJavaScript(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el || !el.checkVisibility()) return null;
          const rect = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) ? rect.toJSON() : null;
        })()`);
        return !!r;
      }).catch(() => { throw Error('Control is not visible or is covered: ' + selector); });
      const event = {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2),button:'left',clickCount:1,modifiers:slow?['shift']:[]};
      shell.sendInputEvent({type:'mouseMove',x:event.x,y:event.y});
      shell.sendInputEvent({type:'mouseDown',...event}); shell.sendInputEvent({type:'mouseUp',...event});
    };
    // Frame submissions and OOPIF hit regions can lag a DOM resize on X11.
    const awaitShellPaint = async () => {
      await shell.executeJavaScript(`(()=>{const marker=document.createElement('i');marker.id='controls-paint-fence';
        marker.style.cssText='position:fixed;top:0;left:0;width:8px;height:8px;z-index:2147483647;background:lime;pointer-events:none';
        document.body.append(marker)})()`);
      const green=async()=>{
        const image=await shell.capturePage(), pixel=image.toBitmap(), i=4*(2*image.getSize().width+2);
        return pixel[i]<10 && pixel[i+1]>245 && pixel[i+2]<10;
      };
      await wait(green);
      await shell.executeJavaScript("document.querySelector('#controls-paint-fence').remove()");
      await wait(async()=>!await green());
    };
    const settled = async angle => {
      let lastAngle, lastChange=Date.now();
      const deadline=Date.now()+60000;
      while (Date.now()<deadline) {
        const current=await state();
        if (current.angle===angle && current.target==='paused') return;
        if (current.angle!==lastAngle) { lastAngle=current.angle; lastChange=Date.now(); }
        assert(Date.now()-lastChange<18000,'Hinge stopped advancing at '+current.angle+'°');
        await sleep(50);
      }
      throw Error('Hinge did not settle at '+angle+'°');
    };
    const toggle = async slow => { await click('.duo-fold-toggle', slow); await sleep(80); };
    if (reducedBySystem) {
      // Measure the same explicit override available to someone with Reduce Motion enabled.
      await click('.duo-enable-motion');
      await wait(() => shell.executeJavaScript("document.querySelector('.duo-bottom-minibar').dataset.motion === 'full'"));
    }
    // Ordinary-speed playback must change the composited device itself. Sample
    // the device body, excluding the toolbar and the hinge controls. A single
    // scanline can miss a rotating bezel or a focus change above or below it.
    const readDock = () => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const button = rect('.duo-fold-toggle'), pause = rect('.duo-pause-btn'), angle = rect('.duo-settings');
      const bar = rect('.duo-bottom-minibar'), stage = rect('.iphone-stage-scaler');
      return { anchors:[button.x,button.y,pause.x,pause.y,angle.x,angle.y,stage.x,stage.y,rect('.preview-handle').x,rect('.preview-handle').width],
        gap:bar.top-stage.bottom, right:bar.right, width:innerWidth };
    };
    const fixed = await shell.executeJavaScript('('+readDock.toString()+')()');
    const ordinary = [];
    for (const destination of [180, 0]) {
      if (destination === 0) await click('.duo-settings');
      const bounds = win.getBounds();
      await shell.executeJavaScript(`(() => {
        const read = (${readDock.toString()});
        window.dockPositions = [read()];
        const angle = document.querySelector('.duo-current-angle');
        window.sawHandoff = false;
        window.handoffObserver = new MutationObserver(() => {
          window.dockPositions.push(read());
          if (angle.textContent === '126°') window.sawHandoff = true;
        });
        window.handoffObserver.observe(angle, {subtree:true, characterData:true, childList:true});
      })()`);
      const distinct = [];
      const started = Date.now();
      shell.beginFrameSubscription(image => {
        const { width, height } = image.getSize();
        const body = image.crop({ x: 0, y: Math.floor(height * 0.18), width, height: Math.floor(height * 0.62) })
          .resize({ width: 120, height: 64 }).toBitmap();
        const materiallyDifferent = previous => {
          let changed = 0;
          for (let i = 0; i < body.length; i += 4) {
            if (Math.abs(body[i + 3] - previous[i + 3]) > 45 ||
                Math.abs(body[i + 1] - previous[i + 1]) > 35) changed++;
          }
          return changed >= 0.02 * (body.length / 4);
        };
        if (distinct.every(frame => materiallyDifferent(frame.pixels))) {
          distinct.push({ ms: Date.now() - started, pixels: body });
        }
      });
      try {
        await toggle(false);
        await settled(destination);
        await sleep(450);
      } finally { shell.endFrameSubscription(); }
      const paintedAtMs = distinct.map(frame => frame.ms);
      const sawHandoff = await shell.executeJavaScript('window.handoffObserver.disconnect(); window.sawHandoff');
      assert(sawHandoff, 'Ordinary playback skipped the 126° optical handoff');
      const positions = await shell.executeJavaScript('window.dockPositions');
      for (const sample of positions) {
        assert.deepEqual(sample.anchors, fixed.anchors, 'Hinge controls moved during travel');
        assert(sample.gap >= 0 && sample.right <= sample.width, 'Hinge controls overlapped the stage or window edge');
      }
      assert.deepEqual(win.getBounds(),bounds,'Native window moved during travel');
      ordinary.push({ destination, paintedAtMs, sawHandoff, checkedPositions:positions.length, gap:fixed.gap });
      console.log(`Normal fold to ${destination}° on ${process.platform}: ${distinct.length} distinct device images at ${paintedAtMs.join(', ')} ms`);
      assert(distinct.length >= 6, `Only ${distinct.length} distinct device images toward ${destination}° at normal speed`);
    }
    await click('.duo-settings');
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
    const stopped = (await state()).angle;
    const pauseStatus = await shell.executeJavaScript(`(() => {
      const b=document.querySelector('.duo-pause-btn'), r=b.getBoundingClientRect();
      return { disabled:b.disabled, label:b.ariaLabel, x:r.x, y:r.y, width:innerWidth, height:innerHeight,
        hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) };
    })()`);
    console.log('Pause before resume', stopped, pauseStatus);
    assert.equal(pauseStatus.disabled,false,'Escape must leave a resumable trip');
    assert.equal(pauseStatus.hit,true,'Resume must be visible and receive pointer input');
    await sleep(200);
    assert.equal((await state()).angle, stopped, 'Escape must hold its angle');
    // On Core Animation the resumed sweep can finish before a round trip to
    // the main process. Observe the actual target change before sending input.
    await shell.executeJavaScript(`(() => {
      const bar = document.querySelector('.duo-bottom-minibar');
      window.observedResumeTarget = null;
      const observer = new MutationObserver(() => {
        if (bar.dataset.target === 'paused') return;
        window.observedResumeTarget = bar.dataset.target;
        observer.disconnect();
      });
      observer.observe(bar, { attributes: true, attributeFilter: ['data-target'] });
    })()`);
    await click('.duo-pause-btn');
    await wait(() => shell.executeJavaScript("window.observedResumeTarget === '0'"));
    await click('.duo-settings');
    await wait(()=>shell.executeJavaScript("document.querySelector('.duo-settings').ariaExpanded==='true'"));
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
      if(angle===16) {
        await awaitShellPaint();
        await click('button[title^="Show Toolbar"]');
        await wait(()=>shell.executeJavaScript("!!document.querySelector('.preview-toolbar')"));
        await awaitShellPaint();
        await click('button[aria-label="Device controls"]');
        await wait(()=>shell.executeJavaScript(`!!document.querySelector('.tb-action[aria-label="Unfold"]')`));
        await shell.executeJavaScript(`document.querySelector('button[aria-label="Hide toolbar"]').click()`);
        await wait(()=>shell.executeJavaScript(`!document.querySelector('.tb-action[aria-label="Unfold"]')`));
      }
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
    // This fixture has a cream background. An unpainted moving leaf exposes
    // the shell's dark backing over a large block between the rim and hinge.
    const blankLeafFraction = image => {
      const {width,height}=image.getSize(), pixels=image.toBitmap();
      let blank=0, total=0;
      for(let y=Math.round(height*.2);y<height*.62;y+=4) {
        for(let x=Math.round(width*.24);x<width*.47;x+=4) {
          const i=(y*width+x)*4;
          if(pixels[i+3]>240 && Math.abs(pixels[i]-12)<2 && Math.abs(pixels[i+1]-9)<2 && Math.abs(pixels[i+2]-9)<2) blank++;
          total++;
        }
      }
      return blank/total;
    };
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
          const blankFraction=blankLeafFraction(image);
          frames.push({name,destination,ms:Date.now()-started,...snapshot,blankFraction});
          assert(blankFraction<0.35,`Moving leaf lost page pixels in ${name} (${Math.round(100*blankFraction)}% backing)`);
          await sleep(60);
        } while(settledFrames<4 || stable<2);
      }
    }
    assert.equal(guests().length,1); assert.equal(guests()[0].id,guest.id);
    assert.equal(await guest.executeJavaScript('window.sessionToken'),token);
    assert.equal(await guest.executeJavaScript('document.querySelector("input").value'),'Kept through every fold');
    // OS reduced-motion preference uses an immediate, deterministic endpoint.
    if (!shell.debugger.isAttached()) shell.debugger.attach('1.3');
    await shell.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    if (reducedBySystem) {
      await shell.executeJavaScript(`(() => {const m=document.querySelector('[aria-label="More hinge options"]');
        m.value='motion';m.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(() => shell.executeJavaScript("localStorage.getItem('duo-always-animate')===null"));
    }
    const motionMode = () => shell.executeJavaScript("document.querySelector('.duo-bottom-minibar').dataset.motion");
    await wait(async () => await motionMode() === 'reduced');
    await toggle(false); await settled(0);
    assert(await shell.executeJavaScript("!!document.querySelector('.duo-enable-motion')"));
    fs.writeFileSync(path.join(out,'motion-reduced.png'),(await shell.capturePage()).toPNG());
    await click('.duo-enable-motion');
    await wait(async () => await motionMode() === 'full');
    assert.equal(await shell.executeJavaScript("localStorage.getItem('duo-always-animate')"),'true');
    await toggle(false); await settled(180);
    shell.debugger.detach();
    fs.writeFileSync(path.join(out,'motion.json'),JSON.stringify({checkpoints,scrubbed,sizes,guestId:guest.id,token,ordinary,frames,reducedMotion:true},null,2));
    console.log('PASS motion: reverse, pause, drag, keyboard, guest continuity, reduced motion');
    clearTimeout(watchdog); app.exit(0);
  } catch(error) {const w=BrowserWindow.getAllWindows()[0];if(w){fs.writeFileSync(path.join(out,'failure.png'),(await w.webContents.capturePage()).toPNG());console.log('FAILED STATE',await w.webContents.executeJavaScript('({angle:document.querySelector(".duo-hinge-slider")?.value,target:document.querySelector(".duo-bottom-minibar")?.dataset.target,focus:document.activeElement?.tagName})'));}console.error(error);app.exit(1);}
});
