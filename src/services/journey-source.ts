import * as http from 'node:http';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isLoopbackHostHeader } from './reboot-server';

const mime:Record<string,string>={
  html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',
  webmanifest:'application/manifest+json',wasm:'application/wasm',txt:'text/plain',md:'text/plain',csv:'text/plain',
  xml:'application/xml',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',
  webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',pdf:'application/pdf',
  mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',ogg:'audio/ogg'
};

// Only the native picker supplies this path. A single selected file never
// grants access to its siblings. A built folder retains its real URL layout.
export async function serveJourneySource(selection:string,folder:boolean) {
  const selected=await realpath(selection);
  const root=folder?selected:path.dirname(selected);
  if(folder && path.parse(root).root===root)throw Error('Choose the website build directory.');
  const entry=folder?'index.html':path.basename(selected);
  if(!(await stat(path.join(root,entry)).catch(()=>null))?.isFile())
    throw Error('Choose a built website folder containing index.html or select one file.');
  const server=http.createServer(async(req,res)=>{
    const fail=(code:number)=>{res.writeHead(code);res.end();};
    try {
      if(!isLoopbackHostHeader(req.headers.host) || req.headers['sec-fetch-site']==='cross-site')return fail(403);
      if(req.method!=='GET' && req.method!=='HEAD')return fail(405);
      let raw:string;
      try{raw=decodeURIComponent((req.url??'/').split('?')[0]);}catch{return fail(400);}
      if(!raw.startsWith('/') || raw.includes('\\') || raw.includes('\0') ||
        raw.split('/').some(segment=>segment.startsWith('.')))return fail(404);
      let relative=raw.slice(1);
      if(raw.endsWith('/'))relative+='index.html';
      if(!folder && relative!==entry)return fail(404);
      const candidate=path.resolve(root,relative);
      // Reject symlinks including intermediate directory links.
      if(await realpath(candidate).catch(()=>null)!==candidate || !candidate.startsWith(root.endsWith(path.sep)?root:root+path.sep))return fail(404);
      const file=await open(candidate,'r');
      try{
        const info=await file.stat();
        if(!info.isFile()){await file.close();return fail(404);}
        res.writeHead(200,{'Content-Type':mime[path.extname(candidate).slice(1).toLowerCase()] || 'application/octet-stream',
          'Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});
        if(req.method==='HEAD'){await file.close();res.end();return;}
        const stream=file.createReadStream();
        res.on('close',()=>stream.destroy());
        stream.on('error',()=>res.destroy());stream.pipe(res);
      }catch(error){await file.close();throw error;}
    }catch{if(!res.headersSent)fail(404);else res.destroy();}
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address || typeof address==='string'){server.close();throw Error('Could not open local preview.');}
  return {url:'http://127.0.0.1:'+address.port+'/'+(folder?'':encodeURIComponent(entry)),close(){server.close();server.closeAllConnections();}};
}
