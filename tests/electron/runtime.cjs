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
server.listen(18769,'127.0.0.1',async()=>{
  process.env.SIMULATOR_DEFAULT_URL='http://127.0.0.1:18769/first';
  process.env.SIMULATOR_ALWAYS_ON_TOP='true';
  require(path.resolve(__dirname, '../../dist-electron/index.js'));
  await app.whenReady();
  try {
    let guest;
    for(let i=0;i<100;i++){
      guest=webContents.getAllWebContents().find(w=>w.getType()==='webview');
      if(guest && guest.debugger.isAttached() && guest.getURL().includes('18769')) break;
      await sleep(100);
    }
    await sleep(1200);
    const first=await probe(guest);
    guest.reload();
    await sleep(1200);
    const reload=await probe(guest);
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
      await sleep(150);
    };
    await click();
    output.touchEvents = await evaluate(guest, 'inputEvents');
    assert.ok(output.touchEvents.includes('touchstart'), JSON.stringify(output.touchEvents));
    win.webContents.send('simulator:external-state',{...state.value.state,touchCursorEnabled:true});
    await sleep(350);
    await evaluate(guest, 'window.inputEvents=[]');
    await click();
    output.mouseEvents = await evaluate(guest, 'inputEvents');
    assert.deepEqual(output.mouseEvents, ['mouse']);
    console.log('REVIEW_RESULT '+JSON.stringify(output));
    fs.writeFileSync(root+'/runtime.json',JSON.stringify(output,null,2));
    app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
