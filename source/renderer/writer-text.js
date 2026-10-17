// SPDX-License-Identifier: GPL-3.0-only
window.StudyText=options=>{
  const layer=document.createElement('div');layer.id='canvas-text-layer';document.body.append(layer);
  const labels=new Map();let editing=null,enabled=false,chain=Promise.resolve(),timer=0;
  const frame=document.createElement('div');frame.id='canvas-text-editor';frame.hidden=true;frame.contentEditable='plaintext-only';frame.setAttribute('role','textbox');frame.setAttribute('aria-label','画布文字');frame.setAttribute('aria-multiline','true');frame.spellcheck=false;
  document.body.append(frame);const input=frame;
  function changed(){if(!editing)return;const value=input.innerText.replace(/\r\n?/g,'\n');if(value.length>50000){options.error(new Error('文字不能超过 50000 字。'));return;}editing.value=value;if(editing.box){editing.box.text=value;options.changed();}else{clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),600);}}
  async function flush(){
    clearTimeout(timer);const item=editing;if(!item)return;const text=item.value;
    chain=chain.catch(()=>{}).then(async()=>{
      if(item.box||item.saved===text)return;
      if(item.kind==='note')await window.study.updateNoteText({id:item.id,entryId:item.entryId,text});
      else await window.study.saveReaderText({sessionId:item.sessionId,text});
      item.saved=text;item.dirty=true;
    });
    try{await chain;}catch(e){options.error(e);throw e;}
  }
  async function finish(){
    const item=editing;if(!item)return;await flush();if(editing!==item)return;
    if(item.dirty&&!item.box)await options.reload();
    if(item.box&&!item.value.trim()){options.board().texts=options.board().texts.filter(t=>t!==item.box);options.changed();}
    editing=null;frame.hidden=true;options.editing(null);options.invalidate();
  }
  async function open(item,client){
    await finish();editing={...item,value:item.text,saved:item.text,sessionId:options.session()};
    input.textContent=item.text;frame.hidden=false;options.editing(editing);position();input.focus({preventScroll:true});
    if(client){const range=document.caretRangeFromPoint?.(client.x,client.y);if(range&&frame.contains(range.startContainer)){const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}}

  }
  function hit(point){
    const board=options.board();
    for(const box of [...board.texts].reverse()){
      const label=labels.get(box.id),height=label?.offsetHeight||box.size*1.6;
      if(point.x>=box.x&&point.x<=box.x+box.width&&point.y>=box.y&&point.y<=box.y+height)return {...box,box};
    }
    if(options.reading()){
      const anchor=options.anchor(point);
      if(anchor!=null){const local=StudyBoard.localPoint(point,anchor,board.file),target=StudyReader.editableAt(anchor,local.x,local.y);if(target)return {...target,anchor};}
    }
    return null;
  }
  async function editExisting(point){const target=hit(point),v=options.board().viewport;if(target)await open(target,{x:point.x-v.x,y:point.y-v.y});}
  async function click(point){
    const board=options.board();if(hit(point))return editExisting(point);
    if(board.texts.length>=500)throw new Error('文字框过多，请先清理。');
    await finish();const box={id:crypto.randomUUID(),x:point.x,y:point.y,width:Math.max(100,Math.min(420,innerWidth-point.x+board.viewport.x-24)),size:26,color:'#253445',text:''};
    board.texts.push(box);options.changed();await open({...box,box});
  }
  function position(){
    const board=options.board(),v=board.viewport,ids=new Set();
    for(const box of board.texts){
      ids.add(box.id);let label=labels.get(box.id);
      if(!label){label=document.createElement('div');label.className='canvas-text-box';label.setAttribute('role','button');label.setAttribute('aria-label','编辑画布文字');label.onpointerdown=e=>{if(!enabled)return;e.stopPropagation();e.preventDefault();open({...box,box},{x:e.clientX,y:e.clientY}).catch(options.error);};layer.append(label);labels.set(box.id,label);}
      label.textContent=box.text;label.style.cssText=`left:${box.x-v.x}px;top:${box.y-v.y}px;width:${box.width}px;font-size:${box.size}px;color:${options.color(box.color)}`;label.hidden=editing?.box===box;
    }
    for(const [id,label]of labels)if(!ids.has(id)){label.remove();labels.delete(id);}
    layer.classList.toggle('text-enabled',enabled);
    if(editing){
      const item=editing,scale=item.box?1:board.file.width/1000,r=item.box?{x:0,y:0}:StudyBoard.rect(board.file,item.anchor),box=item.box||item;
      const x=r.x+box.x*scale-v.x,y=r.y+box.y*scale-v.y;
      frame.style.left=x+'px';frame.style.top=y+'px';frame.style.width=(box.width*scale)+'px';frame.style.fontSize=(box.size*scale)+'px';frame.style.lineHeight=(item.box?box.size*1.6:item.kind==='note'?52*scale:42*scale)+'px';frame.style.color=item.box?options.color(box.color):'var(--ui-text)';frame.style.background='transparent';

    }
  }
  input.oninput=changed;input.onkeydown=e=>{if(e.key==='Escape'||e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();finish().catch(options.error);}};
  frame.addEventListener('focusout',()=>{setTimeout(()=>{if(editing&&document.activeElement!==frame)finish().catch(options.error);},0);});
  let drag=null;
  frame.onpointerdown=e=>{if(!e.altKey||!editing?.box)return;e.preventDefault();drag={x:e.clientX,y:e.clientY,left:editing.box.x,top:editing.box.y};frame.setPointerCapture(e.pointerId);};
  frame.onpointermove=e=>{if(!drag||!editing?.box)return;editing.box.x=Math.max(0,drag.left+e.clientX-drag.x);editing.box.y=Math.max(0,drag.top+e.clientY-drag.y);options.changed();position();};
  frame.onpointerup=frame.onpointercancel=()=>{drag=null;};
  return {click,hit,editExisting,position,get active(){return Boolean(editing);},flush:finish,setMode(value){enabled=value;if(!enabled)finish().catch(options.error);position();},reset(){clearTimeout(timer);options.editing(null);editing=null;frame.hidden=true;for(const label of labels.values())label.remove();labels.clear();}};
};
