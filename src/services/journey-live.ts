import type { WebContents } from 'electron';

// Stream the test page's own compositor. An animation can produce many frames
// between decisions, and a static page need not produce another frame.
export function watchJourneySurface(source:WebContents, deliver:(jpeg:string)=>void):()=>void {
  const cdp=source.debugger;
  let stopped=false;
  let fallback=false;
  let received=false;
  let timer:ReturnType<typeof setTimeout> | undefined;
  async function sample(){
    if(stopped || source.isDestroyed())return;
    try {
      const frame=await source.capturePage();
      if(!stopped && fallback && !frame.isEmpty()){
        const width=Math.min(680,frame.getSize().width);
        deliver(frame.resize({width}).toJPEG(76).toString('base64'));
      }
    } catch { /* A navigation can interrupt a single compositor readback. */ }
    if(!stopped && fallback)timer=setTimeout(()=>void sample(),90);
  }
  function useReadback(){
    if(stopped || received || fallback)return;
    fallback=true;
    void sample();
  }
  function onMessage(_event:unknown,method:string,params:{data?:string;sessionId?:number},childSession?:string){
    if(stopped || childSession || method!=='Page.screencastFrame')return;
    void cdp.sendCommand('Page.screencastFrameAck',{sessionId:params.sessionId}).catch(()=>{});
    if(!params.data)return;
    received=true;
    fallback=false;
    clearTimeout(timer);
    deliver(params.data);
  }
  cdp.on('message',onMessage);
  try {
    if(!cdp.isAttached())cdp.attach('1.3');
    // If a hidden platform surface does not start painting, read that same
    // surface directly until the first screencast frame becomes available.
    timer=setTimeout(useReadback,1500);
    void cdp.sendCommand('Page.startScreencast',{format:'jpeg',quality:76,maxWidth:760,maxHeight:1200,everyNthFrame:1}).catch(useReadback);
  } catch {useReadback();}
  return ()=>{
    stopped=true;
    clearTimeout(timer);
    cdp.removeListener('message',onMessage);
    if(!source.isDestroyed() && cdp.isAttached())void cdp.sendCommand('Page.stopScreencast').catch(()=>{});
  };
}
