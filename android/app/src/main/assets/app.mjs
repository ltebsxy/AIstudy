// SPDX-License-Identifier: GPL-3.0-only
import {rpc,native,localGet,localPut,readFile} from './bridge.mjs';
import {escape,extension,readingPlan,normalizeCourse,doubleTap} from './core.mjs';
import {Ink} from './ink.mjs';
const $=id=>document.getElementById(id), clone=value=>JSON.parse(JSON.stringify(value));
let state,active,mode='documents',folder='',tool='hand',systemTheme='light',saving=Promise.resolve(),saveTimer,noteTimer,toastTimer,worker,lookupId=0,lastTap,phraseRange,phraseTimer,attachment='',busyImport=false,opening=0;
const lookups=new Map();
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function bind(id,event,handler){$(id).addEventListener(event,e=>{try{Promise.resolve(handler(e)).catch(error=>toast(error.message));}catch(error){toast(error.message);}});}
function queue(operation){$('save-status').textContent='保存中';saving=saving.catch(()=>{}).then(operation).then(()=>{$('save-status').textContent='已保存';}).catch(error=>{$('save-status').textContent='保存失败';toast('保存失败：'+error.message);throw error;});saving.catch(()=>{});return saving;}
function saveState(immediate=false){clearTimeout(saveTimer);const save=()=>queue(()=>rpc('save',clone(state)));if(immediate)return save();saveTimer=setTimeout(save,280);}
function captureNote(){
  if(!active)return;
  if(active.type==='doc')active.note.canvas=ink.data();
  else if(active.screen==='question')active.note.pages[active.course.questions[active.note.index].id]=ink.data();
  else active.note.knowledgeScroll=$('scroll').scrollTop;
}
function saveNote(immediate=false){
  clearTimeout(noteTimer);if(!active)return;captureNote();const id=active.noteId,data=clone(active.note);const save=()=>queue(()=>rpc('saveNote',{id,data}));
  if(immediate)return save();noteTimer=setTimeout(save,450);
}
async function flush(){clearTimeout(saveTimer);clearTimeout(noteTimer);if(busyImport){await saving;return;}await saveNote(true);await saveState(true);await saving;}
window.flushStudy=flush;
const ink=new Ink({viewport:$('viewport'),scroll:$('scroll'),canvas:$('ink'),paper:$('paper'),content:$('content'),onChange:immediate=>saveNote(immediate)});
function setTool(value){tool=value;ink.setTool(value);document.querySelectorAll('button[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===value));if(value!=='hand'){hideTranslation();getSelection()?.removeAllRanges();}}
function theme(){const value=state.prefs.theme??'system',resolved=value==='system'?systemTheme:value;document.documentElement.dataset.theme=resolved;ink.draw();if(native)rpc('appearance',{theme:resolved}).catch(error=>toast(error.message));}
window.systemThemeChanged=value=>{systemTheme=value;if(state)theme();};
function viewPrefs(){return {...{font:19,line:1.85},...state.prefs.reading,...active?.note.display};}
function applyDisplay(){const p=viewPrefs();$('content').style.setProperty('--font-size',p.font+'px');$('content').style.setProperty('--line-height',p.line);}
function showInfo(title,html){$('info-title').textContent=title;$('info-content').innerHTML=html;$('info-dialog').showModal();}
function plainBlock(text){return window.StudyMath.html(text);}
function markdown(text){
  const mask=window.StudyMath.mask(text);let fenced=false;
  const html=mask.text.split(/\r?\n/).map(line=>{
    if(line.startsWith('```')){fenced=!fenced;return fenced?'<pre><code>':'</code></pre>';}
    if(fenced)return escape(line)+'\n';
    const heading=/^(#{1,4})\s+(.*)$/.exec(line);if(heading)return `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`;
    if(!line.trim())return '<br>';
    let safe=escape(line).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
    if(/^[-*] /.test(line))safe='• '+safe.slice(2);return `<p>${safe}</p>`;
  }).join('');return mask.restore(html)+(fenced?'</code></pre>':'');
}
function tokenize(){
  const walker=document.createTreeWalker($('content'),NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement.closest('.katex,.textLayer,pre,code,input,textarea,button,.word')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}}),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){let end=0,found=false;const fragment=document.createDocumentFragment();for(const match of node.textContent.matchAll(/[A-Za-z]+(?:['’\u2010-\u2013-][A-Za-z]+)*/g)){found=true;fragment.append(document.createTextNode(node.textContent.slice(end,match.index)));const span=document.createElement('span');span.className='word';span.textContent=match[0];fragment.append(span);end=match.index+match[0].length;}if(found){fragment.append(document.createTextNode(node.textContent.slice(end)));node.replaceWith(fragment);}}
}
function english(){return active?.type==='doc'&&active.note.readingMode==='english'&&tool==='hand';}
function updateEnglish(){const enabled=active?.type==='doc'&&active.note.readingMode==='english';$('english').classList.toggle('active',enabled);$('english').hidden=active?.type!=='doc'||active.item.ext==='blank';$('phrase-bar').hidden=!enabled;}
function resetReader(){hideTranslation();lastTap=null;phraseRange=null;clearTimeout(phraseTimer);setTool('hand');$('ink').hidden=false;document.querySelectorAll('button[data-tool]').forEach(b=>b.disabled=false);$('library').hidden=true;$('reader').hidden=false;$('course-controls').hidden=true;}
function library(){
  active=null;opening++;$('reader').hidden=true;$('library').hidden=false;$('title').textContent='AI-StudyDesk';$('back').hidden=!folder;$('new-note').hidden=mode==='courses';
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const current=state.folders.find(f=>f.id===folder&&f.mode===mode);if(folder&&!current)folder='';
  $('folder-name').textContent=current?.name??'全部';$('folder-up').disabled=!folder;
  const pref=state.prefs[mode]??{};$('sort').value=pref.sort??'order';$('items').classList.toggle('grid',pref.view==='grid');
  const folders=state.folders.filter(f=>f.mode===mode&&(f.parent??'')===folder),list=(mode==='documents'?state.documents:state.courses).filter(item=>(item.folder??'')===folder);
  const sort=(a,b)=>pref.sort==='name'?(a.name??a.title).localeCompare(b.name??b.title,'zh-CN'):pref.sort==='recent'?(b.recent??0)-(a.recent??0):0;list.sort(sort);
  $('items').replaceChildren();
  for(const [kind,item] of [...folders.map(f=>['folder',f]),...list.map(f=>[mode==='documents'?'doc':'course',f])]){
    const row=document.createElement('div');row.className='item';const button=document.createElement('button');button.className='open';
    const title=item.name??item.title;button.innerHTML=`${kind==='folder'?'▣ ':kind==='doc'?'▤ ':'▧ '}${escape(title)}<span class="meta">${kind==='folder'?'文件夹':kind==='doc'?item.ext==='blank'?'笔记':item.ext.toUpperCase():'普通课程'}${item.progress?' · '+escape(item.progress):''}</span>`;
    button.onclick=()=>Promise.resolve(kind==='folder'?goFolder(item.id):kind==='doc'?openDoc(item):openCourse(item)).catch(error=>toast(error.message));
    const more=document.createElement('button');more.className='more';more.textContent='⋯';more.setAttribute('aria-label','管理 '+title);more.onclick=()=>manage(kind,item);row.append(button,more);$('items').append(row);
  }
  $('empty').textContent=list.length||folders.length?'':mode==='documents'?'导入英语文章或阅读包，也可以创建空白笔记。支持 TXT、Markdown、文本层 PDF 和图片。':'导入桌面普通课程 JSON。支持书写题、选择题和填空题。';
  state.prefs[mode]??={};state.prefs[mode].folder=folder;state.prefs.location={mode,folder};saveState();
}
function goFolder(id){folder=id;library();}
function manage(kind,item){
  showInfo('管理 '+(item.name??item.title),'<div class="actions"><button id="rename-item">重命名</button><button id="move-item">移动到文件夹</button><button id="remove-item">删除</button></div>');
  bind('rename-item','click',()=>{const name=prompt('新名称',item.name??item.title)?.trim();if(!name)return;if(name.length>200)throw Error('名称过长');item[kind==='course'?'title':'name']=name;saveState(true);$('info-dialog').close();library();});
  bind('move-item','click',()=>{
    const children=new Set([item.id]);let changed=true;while(changed){changed=false;for(const f of state.folders)if(children.has(f.parent)&&!children.has(f.id)){children.add(f.id);changed=true;}}
    const targets=state.folders.filter(f=>f.mode===mode&&(kind!=='folder'||!children.has(f.id)));
    $('info-content').innerHTML='<label>目标文件夹<select id="move-target"><option value="">全部（根目录）</option>'+targets.map(f=>`<option value="${escape(f.id)}">${escape(folderPath(f.id))}</option>`).join('')+'</select></label><button id="move-confirm">移动</button>';
    bind('move-confirm','click',()=>{item[kind==='folder'?'parent':'folder']=$('move-target').value;saveState(true);$('info-dialog').close();library();});
  });
  bind('remove-item','click',async()=>{
    if(!confirm('删除此项'+(kind==='folder'?'及文件夹内所有材料':'')+'？'))return;
    const ids=new Set([item.id]);if(kind==='folder'){let changed=true;while(changed){changed=false;for(const f of state.folders)if(ids.has(f.parent)&&!ids.has(f.id)){ids.add(f.id);changed=true;}}state.folders=state.folders.filter(f=>!ids.has(f.id));state.documents=state.documents.filter(d=>!ids.has(d.folder));state.courses=state.courses.filter(d=>!ids.has(d.folder));}
    else state[kind==='doc'?'documents':'courses']=state[kind==='doc'?'documents':'courses'].filter(d=>d.id!==item.id);
    await saveState(true);await rpc('cleanup');$('info-dialog').close();library();
  });
}
function folderPath(id){const parts=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const f=state.folders.find(f=>f.id===id);if(!f)break;parts.unshift(f.name);id=f.parent;}return parts.join(' / ');}
async function newFolder(){const name=prompt('文件夹名称')?.trim();if(!name)return;state.folders.push({id:crypto.randomUUID(),name:name.slice(0,80),mode,parent:folder});await saveState(true);library();}
async function newNote(){const name=prompt('笔记名称','空白笔记')?.trim();if(!name)return;const item={id:crypto.randomUUID(),name,folder,ext:'blank',added:Date.now()};state.documents.push(item);await saveState(true);await openDoc(item);}
async function openDoc(item){
  await flush();const token=++opening,note=await rpc('note',{id:'doc-'+item.id});if(token!==opening)return;
  active={type:'doc',item,noteId:'doc-'+item.id,note};note.readingMode??=item.readingMode??'standard';resetReader();$('title').textContent=item.name;$('back').hidden=false;$('content').replaceChildren();applyDisplay();ink.load({});
  try{
    if(item.ext==='blank')$('content').innerHTML='';
    else{
      const response=await readFile(item);if(token!==opening)return;
      if(['txt','md','markdown'].includes(item.ext)){
        let text=await response.text();text=text.replace(/^\uFEFF/,'');
        if(item.ext==='txt')$('content').innerHTML=text.split(/\r?\n\s*\r?\n/).map(p=>`<p>${escape(p).replaceAll('\n','<br>')}</p>`).join('');
        else {$('content').innerHTML=markdown(text);window.StudyMath.render($('content'));}tokenize();
      }else if(item.ext==='pdf')await renderPdf(await response.arrayBuffer(),token);
      else{const blob=await response.blob(),url=URL.createObjectURL(blob),image=new Image();image.src=url;image.alt=item.name;image.onload=()=>{URL.revokeObjectURL(url);ink.resize();};$('content').append(image);}
    }
    if(token!==opening)return;applyDisplay();ink.load(note.canvas??{});await new Promise(requestAnimationFrame);$('scroll').scrollTop=note.canvas?.scroll??0;ink.draw();updateEnglish();item.recent=Date.now();state.lastOpen={type:'doc',id:item.id};await saveState(true);
  }catch(error){toast(error.message);$('content').textContent='无法阅读此文件：'+error.message;}
}
let pdfModule;
async function renderPdf(bytes,token){
  pdfModule??=await import('./vendor/pdfjs/pdf.mjs');pdfModule.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.mjs';
  let task=pdfModule.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,cMapUrl:new URL('vendor/pdfjs/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',location.href).href,wasmUrl:new URL('vendor/pdfjs/wasm/',location.href).href,iccUrl:new URL('vendor/pdfjs/iccs/',location.href).href});
  task.onPassword=(update,reason)=>{const password=prompt(reason===1?'PDF 需要密码':'密码不正确，请重试');if(password===null){task.destroy();toast('已取消加密 PDF');}else update(password);};
  const pdf=await task.promise;let textCount=0;
  // Page wrappers reserve layout up front. Raster/text rendering is lazy and bounded.
  const width=$('content').clientWidth,observer=new IntersectionObserver(async entries=>{
    for(const entry of entries){const wrapper=entry.target;if(!entry.isIntersecting||wrapper.dataset.rendered)return;wrapper.dataset.rendered='yes';
      try{const page=await pdf.getPage(Number(wrapper.dataset.page));if(token!==opening){observer.disconnect();pdf.destroy();return;}
        const viewport=page.getViewport({scale:width/page.getViewport({scale:1}).width}),ratio=Math.min(devicePixelRatio||1,2),canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
        await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;
        const text=await page.getTextContent();textCount+=text.items.length;const layer=document.createElement('div');layer.className='textLayer';layer.style.setProperty('--scale-factor',viewport.scale);layer.style.setProperty('--total-scale-factor',viewport.scale);wrapper.replaceChildren(canvas,layer);
        await new pdfModule.TextLayer({textContentSource:text,container:layer,viewport}).render();
        if(!text.items.length)wrapper.title='此页没有文本层，不能离线选词；仍可书写批注';
        if(!textCount&&Number(wrapper.dataset.page)===1)toast('此 PDF 页没有文本层，扫描页暂不支持查词');
        // Keep only nearby page bitmaps. Page sizes and notes stay in world coordinates.
        const rendered=[...$('content').querySelectorAll('.pdf-page[data-rendered=yes]')];for(const old of rendered)if(Math.abs(Number(old.dataset.page)-Number(wrapper.dataset.page))>3){old.replaceChildren();delete old.dataset.rendered;observer.observe(old);}
      }catch(error){wrapper.textContent='PDF 页面加载失败：'+error.message;}
    }
  },{root:$('scroll'),rootMargin:'600px'});
  for(let n=1;n<=pdf.numPages;n++){
    if(token!==opening){observer.disconnect();pdf.destroy();return;}
    const page=await pdf.getPage(n),view=page.getViewport({scale:width/page.getViewport({scale:1}).width}),wrapper=document.createElement('div');wrapper.className='pdf-page';wrapper.dataset.page=n;wrapper.style.width=view.width+'px';wrapper.style.height=view.height+'px';$('content').append(wrapper);observer.observe(wrapper);
  }
  active.cleanup=()=>{observer.disconnect();pdf.destroy();};
}
async function openCourse(item){
  await flush();const token=++opening,response=await readFile(item),course=normalizeCourse(await response.json()),note=await rpc('note',{id:'course-'+item.id});if(token!==opening)return;
  note.index=Math.min(note.index??0,course.questions.length-1);note.responses??={};note.pages??={};active={type:'course',item,course,note,noteId:'course-'+item.id,screen:note.screen??'knowledge'};resetReader();$('title').textContent=item.title;$('back').hidden=false;renderCourse();item.recent=Date.now();state.lastOpen={type:'course',id:item.id};await saveState(true);
}
function renderCourse(){
  hideTranslation();setTool('hand');$('course-controls').hidden=false;$('english').hidden=true;$('phrase-bar').hidden=true;applyDisplay();
  const {course,note}=active,q=course.questions[note.index];$('question-number').textContent=(note.index+1)+' / '+course.questions.length;$('previous').disabled=active.screen==='knowledge'||note.index===0;$('next').textContent=active.screen==='knowledge'?'开始练习':note.index===course.questions.length-1?'查看提交':'下一题';$('knowledge').textContent=active.screen==='knowledge'?'继续练习':'知识点';$('submit').hidden=active.screen==='knowledge';
  if(active.screen==='knowledge'){
    $('content').innerHTML=markdown(course.knowledge);window.StudyMath.render($('content'));ink.load({});$('scroll').scrollTop=note.knowledgeScroll??0;$('ink').hidden=true;document.querySelectorAll('button[data-tool]').forEach(b=>b.disabled=b.dataset.tool!=='hand');
  }else{
    $('ink').hidden=false;document.querySelectorAll('button[data-tool]').forEach(b=>b.disabled=false);
    $('content').innerHTML=`<section class="question"><div class="points">第 ${note.index+1} 题${q.grading?' · '+q.grading.criteria.reduce((s,c)=>s+c.points,0)+' 分':''}</div><div>${plainBlock(q.text)}</div>${q.image?`<img src="${q.image}" alt="题目图片">`:''}<div id="responses"></div></section>`;
    const stored=note.responses[q.id]??(q.type==='blank'?q.blanks.map(()=>''):q.type==='choice'?[]:'');
    if(q.type==='choice'){
      $('responses').innerHTML=q.options.map((o,i)=>`<label class="choice"><input type="${q.multiple?'checkbox':'radio'}" name="answer" value="${i}" ${stored.includes(i)?'checked':''}><span>${String.fromCharCode(65+i)}. ${plainBlock(o)}</span></label>`).join('');
      $('responses').onchange=()=>{note.responses[q.id]=[...$('responses').querySelectorAll('input:checked')].map(input=>Number(input.value));saveNote(true);};
    }else if(q.type==='blank'){
      $('responses').innerHTML=q.blanks.map((label,i)=>`<label class="blank">${escape(label)}<input maxlength="5000" data-blank="${i}" value="${escape(stored[i]??'')}"></label>`).join('');$('responses').oninput=()=>{note.responses[q.id]=[...$('responses').querySelectorAll('input')].map(input=>input.value);saveNote();};
    }else{
      $('responses').innerHTML=`<textarea class="written" maxlength="15000" placeholder="可输入答案，也可切换画笔在题目下方书写">${escape(stored)}</textarea>`;$('responses').oninput=()=>{note.responses[q.id]=$('responses').querySelector('textarea').value;saveNote();};
    }
    ink.load(note.pages[q.id]??{});$('scroll').scrollTop=note.pages[q.id]?.scroll??0;
  }
  note.screen=active.screen;saveNote();
}
async function navigate(index){await saveNote(true);active.screen='question';active.note.index=Math.max(0,Math.min(index,active.course.questions.length-1));renderCourse();}
function responseText(question,value){if(question.type==='choice')return (value??[]).map(i=>String.fromCharCode(65+i)+'. '+question.options[i]).join('；');if(question.type==='blank')return question.blanks.map((label,i)=>label+'：'+(value?.[i]??'未填写')).join('\n');return value??'';}
function exportInk(data){
  if(!data?.strokes?.length)return '';
  let min=0,max=1;for(const stroke of data.strokes)for(const point of stroke.points){min=Math.min(min,point.y);max=Math.max(max,point.y);}const width=600,height=max-min+50,scale=Math.min(1,3000/height),canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fafbf8';ctx.fillRect(0,0,width,height);
  for(const s of data.strokes){ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.globalAlpha=s.tool==='marker'?.28:1;ctx.lineWidth=s.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();const p=s.points;ctx.moveTo(p[0].x*width,p[0].y-min+20);for(let i=1;i<p.length;i++){const next=p[i+1]??p[i];ctx.quadraticCurveTo(p[i].x*width,p[i].y-min+20,(p[i].x+next.x)/2*width,(p[i].y+next.y)/2-min+20);}if(p.length===1){ctx.arc(p[0].x*width,p[0].y-min+20,s.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}return canvas.toDataURL('image/png');
}
async function submit(){
  await saveNote(true);if(active.screen!=='question')return;
  const snapshot={submittedAt:new Date().toISOString(),questions:clone(active.course.questions),responses:clone(active.note.responses),pages:clone(active.note.pages)};active.note.submissions??=[];active.note.submissions.push(snapshot);active.item.progress='已提交 '+active.note.submissions.length+' 次';await saveNote(true);await saveState(true);showSubmission(snapshot);
}
function showSubmission(snapshot){
  $('answer-content').innerHTML=`<p>${escape(new Date(snapshot.submittedAt).toLocaleString())}</p>`+snapshot.questions.map((q,i)=>{const image=exportInk(snapshot.pages[q.id]);return `<section><h3>第 ${i+1} 题</h3><p>${plainBlock(q.text)}</p><p>${plainBlock(responseText(q,snapshot.responses[q.id])||'尚未输入答案')}</p>${image?`<img src="${image}" alt="第 ${i+1} 题手写答案">`:''}${q.grading?`<details><summary>参考答案与评分依据</summary><p>${plainBlock(q.grading.answer)}</p>${q.grading.criteria.map(c=>`<p>${c.points} 分：${plainBlock(c.text)}</p>`).join('')}</details>`:''}</section>`;}).join('')+(snapshot.grade?'<h3>AI 批改结果</h3><div>'+plainBlock(snapshot.grade)+'</div>':'');
  $('grade').onclick=()=>grade(snapshot).catch(error=>toast(error.message));$('answer-dialog').showModal();
}
async function grade(snapshot){
  if(!confirm('将本次提交的题目、答案、评分依据及手写图片发送给已配置的 AI 服务？'))return;
  $('grade').disabled=true;
  try{
    const parts=[{type:'text',text:'题目评分，指出问题，语言精简。无法辨认的作答请明确标记待确认。'}];
    snapshot.questions.forEach((q,i)=>{parts.push({type:'text',text:JSON.stringify({number:i+1,text:q.text,options:q.options,blanks:q.blanks,response:responseText(q,snapshot.responses[q.id]),grading:q.grading})});if(q.image)parts.push({type:'image_url',image_url:{url:q.image}});const url=exportInk(snapshot.pages[q.id]);if(url)parts.push({type:'image_url',image_url:{url}});});
    snapshot.grade=await rpc('chat',{messages:[{role:'user',content:parts}]});await saveNote(true);$('answer-dialog').close();showSubmission(snapshot);
  }finally{$('grade').disabled=false;}
}
function hideTranslation(){$('translation').hidden=true;lookupId++;}
function ensureDictionary(){if(worker)return;worker=new Worker('dictionary-worker.mjs',{type:'module'});worker.onmessage=({data})=>{const task=lookups.get(data.id);lookups.delete(data.id);if(task)data.error?task.reject(Error(data.error)):task.resolve(data.result);};worker.onerror=()=>{for(const task of lookups.values())task.reject(Error('离线词库加载失败，请检查 System WebView 和应用资源'));lookups.clear();worker.terminate();worker=null;};}
function lookup(query){ensureDictionary();return new Promise((resolve,reject)=>{const id=crypto.randomUUID();lookups.set(id,{resolve,reject});worker.postMessage({id,query});});}
function dictionaryHtml(result){
  if(result.parts)return '<p>未收录完整短语，以下是分段释义：</p>'+result.parts.map(r=>'<strong>'+escape(r.word)+'</strong>'+dictionaryHtml(r)).join('');
  if(!result.found)return '<p>本地词库未收录此词。</p>'+(result.suggestions?.length?'<small>可能是：'+escape(result.suggestions.join('、'))+'</small>':'');
  return (result.lemma!==result.word?'<small>原形 '+escape(result.lemma)+'</small>':'')+(result.phonetic?'<p>/'+escape(result.phonetic)+'/</p>':'')+result.senses.map(s=>`<p><small>${escape(s.pos)}</small> ${escape(s.meaning)}</p>`).join('');
}
async function translate(query,rect){
  if(!english())return;const id=++lookupId,box=$('translation');box.innerHTML='<h3>'+escape(query)+'</h3><small>离线查询中…</small>';box.hidden=false;positionTranslation(rect);
  try{const result=await lookup(query);if(id!==lookupId)return;box.innerHTML='<h3>'+escape(result.word)+'</h3>'+dictionaryHtml(result)+'<small>ECDICT · MIT · 离线</small>';positionTranslation(rect);}catch(error){if(id===lookupId){box.innerHTML='<p>'+escape(error.message)+'</p>';positionTranslation(rect);}}
}
function positionTranslation(rect){const box=$('translation'),padding=10,width=box.offsetWidth,height=box.offsetHeight;const left=Math.max(padding,Math.min(innerWidth-width-padding,rect.left)),below=rect.bottom+8,top=below+height<innerHeight-padding?below:Math.max(padding,rect.top-height-8);box.style.left=left+'px';box.style.top=top+'px';}
function containsPoint(range,x,y){return [...range.getClientRects()].some(r=>x>=r.left-5&&x<=r.right+5&&y>=r.top-5&&y<=r.bottom+5);}
function wordAt(x,y){
  const caret=document.caretRangeFromPoint?.(x,y);if(!caret||caret.startContainer.nodeType!==Node.TEXT_NODE||!$('content').contains(caret.startContainer))return;
  const node=caret.startContainer,text=node.textContent,offset=caret.startOffset;
  for(const match of text.matchAll(/[A-Za-z]+(?:['’\u2010-\u2013-][A-Za-z]+)*/g))if(offset>=match.index&&offset<=match.index+match[0].length){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);return {query:match[0],range};}
}
function tapLookup(e){
  if(!english()||e.target.closest('input,textarea,button')||e.button>0)return;
  const now={x:e.clientX,y:e.clientY,time:performance.now()},isDouble=doubleTap(lastTap,now);lastTap=now;
  if(!isDouble)return;lastTap=null;e.preventDefault();
  if(phraseRange&&containsPoint(phraseRange,e.clientX,e.clientY)){
    const query=phraseRange.toString().replace(/\s+/g,' ').trim();const selection=getSelection();selection.removeAllRanges();selection.addRange(phraseRange);translate(query,phraseRange.getBoundingClientRect());return;
  }
  const word=wordAt(e.clientX,e.clientY);if(!word)return;const selection=getSelection();selection.removeAllRanges();selection.addRange(word.range);translate(word.query,word.range.getBoundingClientRect());
}
let pointerStart;
$('content').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY,time:performance.now()};});
$('content').addEventListener('pointerup',e=>{if(pointerStart&&performance.now()-pointerStart.time<280&&Math.hypot(pointerStart.x-e.clientX,pointerStart.y-e.clientY)<12)tapLookup(e);else lastTap=null;});
$('content').addEventListener('dblclick',e=>{if(english())e.preventDefault();});
document.addEventListener('selectionchange',()=>{
  if(!english())return;const selection=getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;const range=selection.getRangeAt(0);if(!$('content').contains(range.commonAncestorContainer))return;
  const text=range.toString().replace(/\s+/g,' ').trim();if(text.includes(' ')){clearTimeout(phraseTimer);phraseTimer=setTimeout(()=>{phraseRange=range.cloneRange();},80);}
});
document.addEventListener('pointerdown',e=>{if(!$('translation').contains(e.target)&&!$('content').contains(e.target))hideTranslation();else if(!$('translation').contains(e.target)&&!$('translation').hidden)hideTranslation();},{capture:true});
$('scroll').addEventListener('scroll',()=>{hideTranslation();if(active)saveNote();},{passive:true});
async function importFiles(tree){
  await flush();if(busyImport)return;setImportBusy(true);
  try{if(native){await rpc('pick',{tree,mode,folder});toast('选择'+(tree?'文件夹':'文件')+'后将复制到应用目录');}
  else{$('preview-import').value='';$('preview-import').webkitdirectory=tree;$('preview-import').multiple=tree;$('preview-import').accept=mode==='courses'?'.json':'.txt,.md,.markdown,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp';$('preview-import').click();}}
  catch(error){setImportBusy(false);throw error;}
}
function setImportBusy(value){busyImport=value;$('library').inert=value;$('settings').disabled=value;}
window.addEventListener('study:import',async({detail})=>{
  try{if(detail.cancelled)return;if(detail.error){toast(detail.error);return;}state=await rpc('load');mode=state.prefs.location?.mode??mode;folder=state.prefs.location?.folder??folder;library();toast('已导入 '+detail.count+' 项');if(detail.warnings?.length)showInfo('导入提示',detail.warnings.map(m=>'<p>'+escape(m)+'</p>').join(''));}catch(error){toast(error.message);}finally{setImportBusy(false);}
});
bind('preview-import','cancel',()=>{setImportBusy(false);});
bind('preview-import','change',async e=>{
  try{
    const files=[...e.target.files];if(!files.length)return;const tree=e.target.webkitdirectory,rootName=tree?files[0].webkitRelativePath.split('/')[0]:'';
    const entries=files.map(file=>({path:tree?file.webkitRelativePath.slice(rootName.length+1):file.name,size:file.size,file})),manifestFile=entries.find(f=>f.path==='reading-pack.json');let selected;
    if(mode==='documents'){if(manifestFile?.size>1024**2)throw Error('清单超过 1 MB');selected=readingPlan(entries,manifestFile?JSON.parse((await manifestFile.file.text()).replace(/^\uFEFF/,'')):null);}
    else selected=entries.filter(f=>extension(f.path)==='json').flatMap(f=>[f]);
    const staged=clone(state),ids=new Map([['',folder]]);if(tree){const id=crypto.randomUUID();staged.folders.push({id,name:rootName,parent:folder,mode});ids.set('',id);}
    function ensure(path){if(ids.has(path))return ids.get(path);const parts=path.split('/'),name=parts.pop(),parent=ensure(parts.join('/')),id=crypto.randomUUID();staged.folders.push({id,name,parent,mode});ids.set(path,id);return id;}
    let count=0;const blobs=[];
    for(const file of selected){const parent=file.path.includes('/')?file.path.slice(0,file.path.lastIndexOf('/')):'',folder=ensure(parent);
      if(mode==='documents'){const id=crypto.randomUUID();staged.documents.push({id,name:file.name,folder,ext:extension(file.path),readingMode:file.readingMode,added:Date.now()});blobs.push([id,file.file]);count++;}
      else{if(file.size>20*1024**2)throw Error('课程文件过大');const raw=JSON.parse((await file.file.text()).replace(/^\uFEFF/,''));for(const value of Array.isArray(raw)?raw:[raw]){const course=normalizeCourse(value),id=crypto.randomUUID();course.id=id;staged.courses.push({id,title:course.title,folder,added:Date.now()});blobs.push([id,new Blob([JSON.stringify(course)],{type:'application/json'})]);count++;}}
    }
    if(!count)throw Error('没有可导入内容');for(const [id,blob] of blobs)await localPut('file:'+id,blob);await rpc('save',staged);state=staged;library();toast('浏览器预览已导入 '+count+' 项');
  }finally{setImportBusy(false);}
});
async function openSettings(){const p=viewPrefs();$('theme').value=state.prefs.theme??'system';$('font-size').value=p.font;$('line-height').value=p.line;$('settings-dialog').showModal();}
async function aiSettings(){
  const config=await rpc('aiConfig'),form=$('ai-config-form');form.elements.endpoint.value=config.endpoint??'';form.elements.model.value=config.model??'';form.elements.key.value='';form.elements.key.placeholder=config.hasKey?'已保存加密密钥；留空保留':'输入 API Key';form.elements.clearKey.checked=false;form.elements.prompt.value=config.prompt??'自然友好，语言精简，数学严谨，公式使用 LaTeX。';$('ai-config-dialog').showModal();
}
function conversation(){if(!active)throw Error('请先打开文档或课程');active.note.chat??={messages:[],contextStart:0,draft:''};return active.note.chat;}
function showChat(){const chat=conversation();attachment=chat.attachment??'';$('chat-history').innerHTML=chat.messages.map(m=>'<div class="message '+m.role+'">'+plainBlock(m.content)+'</div>').join('');$('chat-input').value=chat.draft;$('ai-attachment').textContent=attachment?'将附上选区：'+attachment:'不自动附上文章或课程正文';$('ai-dialog').showModal();$('chat-history').scrollTop=$('chat-history').scrollHeight;}
async function sendChat(){
  const chat=conversation(),text=$('chat-input').value.trim();if(!text)return;const question=(attachment?'选取的片段：\n'+attachment+'\n\n':'')+text;
  $('send-chat').disabled=true;try{
    const messages=[...chat.messages.slice(chat.contextStart).map(m=>({role:m.role,content:m.content})),{role:'user',content:question}];
    if(messages.length>40)throw Error('上下文过长，请清除上下文后继续');
    const answer=await rpc('chat',{messages});chat.messages.push({role:'user',content:question},{role:'assistant',content:answer});chat.draft='';chat.attachment='';attachment='';await saveNote(true);$('ai-dialog').close();showChat();
  }finally{$('send-chat').disabled=false;}
}
async function back(){
  const dialogs=[...document.querySelectorAll('dialog[open]')];if(dialogs.length){dialogs.at(-1).close();return;}
  if(busyImport){toast('正在导入，请稍候');return;}
  if(active){const exiting=active;await flush();state.lastOpen=null;await saveState(true);library();exiting.cleanup?.();return;}if(folder){goFolder(state.folders.find(f=>f.id===folder)?.parent??'');return;}if(native){await flush();await rpc('exit');}else toast('内容已保存，可关闭浏览器预览');
}
window.studyBack=back;
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{if(busyImport){toast('请先完成或取消导入');return;}mode=button.dataset.mode;folder=state.prefs[mode]?.folder??'';library();});
document.querySelectorAll('button[data-tool]').forEach(button=>button.onclick=()=>setTool(button.dataset.tool));
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
bind('back','click',back);bind('new-folder','click',newFolder);bind('new-note','click',newNote);bind('folder-up','click',()=>goFolder(state.folders.find(f=>f.id===folder)?.parent??''));
bind('import-file','click',()=>importFiles(false));bind('import-folder','click',()=>importFiles(true));
bind('sort','change',()=>{state.prefs[mode]??={};state.prefs[mode].sort=$('sort').value;library();});bind('view','click',()=>{state.prefs[mode]??={};state.prefs[mode].view=state.prefs[mode].view==='grid'?'list':'grid';library();});
bind('undo','click',()=>ink.undo());bind('redo','click',()=>ink.redo());bind('ink-color','input',()=>{ink.color=$('ink-color').value;});bind('ink-width','change',()=>{ink.width=Number($('ink-width').value);});
bind('english','click',()=>{active.note.readingMode=active.note.readingMode==='english'?'standard':'english';hideTranslation();updateEnglish();saveNote(true);});
bind('phrase-select','click',()=>{setTool('hand');toast('长按正文选词，再拖动安卓选择柄扩展短语；双击已选区查译。也可点“查询选区”。');});
bind('phrase-lookup','click',()=>{const selection=getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):phraseRange;if(!range||!$('content').contains(range.commonAncestorContainer))throw Error('请先选择正文中的英文短语');phraseRange=range.cloneRange();return translate(range.toString().replace(/\s+/g,' ').trim(),range.getBoundingClientRect());});
bind('settings','click',openSettings);bind('read-settings','click',openSettings);bind('theme','change',()=>{state.prefs.theme=$('theme').value;theme();saveState(true);});
for(const id of ['font-size','line-height'])bind(id,'input',()=>{const display={font:Number($('font-size').value),line:Number($('line-height').value)};if(active){active.note.display=display;saveNote();}else{state.prefs.reading=display;saveState();}applyDisplay();});
bind('settings-dialog','close',()=>flush());bind('ai-settings','click',aiSettings);
bind('licenses','click',async()=>{const texts=await Promise.all(['THIRD-PARTY.md','vendor/ecdict/SOURCE.json','vendor/ecdict/LICENSE','vendor/katex/LICENSE','vendor/pdfjs/LICENSE','vendor/PROJECT-LICENSE'].map(path=>fetch(path).then(r=>r.text())));showInfo('许可与来源',texts.map(t=>'<pre style="white-space:pre-wrap;font-size:12px">'+escape(t)+'</pre>').join(''));});
bind('ai-config-form','submit',async e=>{e.preventDefault();const form=e.target,payload={endpoint:form.elements.endpoint.value.trim(),model:form.elements.model.value.trim(),prompt:form.elements.prompt.value};if(form.elements.clearKey.checked)payload.key='';else if(form.elements.key.value)payload.key=form.elements.key.value;await rpc('saveAi',payload);form.elements.key.value='';$('ai-config-dialog').close();toast('AI 设置已保存');});
bind('ai-open','click',showChat);bind('chat-input','input',()=>{conversation().draft=$('chat-input').value;saveNote();});bind('send-chat','click',sendChat);
bind('attach-selection','click',()=>{const range=phraseRange,selected=range?.toString()??getSelection()?.toString();if(!selected?.trim())throw Error('先在正文中选择片段再打开 AI');if(selected.length>10000)throw Error('选区超过 10000 字');attachment=selected.trim();conversation().attachment=attachment;saveNote(true);$('ai-attachment').textContent='将附上选区：'+attachment;});
bind('clear-context','click',async()=>{const chat=conversation();chat.contextStart=chat.messages.length;await saveNote(true);toast('已清除发送上下文，本地记录仍保留');});
bind('knowledge','click',async()=>{await saveNote(true);active.screen=active.screen==='knowledge'?'question':'knowledge';renderCourse();});bind('previous','click',()=>navigate(active.note.index-1));
bind('next','click',()=>active.screen==='knowledge'?navigate(active.note.index):active.note.index<active.course.questions.length-1?navigate(active.note.index+1):active.note.submissions?.length?showSubmission(active.note.submissions.at(-1)):showInfo('提交答案','<p>点击底部“提交答案”保存本次所有题目的作答。提交后可以查看参考答案。</p>'));bind('submit','click',submit);
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush().catch(()=>{});});window.addEventListener('pagehide',()=>flush().catch(()=>{}));
async function boot(){
  state=await rpc('load');state.prefs??={};mode=state.prefs.location?.mode??'documents';folder=state.prefs.location?.folder??'';systemTheme=await rpc('systemTheme');theme();document.body.hidden=false;library();
  const last=state.lastOpen;if(last){const item=(last.type==='doc'?state.documents:state.courses).find(i=>i.id===last.id);if(item)await (last.type==='doc'?openDoc(item):openCourse(item));}setTool('hand');
}
boot().catch(error=>{document.body.hidden=false;showInfo('启动失败','<p>'+escape(error.message)+'</p><p>保存的文件保持原样，请检查应用存储空间后重新打开。</p>');});
