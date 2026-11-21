// Drive the host with real Electron pointer input and send touch gestures via Chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {app, BrowserWindow, webContents} = require('electron');
const out = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'stage-gestures-'));
fs.mkdirSync(out,{recursive:true});
const data = fs.mkdtempSync(path.join(os.tmpdir(),'stage-gesture-profile-'));
app.setPath('userData',data);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label) {
  const deadline=Date.now()+25000;
  while(Date.now()<deadline){const value=await fn();if(value)return value;await sleep(55);}
  throw Error('Timed out waiting for '+label);
}
const server=http.createServer((_req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Field notes</title><style>body{margin:0;background:#f1eee5;color:#193f38;font:18px system-ui}article{padding:40px 24px;min-height:250vh}h1{font:40px Georgia}hr{margin:28px 0;border:0;border-top:1px solid #bac9bb}</style><article><small>Pacific coast</small><h1>Field notes</h1><p>Headlands trail</p><hr><p>Survey notebook</p></article><script>window.sessionToken=Math.random()</script>');
});
server.listen(0,'127.0.0.1',async()=>{
  try {
    const site='http://127.0.0.1:'+server.address().port+'/';
    fs.writeFileSync(path.join(data,'simulator-state-v2.json'),JSON.stringify({selectedDeviceId:'iphone-17-pro',shellMode:'ios-safari',currentUrl:site,hudCollapsed:true,scale:.8}));
    require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));
    await app.whenReady();
    const win=await until(()=>BrowserWindow.getAllWindows()[0],'window');win.show();win.focus();
    const wc=win.webContents, js=code=>wc.executeJavaScript(code);
    const findGuest=()=>webContents.getAllWebContents().find(w=>w.getType()==='webview' && w.getURL()===site && !w.isLoading());
    await until(findGuest,'initial guest');
    const seedApps=async apps=>{
      const previous=await until(findGuest,'guest before reloading saved apps');
      await js('localStorage.setItem("pwa-stage.installed-web-apps.v1",'+JSON.stringify(JSON.stringify(apps))+')');
      const loaded=new Promise(resolve=>wc.once('did-finish-load',resolve));win.reload();await loaded;
      await until(async()=>{
        const current=findGuest();
        if(!current || current.id===previous.id) return false;
        const attached=await js("document.querySelector('webview')?.getWebContentsId()");
        return attached===current.id && await current.executeJavaScript('typeof window.sessionToken==="number"');
      },'new guest after loading saved apps');
    };
    const fieldNotes={id:'field-notes',name:'Field notes',launchUrl:site,opensAsWebApp:true,addedAt:1};
    await seedApps([fieldNotes]);
    const guest=await until(findGuest,'reloaded guest'),token=await guest.executeJavaScript('window.sessionToken');
    const center=selector=>until(()=>js(`(()=>{for(const el of document.querySelectorAll(${JSON.stringify(selector)})){
      const r=el.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
      if(el.contains(document.elementFromPoint(x,y)))return {x,y};}return null})()`),selector);
    const mouse=(type,p)=>wc.sendInputEvent({type,...p,button:'left',clickCount:1,modifiers:type==='mouseMove'?['leftButtonDown']:[]});
    const click=async selector=>{const p=await center(selector);mouse('mouseDown',p);mouse('mouseUp',p);};
    const home=()=>js("!!document.querySelector('.home-screen-home')");
    const swipe=async(dx,dy,selector='.ios-home-indicator')=>{
      const p=await center(selector);mouse('mouseDown',p);
      for(const step of [.25,.6,1]){mouse('mouseMove',{x:p.x+Math.round(dx*step),y:p.y+Math.round(dy*step)});await sleep(45);}
      mouse('mouseUp',{x:p.x+dx,y:p.y+dy});
    };
    const capture=async name=>{
      await js("(()=>{const e=document.createElement('i');e.id='gesture-fence';e.style.cssText='position:fixed;top:0;left:0;width:8px;height:8px;background:lime;z-index:2147483647';document.body.append(e)})()");
      const green=im=>{const p=im.toBitmap(),i=4*(im.getSize().width*2+2);return p[i+1]>245&&p[i+2]<10;};
      await until(async()=>green(await wc.capturePage()),'paint fence');
      await js("document.querySelector('#gesture-fence').remove()");
      const image=await until(async()=>{const im=await wc.capturePage();return !green(im)&&im;},name);
      fs.writeFileSync(path.join(out,name+'.png'),image.toPNG());
    };
    const touch=async(type,p)=>wc.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
    wc.debugger.attach('1.3');
    await center('webview'); // The host's hit test in the page interior must reach the guest.
    const body=await guest.executeJavaScript('({x:Math.round(innerWidth/2),y:Math.round(innerHeight/2)})');
    const pageTouch=(type,points)=>guest.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:points});
    await pageTouch('touchStart',[body]);
    for(const d of [20,45,80,120]){await pageTouch('touchMove',[{x:body.x,y:body.y-d}]);await sleep(35);}
    await pageTouch('touchEnd',[]);
    await until(async()=>await guest.executeJavaScript('scrollY')>0,'page scroll');
    assert(!(await home()));
    await guest.executeJavaScript('scrollTo(0,0)');
    await swipe(0,-10);await sleep(250);assert(!(await home()),'short drag opened Home');
    await swipe(52,-9);await sleep(250);assert(!(await home()),'sideways edge drag opened Home');

    await capture('gesture-before');
    const edge=await center('.ios-home-indicator');
    await touch('touchStart',edge);await touch('touchMove',{x:edge.x,y:edge.y-91});
    await until(()=>js("!!document.querySelector('[data-home-drag=tracking]')"),'finger tracking');
    await capture('gesture-lift');
    await touch('touchCancel');await sleep(250);
    assert(!(await home()));assert.equal(await js("!!document.querySelector('.home-screen-preview')"),false);
    await touch('touchStart',edge);
    for(const d of [12,40,85])await touch('touchMove',{x:edge.x,y:edge.y-d});
    await touch('touchEnd');await until(home,'swipe to Home');await capture('gesture-home');
    assert.equal(await guest.executeJavaScript('window.sessionToken'),token);
    await click('.home-grid [aria-label=Viewport]');
    await until(()=>js("!!document.querySelector('.viewport-readings dd')"),'actual viewport readings');
    const readings=await js("Array.from(document.querySelectorAll('.viewport-readings dd'),el=>el.textContent)");
    const expected=await guest.executeJavaScript('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})');
    assert.equal(readings[0],expected.w+' × '+expected.h+' CSS px');assert.equal(readings[3],expected.dpr+'×');
    await capture('viewport-tool');await swipe(0,-85);
    await until(()=>js("!document.querySelector('.home-utility')"),'leave Viewport');
    await click('.home-grid [aria-label=Settings]');await capture('gesture-settings');
    await swipe(0,-70);await until(()=>js("!document.querySelector('.home-utility')"),'leave Settings');
    await click('.home-dock [aria-label=Chrome]');await until(()=>js("!!document.querySelector('.app-surface-app')"),'open Chrome');
    await swipe(0,-80);await until(home,'leave Chrome');
    await click('.home-dock [aria-label=Chrome]');await until(()=>js("!!document.querySelector('.app-surface-app')"),'reopen Chrome');
    const wheelEdge=await center('.ios-home-indicator');
    await wc.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',...wheelEdge,deltaX:0,deltaY:84});
    await until(home,'trackpad scroll at bottom edge');
    // Populate a second page only for the pagination regression.
    await seedApps(Array.from({length:26},(_,i)=>({...fieldNotes,id:String(i),name:'Notebook '+i})));
    // DOM attachment precedes native presentation after a window reload.
    await capture('reloaded-before-paging');
    if (!(await home())) {await swipe(0,-85);await until(home,'Home after loading two app pages');}
    await swipe(-65,0,'.home-grid button[aria-label="Notebook 1"]');
    await until(()=>js("document.querySelector('[aria-current=page]')?.ariaLabel==='Page 2'"),'second app page');
    assert(!await js("!!document.querySelector('.home-utility')"));
    await swipe(100,0,'.home-grid button:nth-of-type(1)');
    await until(()=>js("document.querySelector('[aria-current=page]')?.ariaLabel==='Page 1'"),'first app page');
    const step=await js('window.simulatorBridge.getInitialPayload()');
    const duo={...step.value.state,selectedDeviceId:'iphone-duo-unfolded',shellMode:'pwa-standalone',scale:.65};
    win.webContents.send('simulator:external-state',duo);
    await until(()=>js("!!document.querySelector('.duo-slice-primary webview')"),'Duo');
    if(await home()){await click('.duo-slice-primary .home-grid [aria-label="Notebook 0"]');}
    await until(()=>js("!!document.querySelector('.duo-slice-primary .app-surface-app')"),'Duo app');
    await until(()=>js("!!document.querySelector('.duo-3d-stage-root[data-motion-ready]') && document.querySelector('.duo-hinge-slider')?.value==='180'"),'open Duo hardware');
    await capture('duo-before-swipe');
    const duoEdge='.duo-slice-primary .ios-home-indicator';
    const start=await center(duoEdge);
    mouse('mouseDown',start);
    await until(()=>js("!!document.querySelector('[data-home-pressed]')"),'Duo edge pointer capture');
    for (const dy of [20,48,75]) {mouse('mouseMove',{x:start.x,y:start.y-dy});await sleep(45);}
    await until(()=>js("!!document.querySelector('[data-home-drag=tracking]')"),'Duo drag follows the pointer');
    mouse('mouseUp',{x:start.x,y:start.y-75});await until(home,'Duo Home');
    await click('.duo-slice-primary .home-grid [aria-label=Settings]');
    await swipe(0,-75,'.duo-slice-primary .ios-home-indicator');await until(()=>js("!document.querySelector('.home-utility')"),'Duo Settings dismissal');
    await capture('gesture-duo-home');
    wc.debugger.detach();
    fs.writeFileSync(path.join(out,'gestures.json'),JSON.stringify({readings,expected,guestRetained:true,pageScroll:true,shortAndSidewaysDrags:true,touchCancel:true,homeSwipe:true,wheel:true,paging:true,duo:true},null,2));
    console.log('PASS gestures: page scroll, cancellation, interactive lift, Home, paging, Settings, Viewport and Duo');
    app.exit(0);
  } catch(error){console.error(error);app.exit(1);}
});
