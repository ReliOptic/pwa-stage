// Drive the Home Screen in Electron. Local responses keep third-party accounts and
// network availability out of the installation and launch regression.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {app, BrowserWindow, webContents} = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-web-apps-'));
const out = process.env.SIMULATOR_TEST_OUTPUT || profile;
const key = 'pwa-stage.installed-web-apps.v1';
app.setPath('userData', profile);
fs.mkdirSync(out, {recursive:true});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, description) {
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await sleep(65);
  }
  throw Error('Timed out waiting for ' + description);
}

require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname, '../../dist-electron/index.js'));
app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows()[0], 'simulator window');
  win.show(); win.focus();
  const wc = win.webContents, js = expression => wc.executeJavaScript(expression);
  const guest = () => webContents.getAllWebContents().find(w => w.getType() === 'webview');
  const readyGuest = await until(() => {
    const w = guest();
    return w && w.getURL().startsWith('http:') && !w.isLoading() && w;
  }, 'start page');
  const requests = [];
  readyGuest.session.protocol.handle('https', request => {
    requests.push(request.url);
    return new Response('<!doctype html><meta name="viewport" content="width=device-width"><title>Launch test</title>', {
      headers: {'Content-Type':'text/html'}
    });
  });
  const apps = () => js('JSON.parse(localStorage.getItem('+JSON.stringify(key)+'))');
  const has = label => js('!!document.querySelector('+JSON.stringify('[aria-label="'+label+'"]')+')');
  async function click(selector) {
    const point = await until(() => js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({block:'nearest'});
      const r = el.getBoundingClientRect(), x = Math.round(r.x+r.width/2), y = Math.round(r.y+r.height/2);
      return el.contains(document.elementFromPoint(x,y)) && {x,y};
    })()`), selector);
    for (const type of ['mouseDown','mouseUp']) wc.sendInputEvent({type,...point,button:'left',clickCount:1});
  }
  const label = name => click('[aria-label="'+name+'"]');
  const home = async () => {
    wc.send('simulator:shortcut', {key:'h',shift:true});
    await until(() => js("!!document.querySelector('.home-screen-home') && !document.querySelector('.home-utility')"), 'Home');
  };
  const capture = async name => {
    await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await sleep(200);
    fs.writeFileSync(path.join(out, name+'.png'), (await wc.capturePage()).toPNG());
  };
  async function reloadHome() {
    const previous = guest().id;
    const done = new Promise(resolve => wc.once('did-finish-load', resolve));
    win.reload(); await done;
    await until(() => {const w=guest();return w && w.id!==previous && w.getURL() && !w.isLoading();}, 'new guest');
    await home();
  }

  await home();
  assert.deepEqual((await apps()).map(a=>a.name), ['Instagram','X']);
  await until(() => js("[...document.querySelectorAll('.home-grid img')].every(i=>i.complete&&i.naturalWidth===192)"), 'bundled icons');
  await capture('starter-home');
  await label('Web Apps');
  await until(() => has('Add TikTok'), 'catalogue');
  assert(await has('Open Instagram') && await has('Open X'));
  await capture('web-apps');
  await label('Add TikTok'); await until(() => has('Open TikTok'), 'single install');
  await click('.catalog-heading button'); await until(async () => (await apps()).length===6, 'add remaining apps');
  assert.equal(new Set((await apps()).map(a=>a.id)).size,6);
  assert.equal(requests.length,0);
  await label('Back to Home Screen'); await capture('installed-home');
  const launches = {};
  for (const entry of await apps()) {
    await label(entry.name);
    const w = await until(() => {
      const current=guest();
      return current?.getURL()===entry.launchUrl && !current.isLoading() && current;
    }, entry.name+' launch');
    await until(() => w.executeJavaScript("navigator.standalone===true && matchMedia('(display-mode: standalone)').matches"), 'standalone page');
    launches[entry.name]=w.getURL();
    await home();
  }

  await label('Settings');
  await click('.home-tool-app:has(img[src$="/instagram.png"])');
  await click('.home-tool-danger');
  await until(() => js("document.querySelector('.home-tool-danger')?.textContent==='Confirm removal'"), 'removal confirmation');
  await click('.home-tool-danger');
  await until(async () => !(await apps()).some(a=>a.name==='Instagram'), 'removal');
  await reloadHome();
  assert(!await has('Instagram'));
  await label('Settings'); await click('.catalog-shortcut button'); await label('Add Instagram');
  await until(async () => (await apps()).filter(a=>a.name==='Instagram').length===1, 'reinstall');

  // Preserve saved lists, including an intentionally empty one. An existing
  // X homepage with a custom label qualifies, while its deep links stay separate.
  const manual = {...(await apps()).find(a=>a.name==='X'),id:'existing',name:'My feed',launchUrl:'https://x.com/home'};
  const post = {...manual,id:'post',name:'Saved post',launchUrl:'https://x.com/example/status/123'};
  await js('localStorage.setItem('+JSON.stringify(key)+','+JSON.stringify(JSON.stringify([manual,post]))+')');
  await reloadHome();
  assert.deepEqual(await apps(),[manual,post]);
  await label('Web Apps'); await until(() => has('Open X'), 'existing X homepage'); await click('.catalog-heading button');
  await until(async()=>(await apps()).length===7, 'bulk install beside previous entries');
  assert.deepEqual((await apps()).slice(-2),[manual,post]);
  await js('localStorage.setItem('+JSON.stringify(key)+',"[]")');
  await reloadHome(); assert.deepEqual(await apps(),[]);
  await label('Web Apps');await until(() => has('Add X'), 'empty collection');assert(await has('Add Instagram'));
  fs.writeFileSync(path.join(out,'web-apps.json'),JSON.stringify({starters:['Instagram','X'],launches,transport:'local HTTPS responses',persistedRemoval:true,preservedExistingList:true},null,2));
  console.log('PASS web apps: starters, add, add all, standalone launch, removal, restore and existing collections');
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
