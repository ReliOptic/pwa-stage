// Exercise a cross-origin video player, its native fullscreen lifecycle, and device captures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, nativeImage, shell, webContents } = require('electron');
const out = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'stage-media-'));
fs.mkdirSync(out,{recursive:true});
const data = fs.mkdtempSync(path.join(os.tmpdir(),'stage-media-data-'));
const desktop = path.join(data,'Desktop');
fs.mkdirSync(desktop);
app.setPath('userData',data);
app.setPath('desktop',desktop);
const pause = ms => new Promise(r=>setTimeout(r,ms));
const until = async (fn,label) => {
  for(let i=0;i<200;i++){const result=await fn();if(result)return result;await pause(60);}
  throw Error('Timed out waiting for '+label);
};
const listen = async handler => {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return 'http://127.0.0.1:'+server.address().port+'/';
};
const html=(res,markup)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(markup);};
(async()=>{
  const player=await listen((_req,res)=>html(res,`<!doctype html><style>*{box-sizing:border-box}body{margin:0;background:#214950;color:white;font:18px system-ui}video{width:100%;height:136px}button{font:inherit}</style><video controls muted playsinline></video><button onclick="document.querySelector('video').requestFullscreen()">Full screen</button><script>
    const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');
    function draw(){ctx.fillStyle='#11685c';ctx.fillRect(0,0,320,180);ctx.fillStyle='#d8f1ce';ctx.fillRect(0,70,320,8);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Harbour camera',18,48)}draw();
    const video=document.querySelector('video');video.srcObject=c.captureStream(5);video.play();setInterval(draw,200);
  </script>`));
  const site=await listen((_req,res)=>html(res,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#d6ecdf;color:#1c3d39;font:18px system-ui}main{padding:22px}iframe{width:100%;height:190px;border:0}</style><main><h2>Coastal watch</h2><iframe allow="fullscreen; autoplay" allowfullscreen src="${player}"></iframe><p>Harbour conditions</p></main>`));
  fs.writeFileSync(path.join(data,'simulator-state-v2.json'),JSON.stringify({selectedDeviceId:'iphone-17-pro',shellMode:'ios-safari',currentUrl:site,hudCollapsed:true,scale:0.8}));
  require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));
  await app.whenReady();
  const win=await until(()=>BrowserWindow.getAllWindows()[0],'host window');
  win.show();win.focus();
  const wc=win.webContents, js=s=>wc.executeJavaScript(s);
  const guest=await until(()=>webContents.getAllWebContents().find(w=>w.getType()==='webview' && w.getURL()===site),'guest');
  const frame=await until(()=>guest.mainFrame.frames.find(f=>f.url===player),'cross-origin player');
  await until(()=>frame.executeJavaScript("document.querySelector('video').videoWidth>0"),'playing media');
  const bounds=win.getBounds(), id=guest.id;
  const geometry=()=>js(`(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    return {screen:box('.iphone-screen'),guest:box('webview'),toolbar:box('.preview-handle'),bars:!!document.querySelector('.ios-address-form')}})()`);
  const before=await geometry();
  assert(before.bars);
  // Wait for native guest pixels. DOM fullscreen events precede the compositor.
  const shot = async () => nativeImage.createFromBuffer((await wc.capturePage()).toPNG());
  const viewport = await js('innerWidth');
  const color = (image,x,y) => {
    const width=image.getSize().width, scale=width/viewport;
    const i=4*(Math.round(y*scale)*width+Math.round(x*scale));
    return Array.from(image.toBitmap().subarray(i,i+3)).reverse();
  };
  const matches = (rgb,expected) => rgb.every((n,i)=>Math.abs(n-expected[i])<20);
  const field = [214,236,223], film=[17,104,92];
  const at = (image,x,y) => color(image,before.screen.x+x*before.screen.w,before.screen.y+y*before.screen.h);
  const inline=await until(async()=>{const image=await shot();return matches(at(image,.55,.78),field)&&matches(at(image,.7,.30),film)&&image;},'inline video paint');
  fs.writeFileSync(path.join(out,'device-video-inline.png'),inline.toPNG());
  await frame.executeJavaScript("document.querySelector('button').click()",true);
  await until(()=>frame.executeJavaScript("document.fullscreenElement===document.querySelector('video')"),'video fullscreen');
  await until(async()=>!(await geometry()).bars,'browser controls to retract');
  const full=await geometry();
  assert.equal(win.isFullScreen(),false,'HTML fullscreen escaped the device');
  assert.deepEqual(win.getBounds(),bounds);
  assert.deepEqual(full.toolbar,before.toolbar);
  assert.deepEqual(full.screen,before.screen);
  for(const k of ['x','y','w','h'])assert(Math.abs(full.guest[k]-full.screen[k])<2,'video aperture '+k);
  const painted=await until(async()=>{
    const image=await shot();
    return matches(at(image,.6,.5),film) && matches(at(image,.6,.78),[0,0,0]) && image;
  },'letterboxed fullscreen video pixels');
  fs.writeFileSync(path.join(out,'device-video-fullscreen.png'),painted.toPNG());
  guest.focus();
  guest.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  guest.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await until(()=>frame.executeJavaScript("!document.fullscreenElement"),'Escape to leave video fullscreen');
  await until(async()=>(await geometry()).bars,'restored browser');
  assert.equal(guest.id,id);assert.equal(guest.getURL(),site);assert.deepEqual(win.getBounds(),bounds);
  await until(async()=>matches(at(await shot(),.55,.78),field),'restored page paint');
  const click=async selector=>{
    const p=await until(()=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
      const r=e.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
      return e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`),selector);
    wc.sendInputEvent({type:'mouseMove',...p});
    for(const type of ['mouseDown','mouseUp'])wc.sendInputEvent({type,...p,button:'left',clickCount:1});
  };
  await click('button[aria-label="Device controls"]');
  await click('.control-sections button:nth-child(2)');
  await until(()=>js("document.querySelector('.capture-controls code')?.textContent==="+JSON.stringify(desktop)),'actual save directory');
  await click('button[aria-label="Save screenshot"]');
  const file=await until(()=>fs.readdirSync(desktop).find(f=>f.endsWith('.png')),'saved PNG');
  await until(()=>js("!!document.querySelector('.capture-last button')"),'saved filename');
  const saved=nativeImage.createFromBuffer(fs.readFileSync(path.join(desktop,file)));
  const scale=painted.getSize().width/viewport;
  assert(Math.abs(saved.getSize().width-before.screen.w*scale)<=2*scale);
  const sample=saved.resize({width:100,height:100});
  const bitmap=sample.toBitmap();
  const savedColor=(x,y)=>Array.from(bitmap.subarray(4*(y*100+x),4*(y*100+x)+3)).reverse();
  assert(matches(savedColor(55,78),field) && matches(savedColor(70,30),film),'capture includes the actual page and video');
  assert(!saved.isEmpty());
  fs.copyFileSync(path.join(desktop,file),path.join(out,'saved-device-screen.png'));
  await until(()=>js("!!document.querySelector('.capture-last button')"),'saved filename');
  const tab=await js("(()=>{const r=document.querySelector('.capture-controls code').getBoundingClientRect();return {x:r.right-2,y:r.top+2}})()");
  const panel=await until(async()=>{const image=await shot();const rgb=color(image,tab.x,tab.y);return !matches(rgb,color(inline,tab.x,tab.y))&&image;},'painted screenshot controls');
  fs.writeFileSync(path.join(out,'screenshot-location.png'),panel.toPNG());
  // Inspect the destinations handed to the OS without launching Finder/Explorer on CI.
  const opened=[];
  shell.openPath=async target=>{opened.push(target);return '';};
  shell.showItemInFolder=target=>opened.push(target);
  await click('button[aria-label="Open folder"]');await until(()=>opened.length===1,'open folder');
  await click('.capture-last button');await until(()=>opened.length===2,'reveal capture');
  assert.deepEqual(opened,[desktop,path.join(desktop,file)]);
  fs.writeFileSync(path.join(out,'device-media.json'),JSON.stringify({bounds,before,full,guestRetained:true,escape:true,saved:file,folder:desktop,osDestinations:opened},null,2));
  console.log('PASS media: cross-origin fullscreen stays inside the screen, Escape restores the browser, capture destinations verified');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1);});
setTimeout(()=>app.exit(2),110000);
