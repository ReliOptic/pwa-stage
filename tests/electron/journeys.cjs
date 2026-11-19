// Real isolated mobile pages. Only the model transport is replaced for repeatable CI without paid credentials.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,dialog,nativeImage,session}=require('electron');
const out=process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'journey-proof-'));
fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'journey-user-')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,label){const start=Date.now();while(Date.now()-start<35000){const r=await read();if(r)return r;await sleep(75);}throw Error(label);}
let site,mode='normal',apiCalls=0,posts=0,outside=0;
const server=http.createServer((req,res)=>{
  if(req.method==='POST')posts++;
  if(req.url==='/outside')outside++;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/drawer'){
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><style>body{padding:8px;font:18px system-ui}</style><a href="/classes" target="_top">Class times</a>');
    return;
  }
  if(req.url==='/scroll'){
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><style>*{margin:0}section{height:100vh;background:#bf272e}section+section{background:#259341}</style><section>First screen</section><section>Second screen</section>');
    return;
  }
  if(req.url==='/touch-surface'){
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}main{height:100dvh;background:teal}</style><main role="group" aria-label="Film preview"><div>Short film</div></main><script>document.querySelector('main').addEventListener('click',e=>{if(e.isTrusted)e.currentTarget.innerHTML='<button>Film details</button>'})</script>`);
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
  if(mode==='bad-key')return new Response('{}',{status:401});
  if(mode==='slow')return new Promise(resolve=>setTimeout(()=>resolve(new Response('{}')),1200));
  let answer;
  if(!input.persona)answer={audiences:['Morning lap swimmer','First-time visitor','Weekend visitor']};
  else if(mode==='scroll'){
    answer=input.history.length===1?{action:'scroll',reason:'Look further down the page.'}:{action:'finish',reason:'The next section is visible.'};
  }else if(mode==='surface'){
    answer=input.page.controls.includes('Film details')?{action:'finish',reason:'The player controls are visible.'}:
      {action:'tap',target:input.page.controls.indexOf('Film preview'),reason:'Tap to reveal the controls.'};
  }else{
    assert(!input.page.controls.includes('External'));
    if(!input.history.some(f=>f.action!=='Arrived'))assert(input.page.text.includes('Fresh visitor'));
    const next=mode==='offsite'?'Partner':input.page.controls.includes('Class times')?'Class times':'Find a session';
    answer=input.page.path==='/classes'?{action:'finish',reason:'I can see when public lanes open.'}:
      {action:'tap',target:input.page.controls.indexOf(next),reason:'I want to see the opening time.'};
  }
  return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});
};
server.listen(0,'127.0.0.1',async()=>{
 try{
  site='http://127.0.0.1:'+server.address().port;
  require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));await app.whenReady();
  session.fromPartition('journey-openrouter',{cache:false}).protocol.handle('https',modelResponse);
  const shell=await until(()=>BrowserWindow.getAllWindows()[0],'shell');
  const shellJS=code=>shell.webContents.executeJavaScript(code);
  await until(()=>shellJS("!!document.querySelector('[aria-label=\"Device controls\"]')"),'device controls');
  await shellJS("document.querySelector('[aria-label=\"Device controls\"]').click()");
  await shellJS("document.querySelector('[aria-label=\"Audience journeys\"]').click()");
  const studio=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('studio=journeys')),'studio');
  const js=code=>studio.webContents.executeJavaScript(code);
  await until(()=>js("!!document.querySelector('.journey-form')"),'brief form');
  const set=(selector,value)=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await set('.journey-fields input',site);await set('textarea','Find morning swim times');await set('[type=password]','fixture-key');await set('[type=number]','2');
  async function capture(name){await sleep(180);fs.writeFileSync(path.join(out,name+'.png'),(await studio.webContents.capturePage()).toPNG());}
  await capture('journey-setup');
  assert.equal(await js("document.querySelector('.journey-fields input').value"),site,'Loading the device settings must preserve a typed URL');
  const status=()=>js('window.journeyStudio.initial().then(x=>x.report)');
  await js("document.querySelector('[type=submit]').click()");
  const report=await until(async()=>{const r=await status();return r && r.status!=='running' && r;},'finished run');
  assert.equal(report.status,'completed',report.message);assert.equal(report.visits.length,2);assert.notEqual(report.visits[0].persona,report.visits[1].persona);
  for(const v of report.visits){assert.deepEqual(v.frames.map(f=>f.action),['Arrived','Find a session','Class times']);assert.equal(v.outcome,'finished');}
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
  mode='offsite';await start();await until(async()=>(await status()).status==='completed','scope block');
  assert.equal((await status()).visits[0].outcome,'blocked');assert.equal(outside,0);
  mode='surface';await js('window.journeyStudio.start('+JSON.stringify({...req,address:site+'/touch-surface'})+')');
  await until(async()=>(await status()).status!=='running','touch surface');
  const surface=(await status()).visits[0];assert.equal(surface.outcome,'finished');assert.equal(surface.frames[1].action,'Film preview');
  mode='scroll';await js('window.journeyStudio.start('+JSON.stringify({...req,address:site+'/scroll'})+')');
  await until(async()=>(await status()).status!=='running','scrolled capture');
  const scrolled=await status();assert.equal(scrolled.visits[0].outcome,'finished');
  for(const f of scrolled.visits[0].frames){
    const url=await js('window.journeyStudio.image('+JSON.stringify(scrolled.id)+','+f.id+')');
    const thumb=nativeImage.createFromDataURL(url).resize({width:3,height:3});
    const pixel=thumb.toBitmap().subarray(16,20);
    assert.equal(pixel[1]>pixel[2],f.action==='Scroll down','Middle pixel should turn from red to green after scroll');
  }
  mode='bad-key';await start();await until(async()=>(await status()).status==='error','provider error');
  assert((await status()).message.includes('401'));
  mode='slow';const before=apiCalls;await start();await until(()=>apiCalls>before,'pending request');
  await js('window.journeyStudio.stop()');await until(async()=>(await status()).status==='stopped','cancellation');
  assert.equal(BrowserWindow.getAllWindows().length,2);
  studio.close();
  fs.writeFileSync(path.join(out,'journey-result.json'),JSON.stringify({modelTransport:'local OpenRouter response fixture',report,posts,outside,providerError:true,stopped:true},null,2));
  console.log('PASS audience journeys: real SPA tap, same-origin link, shuffled isolated visits, captured frames, replay, export, stop and provider error');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
