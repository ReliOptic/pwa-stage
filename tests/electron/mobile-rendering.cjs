// Test what a site actually renders across an HTTP redirect, a cross-site iframe
// and two kinds of worker. localhost and 127.0.0.1 are distinct Chromium sites.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, webContents } = require('electron');
const out = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'stage-mobile-'));
fs.mkdirSync(out,{recursive:true});
const data = fs.mkdtempSync(path.join(os.tmpdir(),'stage-mobile-profile-'));
app.setPath('userData',data);
const requests = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(read, name, timeout=20000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await read();if(value)return value;await sleep(65);}
  throw Error('Timed out waiting for '+name);
}
const identity = `({ua:navigator.userAgent,platform:navigator.platform,hints:'userAgentData' in navigator})`;
const metrics = `({...(${identity}),width:innerWidth,screen:screen.width,dpr:devicePixelRatio,
  touch:navigator.maxTouchPoints,coarse:matchMedia('(pointer:coarse)').matches,hover:matchMedia('(hover:hover)').matches})`;
const html=(res,src)=>{res.setHeader('Content-Type','text/html; charset=UTF-8');res.end(src);};
const script=(res,src)=>{res.setHeader('Content-Type','text/javascript');res.end(src);};
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://'+req.headers.host);
  requests.push({path:url.pathname,ua:req.headers['user-agent'],mobileHint:req.headers['sec-ch-ua-mobile']});
  res.setHeader('Accept-CH','Sec-CH-UA-Mobile, Sec-CH-UA-Platform');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname.endsWith('/open')){
    res.writeHead(302,{Location:'./library'});return res.end();
  }
  if(url.pathname.endsWith('/worker.js'))return script(res,`postMessage(${identity});`);
  if(url.pathname.endsWith('/sw.js'))return script(res,`
    const boot=${identity};
    oninstall=event=>event.waitUntil(skipWaiting());
    onactivate=event=>event.waitUntil(clients.claim());
    onmessage=event=>event.waitUntil(fetch('worker-request').then(()=>event.ports[0].postMessage(boot)));
  `);
  if(url.pathname.endsWith('/worker-request'))return res.end('ok');
  if(url.pathname.endsWith('/player'))return html(res,`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>*{box-sizing:border-box}body{margin:0;font:16px system-ui;color:#163c38;background:#fcfaf5}
    article{height:190px;background:#4e7376;color:white;display:grid;align-content:end;padding:18px}
    h2{font:28px Georgia;margin:0 0 8px}nav{background:#a04d31;color:white;padding:14px}.touch{display:none}
    @media(pointer:coarse) and (hover:none) {nav{background:#176558}.desktop{display:none}.touch{display:inline}}</style>
    <script>window.boot=${metrics}</script><article><h2>Coastal field notes</h2>Harbour, morning</article>
    <nav><span class="desktop">Desktop player · mouse controls</span><span class="touch">Mobile player · touch controls</span></nav>`);
  if(url.pathname.endsWith('/library')){
    const mobile=/iPhone/.test(req.headers['user-agent']) && req.headers['sec-ch-ua-mobile']!=='?0';
    return html(res,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Field journal</title>
      <style>*{box-sizing:border-box}body{margin:0;background:#fcfaf5;color:#203937;font:16px system-ui}
      main{padding:18px}header{font-size:12px;letter-spacing:.12em;padding-bottom:12px;border-bottom:1px solid #a9bab3}
      h1{font:36px Georgia;margin:20px 0}iframe{width:100%;height:246px;border:0;margin-bottom:14px}
      .services{font-size:13px;line-height:1.7}</style>
      <script>window.boot=${metrics}</script><main><header>FIELD JOURNAL</header><h1>${mobile?'Mobile library':'Desktop library'}</h1>
      <iframe title="Player" src="http://localhost:${server.address().port}/player"></iframe><div class="services"></div></main>
      <script>window.readServices=async()=>{
        const worker=new Worker('worker.js');const thread=await new Promise(resolve=>worker.onmessage=e=>resolve(e.data));worker.terminate();
        await navigator.serviceWorker.register('sw.js');const registration=await navigator.serviceWorker.ready;
        const channel=new MessageChannel();const result=new Promise(resolve=>channel.port1.onmessage=e=>resolve(e.data));
        registration.active.postMessage('read',[channel.port2]);const background=await result;channel.port1.close();
        document.querySelector('.services').textContent='Worker · '+thread.platform+'  /  Service worker · '+background.platform;
        return {thread,background};
      }</script>`);
  }
  res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1',async()=>{
 try {
  const origin='http://127.0.0.1:'+server.address().port;
  fs.writeFileSync(path.join(data,'simulator-state-v2.json'),JSON.stringify({currentUrl:origin+'/safari/open',
    selectedDeviceId:'iphone-17-pro',shellMode:'ios-safari',orientation:'portrait',scale:.8,hudCollapsed:true}));
  require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));await app.whenReady();
  const win=await until(()=>BrowserWindow.getAllWindows()[0],'window');win.show();win.focus();
  const guest=await until(()=>webContents.getAllWebContents().find(w=>w.getType()==='webview'&&w.getURL()===origin+'/safari/library'),'Safari');
  const report={};
  const state=(await win.webContents.executeJavaScript('window.simulatorBridge.getInitialPayload()')).value.state;
  for(const mode of ['safari','chrome','standalone']){
    const route='/'+mode;
    if(mode!=='safari')win.webContents.send('simulator:external-state',{...state,shellMode:mode==='chrome'?'ios-chrome':'pwa-standalone',currentUrl:origin+route+'/open'});
    await until(()=>guest.getURL()===origin+route+'/library'&&!guest.isLoading(),'redirected '+mode+' page');
    const frame=await until(()=>guest.mainFrame.frames.find(f=>f.url.endsWith('/player')),'cross-site frame');
    const root=await guest.executeJavaScript('window.boot');
    const child=await frame.executeJavaScript('window.boot');
    const {thread,background}=await guest.executeJavaScript('readServices()');
    const touchLayout=await frame.executeJavaScript("getComputedStyle(document.querySelector('.touch')).display");
    const frameWidth=await frame.executeJavaScript('innerWidth');
    report[mode]={root,child,frameWidth,thread,background,touchLayout};
    // Fence the capture on the actual player pixels; DOM readiness can precede native paint.
    const painted = color => until(async()=>{
      const image=await win.webContents.capturePage(), bitmap=image.toBitmap();
      let count=0;
      for(let i=0;i<bitmap.length;i+=16){
        if(bitmap[i]===color[2] && bitmap[i+1]===color[1] && bitmap[i+2]===color[0] && ++count===24)return image;
      }
    },'player paint in '+mode);
    await frame.executeJavaScript("document.querySelector('nav').style.backgroundColor='#6fff00'");
    await painted([111,255,0]);
    await frame.executeJavaScript("document.querySelector('nav').style.removeProperty('background-color')");
    const shot=await painted(touchLayout==='inline'?[23,101,88]:[160,77,49]);
    fs.writeFileSync(path.join(out,'mobile-'+mode+'.png'),shot.toPNG());
    for(const context of [root,child,thread,background]){
      assert.match(context.ua,mode==='chrome'?/CriOS\//:/Version\//);assert.match(context.ua,/iPhone/);
      assert.equal(context.platform,'iPhone');assert.equal(context.hints,false);
    }
    for(const doc of [root,child]){
      assert.equal(doc.screen,402);assert.equal(doc.dpr,3);assert.equal(doc.touch,5);
      assert.equal(doc.coarse,true);assert.equal(doc.hover,false);
    }
    assert.equal(root.width,402);assert.equal(frameWidth,366);assert.equal(touchLayout,'inline');
    assert.equal(await guest.executeJavaScript("document.querySelector('h1').textContent"),'Mobile library');
    for(const endpoint of ['/open','/library','/sw.js','/worker-request']){
      const req=requests.find(req=>req.path===route+endpoint);assert(req,route+endpoint);
      assert.match(req.ua,mode==='chrome'?/CriOS\//:/Version\//);assert.match(req.ua,/iPhone/);
      assert.notEqual(req.mobileHint,'?0');
    }
  }
  {
    const token=await guest.executeJavaScript('window.pageToken=Math.random()');
    win.webContents.send('simulator:external-state',{...state,shellMode:'pwa-standalone',currentUrl:guest.getURL(),orientation:'landscape'});
    await until(async()=>await guest.mainFrame.frames[0].executeJavaScript('screen.width')===874,'rotated iframe screen');
    assert.equal(await guest.executeJavaScript('window.pageToken'),token);
  }
  // Duo's rail and fold geometry change the real page width. The page must see
  // the same CSS width at startup and after unfolding, with its state intact.
  const coverState={...state,selectedDeviceId:'iphone-duo-folded',orientation:'portrait',shellMode:'ios-safari',currentUrl:origin+'/duo/open'};
  await win.webContents.executeJavaScript('window.simulatorBridge.updateSimulatorState('+JSON.stringify(coverState)+')');
  const reloaded = new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  win.reload();await reloaded;
  const duo=await until(()=>webContents.getAllWebContents().find(w=>w.getType()==='webview' && w.getURL()===origin+'/duo/library' && !w.isLoading()),'Duo cover');
  const paneSize=()=>win.webContents.executeJavaScript("(()=>{const el=document.querySelector('.duo-slice-primary webview');return el&&{width:el.clientWidth,height:el.clientHeight}})()");
  const cover=await until(async()=>{const box=await paneSize();return box?.width===382 && box;},'cover layout box');
  assert.equal(await duo.executeJavaScript('window.boot.width'),cover.width);
  const pageToken=await duo.executeJavaScript('window.foldToken=Math.random()');
  await win.webContents.executeJavaScript("document.querySelector('.duo-fold-toggle').click()");
  const inner=await until(async()=>{
    const box=await paneSize();
    if(box?.width!==867)return false;
    const reading=await duo.executeJavaScript('({width:innerWidth,height:innerHeight})');
    return reading.width===box.width && reading.height===box.height && reading;
  },'inner layout and guest viewport to agree',55000);
  assert.equal(await duo.executeJavaScript('window.foldToken'),pageToken);
  report.duo={cover,inner,retained:true};
  // Use a local protocol fixture for the real webRequest redirect path. This
  // checks navigation semantics and never depends on the public YouTube service.
  const routes=[];
  duo.session.protocol.handle('https', req=>{
    const url=new URL(req.url);routes.push(url.href);
    if(url.hostname==='m.youtube.com' && url.searchParams.has('bounce')){
      return new Response(null,{status:302,headers:{Location:'https://www.youtube.com/watch?v=returned'}});
    }
    return new Response('<!doctype html><title>Navigation fixture</title>',{headers:{'Content-Type':'text/html'}});
  });
  for(const [start,end] of [
    ['https://www.youtube.com/watch?v=field#t=20','https://m.youtube.com/watch?v=field#t=20'],
    ['https://youtube.com/','https://m.youtube.com/'],
    ['https://www.youtube.com/watch?v=field&app=desktop','https://www.youtube.com/watch?v=field&app=desktop'],
    ['https://www.youtube.com/embed/field','https://www.youtube.com/embed/field'],
    ['https://www.youtube.com/watch?bounce=1','https://www.youtube.com/watch?v=returned']
  ]){
    await duo.loadURL(start);assert.equal(duo.getURL(),end);
  }
  assert(routes.includes('https://m.youtube.com/watch?bounce=1'));
  fs.writeFileSync(path.join(out,'mobile-rendering.json'),JSON.stringify({report,requests,routes},null,2));
  console.log('Mobile rendering recorded for Safari, Chrome and standalone');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
