import {describe, expect, it, vi, afterEach} from 'vitest';
import {journeyRequest, drawPersonas, chooseAction, suggestPersonas} from '../../src/services/journey-planner';
const request={address:'https://example.org/',goal:'Find class times',audiences:[],iterations:3,model:'openai/gpt-4.1-mini',apiKey:'test-only'};
const page={path:'/',title:'Classes',text:'Morning schedule',controls:['See schedule']};
const signal=new AbortController().signal;
afterEach(()=>vi.unstubAllGlobals());
describe('audience journeys',()=>{
  it('accepts bare domains and an environment key',()=>{
    expect(journeyRequest({...request,address:'example.org',apiKey:''},'env-test')).toMatchObject({address:'https://example.org/',apiKey:'env-test'});
  });
  it.each([{address:'ftp://example.org'},{address:'https://a:b@example.org/'},{iterations:1.5},{iterations:13},{apiKey:''},{audiences:['Student','Student']},{goal:' '}])('rejects invalid setup %j',patch=>{
    expect(()=>journeyRequest({...request,...patch})).toThrow();
  });
  it('draws full decks before repeating, including at deck boundaries',()=>{
    for(let i=0;i<50;i++){
      const order=drawPersonas(['A','B','C'],12);
      expect(order).toHaveLength(12);
      for(let j=0;j<12;j+=3) expect(new Set(order.slice(j,j+3)).size).toBe(3);
      expect(order.every((p,j)=>!j||p!==order[j-1])).toBe(true);
    }
  });
  it('does not run a model-provided script or out-of-bounds action',async()=>{
    for(const decision of [{action:'script',reason:'x'},{action:'tap',target:9,reason:'x'}]){
      vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{message:{content:JSON.stringify(decision)}}]})));
      await expect(chooseAction(request,'Student',page,[],signal)).rejects.toThrow();
    }
  });
  it('requires distinct suggested audiences for repeated visits',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{message:{content:'{"audiences":["Same","Same"]}'}}]})));
    await expect(suggestPersonas(request,page,signal)).rejects.toThrow();
  });
});
