const assert = require('node:assert/strict');
const path = require('node:path');
const {app,BrowserWindow,webContents}=require('electron');
const fs=require('node:fs');
const http=require('node:http');
const root=process.env.SIMULATOR_TEST_OUTPUT;
const data=fs.mkdtempSync(root+'/flows-data-');
app.setPath('userData',data);
fs.writeFileSync(data+'/simulator-state-v2.json',JSON.stringify({shellMode:'ios-safari',currentUrl:'http://127.0.0.1:18771/'}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn)=>{for(let i=0;i<150;i++){try{const r=await fn();if(r)return r}catch{}await sleep(100)}throw Error('wait timeout')};
const server=http.createServer((req,res)=>{
 if(req.url==='/manifest.json'){res.writeHead(302,{Location:'/assets/app/manifest.json'});res.end();return;}
 if(req.url==='/assets/app/manifest.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:'Test App',display:'browser',start_url:'../../'}));return;}
 res.setHeader('Content-Type','text/html');
 res.end('<!doctype html><meta name="viewport" content="width=device-width"><link rel="manifest" href="/manifest.json"><title>Probe App</title><script>window.probeToken=Math.random()</script><p>Local fixture</p><input id="value">');
});
setTimeout(()=>app.exit(2),55000);
server.listen(18771,'127.0.0.1',async()=>{
 require(path.resolve(__dirname, '../../dist-electron/index.js'));await app.whenReady();
 try{
 const win=await wait(()=>BrowserWindow.getAllWindows()[0]);const js=e=>win.webContents.executeJavaScript(e);
 const click=sel=>js('document.querySelector('+JSON.stringify(sel)+').click()');
 const clickText=text=>js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(text)+').click()');
 const guests=()=>webContents.getAllWebContents().filter(w=>w.getType()==='webview');
 const pageLoaded=()=>guests().length===1&&guests()[0].getURL()==='http://127.0.0.1:18771/'&&!guests()[0].isLoading();
 await wait(pageLoaded);await sleep(1500);
 await click('[aria-label="More"]');await clickText('Share');await clickText('Add to Home Screen');
 await wait(()=>js('!!document.querySelector(".ios-card-fields input")'));
 const toggleDefault=await js('document.querySelector(".ios-card-toggle input").checked');
 await clickText('Add');await wait(()=>js('!!document.querySelector(".home-screen-home")'));
 await click('.home-grid [aria-label="Test App"]');await sleep(1200);
 const safariLaunch=await js('window.simulatorBridge.getInitialPayload()');
 win.webContents.send('simulator:external-state',{...safariLaunch.value.state,shellMode:'ios-chrome'});await sleep(1200);
 await click('[aria-label="Share"]');await clickText('Add to Home Screen');await wait(()=>js('!!document.querySelector(".ios-card-toggle input")'));
 await click('.ios-card-toggle input');await clickText('Add');await wait(()=>js('!!document.querySelector(".home-screen-home")'));
 const installed=await js('JSON.parse(localStorage.getItem("pwa-stage.installed-web-apps.v1"))');
 await click('.home-grid [aria-label="Test App"]');await sleep(1000);
 const chromeBookmarkLaunch=await js('window.simulatorBridge.getInitialPayload()');
 win.webContents.send('simulator:external-state',{...chromeBookmarkLaunch.value.state,selectedDeviceId:'iphone-duo-unfolded',duoDisplayMode:'single-span'});
 await wait(async()=>js('!!document.querySelector(".duo-slice-primary webview")'));
 await wait(pageLoaded);
 const guest=guests()[0];const before={id:guest.id,token:await guest.executeJavaScript('window.probeToken')};
 await click('button[title="Cover Display (5.4″ · 466×678pt)"]');
 await wait(()=>js('document.querySelector(".duo-hinge-slider").value==="0"'));await sleep(500);
 const closed={count:guests().length,id:guests()[0].id,token:await guests()[0].executeJavaScript('window.probeToken')};
 await click('button[title="Inner Wide Display (7.6″ · 951×669pt)"]');
 await wait(()=>js('document.querySelector(".duo-hinge-slider").value==="180"'));await sleep(500);
 const open={count:guests().length,id:guests()[0].id,token:await guests()[0].executeJavaScript('window.probeToken')};
 win.webContents.send('simulator:shortcut',{key:'h',shift:true});await wait(()=>js('!!document.querySelector(".home-screen-home")'));
 await click('button[title="Cover Display (5.4″ · 466×678pt)"]');await wait(()=>js('document.querySelector(".duo-hinge-slider").value==="0"'));await sleep(500);
 const homeStays=await js('!!document.querySelector(".home-screen-home")');
 const result={toggleDefault,safariLaunch:safariLaunch.value.state.shellMode,installed,chromeBookmarkLaunch:chromeBookmarkLaunch.value.state.shellMode,before,closed,open,homeStays};
 assert.equal(toggleDefault,true); assert.equal(result.safariLaunch,'pwa-standalone');
 assert.equal(installed[0].opensAsWebApp,false); assert.equal(result.chromeBookmarkLaunch,'ios-safari');
 assert.equal(closed.count,1); assert.equal(open.count,1);
 assert.equal(before.id,closed.id); assert.equal(before.id,open.id);
 assert.equal(before.token,closed.token); assert.equal(before.token,open.token);
 assert.equal(homeStays,true);
 fs.writeFileSync(root+'/flows.json',JSON.stringify(result,null,2));console.log('FLOWS_RESULT '+JSON.stringify(result));app.exit(0);
 }catch(e){console.error(e);app.exit(1)}
});
