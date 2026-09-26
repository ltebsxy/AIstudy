function setupFloatingChat(panel) {
  const key = 'lesson-chat-window';
  let box;
  try { box = JSON.parse(localStorage.getItem(key)); } catch {}
  if (!box || !['left','top','width','height'].every(k=>Number.isFinite(box[k]))) {
    box = { left: innerWidth - 384, top: 24, width: 360, height: 640 };
  }
  function place() {
    const width = Math.max(280, Math.min(box.width, innerWidth - 24));
    const height = Math.max(340, Math.min(box.height, innerHeight - 24));
    box = { width, height, left: Math.max(12,Math.min(box.left,innerWidth-width-12)), top:Math.max(12,Math.min(box.top,innerHeight-height-12)) };
    Object.assign(panel.style,{left:`${box.left}px`,top:`${box.top}px`,width:`${width}px`,height:`${height}px`});
  }
  function save() { try { localStorage.setItem(key,JSON.stringify(box)); } catch {} }
  const header = panel.querySelector('header');
  header.title = '拖动移动窗口；拖动右下角调整大小';
  let drag;
  header.onpointerdown = e => {
    if(e.button!==0 || e.target.closest('button'))return;
    drag={x:e.clientX,y:e.clientY,left:box.left,top:box.top};
    header.setPointerCapture(e.pointerId);e.preventDefault();
  };
  header.onpointermove = e => {if(!drag)return;box.left=drag.left+e.clientX-drag.x;box.top=drag.top+e.clientY-drag.y;place();};
  header.onpointerup = header.onpointercancel = () => {drag=null;save();};
  const observer = new ResizeObserver(()=>{
    if(panel.hidden)return;
    const r=panel.getBoundingClientRect();box.width=r.width;box.height=r.height;save();
  });
  observer.observe(panel);
  window.addEventListener('resize',place);
  place();
  return {show:place,dispose:()=>{observer.disconnect();window.removeEventListener('resize',place);}};
}
