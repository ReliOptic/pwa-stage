// Render Home on every catalogue viewport. Capture the native compositor after a paint fence.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out=process.env.SIMULATOR_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'home-catalog-'));
fs.mkdirSync(out,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'home-catalog-data-')));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,description) {
  const deadline=Date.now()+35000;
  while(Date.now()<deadline){const result=await fn();if(result)return result;await sleep(70);}
  throw Error('Timed out waiting for '+description);
}
require(process.env.SIMULATOR_TEST_ENTRY || path.resolve(__dirname,'../../dist-electron/index.js'));
app.whenReady().then(async()=>{
  const win=await until(()=>BrowserWindow.getAllWindows()[0],'simulator');
  win.show();win.focus();
  const wc=win.webContents, js=code=>wc.executeJavaScript(code);
  await until(()=>js('!!document.querySelector("webview")'),'device');
  const {value:initial}=await js('window.simulatorBridge.getInitialPayload()');
  win.webContents.send('simulator:shortcut',{key:'h',shift:true});
  await until(()=>js('!!document.querySelector(".home-screen-home")'),'home');
  const results=[];
  for(const preset of initial.presets) {
    const duo=preset.id.startsWith('iphone-duo');
    for(const orientation of duo?['portrait']:['portrait','landscape']) {
      const state={...initial.state,selectedDeviceId:preset.id,orientation,scale:.65,hudCollapsed:true};
      await js('window.simulatorBridge.updateSimulatorState('+JSON.stringify(state)+')');
      win.webContents.send('simulator:external-state',state);
      const width=orientation==='portrait'?preset.width:preset.height;
      const height=orientation==='portrait'?preset.height:preset.width;
      const selector=(duo?'.duo-slice-primary ':'')+'.home-screen-home';
      const result=await until(()=>js(`(()=>{
        const h=document.querySelector(${JSON.stringify(selector)}); if(!h || h.offsetWidth!==${width} || h.offsetHeight!==${height})return null;
        const angle=document.querySelector('.duo-hinge-slider')?.value;
        if(${duo} && angle!==${JSON.stringify(preset.id.endsWith('-unfolded')?'180':'0')})return null;
        const grid=h.querySelector('.home-grid'),icons=[...grid.querySelectorAll('button')],dock=h.querySelector('.home-dock');
        if (icons.length!==3 || !h.closest('.stage-wrapper') || h.getBoundingClientRect().bottom>innerHeight+1) return null;
        return {width:h.offsetWidth,height:h.offsetHeight,gridWidth:grid.offsetWidth,gridTop:grid.offsetTop,
          icons:icons.map(el=>({label:el.ariaLabel,left:el.parentElement.offsetLeft,top:el.parentElement.offsetTop,width:el.offsetWidth})),
          dockIcon:dock.querySelector('button').offsetWidth};
      })()`),preset.id+' '+orientation);
      const labels=result.icons.map(item=>item.label);
      assert.deepEqual(labels,['Settings','Manifest','PWA Checks']);
      assert(result.gridWidth>=4*result.icons[0].width);
      for(let i=1;i<3;i++)assert(result.icons[i].left>=result.icons[i-1].left+result.icons[i-1].width);
      // A marker round trip also lets the host finish its native resize.
      await js("(()=>{const m=document.createElement('i');m.id='home-paint';m.style.cssText='position:fixed;top:0;left:0;width:8px;height:8px;background:lime;z-index:2147483647';document.body.append(m)})()");
      const green=image=>{const {width}=image.getSize(),i=4*(2*width+2),p=image.toBitmap();return p[i+1]>245 && p[i+2]<8;};
      await until(async()=>green(await wc.capturePage()),'paint marker');
      await js("document.querySelector('#home-paint').remove()");
      const shot=await until(async()=>{const image=await wc.capturePage();return !green(image)&&image;},'home capture');
      const name='home-'+preset.id+'-'+orientation;
      fs.writeFileSync(path.join(out,name+'.png'),shot.toPNG());
      results.push({preset:preset.id,orientation,...result});
      console.log('HOME',preset.id,orientation,result.icons[0].width);
    }
  }
  fs.writeFileSync(path.join(out,'home-catalog.json'),JSON.stringify(results,null,2));
  console.log('PASS home catalogue',results.length);app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
