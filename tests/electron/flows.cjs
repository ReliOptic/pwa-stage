const assert = require('node:assert/strict');
const path = require('node:path');
const {app,BrowserWindow,webContents}=require('electron');
const fs=require('node:fs');
const http=require('node:http');
const root=process.env.SIMULATOR_TEST_OUTPUT;
const data=fs.mkdtempSync(root+'/flows-data-');
app.setPath('userData',data);
fs.writeFileSync(data+'/simulator-state-v2.json',JSON.stringify({shellMode:'ios-safari',selectedDeviceId:'iphone-17-pro',hudCollapsed:true,currentUrl:'http://127.0.0.1:18771/'}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn)=>{for(let i=0;i<150;i++){try{const r=await fn();if(r)return r}catch{}await sleep(100)}throw Error('wait timeout')};
const server=http.createServer((req,res)=>{
 const url = new URL(req.url, 'http://127.0.0.1:18771');
 const route = url.searchParams.get('site') === 'chrome' ? 'chrome' : 'safari';
 if(url.pathname === '/manifest.json') {
   res.writeHead(302,{Location:'/assets/app/manifest.json?site='+route});res.end();return;
 }
 if(url.pathname === '/assets/app/manifest.json') {
   res.setHeader('Content-Type','application/json');
   res.end(JSON.stringify({name:'Tide Table',display:'browser',start_url:'../../'+route}));return;
 }
 if(url.pathname === '/icon.svg') {
   res.setHeader('Content-Type','image/svg+xml');
   res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><rect width="90" height="90" fill="#084e51"/><path d="M14 52q14-29 31-6t31-5M14 64q14-29 31-6t31-5" fill="none" stroke="#bdf6d3" stroke-width="5"/></svg>');return;
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f0e7"><link rel="manifest" href="/manifest.json?site=${url.pathname.slice(1)}"><link rel="apple-touch-icon" href="/icon.svg"><title>Tide Table</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f0e7;color:#133e40;font:16px system-ui}main{padding:32px 22px}header{font:bold 22px Georgia}section{background:#104f51;color:#edfae9;border-radius:18px;margin:32px 0 20px;padding:24px 20px}h1{font:42px/1 Georgia;margin:16px 0}h2{font:26px Georgia}p{color:#506865}section p{color:#bbdac9}svg{width:100%}footer{display:flex;justify-content:space-between;padding:15px 0;border-top:1px solid #becbc4}</style><main><header>Tide Table</header><section>Point Reyes<h1>2.4 m</h1><p>Incoming tide</p><svg viewBox="0 0 300 90"><path d="M0 77C65 77 65 10 130 10s92 84 170 40" fill="none" stroke="#abefce" stroke-width="4"/></svg></section><h2>Today’s tides</h2><footer>High tide <b>10:42</b></footer><footer>Low tide <b>16:58</b></footer></main><script>window.probeToken=Math.random()</script>`);
});
setTimeout(()=>app.exit(2),145000);
server.listen(18771,'127.0.0.1',async()=>{
 require(path.resolve(__dirname, '../../dist-electron/index.js'));await app.whenReady();
 try{
 const win=await wait(()=>BrowserWindow.getAllWindows()[0]);win.show();win.focus();win.webContents.setBackgroundThrottling(false);
 const js=e=>win.webContents.executeJavaScript(e);
 const press=async expression=>{
   // Wait out entrance animations and require an actual, unobstructed hit target.
   const point=await wait(()=>js(`(()=>{const el=${expression};if(!el)return null;const r=el.getBoundingClientRect();const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return el.contains(document.elementFromPoint(x,y))?{x,y}:null})()`));
   win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
   win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
   await sleep(80);
 };
 const click=selector=>press('document.querySelector('+JSON.stringify(selector)+')');
 const clickText=text=>press('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(text)+')');
 const guests=()=>webContents.getAllWebContents().filter(w=>w.getType()==='webview');
 const site='http://127.0.0.1:18771';
 const pageLoaded=(route='safari')=>guests().length===1&&guests()[0].getURL()===site+'/'+route&&!guests()[0].isLoading();
 const present=selector=>js('!!document.querySelector('+JSON.stringify(selector)+')');
 const capture=async name=>{
   await js(`Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`);
   const mark = color => js(`(()=>{let m=document.querySelector('#capture-marker');if(!m){m=document.createElement('div');m.id='capture-marker';document.body.append(m)}m.style.cssText='position:fixed;top:0;left:0;width:8px;height:8px;z-index:2147483647;pointer-events:none;background:'+ ${JSON.stringify(color)}})()`);
   // A shell marker fences Chromium's compositor after the visible sheet or app has settled.
   await mark('lime');
   const green = image => {const px=image.toBitmap(),i=(2*image.getSize().width+2)*4;return px[i+1]>230&&px[i]<20&&px[i+2]<20;};
   await wait(async()=>green(await win.webContents.capturePage()));
   await js('document.querySelector("#capture-marker").remove()');
   let image;
   await wait(async()=>{image=await win.webContents.capturePage();return !green(image);});
   fs.writeFileSync(path.join(root,name+'.png'),image.toPNG());
 };
 const setField=async(selector,value)=>{
   await click(selector);
   await wait(()=>js('document.activeElement.matches('+JSON.stringify(selector)+')'));
   await js('document.activeElement.select()');
   await win.webContents.insertText(value);
   assert.equal(await js('document.activeElement.value'),value);
 };
 const goHome=async()=>{
   await click('button[aria-label="Home"]');
   await wait(()=>present('.home-screen-home'));
 };
 const enterBrowser=async(browser)=>{
   await click('.home-dock [aria-label="'+browser+'"]');
   await wait(()=>present('.app-surface-app'));
   await wait(()=>present('input[aria-label="Website address"]'));
 };
 const install=async(browser,route,name)=>{
   await enterBrowser(browser);
   await setField('.ios-address-form input',site+'/'+route);
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
   win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
   win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
   await wait(()=>pageLoaded(route));
   await capture(route+'-browser');
   if(browser==='Safari') { await click('[aria-label="More"]'); await clickText('Share'); }
   else await click('[aria-label="Share"]');
   await capture(route+'-share');
   await clickText('Add to Home Screen');
   await wait(()=>present('.ios-card-fields input'));
   assert(await js('document.querySelector(".ios-card-toggle input").checked'));
   await setField('.ios-card-fields input',name);
   await capture(route+'-confirm');
   await clickText('Add');await wait(()=>present('.home-screen-home'));
   await capture(route+'-home');
   await click('.home-grid [aria-label="'+name+'"]');await wait(()=>present('.app-surface-app'));
   await wait(()=>pageLoaded(route));
   const result=await js('window.simulatorBridge.getInitialPayload()');
   assert.equal(result.value.state.shellMode,'pwa-standalone');
   assert.equal(result.value.state.currentUrl,site+'/'+route);
   assert.equal(await present('.ios-address-form'),false);
   await capture(route+'-standalone');
 };
 await wait(()=>pageLoaded(''));await sleep(500);
 await goHome();
 await install('Safari','safari','Coast');
 await goHome();
 await install('Chrome','chrome','Harbor');
 await goHome();
 await enterBrowser('Chrome');
 await click('[aria-label="Share"]');await clickText('Add to Home Screen');
 await wait(()=>present('.ios-card-toggle input'));
 await click('.ios-switch');await clickText('Add');await wait(()=>present('.home-screen-home'));
 const installed=await js('JSON.parse(localStorage.getItem("pwa-stage.installed-web-apps.v1"))');
 assert.equal(installed.length,2);
 assert.equal(installed[0].launchUrl,site+'/chrome');
 assert.equal(installed[0].opensAsWebApp,false);
 assert.equal(installed[1].name,'Coast');
 await click('.home-grid [aria-label="Tide Table"]');await wait(()=>present('.app-surface-app'));
 const chromeBookmarkLaunch=await js('window.simulatorBridge.getInitialPayload()');
 win.webContents.send('simulator:external-state',{...chromeBookmarkLaunch.value.state,selectedDeviceId:'iphone-duo-unfolded',duoDisplayMode:'single-span'});
 await wait(async()=>js('!!document.querySelector(".duo-slice-primary webview")'));
 await wait(()=>pageLoaded('chrome'));
 const guest=guests()[0];const before={id:guest.id,token:await guest.executeJavaScript('window.probeToken')};
 await click('button[aria-label="Posture and finish"]');
 await click('button[title="Cover Display (5.4″ · 466×678pt)"]');
 await wait(()=>js('document.querySelector(".duo-hinge-slider").value==="0"'));await sleep(500);
 const closed={count:guests().length,id:guests()[0].id,token:await guests()[0].executeJavaScript('window.probeToken')};
 await click('button[aria-label="Posture and finish"]');
 await click('button[title="Inner Wide Display (7.6″ · 951×669pt)"]');
 await wait(()=>js('document.querySelector(".duo-hinge-slider").value==="180"'));await sleep(500);
 const open={count:guests().length,id:guests()[0].id,token:await guests()[0].executeJavaScript('window.probeToken')};
 win.webContents.send('simulator:shortcut',{key:'h',shift:true});await wait(()=>js('!!document.querySelector(".home-screen-home")'));
 await click('button[aria-label="Posture and finish"]');
 await click('button[title="Cover Display (5.4″ · 466×678pt)"]');await wait(()=>js('document.querySelector(".duo-hinge-slider").value==="0"'));await sleep(500);
 const homeStays=await js('!!document.querySelector(".home-screen-home")');
 const result={standaloneRoutes:[site+'/safari',site+'/chrome'],installed,chromeBookmarkLaunch:chromeBookmarkLaunch.value.state.shellMode,before,closed,open,homeStays};
 assert.equal(installed[0].opensAsWebApp,false); assert.equal(result.chromeBookmarkLaunch,'ios-safari');
 assert.equal(closed.count,1); assert.equal(open.count,1);
 assert.equal(before.id,closed.id); assert.equal(before.id,open.id);
 assert.equal(before.token,closed.token); assert.equal(before.token,open.token);
 assert.equal(homeStays,true);
 fs.writeFileSync(root+'/flows.json',JSON.stringify(result,null,2));console.log('FLOWS_RESULT '+JSON.stringify(result));app.exit(0);
 }catch(e){
   const win=BrowserWindow.getAllWindows()[0];
   if(win)console.error('Install state',await win.webContents.executeJavaScript('({field:document.querySelector(".ios-address-form input")?.value,focus:document.activeElement?.outerHTML.slice(0,160),sheet:document.querySelector("[role=dialog]")?.getAttribute("aria-label")})'));
   console.error(e);app.exit(1);
 }
});
