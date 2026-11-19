// This fixed function also runs in the trusted automation shell. A marker in
// the element's containing block includes CSS scale and the Duo's perspective.
export function projectGuestPoint(guest:HTMLElement,x:number,y:number) {
  if(!guest.parentElement)throw Error('The simulator viewport is unavailable.');
  const point=document.createElement('i');
  point.style.cssText='position:absolute;width:0;height:0;pointer-events:none';
  point.style.left=(guest.offsetLeft+x*guest.clientWidth)+'px';
  point.style.top=(guest.offsetTop+y*guest.clientHeight)+'px';
  guest.parentElement.append(point);
  const rect=point.getBoundingClientRect();
  point.remove();
  return {x:rect.x,y:rect.y};
}
