// Real isolated mobile pages. Only the model transport is replaced for repeatable CI without paid credentials.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,dialog,nativeImage,session}=require('electron');
const out=process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'journey-proof-'));
fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'journey-user-')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,label){const start=Date.now();while(Date.now()-start<35000){const r=await read();if(r)return r;await sleep(75);}throw Error(label);}
let site,mode='normal',apiCalls=0,posts=0,outside=0,releaseDecision;
const server=http.createServer((req,res)=>{
  if(req.method==='POST')posts++;
  if(req.url==='/outside')outside++;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/moving'){
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><style>body{background:#ed3013}body.second{background:#1543df}</style><h1>Colour study</h1><script>setInterval(()=>document.body.classList.toggle("second"),230)</script>');return;
  }
  if(req.url==='/drawer'){
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><style>body{padding:8px;font:18px system-ui}</style><a href="/classes" target="_top">Class times</a>');
    return;
  }
  if(req.url==='/document'){
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.end('TOP ONLY\n'+Array.from({length:300},(_,i)=>'Line '+i).join('\n'));return;
  }
  if(req.url==='/scroll'){
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><style>*{margin:0}section{height:100vh;background:#bf272e}section+section{background:#259341}</style><section>First screen</section><section>Second screen</section>');
    return;
  }
  if(req.url==='/pending-image'){res.writeHead(200,{'Content-Type':'image/png'});res.flushHeaders();return;}
  if(req.url==='/touch-surface'){
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}main{height:100dvh;background:teal}</style><main role="group" aria-label="Film preview"><div>Short film</div></main><img src="/pending-image" alt=""><script>document.querySelector('main').addEventListener('click',e=>{if(e.isTrusted)e.currentTarget.innerHTML='<button>Film details</button>'})</script>`);
    return;
  }
  const details=req.url==='/classes';
  res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+ (details?'Class times':'Harbour pool')+'</title><style>body{margin:0;background:#f2f4e9;color:#143e3b;font:19px system-ui}main{padding:28px}h1{font:42px Georgia}button,a{display:block;background:#24594c;color:white;padding:14px 18px;border:0;border-radius:8px;margin:12px 0;font-size:18px}</style><main>'+
    (details?'<h1>Morning swim</h1><p>Public lanes open at 07:00.</p>':'<h1>Harbour pool</h1><p id="visitor"></p><button onclick="if(!event.isTrusted)return;document.querySelector(\'#drawer\').hidden=false;fetch(\'/write\',{method:\'POST\'}).catch(()=>{})">Find a session</button><section id="drawer" hidden><iframe src="/drawer" title="Schedule" style="width:100%;height:90px;border:0"></iframe></section><a href="'+site.replace('127.0.0.1','localhost')+'/outside">External</a><button onclick="location.href=\''+site.replace('127.0.0.1','localhost')+'/outside\'">Partner</button><script>visitor.textContent=localStorage.seen?"Returning":"Fresh visitor";localStorage.seen="1"</script>')+'</main>');
});
async function modelResponse(request){
  assert.equal(request.url,'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.headers.get('Authorization'),'Bearer fixture-key');apiCalls++;
  const messages=(await request.json()).messages, input=JSON.parse(messages[1].content);
  assert(!JSON.stringify(messages).includes('fixture-key'));
  if(mode==='held'){
    await new Promise(resolve=>{releaseDecision=resolve;});
    return Response.json({choices:[{message:{content:JSON.stringify({action:'finish',reason:'The title is visible.',evidence:'Colour study'})}}]});
  }
  if(mode==='bad-key')return new Response('{}',{status:401});
  if(mode==='slow')return new Promise(resolve=>setTimeout(()=>resolve(new Response('{}')),1200));
  let answer;
  if(!input.persona)answer={audiences:['Morning lap swimmer','First-time visitor','Weekend visitor']};
  else if(mode==='scroll'){
    answer=input.history.length===1?{action:'scroll',reason:'Look further down the page.'}:{action:'finish',reason:'The next section is visible.'};
  }else if(mode==='surface'){
    answer=input.page.controls.includes('Film details')?{action:'finish',evidence:'Film details',reason:'The player controls are visible.'}:
      {action:'tap',target:input.page.controls.indexOf('Film preview'),reason:'Tap to reveal the controls.'};
  }else{
    assert(!input.page.controls.includes('External'));
    if(!input.history.some(f=>f.action!=='Arrived'))assert(input.page.text.includes(mode==='installed'?'Returning':'Fresh visitor'));
    const next=mode==='offsite'?'Partner':input.page.controls.includes('Class times')?'Class times':'Find a session';
    answer=input.page.path==='/classes'?{action:'finish',evidence:'07:00',reason:'I can see when public lanes open.'}:
      {action:'tap',target:input.page.controls.indexOf(next),reason:'I want to see the opening time.'};
  }
  return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});
};
server.listen(0,'127.0.0.1',async()=>{
 try{
  site='http://127.0.0.1:'+server.address().port;
  delete process.env.OPENROUTER_API_KEY;
  require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));await app.whenReady();
  session.fromPartition('journey-openrouter',{cache:false}).protocol.handle('https',modelResponse);
  const shell=await until(()=>BrowserWindow.getAllWindows()[0],'shell');
  const shellJS=code=>shell.webContents.executeJavaScript(code);
  await until(()=>shellJS("!!document.querySelector('[aria-label=\"Device controls\"]')"),'device controls');
  const original=shell.getSize();
  const guestId=await until(()=>shellJS("(()=>{try{return document.querySelector('webview')?.getWebContentsId();}catch{return null;}})()"),'attached device guest');
  await shellJS("document.querySelector('.agent-toggle').click()");
  const studio=shell;
  const js=code=>studio.webContents.executeJavaScript(code);
  await until(()=>js("!!document.querySelector('.journey-form')"),'brief form');
  const set=(selector,value)=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await set('#agent-address',site);await set('#agent-goal','Find morning swim times');
  assert.equal(await js("document.querySelector('.journey-model').open"),false);
  await js("document.querySelector('.journey-primary').click()");
  await until(()=>js("document.querySelector('.journey-model').open && document.activeElement.type==='password'"),'missing key reveals and focuses its field');
  await set('[type=password]','fixture-key');
  await js("document.querySelector('.journey-model summary').click()");
  await js("document.querySelector('[aria-label=\"Remove one visit\"]').click()");
  assert.equal(await js("document.querySelector('#agent-visits').value"),'2');
  async function capture(name){await sleep(180);fs.writeFileSync(path.join(out,name+'.png'),(await studio.webContents.capturePage()).toPNG());}
  await capture('journey-setup');
  assert.equal(BrowserWindow.getAllWindows().filter(w=>w.isVisible()).length,1);
  assert(studio.getSize()[0]>=original[0]);
  await js("document.querySelector('[aria-label=\"Close Agent\"]').click()");
  await until(()=>js("document.querySelector('.agent-panel').hidden"),'collapse panel');
  await until(()=>shell.getSize().every((n,i)=>n===original[i]),'native window restored to device size');
  assert.equal(await js("document.querySelector('webview').getWebContentsId()"),guestId);
  await js("document.querySelector('.agent-toggle').click()");
  await until(()=>js("!document.querySelector('.agent-panel').hidden"),'reopen panel');
  assert.equal(await js("document.querySelector('.journey-fields input').value"),site,'Loading the device settings must preserve a typed URL');
  const status=()=>js('window.journeyStudio.initial().then(x=>x.report)');
  await js("document.querySelector('.journey-primary').click()");
  const report=await until(async()=>{const r=await status();return r && r.status!=='running' && r;},'finished run');
  assert.equal(report.status,'completed',report.message);assert.equal(report.visits.length,2);assert.notEqual(report.visits[0].persona,report.visits[1].persona);
  for(const v of report.visits){assert.deepEqual(v.frames.map(f=>f.action),['Arrived','Find a session','Class times']);assert.equal(v.outcome,'finished');}
  for(const v of report.visits){
    assert.deepEqual(v.inputs.map(x=>x.label),['Find a session','Class times']);
    for(const input of v.inputs){assert(v.frames.some(f=>f.id===input.from));assert(v.frames.some(f=>f.id===input.to));}
  }
  assert.equal(posts,0);assert.equal(apiCalls,7);assert(!JSON.stringify(report).includes('fixture-key'));
  await until(()=>js("!!document.querySelector('.journey-photo img')"),'compositor preview');
  await capture('journey-review');
  await js("document.querySelector('[aria-label=\"Previous step\"]').click()");
  await until(()=>js("document.querySelector('.journey-photo img')?.alt==='Screen after Find a session'"),'step review');
  await js("document.querySelector('[aria-label=\"Replay visit\"]').click()");
  await until(()=>js("document.querySelector('.journey-photo img')?.alt==='Screen after Class times'"),'replay');
  const file=path.join(out,'journey-report.html');
  dialog.showSaveDialog=async()=>({canceled:false,filePath:file});
  assert(await js('window.journeyStudio.save()'));assert(fs.readFileSync(file,'utf8').includes('data:image/jpeg;base64,'));
  const req={address:site,goal:'Find opening times',audiences:['Swimmer'],iterations:1,apiKey:'fixture-key',model:'openai/gpt-4.1-mini'};
  const start=()=>js('window.journeyStudio.start('+JSON.stringify(req)+')');
  mode='held';
  await js('window.journeyStudio.start('+JSON.stringify({...req,address:site+'/moving',recordScreen:true})+')');
  const held=await until(async()=>{const r=await status();return releaseDecision && r?.status==='running' && r.visits[0]?.frames.length===1 && r;},'model waiting');
  const colors=new Set();
  async function sampleLive(){
    const rgb=await js(`(()=>{const image=document.querySelector('.journey-live-screen img');
      if(!image?.naturalWidth || !image.complete)return null;
      const c=document.createElement('canvas');c.width=c.height=3;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,3,3);return [...ctx.getImageData(1,1,1,1).data];})()`);
    if(rgb && Math.abs(rgb[0]-rgb[2])>80)colors.add(rgb[0]>rgb[2]?'red':'blue');
    return colors.size===2;
  }
  await until(sampleLive,'live visitor pixels must change before the next model decision');
  assert.equal((await status()).visits[0].inputs.length,0);
  await js("document.querySelector('[aria-label=\"Close Agent\"]').click()");
  const hiddenAt=Date.now();await sleep(850);const reopenedAt=Date.now();
  await js("document.querySelector('.agent-toggle').click()");
  await until(()=>js("!!document.querySelector('.journey-live-screen img')?.naturalWidth"),'resume live view');
  releaseDecision();
  await until(async()=>(await status()).status==='completed','held visit completed');
  const filmFile=path.join(out,'moving-visit.html');
  dialog.showSaveDialog=async()=>({filePath:filmFile,canceled:false});assert(await js('window.journeyStudio.save()'));
  const film=fs.readFileSync(filmFile,'utf8');
  const samples=JSON.parse(film.match(/<template>(.*?)<\/template>/s)[1]);
  const began=held.visits[0].startedAt;
  assert(samples.some(f=>f.at+began>hiddenAt && f.at+began<reopenedAt),'recording must continue with the panel closed');
  assert(new Set(samples.map(f=>f.jpeg)).size>1);
  mode='installed';
  await js('window.journeyStudio.start('+JSON.stringify({...req,installFirst:true})+')');
  await until(async()=>(await status()).status!=='running','installed guest journey');
  const installed=(await status()).visits[0];
  assert.equal(installed.outcome,'finished',installed.note);
  assert.deepEqual(installed.frames.slice(-3).map(f=>f.action),['Arrived','Find a session','Class times']);
  assert.equal(installed.frames.at(-1).path,'/classes');
  mode='offsite';await start();await until(async()=>(await status()).status==='completed','scope block');
  assert.equal((await status()).visits[0].outcome,'blocked');assert.equal(outside,0);
  mode='surface';await js('window.journeyStudio.start('+JSON.stringify({...req,address:site+'/touch-surface'})+')');
  await until(async()=>(await status()).status!=='running','touch surface');
  const surface=(await status()).visits[0];assert.equal(surface.outcome,'unconfirmed');assert.equal(surface.quote,'Film details');assert.equal(surface.frames[1].action,'Film preview');
  mode='scroll';await js('window.journeyStudio.start('+JSON.stringify({...req,address:site+'/scroll'})+')');
  await until(async()=>(await status()).status!=='running','scrolled capture');
  const scrolled=await status();assert.equal(scrolled.visits[0].outcome,'unconfirmed');
  for(const f of scrolled.visits[0].frames){
    const url=await js('window.journeyStudio.image('+JSON.stringify(scrolled.id)+','+f.id+')');
    const thumb=nativeImage.createFromDataURL(url).resize({width:3,height:3});
    const pixel=thumb.toBitmap().subarray(16,20);
    assert.equal(pixel[1]>pixel[2],f.action==='Scroll down','Middle pixel should turn from red to green after scroll');
  }
  await js('window.journeyStudio.start('+JSON.stringify({...req,address:site+'/document'})+')');
  await until(async()=>(await status()).status!=='running','visible document excerpts');
  const documentFrames=(await status()).visits[0].frames;
  assert(documentFrames[0].observation.text.includes('TOP ONLY'),JSON.stringify(documentFrames.map(f=>f.observation)));
  assert(documentFrames[1].observation.text.includes('Line'));
  assert(!documentFrames[1].observation.text.includes('TOP ONLY'));
  mode='bad-key';await start();await until(async()=>(await status()).status==='error','provider error');
  assert((await status()).message.includes('401'));
  mode='slow';const before=apiCalls;await start();await until(()=>apiCalls>before,'pending request');
  await js("document.querySelector('[aria-label=\"Close Agent\"]').click()");
  await until(()=>js("document.querySelector('.agent-panel').hidden"),'collapse during run');
  assert.equal((await status()).status,'running');
  await js("document.querySelector('.agent-toggle').click()");
  await until(()=>js("!document.querySelector('.agent-panel').hidden"),'resume monitoring');
  await js('window.journeyStudio.stop()');await until(async()=>(await status()).status==='stopped','cancellation');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  fs.writeFileSync(path.join(out,'journey-result.json'),JSON.stringify({modelTransport:'local OpenRouter response fixture',report,posts,outside,providerError:true,stopped:true},null,2));
  console.log('PASS audience journeys: real SPA tap, same-origin link, shuffled isolated visits, captured frames, replay, export, stop and provider error');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
