import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

type Runtime = { identifier:string; version:string; buildversion?:string; isAvailable:boolean };
type Device = { udid:string; deviceTypeIdentifier:string; state:string; isAvailable:boolean };
type Inventory = { runtimes:Runtime[]; devices:Record<string,Device[]>; devicetypes:{identifier:string;name:string}[] };

export function selectReference(inventory:Inventory, preset:string) {
  const name=preset.replace(/ · (Cover|Inner)$/,'').replace('(3rd gen)','(3rd generation)');
  const type=inventory.devicetypes.find(d=>d.name===name);
  const matches=inventory.runtimes.filter(r=>r.isAvailable && r.version==='27.3' && r.identifier.includes('.SimRuntime.iOS-'))
    .flatMap(runtime=>(inventory.devices[runtime.identifier]??[]).filter(d=>d.isAvailable && d.state==='Booted' && d.deviceTypeIdentifier===type?.identifier)
      .map(device=>({runtime,device,name})));
  if(matches.length!==1)throw Error('Boot exactly one '+name+' running iOS 27.3 in Xcode Simulator. Found '+matches.length+'.');
  return matches[0];
}

// The same function runs in the current Chromium document and in WebDriver's Safari document.
export function measurePage() {
  const viewport=window.visualViewport;
  const probe=document.createElement('div');
  probe.style.cssText='all:initial!important;position:fixed!important;visibility:hidden!important;pointer-events:none!important;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)!important';
  document.documentElement.append(probe);
  try {
    const style=getComputedStyle(probe);
    return {url:location.href,screenWidth:screen.width,screenHeight:screen.height,dpr:devicePixelRatio,
      layoutWidth:innerWidth,layoutHeight:innerHeight,visualWidth:viewport?.width??null,visualHeight:viewport?.height??null,
      safeTop:style.paddingTop,safeRight:style.paddingRight,safeBottom:style.paddingBottom,safeLeft:style.paddingLeft,
      standalone:matchMedia('(display-mode: standalone)').matches,dark:matchMedia('(prefers-color-scheme: dark)').matches,
      viewportMeta:document.querySelector('meta[name="viewport" i]')?.getAttribute('content')??null,
      cssHyphenateLimitChars:CSS.supports('hyphenate-limit-chars','8 3 3'),
      cssTextOverflowString:CSS.supports('text-overflow','"more"'),
      cssWebkitLineClampPercentage:CSS.supports('-webkit-line-clamp','50%'),
      secureContext:isSecureContext,serviceWorkerAPI:'serviceWorker' in navigator};
  } finally {probe.remove();}
}

function command(file:string,args:string[]):Promise<string>{
  return new Promise((resolve,reject)=>execFile(file,args,{timeout:15000,maxBuffer:8*1024*1024},(err,out)=>err?reject(err):resolve(out.trim())));
}
async function localPort():Promise<number>{
  const server=createServer();
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const addr=server.address();
      server.close(()=>addr && typeof addr==='object'?resolve(addr.port):reject(Error('No local WebDriver port')));
    });
  });
}

export async function captureSafari(preset:string,url:string) {
  if(!['http:','https:'].includes(new URL(url).protocol))throw Error('Open an HTTP or HTTPS project.');
  const inventory:Inventory=JSON.parse(await command('/usr/bin/xcrun',['simctl','list','--json']));
  const {runtime,device,name}=selectReference(inventory,preset);
  const xcode=await command('/usr/bin/xcodebuild',['-version']);
  const port=await localPort();
  const driver=spawn('/usr/bin/safaridriver',['-p',String(port)],{stdio:'ignore'});
  let failure='';
  driver.on('error',err=>{failure=err.message;});
  async function request(route:string,method='GET',body?:unknown,timeout=65000){
    const response=await fetch('http://127.0.0.1:'+port+route,{method,redirect:'error',signal:AbortSignal.timeout(timeout),
      ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const {value}=await response.json();
    if(!response.ok || value?.error)throw Error(String(value?.message || 'Safari WebDriver HTTP '+response.status));
    return value;
  }
  let session='';
  try {
    let ready=false;
    for(let i=0;i<50;i++){
      if(failure || driver.exitCode!==null)throw Error(failure || 'SafariDriver stopped. Enable Safari remote automation on this Mac and simulator.');
      try {await request('/status','GET',undefined,600);ready=true;break;} catch {await delay(100);}
    }
    if(!ready || failure || driver.exitCode!==null)throw Error('SafariDriver did not start. Check Safari remote automation settings.');
    const {sessionId,capabilities}=await request('/session','POST',{capabilities:{alwaysMatch:{
      browserName:'Safari',platformName:'iOS','safari:useSimulator':true,'safari:deviceUDID':device.udid,'safari:platformVersion':'27.3'
    }}});
    if(typeof sessionId!=='string' || !sessionId)throw Error('SafariDriver returned no session.');
    session='/session/'+encodeURIComponent(sessionId);
    if(capabilities?.browserName?.toLowerCase()!=='safari' || capabilities?.platformName?.toLowerCase()!=='ios'
      || (capabilities['safari:platformVersion'] && capabilities['safari:platformVersion']!==runtime.version)
      || (capabilities['safari:deviceUDID'] && capabilities['safari:deviceUDID']!==device.udid))throw Error('Unexpected Safari session target.');
    await request(session+'/timeouts','POST',{pageLoad:45000});
    await request(session+'/url','POST',{url});
    const measurements:ReturnType<typeof measurePage>=await request(session+'/execute/sync','POST',{script:'return ('+measurePage.toString()+')()',args:[]});
    if(!measurements || !Number.isFinite(measurements.layoutWidth) || measurements.layoutWidth<=0 || typeof measurements.url!=='string')
      throw Error('Safari returned an incomplete page measurement.');
    return {xcode,device:name,udid:device.udid,runtime:runtime.version,runtimeBuild:runtime.buildversion??null,capabilities,measurements};
  } finally {
    try {if(session)await request(session,'DELETE',undefined,3000);} finally {driver.kill();}
  }
}
