// Integration test for a Mac with an iOS 27.3 simulator booted in Xcode.
const assert = require('node:assert/strict');
const http = require('node:http');
const {captureSafari} = require('../../dist-electron/services/xcode-reference');

async function run() {
  if (process.platform !== 'darwin') throw Error('This test requires macOS, SafariDriver and an iOS 27.3 Simulator.');
  const server = http.createServer((_req,res) => {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reference test</title>');
  });
  await new Promise((resolve,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolve));
  try {
    const url = 'http://127.0.0.1:'+server.address().port+'/';
    const result = await captureSafari(process.argv[2] || 'iPhone 17 Pro',url);
    const page = result.measurements;
    assert.equal(result.runtime,'27.3');
    assert.equal(page.url,url);
    assert.equal(page.viewportMeta,'width=device-width,initial-scale=1');
    assert.equal(page.standalone,false);
    assert.equal(page.cssTextOverflowString,true,'Safari 27.3 custom text-overflow string');
    assert.equal(page.cssWebkitLineClampPercentage,false,'Safari 27.3 removed percentage line clamp');
    console.log(JSON.stringify(result,null,2));
  } finally {server.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
