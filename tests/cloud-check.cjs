// Run the documented terminal command against a developer preview with no desktop session.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const out = process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'stage-cloud-evidence-'));
fs.mkdirSync(out,{recursive:true});
const icon = fs.readFileSync(path.join(root,'public/assets/ios27/icon-512.png'));
const readings = [];
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/seen') {
    readings.push({header:req.headers['accept-language'], ...Object.fromEntries(url.searchParams)});
    res.writeHead(204).end(); return;
  }
  if (url.pathname === '/site.webmanifest') {
    res.writeHead(200,{'Content-Type':'application/manifest+json'});
    res.end(JSON.stringify({name:'Market hours',start_url:'/today',display:'standalone'})); return;
  }
  if (url.pathname === '/icon.png') { res.writeHead(200,{'Content-Type':'image/png'}).end(icon); return; }
  if (url.pathname === '/missing') { res.writeHead(404).end('Missing preview'); return; }
  const shortcut = url.pathname === '/shortcut';
  const noIcon = url.pathname === '/no-icon';
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Market hours</title>${shortcut ? '' : '<link rel="manifest" href="/site.webmanifest">'}
    ${noIcon ? '' : '<link rel="apple-touch-icon" sizes="512x512" href="/icon.png">'}
    <style>body{margin:32px;background:#f8f1da;color:#203e32;font:18px system-ui}h1{font-size:35px}</style>
    <main><h1>Market hours</h1><p>Thursday · 09:00–16:45</p></main>
    <script>fetch('/seen?'+new URLSearchParams({path:location.pathname,standalone:String(navigator.standalone),language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone}));</script>`);
});

async function run(args,expected) {
  const env = {...process.env,INIT_CWD:out};
  if (process.platform === 'linux') { delete env.DISPLAY; delete env.WAYLAND_DISPLAY; }
  const child = spawn(process.execPath,[path.join(root,'scripts/check-pwa.cjs'),...args],{cwd:out,env});
  let stdout = '', stderr = '';
  child.stdout.on('data',data=>{stdout+=data;});
  child.stderr.on('data',data=>{stderr+=data;});
  const code = await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>child.kill('SIGTERM'),150000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',status=>{clearTimeout(timer);resolve(status);});
  });
  assert.equal(code,expected,stdout+'\n'+stderr.slice(-4000));
  if (expected===2) return;
  const file = stdout.split(/\r?\n/).find(line=>line.endsWith(path.sep+'report.json'));
  assert(file?.startsWith(path.join(out,'QA 자료')+path.sep),stdout);
  const report = JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(report.passed,expected===0);
  const html = fs.readFileSync(path.join(path.dirname(file),'report.html'),'utf8');
  assert(html.includes('Home Screen installation check'));
  return {report,html};
}

server.listen(0,'127.0.0.1',async()=>{
  try {
    const addr=':'+server.address().port;
    const options=['--out','QA 자료','--language','ko-KR','--timezone','Asia/Seoul'];
    const {report,html}=await run([addr+'/preview',...options],0);
    assert.equal(report.visits.length,2);
    assert.match(report.engine,/^Chromium /);
    assert.deepEqual(report.visits.map(v=>v.persona),['iPhone 17 Pro · Safari','iPhone 17 Pro · Chrome']);
    for(const visit of report.visits) {
      assert.equal(visit.outcome,'verified');
      assert.equal(visit.passed,true);
      assert.equal(visit.installation.path,'/today');
      assert.equal(visit.installation.manifest,true);
      assert.equal(visit.installation.checks.find(c=>c.id==='touch-icon').level,'pass');
      assert.deepEqual(visit.frames.map(f=>f.action),['Open website','Share','Add to Home Screen','Find installed icon','Reopen from Home Screen']);
    }
    assert(readings.some(r=>r.path==='/today' && r.standalone==='true' && r.language==='ko-KR' && r.zone==='Asia/Seoul' && r.header?.startsWith('ko-KR')));
    const captures=Array.from(html.matchAll(/src="data:image\/jpeg;base64,([^"]+)"/g));
    assert.equal(captures.length,10);
    for(const [,encoded] of captures){
      const jpeg=Buffer.from(encoded,'base64'),frame=jpeg.indexOf(Buffer.from([0xff,0xc0]));
      assert(frame>=0 && jpeg.readUInt16BE(frame+7)>150 && jpeg.readUInt16BE(frame+5)>300,'native device-size JPEG');
    }
    const single=[...options,'--browser','safari'];
    const shortcut=await run([addr+'/shortcut',...single],1);
    assert.equal(shortcut.report.visits[0].installation.manifest,false);
    const noIcon=await run([addr+'/no-icon',...single],1);
    assert.equal(noIcon.report.visits[0].passed,false);
    assert.equal(noIcon.report.visits[0].installation.checks.find(c=>c.id==='touch-icon').level,'fail');
    assert(noIcon.html.includes('No icon for the Home Screen'));
    const missing=await run([addr+'/missing',...single],1);
    assert.equal(missing.report.visits[0].outcome,'blocked');assert.match(missing.report.visits[0].note,/404/);
    await run([addr,'--device','missing-device',...options],2);
    console.log('PASS cloud CLI · Safari and Chrome, standalone launch, region, compositor captures, missing manifest/icon, HTTP 404 and invalid input. Evidence: '+out);
  }catch(error){console.error(error);process.exitCode=1;}
  finally{server.close();server.closeAllConnections();}
});
