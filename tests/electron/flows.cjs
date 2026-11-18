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
 res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f0e7"><link rel="manifest" href="/manifest.json?site=${url.pathname.slice(1)}"><link rel="apple-touch-icon" href="/icon.svg"><title>Tide Table</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f0e7;color:#133e40;font:16px system-ui}main{padding:32px 22px}header{font:bold 22px Georgia}section{background:#104f51;color:#edfae9;border-radius:18px;margin:32px 0 20px;padding:24px 20px}h1{font:42px/1 Georgia;margin:16px 0}h2{font:26px Georgia}p{color:#506865}section p{color:#bbdac9}svg{width:100%}footer{display:flex;justify-content:space-between;padding:15px 0;border-top:1px solid #becbc4}</style><main><header>Tide Table</header><button id="site-settings" style="position:fixed;right:8%;top:18%;border:0;border-radius:18px;background:#d6ecdf;color:#16494c;padding:9px 14px" onclick="window.settingTapTrusted=event.isTrusted;document.querySelector('dialog').showModal()">Settings</button><dialog>Station settings <button onclick="this.parentElement.close()">Done</button></dialog><section>Point Reyes<h1>2.4 m</h1><p>Incoming tide</p><svg viewBox="0 0 300 90"><path d="M0 77C65 77 65 10 130 10s92 84 170 40" fill="none" stroke="#abefce" stroke-width="4"/></svg></section><h2>Today’s tides</h2><footer>High tide <b>10:42</b></footer><footer>Low tide <b>16:58</b></footer></main><script>window.probeToken=Math.random()</script>`);
});
setTimeout(()=>app.exit(2),240000);
server.listen(18771,'127.0.0.1',async()=>{
 require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname, '../../dist-electron/index.js'));await app.whenReady();
 try{
 const win=await wait(()=>BrowserWindow.getAllWindows()[0]);win.show();win.focus();win.webContents.setBackgroundThrottling(false);
 const js=e=>win.webContents.executeJavaScript(e);
 const press=async expression=>{

   // Wait out entrance animations and require an actual, unobstructed hit target.
   const point=await wait(()=>js(`(()=>{const el=${expression};if(!el)return null;const r=el.getBoundingClientRect();const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return el.contains(document.elementFromPoint(x,y))?{x,y}:null})()`));
   win.webContents.sendInputEvent({type:'mouseMove',...point});
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
 const toolsChecked = [];
 const checkBrowserTools=async(browser,route)=>{
   const guest=guests()[0];
   const settings=browser==='Safari'?'Website Settings':'Settings';
   await click(browser==='Safari'?'[aria-label="Page menu"]':'[aria-label="More"]');
   await clickText(settings);
   await click('[aria-label="Increase page zoom"]');
   await wait(()=>Math.abs(guest.getZoomFactor()-1.15)<0.001);
   await capture(route+'-settings');
   await click('[aria-label="Reset page zoom"]');
   await wait(()=>Math.abs(guest.getZoomFactor()-1)<0.001);
   const dark=()=>guest.executeJavaScript("matchMedia('(prefers-color-scheme:dark)').matches");
   const initial=await dark();
   await click('.browser-setting input'); await wait(async()=>await dark()!==initial);
   await click('.browser-setting input'); await wait(async()=>await dark()===initial);
   await click('[aria-label="Back to browser menu"]');
   await clickText('Find on Page');
   await setField('[aria-label="Find text"]','tide');
   const matches=await wait(()=>js("document.querySelector('.browser-find output')?.textContent.match(/[1-9] *\\/ *[2-9]/)?.[0]"));
   await click('[aria-label="Next match"]'); await wait(()=>js("document.querySelector('.browser-find output')?.textContent!=="+JSON.stringify(matches)));
   await click('[aria-label="Close find"]');
   await click('[aria-label="More"]');await clickText('Add Bookmark');await clickText('Bookmarks');
   await wait(()=>js("document.querySelector('.browser-library-row small')?.textContent==="+JSON.stringify(site+'/'+route)));
   await click('[aria-label="Back to browser menu"]');await clickText('History');
   await wait(()=>js("Array.from(document.querySelectorAll('.browser-library-row small')).some(item=>item.textContent==="+JSON.stringify(site+'/'+route)+")"));
   await click('[aria-label="Done"]');
   toolsChecked.push({browser,zoom:115,restoredZoom:100,appearance:true,matches,bookmarks:true,history:true});
 };
 const install=async(browser,route,name)=>{
   await enterBrowser(browser);
   await setField('.ios-address-form input',site+'/'+route);
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
   win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
   win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
   await wait(()=>pageLoaded(route));
   await capture(route+'-browser');
   await checkBrowserTools(browser,route);
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
 // Open the bundled tools from the same Home where both browsers installed a site.
 const tool=name=>click('.home-grid button[aria-label="'+name+'"]');
 const backHome=()=>click('[aria-label="Back to Home Screen"]');
 await tool('Manifest');
 await wait(()=>js("document.querySelector('.home-tool-scroll pre')?.textContent.includes('start_url')"));
 await click('[aria-label="Refresh inspection"]');await capture('home-manifest');
 await backHome();await tool('PWA Checks');
 await wait(()=>present('.home-tool-check'));await capture('home-pwa-checks');await backHome();
 const homeIconSize=()=>js("document.querySelector('.home-grid button').offsetWidth");
 const regular=await homeIconSize();
 await tool('Settings');await click('.home-utility label:nth-child(2) input');
 await wait(async()=>await homeIconSize()>regular);
 await capture('home-settings');
 await backHome();await capture('home-large-icons');await tool('Settings');
 await click('.home-utility label:nth-child(2) input');
 await wait(async()=>await homeIconSize()===regular);
 await click('.home-tool-app:nth-child(2)');
 await setField('.home-utility input:not([type=checkbox])','Coast Maps');
 await click('.home-utility input[type=checkbox]');await clickText('Save changes');
 const readInstalled=()=>js('JSON.parse(localStorage.getItem("pwa-stage.installed-web-apps.v1"))');
 await wait(async()=> (await readInstalled()).some(a=>a.name==='Coast Maps' && !a.opensAsWebApp));
 await capture('home-app-details');
 await clickText('Open app');await wait(()=>pageLoaded('safari'));
 assert.equal((await js('window.simulatorBridge.getInitialPayload()')).value.state.shellMode,'ios-safari');
 await goHome();await tool('Settings');await click('.home-tool-app:nth-child(2)');
 await clickText('Remove from Home Screen');await clickText('Cancel');assert.equal((await readInstalled()).length,2);
 await clickText('Remove from Home Screen');await clickText('Confirm removal');
 await wait(async()=>(await readInstalled()).length===1);
 await backHome();assert(!await present('.home-grid [aria-label="Coast Maps"]'));
 await click('.home-grid [aria-label="Tide Table"]');await wait(()=>present('.app-surface-app'));
 const chromeBookmarkLaunch=await js('window.simulatorBridge.getInitialPayload()');
 win.webContents.send('simulator:external-state',{...chromeBookmarkLaunch.value.state,selectedDeviceId:'iphone-duo-unfolded',duoDisplayMode:'single-span'});
 await wait(async()=>js('!!document.querySelector(".duo-slice-primary webview")'));
 await wait(()=>pageLoaded('chrome'));
 const guest=guests()[0];const before={id:guest.id,token:await guest.executeJavaScript('window.probeToken')};
 // Switching from the slab remounts the guest before the native Duo window is resized.
 // Measure and click the disclosure after the whole stage fits the painted window.
 await wait(()=>js("document.querySelector('.iphone-stage-scaler').getBoundingClientRect().width <= innerWidth"));
 await capture('duo-before-controls');
 await click('.duo-settings');
 await wait(()=>js("document.querySelector('.duo-settings').ariaExpanded==='true'"));
 const scrub=async angle=>{
   await js(`(()=>{const el=document.querySelector('.duo-hinge-slider');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${angle});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await wait(()=>js(`document.querySelector('.duo-current-angle')?.textContent.trim()==='${angle}°'`));
 };
 const overlapAngles=[];
 for (const angle of [32,33,70,89,90,89,70]){
   await scrub(angle);
   const expected=angle>=33 && angle<=89;
   await wait(()=>js("document.querySelector('.duo-3d-stage-root').hasAttribute('data-dual-display')==="+expected));
   overlapAngles.push({angle,both:expected});
 }
 await wait(()=>present('.duo-cover-mirror .guest-mirror-ready'));
 await capture('duo-70-held');
 const cover='.duo-cover-mirror ';
 await click(cover+'[aria-label="More"]');
 await wait(()=>present(cover+'[role="dialog"]'));
 await clickText('Website Settings');await capture('duo-70-browser-settings');
 await click(cover+'[aria-label="Done"]');
 // Project the actual guest button's normalized coordinates through the cover canvas.
 const tapOnCover=async selector=>{
   const target=await guest.executeJavaScript("(()=>{const r=document.querySelector("+JSON.stringify(selector)+").getBoundingClientRect();return [(r.x+r.width/2)/innerWidth,(r.y+r.height/2)/innerHeight]})()");
   const point=await js(`(()=>{const c=document.querySelector('.duo-cover-mirror canvas');const dot=document.createElement('i');dot.style.cssText='position:absolute;pointer-events:none;width:1px;height:1px;left:'+(c.offsetLeft+c.clientWidth*${target[0]})+'px;top:'+(c.offsetTop+c.clientHeight*${target[1]})+'px';c.parentElement.append(dot);const r=dot.getBoundingClientRect();dot.remove();return {x:Math.round(r.x),y:Math.round(r.y)}})()`);
   assert(await js(`document.elementFromPoint(${point.x},${point.y})?.matches('.duo-cover-mirror canvas')`));
   for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});
 };
 await tapOnCover('#site-settings');
 await wait(()=>guest.executeJavaScript("document.querySelector('dialog').open"));
 assert.equal(await guest.executeJavaScript('window.settingTapTrusted'),true);
 await wait(()=>present('.duo-cover-source[data-framed-dialog]'));
 await capture('pwa-settings-from-cover');
 await tapOnCover('dialog button');
 await wait(()=>guest.executeJavaScript("!document.querySelector('dialog').open"));
 await wait(async()=>!await present('.duo-cover-source[data-framed-dialog]'));
 // Return from the cover's native guest dialog with a real pointer gesture.
 // Sending only an input event skips pointer capture, release and focus transfer.
 const end=await js(`(()=>{const r=document.querySelector('.duo-hinge-slider').getBoundingClientRect();return{x:Math.floor(r.right-3),y:Math.round(r.y+r.height/2)}})()`);
 for (const type of ['mouseMove','mouseDown','mouseUp']) {
   win.webContents.sendInputEvent({type,...end,...(type==='mouseMove'?{}:{button:'left',clickCount:1})});
 }
 await wait(()=>js("document.querySelector('.duo-hinge-slider').value==='180'"));
 await wait(()=>guest.executeJavaScript('screen.width===951'));
 await capture('duo-wide-after-cover');
 const selectEndpoint=async angle=>{
   // Native select type-ahead chooses a posture using the focused host control.
   await js("document.querySelector('[aria-label=\"Preview posture\"]').focus()");
   const keyCode=angle===0?'C':'O';
   win.webContents.sendInputEvent({type:'keyDown',keyCode});
   win.webContents.sendInputEvent({type:'char',keyCode:keyCode.toLowerCase()});
   win.webContents.sendInputEvent({type:'keyUp',keyCode});
   // Software rendering may present frames slowly. Require a settled endpoint.
   const deadline=Date.now()+45000;
   while(Date.now()<deadline){
     if(await js(`document.querySelector('.duo-hinge-slider').value==='${angle}' && document.querySelector('.duo-bottom-minibar').dataset.target==='paused'`)) return;
     await sleep(100);
   }
   throw Error('Posture did not settle at '+angle+'°');
 };
 await selectEndpoint(0);
 const closed={count:guests().length,id:guests()[0].id,token:await guests()[0].executeJavaScript('window.probeToken')};
 await selectEndpoint(180);
 const open={count:guests().length,id:guests()[0].id,token:await guests()[0].executeJavaScript('window.probeToken')};
 win.webContents.send('simulator:shortcut',{key:'h',shift:true});await wait(()=>js('!!document.querySelector(".home-screen-home")'));
 await selectEndpoint(0);
 const homeStays=await js('!!document.querySelector(".home-screen-home")');
 const result={toolsChecked,overlapAngles,guestSettingsFromCover:true,standaloneRoutes:[site+'/safari',site+'/chrome'],installed,chromeBookmarkLaunch:chromeBookmarkLaunch.value.state.shellMode,before,closed,open,homeStays};
 assert.equal(installed[0].opensAsWebApp,false); assert.equal(result.chromeBookmarkLaunch,'ios-safari');
 assert.equal(closed.count,1); assert.equal(open.count,1);
 assert.equal(before.id,closed.id); assert.equal(before.id,open.id);
 assert.equal(before.token,closed.token); assert.equal(before.token,open.token);
 assert.equal(homeStays,true);
 fs.writeFileSync(root+'/flows.json',JSON.stringify(result,null,2));console.log('FLOWS_RESULT '+JSON.stringify(result));app.exit(0);
 }catch(e){
   const win=BrowserWindow.getAllWindows()[0];
   if(win)console.error('Install state',await win.webContents.executeJavaScript('({field:document.querySelector(".ios-address-form input")?.value,focus:document.activeElement?.outerHTML.slice(0,160),sheet:document.querySelector("[role=dialog]")?.getAttribute("aria-label"),matches:document.querySelector(".browser-find output")?.textContent,expanded:document.querySelector(".duo-settings")?.ariaExpanded,angle:document.querySelector(".duo-current-angle")?.textContent})'));
   console.error(e);app.exit(1);
 }
});
