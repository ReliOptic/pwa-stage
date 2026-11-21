// Exercise the shipping shell, a language-negotiating HTTP site and its isolated frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, webContents } = require('electron');

const output = process.env.SIMULATOR_TEST_OUTPUT;
const profile = fs.mkdtempSync(path.join(output, 'region-data-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('site-per-process');
fs.writeFileSync(path.join(profile, 'simulator-state-v2.json'), JSON.stringify({
  selectedDeviceId:'iphone-se-3', hudCollapsed:true, scale:0.8
}));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(label, read, timeout=18000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await sleep(70);
  }
  throw Error('Timed out waiting for ' + label);
}

const requests = [];
const readings = {};
const readEnvironment = `({language:navigator.language, languages:navigator.languages,
  locale:Intl.DateTimeFormat().resolvedOptions().locale, timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})`;
const arabicName = '🧭 دليل المدينة';
const koreanName = '🧭 우리 동네';
const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  const header = req.headers['accept-language'] || '';
  const language = header.startsWith('ar') ? 'ar' : header.startsWith('ko') ? 'ko' : 'en';
  const name = {ar:arabicName, ko:koreanName, en:'🧭 City guide'}[language];
  requests.push({route, url:req.url, header, host:req.headers.host});
  res.setHeader('Cache-Control', 'no-store');
  if (route === '/manifest') {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.end(JSON.stringify({short_name:name, start_url:'/guide', display:'standalone'}));
  }
  if (route === '/slow-manifest') {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.write('{');
    return;
  }
  if (route === '/sw.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(`onmessage=e=>e.waitUntil(fetch('/worker-language').then(r=>r.text()).then(header=>e.ports[0].postMessage({...(${readEnvironment}),header})))`);
  }
  if (route === '/worker-language') return res.end(header);
  if (route === '/worker.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end('postMessage(' + readEnvironment + ')');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (route === '/frame') return res.end('<script>parent.postMessage({frame:' + readEnvironment + '},"*")</script>');
  res.end(`<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="manifest" href="${route === '/slow' ? '/slow-manifest' : '/manifest'}"><title>${name}</title>
    <style>body{margin:0;background:#f7f5ed;color:#1f493e;font:18px system-ui}main{padding:32px 20px}h1{font-size:32px}iframe{position:absolute;width:2px;height:2px;border:0}</style>
    <main><h1>${name}</h1><p>${language === 'ar' ? 'أوقات الزيارة' : language === 'ko' ? '방문 시간' : 'Visiting hours'}</p><p id="time"></p></main>
    <script>window.first=${readEnvironment};window.header=${JSON.stringify(header)};window.token=Math.random();
      document.getElementById('time').textContent=new Intl.DateTimeFormat(undefined,{timeStyle:'short'}).format(new Date('2026-01-10T12:00:00Z'));
      window.readServiceWorker=async()=>{
        const lang=encodeURIComponent(navigator.language);
        const registration=await navigator.serviceWorker.register('/sw.js?lang='+lang,{scope:'/worker-'+lang+'/'});
        if(!registration.active || registration.active.state!=='activated'){
          const installing=registration.installing || registration.waiting || registration.active;
          await new Promise((resolve,reject)=>{
            const changed=()=>{ if(installing.state==='activated')resolve(); else if(installing.state==='redundant')reject(Error('Worker installation failed')); };
            installing.addEventListener('statechange',changed);changed();
          });
        }
        const channel=new MessageChannel();
        const result=new Promise(resolve=>channel.port1.onmessage=e=>resolve(e.data));
        registration.active.postMessage('read',[channel.port2]);
        const reading=await result;channel.port1.close();return reading;
      };
      const worker=new Worker('/worker.js');worker.onmessage=e=>{window.workerReading=e.data;worker.terminate()};
      addEventListener('message',e=>{if(e.source===document.querySelector('iframe')?.contentWindow)window.frameReading=e.data.frame});
    </script><iframe title="Language probe" src="http://127.0.0.1:${server.address().port}/frame"></iframe></html>`);
});

const timeout = setTimeout(() => {console.error('Region regression exceeded its deadline', JSON.stringify({readings,requests:requests.slice(-12)})); app.exit(2);}, 150000);
server.listen(0, '127.0.0.1', async () => {
  try {
    require(path.resolve(__dirname, '../../dist-electron/index.js'));
    await app.whenReady();
    const win = await until('simulator window', () => BrowserWindow.getAllWindows()[0]);
    win.show(); win.focus();
    const shell = win.webContents;
    const js = expression => shell.executeJavaScript(expression);
    const select = selector => 'document.querySelector('+JSON.stringify(selector)+')';
    const exists = selector => js('!!'+select(selector));
    const waitFor = selector => until(selector, () => exists(selector));
    async function click(selector) {
      const pt = await until('visible ' + selector, () => js(`(()=>{const el=${select(selector)};
        if(!el)return null;const r=el.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
        return el.contains(document.elementFromPoint(x,y)) && {x,y}})()`));
      shell.sendInputEvent({type:'mouseMove',...pt});
      shell.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...pt});
      shell.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...pt});
      await sleep(160);
    }
    async function fill(selector, value) {
      if (selector === '[name=timeZone]') key('Tab');
      else await click(selector);
      await until('keyboard focus '+selector,() => js('document.activeElement.matches('+JSON.stringify(selector)+')'));
      await js(select(selector)+'.select()');
      await shell.insertText(value);
      assert.equal(await js(select(selector)+'.value'),value);
    }
    const key = keyCode => {
      shell.sendInputEvent({type:'keyDown',keyCode});
      if (keyCode === 'Enter') shell.sendInputEvent({type:'char',keyCode:'\r'});
      shell.sendInputEvent({type:'keyUp',keyCode});
    };
    const guest = await until('blank browser tab', () => webContents.getAllWebContents().find(w => w.getType()==='webview' && w.getURL().endsWith('/index.html') && !w.isLoading()));
    const read = expr => guest.executeJavaScript(expr);
    const state = () => js('window.simulatorBridge.getInitialPayload().then(r=>r.value.state)');
    const base = 'http://localhost:' + server.address().port;
    const enter = async address => {await fill('[aria-label="Website address"]',address); key('Enter');};
    const openRegion = async () => {
      await click('[aria-label="Device controls"]');
      await click('button[aria-controls=region-controls]');
      await waitFor('.region-controls');
    };
    async function capture(name) {
      // Fence the shell paint before sampling the compositor and its guest.
      await js("document.body.insertAdjacentHTML('beforeend','<i id=region-fence style=\"position:fixed;top:0;left:0;width:8px;height:8px;background:lime;z-index:2147483647;pointer-events:none\"></i>')");
      const green = image => {const b=image.toBitmap(),i=(image.getSize().width*2+2)*4;return b[i]<10 && b[i+1]>245 && b[i+2]<10;};
      await until('paint marker',async()=>green(await shell.capturePage()));
      await js('document.querySelector("#region-fence").remove()');
      const shot = await until('unobstructed capture',async()=>{const i=await shell.capturePage();return !green(i) && i;});
      fs.writeFileSync(path.join(output,'region-'+name+'.png'),shot.toPNG());
    }

    await waitFor('.home-screen-home');
    readings.system = await read(readEnvironment);
    await openRegion();
    await fill('[name=language]', 'ko_KR');
    await click('.region-controls button[type=submit]');
    await waitFor('.region-controls [role=alert]');
    assert.equal(await js('document.activeElement.name'), 'language');
    await fill('[name=language]', 'ar-EG');
    await fill('[name=timeZone]', 'Africa/Cairo');
    await click('.region-controls button[type=submit]');
    await until('persisted Arabic region', async () => (await state()).previewTimeZone === 'Africa/Cairo');
    await capture('controls');
    key('Escape');
    await until('focus returned to Device controls', () => js('document.activeElement.ariaLabel==="Device controls"'));
    await click('.home-dock [aria-label=Safari]');
    await waitFor('.app-surface-app');
    await enter(':'+server.address().port+'/مرحبا');
    const expected = new URL('/مرحبا',base).href;
    await until('Arabic document', async () => guest.getURL()===expected && await read('!!window.frameReading && !!window.workerReading'));
    const siteReadings = () => read('(async()=>({main:first, frame:frameReading, worker:workerReading, serviceWorker:await readServiceWorker(), header, lang:document.documentElement.lang, direction:getComputedStyle(document.documentElement).direction}))()');
    readings.arabic = await siteReadings();
    const assertRegion = (sample,language,zone) => {
      assert.equal(sample.header.split(',')[0],language);
      assert.equal(sample.serviceWorker.header.split(',')[0],language,'service worker request language');
      for (const surface of ['main','frame','worker','serviceWorker']) {
        assert.equal(sample[surface].language,language,surface+' browser language');
        assert.equal(sample[surface].locale,language,surface+' formatting locale');
        assert.equal(sample[surface].timeZone,zone,surface+' time zone');
      }
    };
    assertRegion(readings.arabic,'ar-EG','Africa/Cairo');
    assert.equal(readings.arabic.direction,'rtl');
    await capture('arabic');
    await click('[aria-label=More]');
    await click('button[aria-label=Share]');
    await click('.ios-share-action');
    await waitFor('[aria-label="Home Screen name"]');
    assert.equal(await js(select('[aria-label="Home Screen name"]')+'.value'),arabicName);
    await click('.ios-card-primary');
    await waitFor('.home-screen-home');
    const icon = '.home-grid [aria-label="'+arabicName+'"]';
    assert.equal(await js(select(icon)+'?.textContent'),'🧭');
    await capture('home');
    await click(icon);
    await until('standalone Arabic document',async()=>guest.getURL()===base+'/guide' && await read("navigator.standalone && !!window.frameReading && !!window.workerReading"));
    assertRegion(await siteReadings(),'ar-EG','Africa/Cairo');
    const token=await read('window.token');
    await openRegion();
    await fill('[name=language]', 'ko-KR');
    await fill('[name=timeZone]', 'Asia/Seoul');
    await click('.region-controls button[type=submit]');
    await until('server-negotiated Korean reload',()=>read(`window.token!==${token} && window.first?.language==='ko-KR' && !!window.frameReading && !!window.workerReading`));
    readings.korean=await siteReadings();
    assertRegion(readings.korean,'ko-KR','Asia/Seoul');
    assert.equal(readings.korean.lang,'ko');
    key('Escape');
    await capture('korean');
    await js('window.journeyStudio.check('+JSON.stringify({addresses:[':'+server.address().port+'/안내'],devices:['iphone-se-3'],browsers:['ios-chrome']})+')');
    const install = await until('Korean install check',()=>js("window.journeyStudio.initial().then(({report})=>report?.status==='completed' && report)"),60000);
    assert.equal(install.visits[0].outcome,'verified',install.visits[0].note);
    assert.equal(install.visits[0].installation.name,koreanName);
    assert.equal(install.previewLanguage,'ko-KR');
    assert.equal(install.previewTimeZone,'Asia/Seoul');
    win.webContents.send('simulator:shortcut',{key:'h',shift:true});
    await click('.home-grid [aria-label=Viewport]');
    await until('measured Korean environment',()=>js("document.querySelector('.viewport-readings:last-child')?.textContent.includes('Asia/Seoul')"));
    await capture('viewport');
    await click('[aria-label="Back to Home Screen"]');
    await click('.home-dock [aria-label=Chrome]');
    await waitFor('.app-surface-app');
    await enter(base+'/slow');
    await until('slow manifest document',()=>guest.getURL()===base+'/slow');
    const inspection=await js('window.simulatorBridge.inspectPage('+guest.id+')');
    assert(inspection.ok);
    assert.match(inspection.value.inspection.manifestError,/timed out/i);
    assert.equal(inspection.value.checks.find(c=>c.id==='manifest').level,'fail');
    await openRegion();
    await click('.region-controls button[type=button]');
    await until('system settings restored',async()=>!((await state()).previewLanguage) && await read('window.first?.language')===readings.system.language);
    readings.reset=await read(readEnvironment);
    assert.deepEqual(readings.reset,readings.system);
    await read('readServiceWorker()');
    for (const language of ['ar-EG','ko-KR',readings.system.language]) {
      const script=requests.find(r=>r.url==='/sw.js?lang='+language);
      assert.equal(script?.header.split(',')[0],language,'service-worker script negotiation');
    }
    fs.writeFileSync(path.join(output,'region.json'),JSON.stringify({readings,requests,install:install.visits[0].installation,slowManifest:inspection.value.inspection.manifestError},null,2));
    clearTimeout(timeout);
    console.log('PASS region: keyboard entry, regional HTTP negotiation, frame, worker, install, reset and slow manifest');
    app.exit(0);
  } catch (error) {
    console.error(error,JSON.stringify({readings,requests:requests.slice(-16)}));app.exit(1);
  }
});
