import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {serveJourneySource} from '../../src/services/journey-source';
import {stageRequest,journeyRequest,chooseAction} from '../../src/services/journey-planner';

const cleanup:(()=>Promise<void>|void)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
describe('local and neutral sources',()=>{
  it('serves only a picked file and preserves built site URLs within a picked folder',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'journey-source-'));
    cleanup.push(()=>rm(root,{recursive:true,force:true}));
    const site=path.join(root,'site');await mkdir(site);await writeFile(path.join(root,'private.txt'),'private');
    await writeFile(path.join(site,'index.html'),'<p>Actual content</p>');
    await writeFile(path.join(site,'문서.txt'),'설치 안내');
    const file=await serveJourneySource(path.join(site,'문서.txt'),false);cleanup.push(file.close);
    expect(await (await fetch(file.url)).text()).toBe('설치 안내');
    expect((await fetch(new URL('/index.html',file.url))).status).toBe(404);
    const folder=await serveJourneySource(site,true);cleanup.push(folder.close);
    expect(await (await fetch(folder.url)).text()).toContain('Actual content');
    expect((await fetch(new URL('/문서.txt',folder.url))).status).toBe(200);
    expect((await fetch(folder.url,{method:'POST'})).status).toBe(405);
    if(process.platform!=='win32'){
      await symlink(path.join(root,'private.txt'),path.join(site,'leak.txt'));
      expect((await fetch(new URL('/leak.txt',folder.url))).status).toBe(404);
    }
  });
  it('deduplicates coverage and validates local model endpoints',()=>{
    const request={address:'example.org',apiKey:'',goal:'Find hours',audiences:[],iterations:1,model:'local'};
    expect(stageRequest({addresses:['example.org','https://example.org/'],browsers:['ios-safari'],devices:['iphone-se-3']}).addresses).toHaveLength(1);
    expect(()=>stageRequest({addresses:['example.org'],browsers:['unknown'],devices:['iphone-se-3']})).toThrow();
    expect(()=>journeyRequest({...request,localEndpoint:'http://other.example:8080'})).toThrow();
    expect(journeyRequest({...request,localEndpoint:'http://127.0.0.1:8080'},'other-key').apiKey).toBe('');
  });
  it('requires a visible quote to support a model finish and respects screen sharing',async()=>{
    const request={address:'https://site.test',apiKey:'private',goal:'Find hours',material:'Context',audiences:[],iterations:1,model:'model'};
    const page={title:'Hours',path:'/',text:'Open 09:00',controls:[]},signal=new AbortController().signal;
    for(const shareScreen of [false,true]){
      const expected=shareScreen?'09:00':'made-up text';
      const action=await chooseAction({...request,shareScreen},'Visitor',page,[],signal,async(_url,init)=>{
        const content=JSON.parse(String(init.body)).messages[1].content;
        expect(Array.isArray(content)).toBe(shareScreen);
        expect(JSON.stringify(content).includes('data:image')).toBe(shareScreen);
        return Response.json({choices:[{message:{content:JSON.stringify({action:'finish',reason:'I found it',evidence:expected})}}]});
      },'data:image/jpeg;base64,test');
      expect(action.evidence).toBe(shareScreen?'09:00':undefined);
    }
  });
});
