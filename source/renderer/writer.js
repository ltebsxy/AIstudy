const $=id=>document.getElementById(id),canvas=$('paper'),ctx=canvas.getContext('2d'),background=$('document-layer'),bg=background.getContext('2d'),area=$('paper-area');
let course=null,index=0,pages=[],legacy={},board=StudyBoard.normalize(),ready=false,busy=false,tool='pen',active=null,panning=null,redo=[],readerPages=0,cache=new Map(),pending=new Set(),renderQueue=Promise.resolve(),saveChain=Promise.resolve(),saveError=null,generation=0,origin=0,frame=0,saveTimer=0,restoring=false;
let screenWidth=1,screenHeight=1,dpr=1,aiVisible=false;
function aiState(visible){aiVisible=visible;$('writer-ai-panel').hidden=!visible;$('toggle-ai').setAttribute('aria-pressed',String(visible));$('toggle-ai').title=(visible?'关闭':'打开')+' AI 问答';}
window.study.onWriterAIVisibility(aiState);
const reading=()=>course?.sessionMode==='reading';
function status(text){$('save-status').textContent=text;}
function controls(){
  $('undo').disabled=!ready||busy||!board.strokes.length;$('redo').disabled=!ready||busy||!redo.length;$('clear').disabled=!ready||busy||!board.strokes.length;
  for(const id of ['previous-question','next-question','capture-answer']){$(id).hidden=reading();$(id).disabled=!ready||busy;}
  $('previous-question').disabled=!ready||busy||index===0;
  $('next-question').title=index===course?.questions.length-1?'完成最后一题并进入提交页':'下一题';
  $('toggle-ai').hidden=false;$('toggle-ai').disabled=!ready||busy;
  $('file-settings').hidden=!reading();$('question-select').disabled=!ready||busy;for(const input of $('question-response').querySelectorAll('input'))input.disabled=!ready||busy;
  for(const id of ['file-width','file-left','file-gap','reset-file','return-origin'])$(id).disabled=!ready||busy;
}
function settings(){for(const key of ['width','left','gap']){$('file-'+key).value=board.file[key];$('file-'+key+'-value').textContent=Math.round(board.file[key])+' px';}}
function persist(){
  clearTimeout(saveTimer);if(!ready||!course)return;
  if(!reading()){pages[index]={strokes:[],board:structuredClone(board)};}
  const data={sessionId:course.sessionId,...(reading()?{...legacy,workspace:structuredClone(board)}:{pages:structuredClone(pages)})},version=generation;
  status('正在保存…');saveChain=saveChain.then(()=>window.study.writerSave(data)).then(()=>{if(version===generation){saveError=null;status('已自动保存');}},e=>{if(version===generation){saveError=e;status('保存失败：'+e.message);}});
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);}
// Only ink extends the blank area, downward. Existing documents and legacy ink remain reachable.
function fitExtent(){
  if(!board.extent){
    board.extent={top:0,bottom:screenHeight,right:screenWidth};
    for(const stroke of board.strokes)for(const raw of stroke.points){const p=StudyBoard.worldPoint(raw,stroke,board.file);board.extent.top=Math.min(board.extent.top,p.y-48);board.extent.bottom=Math.max(board.extent.bottom,p.y+48);board.extent.right=Math.max(board.extent.right,p.x+48);}
  }
  const e=board.extent;e.bottom=Math.max(e.bottom,e.top+screenHeight);e.right=Math.max(e.right,screenWidth);
  if(!reading()&&!$('canvas-question').hidden)e.bottom=Math.max(e.bottom,96+$('canvas-question').offsetHeight+160);
  if(reading()&&readerPages){const last=StudyBoard.rect(board.file,readerPages-1);e.bottom=Math.max(e.bottom,last.y+last.height+16);e.right=Math.max(e.right,last.x+last.width+16);}
}
function syncScroll(){
  fitExtent();restoring=true;
  const e=board.extent,total=e.bottom-e.top,physical=Math.min(total,8000000);
  board.viewport.x=Math.max(0,Math.min(e.right-screenWidth,board.viewport.x));
  board.viewport.y=Math.max(e.top,Math.min(e.bottom-screenHeight,board.viewport.y));
  origin=total<=8000000?e.top:Math.max(e.top,Math.min(e.bottom-physical,board.viewport.y-physical/2));
  $('scroll-space').style.width=Math.ceil(e.right)+'px';$('scroll-space').style.height=Math.ceil(physical)+'px';
  area.scrollTop=board.viewport.y-origin;area.scrollLeft=board.viewport.x;restoring=false;
}
function moveTo(x,y){board.viewport={x,y};syncScroll();invalidate();scheduleSave();}
area.onscroll=()=>{if(restoring||!ready)return;const y=origin+area.scrollTop,x=area.scrollLeft;if(Math.abs(y-board.viewport.y)<1&&Math.abs(x-board.viewport.x)<1)return;board.viewport={x,y};invalidate();scheduleSave();};
function growForInk(point){
  if(tool==='eraser')return;
  fitExtent();const e=board.extent,extra=Math.max(640,screenHeight),threshold=Math.max(120,Math.round(screenHeight*.2));
  if(point.y>e.bottom-threshold)e.bottom=Math.max(e.bottom+extra,point.y+extra);
  syncScroll();
}
function resize(){
  screenWidth=area.clientWidth;screenHeight=area.clientHeight;dpr=Math.min(devicePixelRatio||1,2);
  for(const c of [canvas,background]){c.width=Math.round(screenWidth*dpr);c.height=Math.round(screenHeight*dpr);c.style.width=screenWidth+'px';c.style.height=screenHeight+'px';}
  syncScroll();invalidate();
}
new ResizeObserver(resize).observe(area);
function invalidate(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});}
function requestPage(i){
  if(cache.has(i)||pending.has(i))return;pending.add(i);const version=generation;
  renderQueue=renderQueue.catch(()=>{}).then(async()=>{
    if(version!==generation)return;
    const c=document.createElement('canvas');c.width=1000;c.height=1400;
    try{await StudyReader.render(i,c);if(version!==generation)return;cache.set(i,c);if(cache.size>12){const first=cache.keys().next().value;cache.delete(first);}invalidate();}
    catch(e){if(version===generation)status('文件显示失败：'+e.message);}
    finally{if(version===generation)pending.delete(i);}
  });
}
function drawDocument(c,v,w,h,queue=true){
  c.fillStyle='#fff';c.fillRect(0,0,w,h);if(!reading())return;
  const step=board.file.width*1.4+board.file.gap,start=Math.max(0,Math.floor(v.y/step)),end=Math.min(readerPages-1,Math.floor((v.y+h)/step));
  for(let i=start;i<=end;i++){
    const r=StudyBoard.rect(board.file,i),x=r.x-v.x,y=r.y-v.y;if(x>w||x+r.width<0)continue;
    c.fillStyle='#fafafa';c.fillRect(x,y,r.width,r.height);c.strokeStyle='#e0e3e5';c.lineWidth=1;c.strokeRect(x-.5,y-.5,r.width+1,r.height+1);
    const source=cache.get(i);if(source)c.drawImage(source,x,y,r.width,r.height);else{if(queue)requestPage(i);c.fillStyle='#a2aaa9';c.font='12px sans-serif';c.fillText('正在读取…',x+20,y+40);}
  }
}
function drawStroke(c,s,v){
  const scale=s.anchor==null?1:board.file.width/1000,r=s.anchor==null?{x:0,y:0}:StudyBoard.rect(board.file,s.anchor),g=StudyInk.geometry(s),bounds=g.bounds;
  if(r.x+bounds.maxX*scale<v.x||r.x+bounds.minX*scale>v.x+screenWidth||r.y+bounds.maxY*scale<v.y||r.y+bounds.minY*scale>v.y+screenHeight)return;
  c.save();c.translate(r.x-v.x,r.y-v.y);c.scale(scale,scale);StudyInk.paint(c,s,g);c.restore();
}

function paint(){
  WriterQuestion.position(board.viewport);
  bg.setTransform(dpr,0,0,dpr,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);drawDocument(bg,board.viewport,screenWidth,screenHeight);ctx.clearRect(0,0,screenWidth,screenHeight);
  for(const s of board.strokes)drawStroke(ctx,s,board.viewport);if(active)drawStroke(ctx,active,board.viewport);
}
function world(event){return {x:Math.max(0,Math.min(screenWidth,event.clientX))+board.viewport.x,y:Math.max(0,Math.min(screenHeight,event.clientY))+board.viewport.y,p:event.pointerType==='pen'?Math.max(.05,event.pressure||.5):.5};}
function anchorAt(p){if(!reading())return undefined;const step=board.file.width*1.4+board.file.gap,i=Math.floor(p.y/step),r=StudyBoard.rect(board.file,i);return i>=0&&i<readerPages&&p.x>=r.x&&p.x<=r.x+r.width&&p.y<=r.y+r.height?i:undefined;}
function appendPoint(event){const position=world(event);growForInk(position);const p=StudyBoard.localPoint(position,active.anchor,board.file),last=active.points.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>.3)active.points.push(p);invalidate();}
canvas.onpointerdown=e=>{
  if(!ready||busy||active||panning||!e.isPrimary||e.button>1)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);
  if(tool==='hand'||e.pointerType==='touch'||e.button===1){panning={x:e.clientX,y:e.clientY,v:{...board.viewport}};document.body.classList.add('dragging');return;}
  const point=world(e);growForInk(point);const anchor=anchorAt(point),scale=anchor==null?1:board.file.width/1000;
  active={tool,color:tool==='highlighter'?'#e5c62c':$('color').value,width:(tool==='eraser'?Number($('eraser-width').value):tool==='highlighter'?Number($('width').value)*5:Number($('width').value))/scale,...(anchor!=null?{anchor}:{}),points:[StudyBoard.localPoint(point,anchor,board.file)]};
  invalidate();
};
canvas.onpointermove=e=>{
  if(panning){moveTo(panning.v.x+panning.x-e.clientX,panning.v.y+panning.y-e.clientY);return;}if(!active)return;
  const samples=e.getCoalescedEvents?.();for(const event of samples?.length?samples:[e])appendPoint(event);
};
function finishStroke(){
  if(panning){panning=null;document.body.classList.remove('dragging');persist();}
  if(!active)return;board.strokes.push(active);active=null;redo=[];
  invalidate();controls();persist();
}
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finishStroke;canvas.oncontextmenu=e=>e.preventDefault();
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!ready||busy||active)return;const factor=e.deltaMode===1?20:e.deltaMode===2?screenHeight:1;moveTo(board.viewport.x+(e.shiftKey?e.deltaY:e.deltaX)*factor,board.viewport.y+(e.shiftKey?0:e.deltaY)*factor);},{passive:false});
function selectTool(next,color){finishStroke();tool=next;if(color)$('color').value=color;document.body.classList.toggle('hand',tool==='hand');
  for(const button of document.querySelectorAll('[data-pen],#hand,#eraser,#highlighter')){const selected=button.dataset.pen?next==='pen'&&button.dataset.pen===$('color').value:button.id===next;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
}
for(const button of document.querySelectorAll('[data-pen]'))button.onclick=()=>selectTool('pen',button.dataset.pen);
for(const id of ['hand','eraser','highlighter'])$(id).onclick=()=>selectTool(id);
$('color').oninput=()=>selectTool('pen');$('width').oninput=finishStroke;$('eraser-width').oninput=finishStroke;
$('undo').onclick=()=>{if(!ready||busy)return;finishStroke();const s=board.strokes.pop();if(s)redo.push(s);invalidate();controls();persist();};
$('redo').onclick=()=>{if(!ready||busy)return;const s=redo.pop();if(s)board.strokes.push(s);invalidate();controls();persist();};
$('clear').onclick=()=>{if(!ready||busy||!confirm('清空当前画布的全部笔迹？文件原文会保留。'))return;finishStroke();redo=[...board.strokes].reverse();board.strokes=[];invalidate();controls();persist();};
for(const key of ['width','left','gap'])$('file-'+key).oninput=()=>{if(!ready)return;finishStroke();board.file[key]=Number($('file-'+key).value);settings();syncScroll();invalidate();scheduleSave();};
$('reset-file').onclick=()=>{board.file={width:Math.min(720,Math.max(320,Math.round(screenWidth*.45))),left:48,gap:24};settings();syncScroll();invalidate();persist();};
$('return-origin').onclick=()=>{finishStroke();moveTo(0,0);$('view-settings').hidePopover();};
async function action(callback){if(!ready||busy)return;finishStroke();persist();busy=true;controls();try{await saveChain;await WriterQuestion.flush();if(saveError)throw saveError;await callback();}catch(e){status(e.message);}finally{busy=false;controls();}}
$('back-course').onclick=()=>ready?action(()=>window.study.pauseSession()):window.study.pauseSession();
$('previous-question').onclick=()=>action(()=>window.study.navigateQuestion(index-1));
$('next-question').onclick=()=>action(()=>window.study.finishSession());
$('capture-answer').onclick=()=>action(()=>window.study.startCapture('answer'));
$('toggle-ai').onclick=async()=>{if(!ready)return;const button=$('toggle-ai');button.disabled=true;try{aiState(await window.study.toggleWriterAI({sessionId:course.sessionId}));}catch(e){status(e.message);}finally{button.disabled=false;}};
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select,dialog'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey){const next={h:'hand',p:'pen',e:'eraser'}[e.key.toLowerCase()];if(next)selectTool(next);}
});
window.study.onCourse(async next=>{
  if(course?.sessionId===next.sessionId)return;finishStroke();clearTimeout(saveTimer);const version=++generation;ready=false;course=next;WriterQuestion.load(next);index=0;pages=[];legacy={};redo=[];cache.clear();pending.clear();readerPages=0;saveError=null;board=StudyBoard.normalize();status('正在载入…');$('course-title').textContent=course.title;controls();invalidate();
  try{
    await saveChain;const stored=await window.study.writerLoad();if(version!==generation)return;pages=stored.pages||[];
    if(reading()){
      legacy={pages:stored.pages||[],notes:stored.notes||[],positions:stored.positions,view:stored.view};
      await renderQueue.catch(()=>{});readerPages=await StudyReader.load(await window.study.readerSource({sessionId:course.sessionId}));if(version!==generation)return;
      board=StudyBoard.migrate(stored,true,Math.min(720,Math.max(320,Math.round(screenWidth*.45))));
    }else board=StudyBoard.migrate(pages[index]||{},false);
    ready=true;aiState(await window.study.writerAIState());settings();syncScroll();invalidate();controls();status('笔迹自动保存在本机');
  }catch(e){status('载入失败：'+e.message);}
});
window.study.onProgress(progress=>{WriterQuestion.progress(progress);if(!reading()&&index!==progress.index){finishStroke();persist();index=progress.index;board=StudyBoard.migrate(pages[index]||{},false);redo=[];settings();syncScroll();invalidate();controls();}});

window.addEventListener('writer-question-navigate',event=>action(()=>window.study.navigateQuestion(event.detail)));
// The chat is an in-window surface: keyboard focus never activates a second OS window.
function bindEmbeddedChat(){
  const frame=$('writer-ai-frame'),panel=$('writer-ai-panel'),bar=frame.contentDocument?.querySelector('.dragbar');if(!bar)return;
  let drag=null;
  bar.onpointerdown=e=>{if(e.target.closest('button'))return;e.preventDefault();const b=panel.getBoundingClientRect();drag={x:e.screenX,y:e.screenY,left:b.left,top:b.top};bar.setPointerCapture(e.pointerId);};
  bar.onpointermove=e=>{if(!drag)return;panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,drag.left+e.screenX-drag.x))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,drag.top+e.screenY-drag.y))+'px';panel.style.right=panel.style.bottom='auto';};
  bar.onpointerup=bar.onpointercancel=bar.onlostpointercapture=()=>{drag=null;};
}
$('writer-ai-frame').addEventListener('load',bindEmbeddedChat);bindEmbeddedChat();
window.addEventListener('resize',()=>{const panel=$('writer-ai-panel');if(panel.style.left){panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,parseFloat(panel.style.left)))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,parseFloat(panel.style.top)))+'px';}});

new ResizeObserver(()=>{if(ready&&!reading()){syncScroll();invalidate();}}).observe($('canvas-question'));
