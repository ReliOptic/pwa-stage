const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, webContents } = require('electron');
const fs=require('node:fs');
const root=process.env.SIMULATOR_TEST_OUTPUT;
app.setPath('userData',fs.mkdtempSync(root+'/duo-data-'));
const http=require('node:http');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width"><script>window.token=Math.random()</script><h1>'+req.url+'</h1><input>');});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>app.exit(2),30000);
server.listen(18769,'127.0.0.1',async()=>{
 process.env.SIMULATOR_DEFAULT_URL='http://127.0.0.1:18769/';
 require(path.resolve(__dirname, '../../dist-electron/index.js'));
 await app.whenReady(); await sleep(2000);
 try{
 const win=BrowserWindow.getAllWindows()[0];
 const initial=await win.webContents.executeJavaScript('window.simulatorBridge.getInitialPayload()');
 const state={...initial.value.state,selectedDeviceId:'iphone-duo-unfolded',duoDisplayMode:'split-comparison',secondaryUrl:'http://127.0.0.1:18769/compare',scale:0.5,hudCollapsed:false};
 win.webContents.send('simulator:external-state',state);
 for(let i=0;i<120;i++) {
   if(webContents.getAllWebContents().filter(w=>w.getType()==='webview').length===2) break;
   await sleep(100);
 }
 await sleep(500);
 const guests=()=>webContents.getAllWebContents().filter(w=>w.getType()==='webview').map(w=>({id:w.id,url:w.getURL()}));
 const open=guests();
 const tokens=await Promise.all(webContents.getAllWebContents().filter(w=>w.getType()==='webview').map(async w=>({id:w.id,token:await w.executeJavaScript('window.token')})));
 await win.webContents.executeJavaScript(`document.querySelector('button[title="Book Mode Free-Stop (100°)"]').click()`);
 await sleep(3000);
 const book=guests();
 const dom=await win.webContents.executeJavaScript(`({webviews:document.querySelectorAll('webview').length,angle:document.querySelector('.duo-angle-readout').textContent,secondary:!!document.querySelector('.duo-slice-secondary')})`);
 assert.equal(open.length, 2); assert.deepEqual(book, open);
 assert.equal(new Set(open.map(w=>w.url)).size, 2);
 fs.writeFileSync(root+'/duo-book.png',(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript(`document.querySelector('button[title="Cover Display (5.4″ · 466×678pt)"]').click()`);
 await sleep(2200); const closed=guests(); assert.deepEqual(closed,open);
 await win.webContents.executeJavaScript(`document.querySelector('button[title="Inner Wide Display (7.6″ · 951×669pt)"]').click()`);
 await sleep(2200); assert.deepEqual(guests(),open);
 const afterTokens=await Promise.all(webContents.getAllWebContents().filter(w=>w.getType()==='webview').map(async w=>({id:w.id,token:await w.executeJavaScript('window.token')})));
 assert.deepEqual(afterTokens,tokens);
 fs.writeFileSync(root+'/duo-split.png',(await win.webContents.capturePage()).toPNG());
 const result={open,book,closed,dom,tokens,afterTokens};
 fs.writeFileSync(root+'/duo.json',JSON.stringify(result,null,2));console.log('DUO_RESULT '+JSON.stringify(result));
 app.exit(0);
 }catch(e){console.error(e);app.exit(1)}
});
