const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, webContents }=require('electron');
const fs=require('node:fs');
const http=require('node:http');
const root=process.env.SIMULATOR_TEST_OUTPUT;
const data=fs.mkdtempSync(root+'/home-data-');
app.setPath('userData',data);
fs.writeFileSync(data+'/simulator-state-v2.json',JSON.stringify({selectedDeviceId:'iphone-se-3',hudCollapsed:false}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn)=>{for(let i=0;i<150;i++){const r=await fn();if(r)return r;await sleep(100);}throw Error('wait timeout')};
let releaseStartup;
const server=http.createServer((req,res)=>{
 if(req.url==='/pending'){releaseStartup=()=>res.end('<!doctype html><title>Previous page</title>');return;}
 if(req.url==='/redirect'){res.writeHead(302,{Location:'/selected'});res.end();return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Probe website</title><p>Real local test page</p>');
});
setTimeout(()=>app.exit(2),45000);
server.listen(18770,'127.0.0.1',async()=>{
 require(path.resolve(__dirname, '../../dist-electron/index.js'));
 await app.whenReady();
 try{
 const win=await wait(()=>BrowserWindow.getAllWindows()[0]);
 win.show();win.focus();
 const js=expr=>win.webContents.executeJavaScript(expr);
 let guest=await wait(()=>webContents.getAllWebContents().find(w=>w.getType()==='webview' && w.getURL().endsWith('/index.html') && !w.isLoading()));
 await wait(()=>js('!!document.querySelector(".home-screen-home .home-dock [aria-label=Safari]")'));
 assert.equal(await guest.executeJavaScript('document.body.innerText'), '');
 await js('document.querySelector(".home-dock [aria-label=Safari]").click()');
 await wait(()=>js('!!document.querySelector(".app-surface-app") && !!document.querySelector(".ios-address-form input")'));
 await js('document.querySelector(".ios-address-form input").focus()');
 await sleep(80);
 await win.webContents.insertText('127.0.0.1:18770/site');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
 win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
 win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
 await wait(()=>guest.getURL().includes('18770')&&!guest.isLoading());
 await sleep(500);
 const state=await js('window.simulatorBridge.getInitialPayload()');
 const start={actual:guest.getURL(),stored:state.value.state.currentUrl};
 const apps=Array.from({length:29},(_,i)=>({id:'test-'+i,name:'App '+(i+1),launchUrl:'http://127.0.0.1:18770/'+i,opensAsWebApp:true,statusBarStyle:'default',iconUrl:null,addedAt:i}));
 await js('localStorage.setItem("pwa-stage.installed-web-apps.v1",'+JSON.stringify(JSON.stringify(apps))+')');
 win.reload();
 await wait(async()=>{try{return await js('!!document.querySelector("webview")')}catch{return false}});
 await sleep(1000);
 win.webContents.send('simulator:shortcut',{key:'h',shift:true});
 await wait(async()=>js('!!document.querySelector(".home-screen-home")'));
 await sleep(400);
 const layout=await js(`(()=>{const d=document.querySelector('[aria-label="Page 2"]'),s=document.querySelector('.home-search-pill');const r=d.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{dot:r.toJSON(),search:s.getBoundingClientRect().toJSON(),hit:h?.outerHTML,scale:document.querySelector('.iphone-frame')?.style.transform}})()`);
 fs.writeFileSync(root+'/home-se.png',(await win.webContents.capturePage()).toPNG());
 const r=layout.dot;
 win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),button:'left',clickCount:1});
 win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),button:'left',clickCount:1});
 await wait(()=>js('document.querySelector("[aria-current=page]")?.getAttribute("aria-label")==="Page 2"'));
 const afterClick=await js(`({page:document.querySelector('[aria-current="page"]')?.getAttribute('aria-label'),searchOpened:!!document.querySelector('.home-search-field')})`);
 assert.equal(start.actual, start.stored);
 assert.equal(afterClick.page, 'Page 2');
 assert.equal(afterClick.searchOpened, false);
 assert.ok(layout.dot.bottom <= layout.search.top);
 // Enter a different address while the first document of a new shell is still
 // loading. Its late commit must preserve the new address and its real redirect.
 const base='http://127.0.0.1:18770';
 await js(`window.simulatorBridge.getInitialPayload().then(r=>window.simulatorBridge.updateSimulatorState({...r.value.state,currentUrl:"${base}/pending",shellMode:"ios-chrome"}))`);
 win.reload();
 await wait(()=>releaseStartup);
 await wait(()=>js('!!document.querySelector(".ios-address-form input")'));
 await js('document.querySelector(".ios-address-form input").focus()');
 await wait(()=>js(`(()=>{const el=document.querySelector(".ios-address-form input");return el.value==="${base}/pending" && el.selectionStart===0 && el.selectionEnd===el.value.length})()`));
 await win.webContents.insertText(base+'/redirect');
 assert.equal(await js('document.querySelector(".ios-address-form input").value'),base+'/redirect');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
 win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
 win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
 releaseStartup();
 guest=await wait(()=>webContents.getAllWebContents().find(w=>w.getType()==='webview' && w.getURL()===base+'/selected'));
 await wait(()=>js('window.simulatorBridge.getInitialPayload().then(r=>r.value.state.currentUrl)').then(url=>url===base+'/selected'));
 const result={start,layout,afterClick,fastLaunch:guest.getURL()};
 fs.writeFileSync(root+'/home.json',JSON.stringify(result,null,2));console.log('HOME_RESULT '+JSON.stringify(result));
 app.exit(0);
 }catch(e){console.error(e);app.exit(1)}
});
