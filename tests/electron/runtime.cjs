const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, webContents } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const root = process.env.SIMULATOR_TEST_OUTPUT;
app.setPath('userData', fs.mkdtempSync(root + '/runtime-data-'));
const requests = [];
const server = http.createServer((req, res) => {
  requests.push({url:req.url, ua:req.headers['user-agent']});
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Probe</title>
  <style>#status{color:red}@media(display-mode:standalone){#status{color:green}}@media(min-width:0px){@media(display-mode:standalone){#nested{color:green}}}</style>
  <script>window.boot={ua:navigator.userAgent,standalone:navigator.standalone??null,vendor:navigator.vendor,dpr:devicePixelRatio,screen:screen.width};</script>
  <div id="status">Mode</div><div id="nested">Nested</div><a href="/second">Next</a><input id="input"><div style="height:2000px"></div>`);
});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const evaluate = (wc, expression) => wc.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(r=>r.result.value);
const probe = async wc => evaluate(wc, `({boot:window.boot,now:{ua:navigator.userAgent,standalone:navigator.standalone,vendor:navigator.vendor,dpr:devicePixelRatio,screen:screen.width},css:getComputedStyle(document.getElementById('status')).color,nested:getComputedStyle(document.getElementById('nested')).color,js:matchMedia('(display-mode:standalone)').matches})`);
setTimeout(()=>{console.log('PROBE_TIMEOUT');app.exit(2)},25000);
server.listen(0,'127.0.0.1',async()=>{
  const site='http://127.0.0.1:'+server.address().port;
  process.env.SIMULATOR_DEFAULT_URL=site+'/first';
  process.env.SIMULATOR_ALWAYS_ON_TOP='true';
  require(path.resolve(__dirname, '../../dist-electron/index.js'));
  await app.whenReady();
  try {
    let guest;
    for(let i=0;i<100;i++){
      guest=webContents.getAllWebContents().find(w=>w.getType()==='webview');
      if(guest && guest.debugger.isAttached() && guest.getURL().startsWith(site+'/')) break;
      await sleep(100);
    }
    const probeLoaded = async () => {
      for(let i=0;i<100;i++) {
        if(await evaluate(guest, "document.readyState === 'complete' && !!window.boot && !!document.querySelector('#nested')")) {
          return probe(guest);
        }
        await sleep(50);
      }
      throw Error('Fixture did not finish loading');
    };
    const first=await probeLoaded();
    const reloaded=new Promise(resolve=>guest.once('did-finish-load',resolve));
    guest.reload();
    await reloaded;
    const reload=await probeLoaded();
    await evaluate(guest, `document.querySelector('a').click()`);
    await sleep(1200);
    const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getType()==='window');
    const state=await win.webContents.executeJavaScript('window.simulatorBridge.getInitialPayload()');
    const output={requests,first,reload,navigated:guest.getURL(),stateUrl:state.value.state.currentUrl};
    assert.match(requests[0].ua, /iPhone OS/);
    for (const result of [first, reload]) {
      assert.equal(result.boot.standalone, true);
      assert.equal(result.boot.vendor, 'Apple Computer, Inc.');
      assert.equal(result.nested, 'rgb(0, 128, 0)');
    }
    assert.equal(output.navigated, output.stateUrl);
    await evaluate(guest, `const style = document.createElement('style'); style.textContent = '@supports(display:grid){@media(display-mode:standalone){#nested{color:blue}}}'; document.head.append(style)`);
    await sleep(100);
    assert.equal(await evaluate(guest, `getComputedStyle(document.querySelector('#nested')).color`), 'rgb(0, 0, 255)');
    // Dispatch real guest input. Touch mode must turn mouse presses into touch
    // events; Mouse mode must restore pointer hover/selection without reloading.
    const listenInput = () => evaluate(guest, `window.inputEvents=[]; document.addEventListener('pointerdown', e=>inputEvents.push(e.pointerType)); document.addEventListener('touchstart', ()=>inputEvents.push('touchstart'))`);
    await listenInput();
    win.show(); win.focus(); guest.focus();
    const click = async () => {
      guest.sendInputEvent({type:'mouseMove',x:100,y:120});
      await sleep(50);
      guest.sendInputEvent({type:'mouseDown',x:100,y:120,button:'left',clickCount:1});
      guest.sendInputEvent({type:'mouseUp',x:100,y:120,button:'left',clickCount:1});
      for (let i=0; i<30; i++) {
        if (await evaluate(guest, 'inputEvents.length > 0')) break;
        await sleep(50);
      }
    };
    for (let attempt=0; attempt<3; attempt++) {
      await click();
      if (await evaluate(guest, 'inputEvents.length > 0')) break;
    }
    output.touchEvents = await evaluate(guest, 'inputEvents');
    assert.ok(output.touchEvents.includes('touchstart'), JSON.stringify(output.touchEvents));
    win.webContents.send('simulator:external-state',{...state.value.state,touchCursorEnabled:true});
    await sleep(350);
    await evaluate(guest, 'window.inputEvents=[]');
    for (let attempt=0; attempt<3; attempt++) {
      await click();
      if (await evaluate(guest, 'inputEvents.length > 0')) break;
    }
    output.mouseEvents = await evaluate(guest, 'inputEvents');
    assert.deepEqual(output.mouseEvents, ['mouse']);
    console.log('REVIEW_RESULT '+JSON.stringify(output));
    fs.writeFileSync(root+'/runtime.json',JSON.stringify(output,null,2));
    app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
