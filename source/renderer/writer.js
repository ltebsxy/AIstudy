const $=id=>document.getElementById(id),canvas=$('paper'),ctx=canvas.getContext('2d'),background=$('document-layer'),bg=background.getContext('2d'),area=$('paper-area');
let course=null,index=0,pages=[],legacy={},board=StudyBoard.normalize(),ready=false,busy=false,tool='pen',active=null,panning=null,redo=[],readerPages=0,cache=new Map(),pending=new Set(),renderQueue=Promise.resolve(),saveChain=Promise.resolve(),saveError=null,generation=0,origin=0,frame=0,saveTimer=0,restoring=false;
let screenWidth=1,screenHeight=1,dpr=1,aiVisible=false,aiMotionState=null,aiAnimation=null,wordGesture=null,textSelection=null;
let readerRevision=0,shapeTimer=0,pendingTextTap=null,selectionRevision=0,gesturePointerId=null;const shapeOriginal=new WeakMap();
// Opt-in, in-memory diagnostics only. No automatic persistence or text/credential capture.
let shapeDiagnostic=null,shapeSequence=0;
function shapeId(value){if(!shapeDiagnostic||!value)return null;const d=shapeDiagnostic;if(!d.ids.has(value))d.ids.set(value,++d.nextId);return d.ids.get(value);}
function traceShape(type,detail){
  const d=shapeDiagnostic;if(!d)return;if(d.events.length>=d.limit){d.dropped++;return;}
  d.events.push(structuredClone({time:performance.now(),type,state:{generation,ready,busy,hidden:document.hidden,focused:document.hasFocus(),tool,enabled:$('auto-shape').checked,board:shapeId(board),active:shapeId(active),last:shapeId(board.strokes.at(-1)),owner:gesturePointerId,viewport:board.viewport,file:board.file,screen:{width:screenWidth,height:screenHeight,dpr},timer:shapeTimer},...(typeof detail==='function'?detail():detail)}));
}
window.StudyShapeDiagnostics={
  start(limit=20000){shapeDiagnostic={ids:new WeakMap(),nextId:0,events:[],dropped:0,limit:Math.max(100,Math.min(50000,Number(limit)||20000)),startedAt:new Date().toISOString()};traceShape('start');},
  stop(){shapeDiagnostic=null;},
  snapshot(){const d=shapeDiagnostic;return d?structuredClone({version:1,startedAt:d.startedAt,dropped:d.dropped,events:d.events}):null;},
  mark(label){traceShape('test-marker',{label:String(label).slice(0,160)});}
};
function pointerDiagnostic(e){return {type:e.type,pointerId:e.pointerId,pointerType:e.pointerType,isPrimary:e.isPrimary,isTrusted:e.isTrusted,buttons:e.buttons,button:e.button,clientX:e.clientX,clientY:e.clientY,pageX:e.pageX,pageY:e.pageY,movementX:e.movementX,movementY:e.movementY,pressure:e.pressure,timeStamp:e.timeStamp};}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(shapeDiagnostic)traceShape('pointer',()=>({event:pointerDiagnostic(e),coalesced:(e.getCoalescedEvents?.()||[]).map(pointerDiagnostic)}));},{capture:true});
document.addEventListener('visibilitychange',()=>traceShape('visibility'));
for(const type of ['focus','blur'])window.addEventListener(type,()=>traceShape(type));
document.addEventListener('click',event=>{const control=event.target.closest?.('#undo,#redo,#pen,#hand,#eraser,#highlighter,#text-tool');if(control)traceShape('control-click',{id:control.id,isTrusted:event.isTrusted});},{capture:true});
const textEditor=StudyText({board:()=>board,session:()=>course?.sessionId,reading:()=>reading(),anchor:anchorAt,color:visibleInk,invalidate,changed:()=>{syncScroll();invalidate();scheduleSave();},error:e=>status(e.message),editing:item=>{StudyReader.setEditing(item);readerRevision++;cache.clear();pending.clear();invalidate();},reload:reloadReading});
function cancelShape(reason='other'){if(shapeTimer)traceShape('timer-cancel',{reason,sequence:shapeSequence});clearTimeout(shapeTimer);shapeTimer=0;}
function scheduleShape(stroke){
  cancelShape('reschedule');if(!$('auto-shape').checked||stroke?.tool!=='pen'||shapeOriginal.has(stroke)){traceShape('schedule-skip',()=>({stroke:shapeId(stroke),reason:!$('auto-shape').checked?'disabled':stroke?.tool!=='pen'?'not-pen':'already-fitted'}));return;}
  const version=generation,current=board,sequence=++shapeSequence;
  traceShape('timer-schedule',()=>({sequence,due:performance.now()+1800,stroke:shapeId(stroke),points:stroke.points.length}));
  shapeTimer=setTimeout(()=>{
    if(sequence===shapeSequence)shapeTimer=0;
    traceShape('timer-fire',()=>({sequence,stroke:shapeId(stroke),scheduledGeneration:version,scheduledBoard:shapeId(current),raw:stroke.points.slice(0,10000),rawTruncated:stroke.points.length>10000}));
    const reason=version!==generation?'generation':board!==current?'board-replaced':!ready?'not-ready':busy?'busy':document.hidden?'hidden':null;
    if(reason){traceShape('timer-skip',{sequence,reason});return;}
    const held=active===stroke;if(!held&&(active||board.strokes.at(-1)!==stroke)){traceShape('timer-skip',{sequence,reason:active?'another-active-stroke':'not-last-stroke'});return;}
    const fit=StudyShapes.fit(stroke,shapeDiagnostic?result=>traceShape('fit',{sequence,stroke:shapeId(stroke),result}):undefined);if(!fit)return;const {shape,...result}=fit;shapeOriginal.set(result,stroke);
    if(held)active=result;else{board.strokes[board.strokes.length-1]=result;persist();}
    traceShape('fit-applied',()=>({sequence,held,from:shapeId(stroke),to:shapeId(result),shape}));
    redo=[];invalidate();controls();status('已整理为'+shape+' · 撤销可恢复原笔迹');
  },1800);
}
try{$('auto-shape').checked=localStorage.getItem('writer-auto-shape')!=='false';}catch{}
$('auto-shape').onchange=()=>{cancelShape('option-change');try{localStorage.setItem('writer-auto-shape',String($('auto-shape').checked));}catch{}};
window.addEventListener('english-selection-clear',()=>{textSelection=null;invalidate();});
window.addEventListener('english-selection',event=>{
  if(event.detail.sessionId!==course?.sessionId)return;
  textSelection={anchor:event.detail.page,items:event.detail.items};invalidate();
});
let canvasColors;
function updateCanvasTheme(){
  const style=getComputedStyle(document.documentElement);
  canvasColors=Object.fromEntries(['bg','page','border','ink'].map(key=>[key,style.getPropertyValue('--canvas-'+key).trim()]));
  if(course?.noteId)cache.clear();invalidate();
}
function visibleInk(color){
  if(!StudyTheme.dark||!/^#[0-9a-f]{6}$/i.test(color))return color;
  const rgb=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));
  return Math.max(...rgb)<100&&Math.max(...rgb)-Math.min(...rgb)<45?canvasColors.ink:color;
}
window.addEventListener('study-theme-changed',updateCanvasTheme);updateCanvasTheme();
function aiState(visible){
  if(aiMotionState===visible)return;
  aiMotionState=visible;aiVisible=visible;
  const panel=$('writer-ai-panel'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  aiAnimation?.cancel();aiAnimation=null;
  if(visible){
    panel.hidden=false;panel.inert=false;
    aiAnimation=StudyChat.transition(panel,true);
  }else{
    panel.inert=true;
    if(reduce||panel.hidden)panel.hidden=true;
    else{aiAnimation=StudyChat.transition(panel,false);aiAnimation.onfinish=()=>{if(!aiVisible)panel.hidden=true;aiAnimation=null;};}
  }
  $('toggle-ai').setAttribute('aria-pressed',String(visible));$('toggle-ai').title=(visible?'关闭':'打开')+' AI 问答';
}
window.study.onWriterAIVisibility(aiState);
const reading=()=>course?.sessionMode==='reading';
let disposeNoteSelection=()=>{};
const englishReading=()=>reading()&&legacy.readingMode==='english';
function status(text){$('save-status').textContent=text;}
function controls(){
  $('back-course').title=course?.noteId?'返回笔记':reading()?'返回读写列表':'返回课程';$('back-course').setAttribute('aria-label',$('back-course').title);
  $('undo').disabled=!ready||busy||!board.strokes.length;$('redo').disabled=!ready||busy||!redo.length;$('clear').disabled=!ready||busy||!board.strokes.length;
  for(const id of ['previous-question','next-question','capture-answer']){$(id).hidden=reading();$(id).disabled=!ready||busy;}
  $('previous-question').disabled=!ready||busy||index===0;
  $('next-question').title=index===course?.questions.length-1?'完成最后一题并进入提交页':'下一题';
  $('toggle-ai').hidden=false;$('toggle-ai').disabled=!ready||busy;
  $('capture-note').hidden=false;$('capture-note').disabled=!ready||busy;$('capture-note').title='截图追加到默认笔记';
  for(const id of ['note-add-text','note-edit-content']){$(id).hidden=!course?.noteId;$(id).disabled=!ready||busy;}
  $('reading-note-settings').hidden=!reading()||!course?.id.startsWith('document:');
  $('file-settings').hidden=!reading();$('question-select').disabled=!ready||busy;for(const input of $('question-response').querySelectorAll('input'))input.disabled=!ready||busy;
  $('reading-mode').disabled=!ready||busy||!reading();$('reading-mode').value=legacy.readingMode||'standard';$('english-help').hidden=!englishReading();
  for(const id of ['file-width','file-left','file-gap','reset-file','return-origin'])$(id).disabled=!ready||busy;
}
function settings(){for(const key of ['width','left','gap']){$('file-'+key).value=board.file[key];$('file-'+key+'-value').textContent=Math.round(board.file[key])+' px';}}
function persist(){
  clearTimeout(saveTimer);if(!ready||!course)return;
  if(!reading()){pages[index]={strokes:[],board:structuredClone(board)};}
  const data={sessionId:course.sessionId,...(reading()?{...legacy,workspace:structuredClone(board)}:{pages:structuredClone(pages)})},version=generation;
  traceShape('save-queued');status('正在保存…');saveChain=saveChain.then(()=>window.study.writerSave(data)).then(()=>{traceShape('save-complete',{savedGeneration:version});if(version===generation){saveError=null;status('已自动保存');}},e=>{traceShape('save-error',{savedGeneration:version});if(version===generation){saveError=e;status('保存失败：'+e.message);}});
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);}
// Only ink extends the blank area, downward. Existing documents and legacy ink remain reachable.
function fitExtent(){
  if(!board.extent){
    board.extent={top:0,bottom:screenHeight,right:screenWidth};
    for(const stroke of board.strokes)for(const raw of stroke.points){const p=StudyBoard.worldPoint(raw,stroke,board.file);board.extent.top=Math.min(board.extent.top,p.y-48);board.extent.bottom=Math.max(board.extent.bottom,p.y+48);board.extent.right=Math.max(board.extent.right,p.x+48);}
  }
  const e=board.extent;e.bottom=Math.max(e.bottom,e.top+screenHeight);e.right=Math.max(e.right,screenWidth);
  for(const text of board.texts)e.bottom=Math.max(e.bottom,text.y+Math.max(70,text.text.split('\n').length*text.size*1.6)+80);
  if(!reading()&&!$('canvas-question').hidden)e.bottom=Math.max(e.bottom,96+$('canvas-question').offsetHeight+160);
  if(reading()&&readerPages){const last=StudyBoard.rect(board.file,readerPages-1);e.bottom=Math.max(e.bottom,last.y+last.height+16);e.right=Math.max(e.right,last.x+last.width+16);}
}
function syncScroll(){
  const before=shapeDiagnostic?{...board.viewport}:null;fitExtent();restoring=true;
  const e=board.extent,total=e.bottom-e.top,physical=Math.min(total,8000000);
  board.viewport.x=Math.max(0,Math.min(e.right-screenWidth,board.viewport.x));
  board.viewport.y=Math.max(e.top,Math.min(e.bottom-screenHeight,board.viewport.y));
  origin=total<=8000000?e.top:Math.max(e.top,Math.min(e.bottom-physical,board.viewport.y-physical/2));
  $('scroll-space').style.width=Math.ceil(e.right)+'px';$('scroll-space').style.height=Math.ceil(physical)+'px';
  area.scrollTop=board.viewport.y-origin;area.scrollLeft=board.viewport.x;restoring=false;if(before&&(before.x!==board.viewport.x||before.y!==board.viewport.y))traceShape('viewport-clamped',{before});
}
function moveTo(x,y){traceShape('viewport-request',{x,y});cancelShape('viewport-move');EnglishReader.close();board.viewport={x,y};syncScroll();invalidate();scheduleSave();}
area.onscroll=()=>{if(restoring||!ready)return;$('reading-selection-note').hidden=true;const y=origin+area.scrollTop,x=area.scrollLeft;if(Math.abs(y-board.viewport.y)<1&&Math.abs(x-board.viewport.x)<1)return;EnglishReader.close();traceShape('viewport-scroll',{next:{x,y}});board.viewport={x,y};invalidate();scheduleSave();};
function growForInk(point){
  if(tool==='eraser')return;
  fitExtent();const e=board.extent,extra=Math.max(640,screenHeight),threshold=Math.max(120,Math.round(screenHeight*.2));
  if(point.y>e.bottom-threshold){const before=e.bottom;e.bottom=Math.max(e.bottom+extra,point.y+extra);traceShape('extent-growth',{before,after:e.bottom,point});}
  syncScroll();
}
function resize(){
  traceShape('resize-before');screenWidth=area.clientWidth;screenHeight=area.clientHeight;dpr=Math.min(devicePixelRatio||1,2);
  for(const c of [canvas,background]){c.width=Math.round(screenWidth*dpr);c.height=Math.round(screenHeight*dpr);c.style.width=screenWidth+'px';c.style.height=screenHeight+'px';}
  syncScroll();invalidate();traceShape('resize-after');
}
new ResizeObserver(resize).observe(area);
function invalidate(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});}
function requestPage(i){
  if(cache.has(i)||pending.has(i))return;pending.add(i);const version=generation,revision=readerRevision;
  renderQueue=renderQueue.catch(()=>{}).then(async()=>{
    if(version!==generation||revision!==readerRevision)return;
    const rect=StudyBoard.rect(board.file,i),v=board.viewport;
    if(rect.y+rect.height<v.y||rect.y>v.y+screenHeight||rect.x+rect.width<v.x||rect.x>v.x+screenWidth){pending.delete(i);return;}
    const c=document.createElement('canvas');c.width=1000;c.height=1400;
    try{await StudyReader.render(i,c);if(version!==generation||revision!==readerRevision)return;cache.set(i,c);if(cache.size>12){const first=cache.keys().next().value;cache.delete(first);}invalidate();}
    catch(e){if(version===generation&&revision===readerRevision)status('文件显示失败：'+e.message);}
    finally{if(version===generation&&revision===readerRevision)pending.delete(i);}
  });
}
function drawDocument(c,v,w,h,queue=true){
  c.fillStyle=canvasColors.bg;c.fillRect(0,0,w,h);if(!reading())return;
  const step=board.file.width*1.4+board.file.gap,start=Math.max(0,Math.floor(v.y/step)),end=Math.min(readerPages-1,Math.floor((v.y+h)/step));
  for(let i=start;i<=end;i++){
    const r=StudyBoard.rect(board.file,i),x=r.x-v.x,y=r.y-v.y;if(x>w||x+r.width<0)continue;
    c.fillStyle=canvasColors.page;c.fillRect(x,y,r.width,r.height);c.strokeStyle=canvasColors.border;c.lineWidth=1;c.strokeRect(x-.5,y-.5,r.width+1,r.height+1);
    const source=cache.get(i);if(source){c.save();if(StudyTheme.dark&&!course?.noteId&&StudyReader.pageKind(i)!=='image')c.filter='invert(0.88) hue-rotate(180deg)';c.drawImage(source,x,y,r.width,r.height);c.restore();}else{if(queue)requestPage(i);c.fillStyle='#a2aaa9';c.font='12px sans-serif';c.fillText('正在读取…',x+20,y+40);}
  }
}
function drawStroke(c,s,v){
  const scale=s.anchor==null?1:board.file.width/1000,r=s.anchor==null?{x:0,y:0}:StudyBoard.rect(board.file,s.anchor),g=StudyInk.geometry(s),bounds=g.bounds;
  if(r.x+bounds.maxX*scale<v.x||r.x+bounds.minX*scale>v.x+screenWidth||r.y+bounds.maxY*scale<v.y||r.y+bounds.minY*scale>v.y+screenHeight)return;
  c.save();c.translate(r.x-v.x,r.y-v.y);c.scale(scale,scale);StudyInk.paint(c,s,g,visibleInk(s.color));c.restore();
}

function paint(){
  traceShape('paint');textEditor.position();
  WriterQuestion.position(board.viewport);
  bg.setTransform(dpr,0,0,dpr,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);drawDocument(bg,board.viewport,screenWidth,screenHeight);ctx.clearRect(0,0,screenWidth,screenHeight);
  if(textSelection?.items.length){
    const r=StudyBoard.rect(board.file,textSelection.anchor),scale=board.file.width/1000;
    ctx.save();ctx.translate(r.x-board.viewport.x,r.y-board.viewport.y);ctx.scale(scale,scale);ctx.fillStyle=StudyTheme.dark?'rgba(124,199,167,.32)':'rgba(95,180,145,.25)';
    for(const item of textSelection.items){ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.angle);ctx.fillRect(item.start,item.top,item.end-item.start,item.height);ctx.restore();}ctx.restore();
  }
  for(const s of board.strokes)drawStroke(ctx,s,board.viewport);if(active)drawStroke(ctx,active,board.viewport);
}
function world(event){return {x:Math.max(0,Math.min(screenWidth,event.clientX))+board.viewport.x,y:Math.max(0,Math.min(screenHeight,event.clientY))+board.viewport.y,p:event.pointerType==='pen'?Math.max(.05,event.pressure||.5):.5};}
function anchorAt(p){if(!reading())return undefined;const step=board.file.width*1.4+board.file.gap,i=Math.floor(p.y/step),r=StudyBoard.rect(board.file,i);return i>=0&&i<readerPages&&p.x>=r.x&&p.x<=r.x+r.width&&p.y<=r.y+r.height?i:undefined;}
function appendPoint(event){
  if(!(event.buttons&1)){traceShape('ignored-sample',()=>({event:pointerDiagnostic(event),reason:'not-pressed'}));return;}
  const position=world(event);const p=StudyBoard.localPoint(position,active.anchor,board.file),last=active.points.at(-1),distance=Math.hypot(p.x-last.x,p.y-last.y);
  traceShape('sample',()=>({event:pointerDiagnostic(event),world:position,local:p,stroke:shapeId(active),distance,accepted:distance>.8}));
  if(distance>.8){if(shapeOriginal.has(active)){traceShape('restore-held-original',()=>({from:shapeId(active),to:shapeId(shapeOriginal.get(active))}));active=shapeOriginal.get(active);}growForInk(position);active.points.push(p);scheduleShape(active);}invalidate();}

function selectedWords(gesture){
  if(gesture.start<0)return null;
  const end=StudyBoard.localPoint(gesture.end,gesture.anchor,gesture.file);
  return ReaderWords.range(gesture.items,gesture.start,gesture.moved?ReaderWords.nearest(gesture.items,end.x,end.y):gesture.start);
}
function highlightWords(gesture){const hit=selectedWords(gesture);textSelection=hit?{anchor:gesture.anchor,items:hit.items}:null;invalidate();}
canvas.onpointerdown=e=>{
  if(!ready||busy||active||pendingTextTap||panning||wordGesture||!e.isPrimary||e.button>1)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);
  gesturePointerId=e.pointerId;
  cancelShape('pointer-down');
  if(textEditor.active){pendingTextTap=null;textEditor.flush().catch(error=>status(error.message));return;}
  if(tool==='text'&&e.button===0){textEditor.click(world(e)).catch(error=>status(error.message));return;}
  $('reading-selection-note').hidden=true;
  if(reading()&&tool==='hand'&&e.pointerType==='mouse'&&e.button===0){
    const point=world(e),anchor=anchorAt(point);
    if(anchor!=null){
      const gesture=wordGesture={x:e.clientX,y:e.clientY,point,end:point,anchor,moved:false,file:{...board.file},items:null,start:-1};
      const local=StudyBoard.localPoint(point,anchor,gesture.file);
      gesture.loaded=StudyReader.words(anchor,!englishReading()).then(items=>{
        gesture.items=items;gesture.start=ReaderWords.hitIndex(items,local.x,local.y);
        if(wordGesture===gesture){if(gesture.start>=0){panning=null;document.body.classList.remove('dragging');highlightWords(gesture);}else if(gesture.moved&&panning)moveTo(panning.v.x+gesture.point.x-gesture.end.x,panning.v.y+gesture.point.y-gesture.end.y);}
      });
      // A failed text layer still permits panning; the popup reports the error on release.
      gesture.loaded.catch(()=>{if(wordGesture===gesture)gesture.items=[];});
    }
  }
  if(tool==='hand'||e.pointerType==='touch'||e.button===1){panning={x:e.clientX,y:e.clientY,v:{...board.viewport}};document.body.classList.add('dragging');return;}
  const point=world(e);const anchor=anchorAt(point),scale=anchor==null?1:board.file.width/1000;
  active={tool,color:tool==='highlighter'?'#e5c62c':$('color').value,width:(tool==='eraser'?Number($('eraser-width').value):tool==='highlighter'?Number($('width').value)*5:Number($('width').value))/scale,...(anchor!=null?{anchor}:{}),points:[StudyBoard.localPoint(point,anchor,board.file)]};
  if(e.pointerType==='mouse'&&e.button===0&&textEditor.hit(point)){pendingTextTap={stroke:active,x:e.clientX,y:e.clientY};active=null;}else growForInk(point);
  invalidate();
};
canvas.onpointermove=e=>{
  // Mouse and pen each have a primary pointer; only the gesture owner may add samples.
  if(e.pointerId!==gesturePointerId){traceShape('ignored-pointer',()=>({event:pointerDiagnostic(e),reason:'not-owner'}));return;}
  if((active||pendingTextTap)&&!(e.buttons&1)){traceShape('ignored-pointer',()=>({event:pointerDiagnostic(e),reason:'not-pressed'}));return;}
  if(pendingTextTap){if(Math.hypot(e.clientX-pendingTextTap.x,e.clientY-pendingTextTap.y)<4)return;active=pendingTextTap.stroke;pendingTextTap=null;}
  if(wordGesture){
    wordGesture.end=world(e);if(!wordGesture.moved){if(Math.hypot(e.clientX-wordGesture.x,e.clientY-wordGesture.y)<=5)return;wordGesture.moved=true;}
    if(!wordGesture.items)return;
    if(wordGesture.start>=0){highlightWords(wordGesture);return;}
  }
  if(panning){moveTo(panning.v.x+panning.x-e.clientX,panning.v.y+panning.y-e.clientY);return;}if(!active)return;
  const samples=e.getCoalescedEvents?.();for(const event of samples?.length?samples:[e])if(event.pointerId===gesturePointerId)appendPoint(event);
};
function finishStroke(){
  traceShape('stroke-finish',()=>({stroke:shapeId(active),points:active?.points.length}));gesturePointerId=null;
  wordGesture=null;
  if(panning){panning=null;document.body.classList.remove('dragging');persist();}
  if(!active)return;board.strokes.push(active);active=null;redo=[];
  invalidate();controls();persist();
}
canvas.onpointerup=e=>{
  if(e.pointerId!==gesturePointerId){traceShape('ignored-pointer',()=>({event:pointerDiagnostic(e),reason:'not-owner'}));return;}
  pendingTextTap=null;const selectionToken=selectionRevision;
  const gesture=wordGesture,stroke=active;finishStroke();if(stroke)scheduleShape(stroke);
  if(gesture&&e.button===0&&englishReading()){
    EnglishReader.open({sessionId:course.sessionId,page:gesture.anchor,hit:gesture.loaded.then(()=>selectedWords(gesture)),clientX:e.clientX,clientY:e.clientY});
  }else if(gesture&&e.button===0){
    const requested=course.sessionId;
    gesture.loaded.then(()=>{
      if(requested!==course?.sessionId||selectionToken!==selectionRevision)return;const hit=selectedWords(gesture);if(!hit)return;
      const button=$('reading-selection-note');button.hidden=false;button.style.left=Math.max(8,Math.min(innerWidth-110,e.clientX))+'px';button.style.top=Math.max(8,Math.min(innerHeight-48,e.clientY+10))+'px';
      button.onclick=async()=>{button.disabled=true;try{await window.study.addReadingNote({sessionId:requested,text:hit.word});button.hidden=true;status('选取文字已加入笔记');if(course.noteId)await reloadNote();}catch(error){status(error.message);}finally{button.disabled=false;}};
    }).catch(error=>status(error.message));
  }
};
canvas.ondblclick=e=>{
  if(!ready||busy||e.button!==0||!textEditor.hit(world(e)))return;
  e.preventDefault();selectionRevision++;cancelShape('edit-text');pendingTextTap=null;EnglishReader.close();$('reading-selection-note').hidden=true;finishStroke();textSelection=null;invalidate();textEditor.editExisting(world(e)).catch(error=>status(error.message));
};
canvas.onpointercancel=e=>{if(e.pointerId!==gesturePointerId)return;pendingTextTap=null;cancelShape('pointer-cancel');EnglishReader.close();finishStroke();};
canvas.onlostpointercapture=e=>{if(e.pointerId!==gesturePointerId)return;pendingTextTap=null;if(wordGesture)EnglishReader.close();finishStroke();};canvas.oncontextmenu=e=>e.preventDefault();
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!ready||busy||active)return;const factor=e.deltaMode===1?20:e.deltaMode===2?screenHeight:1;moveTo(board.viewport.x+(e.shiftKey?e.deltaY:e.deltaX)*factor,board.viewport.y+(e.shiftKey?0:e.deltaY)*factor);},{passive:false});
function selectTool(next,color){cancelShape('tool-switch');$('reading-selection-note').hidden=true;EnglishReader.close();finishStroke();tool=next;if(color)$('color').value=color;document.body.classList.toggle('hand',tool==='hand');document.body.classList.toggle('text-tool',tool==='text');textEditor.setMode(tool==='text');
  for(const button of document.querySelectorAll('[data-pen],#hand,#eraser,#highlighter,#text-tool')){const selected=button.dataset.pen?next==='pen'&&button.dataset.pen===$('color').value:button.id==='text-tool'?next==='text':button.id===next;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
}
$('text-tool').onclick=()=>selectTool('text');
for(const button of document.querySelectorAll('[data-pen]'))button.onclick=()=>selectTool('pen',button.dataset.pen);
for(const id of ['hand','eraser','highlighter'])$(id).onclick=()=>selectTool(id);
$('color').oninput=()=>selectTool('pen');$('width').oninput=finishStroke;$('eraser-width').oninput=finishStroke;
$('undo').onclick=()=>{traceShape('undo-request');if(!ready||busy)return;cancelShape('undo');finishStroke();const s=board.strokes.pop();if(s){const original=shapeOriginal.get(s);if(original){board.strokes.push(original);redo.push({shapeFrom:original,shapeTo:s});}else redo.push(s);traceShape('undo-applied',()=>({from:shapeId(s),to:shapeId(original),points:original?.points.length}));}invalidate();controls();persist();};
$('redo').onclick=()=>{if(!ready||busy)return;cancelShape('redo');const s=redo.pop();if(s?.shapeTo){if(board.strokes.at(-1)===s.shapeFrom)board.strokes[board.strokes.length-1]=s.shapeTo;}else if(s)board.strokes.push(s);invalidate();controls();persist();};
$('clear').onclick=()=>{if(!ready||busy||!confirm('清空当前画布的全部笔迹？文件原文会保留。'))return;finishStroke();redo=[...board.strokes].reverse();board.strokes=[];invalidate();controls();persist();};
for(const key of ['width','left','gap'])$('file-'+key).oninput=()=>{if(!ready)return;EnglishReader.close();finishStroke();traceShape('file-layout',{key,next:Number($('file-'+key).value)});board.file[key]=Number($('file-'+key).value);settings();syncScroll();invalidate();scheduleSave();};
$('reading-mode').onchange=()=>{if(!ready||!reading())return;EnglishReader.close();finishStroke();legacy.readingMode=$('reading-mode').value;if(englishReading())selectTool('hand');controls();persist();};
function defaultFile(){const available=area.clientWidth||innerWidth;const width=Math.min(1000,Math.max(320,Math.round(available*.8)));return {width,left:Math.max(0,Math.round((available-width)/2)),gap:24};}
$('reset-file').onclick=()=>{board.file=defaultFile();settings();syncScroll();invalidate();persist();};
$('return-origin').onclick=()=>{finishStroke();moveTo(0,0);$('view-settings').hidePopover();};
async function flushWriterState(){
  if(!ready)return;cancelShape('flush');pendingTextTap=null;finishStroke();await textEditor.flush();persist();await saveChain;await WriterQuestion.flush();if(saveError)throw saveError;
}
const retrySave=document.createElement('button');retrySave.id='retry-writer-save';retrySave.textContent='重试保存';retrySave.hidden=true;document.body.append(retrySave);
function saveFailed(message){status('保存失败，内容已保留：'+message);retrySave.hidden=false;}
retrySave.onclick=async()=>{retrySave.disabled=true;try{await flushWriterState();retrySave.hidden=true;status('已保存，可以重新返回或关闭');}catch(e){saveFailed(e.message);}finally{retrySave.disabled=false;}};
let flushLock=null;
window.study.onWriterFlush(async request=>{
  if(request.sessionId!==course?.sessionId)throw new Error('保存会话已改变。');
  flushLock={token:request.token,busy};busy=true;document.body.inert=true;controls();
  try{await flushWriterState();retrySave.hidden=true;}catch(e){saveFailed(e.message);throw e;}
});
window.study.onWriterFlushReleased(token=>{if(flushLock?.token!==token)return;busy=flushLock.busy;flushLock=null;document.body.inert=false;controls();});
window.study.onWriterSaveError(saveFailed);
async function action(callback){if(!ready||busy)return;busy=true;controls();try{await flushWriterState();await callback();}catch(e){saveFailed(e.message);}finally{busy=false;controls();}}
$('back-course').onclick=()=>ready?action(()=>window.study.pauseSession()):window.study.pauseSession();
$('previous-question').onclick=()=>action(()=>window.study.navigateQuestion(index-1));
$('next-question').onclick=()=>action(()=>window.study.finishSession());
$('capture-answer').onclick=()=>action(()=>window.study.startCapture('answer'));
$('capture-note').onclick=()=>action(()=>window.study.captureNote(course.id));
window.study.onNoteCaptured(({noteId})=>{status('截图已加入笔记');if(course?.noteId===noteId)reloadNote().catch(e=>status(e.message));});
async function reloadNote(){
  if(course?.noteId)await reloadReading();
}
async function reloadReading(){
  const requested=course?.sessionId;if(!reading())return;
  await renderQueue.catch(()=>{});const source=await window.study.readerSource({sessionId:requested});if(course?.sessionId!==requested)return;
  readerPages=await StudyReader.load(source);cache.clear();pending.clear();syncScroll();invalidate();
}
async function readingTargets(){
  if(!course?.id.startsWith('document:'))return;
  const requested=course.sessionId,state=await window.study.library();if(requested!==course?.sessionId)return;
  const select=$('reading-note-target'),folder=$('reading-note-folder'),target=state.noteDestinations[course.id]||{};
  const path=id=>{const names=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const f=state.folders.find(x=>x.id===id);if(!f)break;names.unshift(f.name);id=f.parentId;}return names.join(' / ');};
  select.replaceChildren(new Option('自动使用此文件的阅读笔记',''),...state.notes.map(n=>new Option([path(n.folderId),n.name].filter(Boolean).join(' / '),n.id)));
  folder.replaceChildren(new Option('知识点 / 全部笔记',''),...state.folders.filter(f=>f.mode==='knowledge').map(f=>new Option(path(f.id),f.id)));
  select.value=target.noteId||'';folder.value=target.folderId||'';folder.disabled=Boolean(select.value);
  const save=async()=>{select.disabled=true;folder.disabled=true;try{await window.study.saveReadingDestination({sessionId:requested,destination:{noteId:select.value,folderId:folder.value}});status('默认笔记已更新');}catch(e){status(e.message);await readingTargets();}finally{select.disabled=false;folder.disabled=Boolean(select.value);}};
  select.onchange=save;folder.onchange=save;
}
$('edit-reading-file').onclick=$('note-edit-content').onclick=()=>action(()=>window.study.editCurrentReading(course.sessionId));
$('note-add-text').onclick=()=>{$('note-new-text').value='';$('note-text-error').textContent='';$('note-text-dialog').showModal();$('note-new-text').focus();};
$('note-text-cancel').onclick=()=>$('note-text-dialog').close();
$('note-text-dialog').querySelector('form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{await window.study.appendNoteText({id:course.noteId,text:$('note-new-text').value});$('note-text-dialog').close();await reloadNote();status('文字已加入笔记');}catch(e){$('note-text-error').textContent=e.message;}finally{button.disabled=false;}
};
$('toggle-ai').onclick=async()=>{if(!ready)return;const button=$('toggle-ai');button.disabled=true;try{aiState(await window.study.toggleWriterAI({sessionId:course.sessionId}));}catch(e){status(e.message);}finally{button.disabled=false;}};
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select,dialog,[contenteditable]'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey){const next={h:'hand',p:'pen',e:'eraser',t:'text'}[e.key.toLowerCase()];if(next)selectTool(next);}
});
window.study.onCourse(async next=>{
  disposeNoteSelection();disposeNoteSelection=()=>{};
  if(course?.sessionId===next.sessionId)return;cancelShape('session-change');textEditor.reset();EnglishReader.close();finishStroke();clearTimeout(saveTimer);const version=++generation;ready=false;course=next;WriterQuestion.load(next);index=0;pages=[];legacy={};redo=[];cache.clear();pending.clear();readerPages=0;saveError=null;board=StudyBoard.normalize();status('正在载入…');$('course-title').textContent=course.title;controls();invalidate();
  try{
    await saveChain;const stored=await window.study.writerLoad();if(version!==generation)return;pages=stored.pages||[];
    if(reading()){
      legacy={pages:stored.pages||[],notes:stored.notes||[],positions:stored.positions,view:stored.view,readingMode:stored.readingMode||'standard'};
      await renderQueue.catch(()=>{});readerPages=await StudyReader.load(await window.study.readerSource({sessionId:course.sessionId}));if(version!==generation)return;
      board=StudyBoard.migrate(stored,true,Math.min(course.noteId?900:720,Math.max(320,Math.round(screenWidth*(course.noteId ? 0.7 : 0.45)))));
      if(!stored.workspace&&!stored.pages?.some(p=>p?.strokes?.length)&&!stored.notes?.some(p=>p?.strokes?.length))board.file=defaultFile();
      if(englishReading())selectTool('hand');
    }else board=StudyBoard.migrate(pages[index]||{},false);
    ready=true;aiState(await window.study.writerAIState());settings();syncScroll();invalidate();controls();status('笔迹自动保存在本机');await readingTargets();
    if(!reading())disposeNoteSelection=setupLessonSelection($('question-text'),null,()=>busy,text=>window.study.appendNoteText({courseId:course.id,text}).then(()=>status('选取文字已加入课程笔记')).catch(e=>status(e.message)));
  }catch(e){status('载入失败：'+e.message);}
});
window.study.onProgress(progress=>{WriterQuestion.progress(progress);if(!reading()&&index!==progress.index){cancelShape('question-change');textEditor.reset();finishStroke();persist();index=progress.index;board=StudyBoard.migrate(pages[index]||{},false);redo=[];settings();syncScroll();invalidate();controls();}});

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
