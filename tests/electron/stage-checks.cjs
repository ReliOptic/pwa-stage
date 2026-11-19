// Stage checks use the production shell and no model transport. The optional
// local model run uses an actual OpenAI-compatible server supplied by the caller.
const {app,BrowserWindow,dialog}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const out=process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'stage-checks-'));
fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'stage-profile-')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(check,label,timeout=120000){const end=Date.now()+timeout;while(Date.now()<end){const value=await check();if(value)return value;await sleep(90);}throw Error(label);}
const server=http.createServer((req,res)=>{
  if(req.url==='/missing'){res.writeHead(404);res.end('Missing item');return;}
  if(req.url==='/manifest.webmanifest'){res.setHeader('Content-Type','application/manifest+json');res.end(JSON.stringify({name:'Settings',start_url:'/today',display:'standalone'}));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const standalone=req.url!=='/article';
  const body=req.url==='/hours'?'<h1>Opening hours</h1><p>Thursday closes at 16:45.</p>':standalone?
    '<h1>Harbour archive</h1><p>Plan your visit to the reading room.</p><a href="/hours">Opening hours</a>':
    '<h1>작업 노트</h1><p>인쇄 판형과 편집 기록.</p>';
  res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+(standalone?'Archive':'작업 노트')+'</title>'+
    (standalone?'<link rel="manifest" href="/manifest.webmanifest">':'')+
    '<style>body{padding:24px 16px;background:#f8f4ec;color:#253d35;font:18px system-ui}h1{font:36px Georgia}a{display:block;color:#1a5e57;padding:13px 0}</style>'+body);
});
server.listen(0,'127.0.0.1',async()=>{
 try{
  const base='http://127.0.0.1:'+server.address().port;
  require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));await app.whenReady();
  const win=await wait(()=>BrowserWindow.getAllWindows()[0],'shell');
  const shell=q=>win.webContents.executeJavaScript(q);
  await wait(()=>shell("!!document.querySelector('[aria-label=\"Device controls\"]')"),'shell toolbar');
  await shell('window.simulatorBridge.openJourneys()');
  const studio=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('studio=journeys')),'studio');
  const js=q=>studio.webContents.executeJavaScript(q);
  await wait(()=>js('!!document.querySelector(".journey-form")'),'form');
  await js("document.querySelector('.journey-modes button:nth-child(2)').click()");
  const set=(selector,value,ev='input')=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(${JSON.stringify(ev)},{bubbles:true}));})()`);
  await set('textarea',[base+'/',base+'/missing',base+'/article'].join('\n'));
  await set('select','iphone-se-3','change');
  await sleep(150);
  fs.writeFileSync(path.join(out,'stage-setup.png'),(await studio.webContents.capturePage()).toPNG());
  await js("document.querySelector('.journey-primary').click()");
  const status=()=>js('window.journeyStudio.initial().then(s=>s.report)');
  async function done(){return wait(async()=>{const r=await status();return r && r.status!=='running' && r;},'run completion',220000);}
  const report=await done();fs.writeFileSync(path.join(out,'stage-checks.json'),JSON.stringify(report,null,2));
  console.log('CHECKS',report.visits.map(v=>[v.persona,v.outcome,v.note]));
  assert.equal(report.status,'completed');assert.deepEqual(report.visits.map(v=>v.outcome),['verified','verified','blocked','blocked','verified','verified']);
  for(const v of report.visits.filter(v=>v.outcome==='verified')){
    assert.equal(v.frames.length,5);
    assert.equal(v.installation.path,v.installation.manifest?'/today':'/article');
  }
  assert(report.visits[2].note.includes('404'));
  const save=async(name)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(out,name+'.html')});assert(await js('window.journeyStudio.save()'));};
  await save('stage-checks');
  await sleep(250);fs.writeFileSync(path.join(out,'stage-review.png'),(await studio.webContents.capturePage()).toPNG());
  const mainState=await shell("JSON.parse(localStorage.getItem('pwa-stage.installed-web-apps.v1')||'[]')");
  assert(!mainState.some(x=>x.launchUrl.startsWith(base)));
  const filename=path.join(out,'Field notes.txt');
  fs.writeFileSync(filename,'Thursday closing time is 16:45.');
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});
  const localSource=await js("window.journeyStudio.pickSource('file')");
  assert.equal(await (await fetch(localSource)).text(),'Thursday closing time is 16:45.');
  const openStage=(request)=>js('window.journeyStudio.check('+JSON.stringify(request)+')');
  await openStage({addresses:[localSource],devices:['iphone-17-pro'],browsers:['ios-chrome']});
  const fileReport=await done();assert.equal(fileReport.visits[0].outcome,'verified',fileReport.visits[0].note);
  fs.writeFileSync(path.join(out,'local-file.json'),JSON.stringify(fileReport,null,2));
  await openStage({addresses:[base],devices:['iphone-17-pro'],browsers:['ios-safari']});
  await js('window.journeyStudio.stop()');assert.equal((await done()).status,'stopped');
  if(process.env.STAGE_MODEL_URL){
    const request={address:base,goal:'Find the closing time on Thursday. Open the relevant page and quote the time.',material:'Context: a new reader arranging a first visit.',audiences:['First-time reader'],iterations:1,apiKey:'',localEndpoint:process.env.STAGE_MODEL_URL,model:'local-journey',installFirst:true};
    await js('window.journeyStudio.start('+JSON.stringify(request)+')');
    const run=await done();fs.writeFileSync(path.join(out,'local-model.json'),JSON.stringify(run,null,2));
    console.log('LOCAL',run.visits.map(v=>[v.frames.map(f=>f.action),v.note,v.outcome]),run.message);
    assert.equal(run.visits[0].installation.path,'/today');assert.equal(run.visits[0].outcome,'finished');assert(run.visits[0].note.includes('16:45'));
    await save('local-model');await sleep(300);
    fs.writeFileSync(path.join(out,'local-review.png'),(await studio.webContents.capturePage()).toPNG());
  }
  console.log('PASS neutral installation checks');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
