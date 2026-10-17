// SPDX-License-Identifier: GPL-3.0-only
import {rpc,native,localPut,readFile} from './bridge.mjs';
import {escape,extension,readingPlan,doubleTap} from './core.mjs';
const $=id=>document.getElementById(id), clone=value=>JSON.parse(JSON.stringify(value));
let state,active,mode='documents',folder='',systemTheme='light',saving=Promise.resolve(),saveTimer,noteTimer,toastTimer,worker,lookupId=0,lastTap,phraseRange,phraseTimer,busyImport=false,opening=0,restoring=false,currentLookup=null;
const lookups=new Map();
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function bind(id,event,handler){$(id).addEventListener(event,e=>{try{Promise.resolve(handler(e)).catch(error=>toast(error.message));}catch(error){toast(error.message);}});}
function queue(operation){$('save-status').textContent='保存中';saving=saving.catch(()=>{}).then(operation).then(()=>{$('save-status').textContent='已保存';}).catch(error=>{$('save-status').textContent='保存失败';toast('保存失败：'+error.message);throw error;});saving.catch(()=>{});return saving;}
function saveState(immediate=false){clearTimeout(saveTimer);const save=()=>queue(()=>rpc('save',clone(state)));if(immediate)return save();saveTimer=setTimeout(save,280);}
function saveNote(immediate=false){
  clearTimeout(noteTimer);if(!active)return;active.note.reader={scroll:$('scroll').scrollTop,ratio:readingRatio(),width:$('scroll').clientWidth};const id=active.noteId,data=clone(active.note);const save=()=>queue(()=>rpc('saveNote',{id,data}));
  if(immediate)return save();noteTimer=setTimeout(save,450);
}
async function flush(){clearTimeout(saveTimer);clearTimeout(noteTimer);if(busyImport){await saving;return;}await saveNote(true);await saveState(true);await saving;}
window.flushStudy=flush;
function theme(){const value=state.prefs.theme??'system',resolved=value==='system'?systemTheme:value;document.documentElement.dataset.theme=resolved;if(native)rpc('appearance',{theme:resolved}).catch(error=>toast(error.message));}
window.systemThemeChanged=value=>{systemTheme=value;if(state)theme();};
function viewPrefs(){return {...{font:19,line:1.85},...state.prefs.reading,...active?.note.display};}
function applyDisplay(){const p=viewPrefs();$('content').style.setProperty('--font-size',p.font+'px');$('content').style.setProperty('--line-height',p.line);}
function showInfo(title,html){$('info-title').textContent=title;$('info-content').innerHTML=html;$('info-dialog').showModal();}
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
function library(){
  active=null;opening++;hideTranslation();$('reader-tools').hidden=true;$('reader').hidden=true;$('library').hidden=false;$('title').textContent='AI-StudyDesk';$('back').hidden=!folder;
  const current=state.folders.find(f=>f.id===folder&&f.mode===mode);if(folder&&!current)folder='';
  $('folder-name').textContent=current?.name??'全部';$('folder-up').disabled=!folder;
  const pref=state.prefs[mode]??{};$('sort').value=pref.sort??'order';$('items').classList.toggle('grid',pref.view==='grid');
  const folders=state.folders.filter(f=>f.mode===mode&&(f.parent??'')===folder),list=state.documents.filter(item=>['txt','md','markdown','pdf'].includes(item.ext)&&(item.folder??'')===folder);
  const sort=(a,b)=>pref.sort==='name'?(a.name??a.title).localeCompare(b.name??b.title,'zh-CN'):pref.sort==='recent'?(b.recent??0)-(a.recent??0):0;list.sort(sort);
  $('items').replaceChildren();
  for(const [kind,item] of [...folders.map(f=>['folder',f]),...list.map(f=>['doc',f])]){
    const row=document.createElement('div');row.className='item';const button=document.createElement('button');button.className='open';
    const title=item.name??item.title;button.innerHTML=`${kind==='folder'?'▣ ':kind==='doc'?'▤ ':'▧ '}${escape(title)}<span class="meta">${kind==='folder'?'文件夹':item.ext.toUpperCase()}${item.progress?' · '+escape(item.progress):''}</span>`;
    button.onclick=()=>Promise.resolve(kind==='folder'?goFolder(item.id):openDoc(item)).catch(error=>toast(error.message));
    const more=document.createElement('button');more.className='more';more.textContent='⋯';more.setAttribute('aria-label','管理 '+title);more.onclick=()=>manage(kind,item);row.append(button,more);$('items').append(row);
  }
  $('empty').textContent=list.length||folders.length?'':'导入英语文章或阅读包开始阅读。支持 TXT、Markdown 和 PDF；双击单词查看释义。';
  state.prefs[mode]??={};state.prefs[mode].folder=folder;state.prefs.location={mode,folder};saveState();
}
function goFolder(id){folder=id;library();}
function manage(kind,item){
  showInfo('管理 '+(item.name??item.title),'<div class="actions"><button id="rename-item">重命名</button><button id="move-item">移动到文件夹</button><button id="remove-item">删除</button></div>');
  bind('rename-item','click',()=>{const name=prompt('新名称',item.name??item.title)?.trim();if(!name)return;if(name.length>200)throw Error('名称过长');item.name=name;saveState(true);$('info-dialog').close();library();});
  bind('move-item','click',()=>{
    const children=new Set([item.id]);let changed=true;while(changed){changed=false;for(const f of state.folders)if(children.has(f.parent)&&!children.has(f.id)){children.add(f.id);changed=true;}}
    const targets=state.folders.filter(f=>f.mode===mode&&(kind!=='folder'||!children.has(f.id)));
    $('info-content').innerHTML='<label>目标文件夹<select id="move-target"><option value="">全部（根目录）</option>'+targets.map(f=>`<option value="${escape(f.id)}">${escape(folderPath(f.id))}</option>`).join('')+'</select></label><button id="move-confirm">移动</button>';
    bind('move-confirm','click',()=>{item[kind==='folder'?'parent':'folder']=$('move-target').value;saveState(true);$('info-dialog').close();library();});
  });
  bind('remove-item','click',async()=>{
    if(!confirm('删除此项'+(kind==='folder'?'及文件夹内所有材料':'')+'？'))return;
    const ids=new Set([item.id]);if(kind==='folder'){let changed=true;while(changed){changed=false;for(const f of state.folders)if(ids.has(f.parent)&&!ids.has(f.id)){ids.add(f.id);changed=true;}}state.folders=state.folders.filter(f=>!ids.has(f.id));state.documents=state.documents.filter(d=>!ids.has(d.folder));state.courses=state.courses.filter(d=>!ids.has(d.folder));}
    else state.documents=state.documents.filter(d=>d.id!==item.id);
    await saveState(true);await rpc('cleanup');$('info-dialog').close();library();
  });
}
function folderPath(id){const parts=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const f=state.folders.find(f=>f.id===id);if(!f)break;parts.unshift(f.name);id=f.parent;}return parts.join(' / ');}
async function newFolder(){const name=prompt('文件夹名称')?.trim();if(!name)return;state.folders.push({id:crypto.randomUUID(),name:name.slice(0,80),mode,parent:folder});await saveState(true);library();}
async function openDoc(item){
  await flush();active?.cleanup?.();const token=++opening,note=await rpc('note',{id:'doc-'+item.id});if(token!==opening)return;
  active={type:'doc',item,noteId:'doc-'+item.id,note};restoring=true;hideTranslation();lastTap=null;phraseRange=null;clearTimeout(phraseTimer);
  $('library').hidden=true;$('reader').hidden=false;$('reader-tools').hidden=false;$('title').textContent=item.name;$('back').hidden=false;$('content').replaceChildren();applyDisplay();$('scroll').scrollTop=0;
  try{
    const response=await readFile(item);if(token!==opening)return;
    if(['txt','md','markdown'].includes(item.ext)){
      const text=(await response.text()).replace(/^\uFEFF/,'');
      if(item.ext==='txt')$('content').innerHTML=text.split(/\r?\n\s*\r?\n/).map(p=>'<p>'+escape(p).replaceAll('\n','<br>')+'</p>').join('');
      else{$('content').innerHTML=markdown(text);window.StudyMath.render($('content'));}tokenize();
    }else if(item.ext==='pdf')await renderPdf(await response.arrayBuffer(),token);
    if(token!==opening)return;await new Promise(requestAnimationFrame);
    const old=note.reader??{scroll:note.canvas?.scroll??0};$('scroll').scrollTop=old.width&&old.width!==$('scroll').clientWidth?(old.ratio??0)*readingExtent():(old.scroll??0);
    updateProgress();item.recent=Date.now();state.lastOpen={type:'doc',id:item.id};await saveState(true);
  }catch(error){if(token===opening){toast(error.message);$('content').textContent='无法阅读此文件：'+error.message;}}
  finally{if(token===opening)restoring=false;}
}
function readingExtent(){return Math.max(0,$('scroll').scrollHeight-$('scroll').clientHeight);}
function readingRatio(){const height=readingExtent();return height?Math.min(1,$('scroll').scrollTop/height):0;}
function updateProgress(){if(!active)return;const progress=readingExtent()?Math.round(readingRatio()*100):100;$('reading-progress').textContent=progress+'%';active.item.progress='已读 '+progress+'%';}
function english(){return !!active;}
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
        if(!text.items.length)wrapper.title='此页没有文本层，暂不支持离线查词';
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
function hideTranslation(){$('translation').hidden=true;lookupId++;currentLookup=null;}
function ensureDictionary(){if(worker)return;worker=new Worker('dictionary-worker.mjs',{type:'module'});worker.onmessage=({data})=>{const task=lookups.get(data.id);lookups.delete(data.id);if(task)data.error?task.reject(Error(data.error)):task.resolve(data.result);};worker.onerror=()=>{for(const task of lookups.values())task.reject(Error('离线词库加载失败，请检查 System WebView 和应用资源'));lookups.clear();worker.terminate();worker=null;};}
function lookup(query){ensureDictionary();return new Promise((resolve,reject)=>{const id=crypto.randomUUID();lookups.set(id,{resolve,reject});worker.postMessage({id,query});});}
function dictionaryHtml(result){
  if(result.parts)return '<p>未收录完整短语，以下是分段释义：</p>'+result.parts.map(r=>'<strong>'+escape(r.word)+'</strong>'+dictionaryHtml(r)).join('');
  if(!result.found)return '<p>本地词库未收录此词。</p>'+(result.suggestions?.length?'<small>可能是：'+escape(result.suggestions.join('、'))+'</small>':'');
  return (result.lemma!==result.word?'<small>原形 '+escape(result.lemma)+'</small>':'')+(result.phonetic?'<p>/'+escape(result.phonetic)+'/</p>':'')+result.senses.map(s=>`<p><small>${escape(s.pos)}</small> ${escape(s.meaning)}</p>`).join('');
}
async function translate(query,rect){
  if(!english())return;const id=++lookupId,box=$('translation');currentLookup={query,documentId:active.item.id,title:active.item.name,result:null,ai:''};
  $('translation-title').textContent=query;$('translation-content').innerHTML='<small>离线查询中…</small>';$('translation-ai').hidden=true;$('translation-ai').textContent='';$('translation-status').textContent='';$('translate-ai').disabled=false;$('add-note').disabled=true;box.hidden=false;positionTranslation(rect);
  try{const result=await lookup(query);if(id!==lookupId)return;currentLookup.result=result;$('translation-content').innerHTML=dictionaryHtml(result);$('add-note').disabled=false;positionTranslation(rect);}
  catch(error){if(id===lookupId){$('translation-content').replaceChildren();$('translation-status').textContent=error.message;$('add-note').disabled=false;positionTranslation(rect);}}
}
async function aiTranslate(){
  if(!currentLookup)return;const id=lookupId,input=currentLookup;$('translate-ai').disabled=true;$('translation-status').textContent='AI 翻译中…';
  try{const answer=await rpc('translate',{text:input.query});if(id!==lookupId)return;input.ai=answer;$('translation-ai').textContent=answer;$('translation-ai').hidden=false;$('translation-status').textContent='AI 翻译';}
  catch(error){if(id===lookupId)$('translation-status').textContent=error.message;}
  finally{if(id===lookupId)$('translate-ai').disabled=false;}
}
async function addReadingNote(){
  if(!currentLookup)return;const id=lookupId,input=currentLookup;
  const text=[input.query,$('translation-content').innerText,...(input.ai?['AI 翻译：'+input.ai]:[])].join('\n');$('add-note').disabled=true;
  try{await queue(async()=>{const notes=await rpc('note',{id:'english-notes'});notes.entries??=[];if(notes.entries.length>=2000)throw Error('笔记已达 2000 条，请先整理');notes.entries.push({id:crypto.randomUUID(),documentId:input.documentId,title:input.title,word:input.query,text,createdAt:new Date().toISOString()});await rpc('saveNote',{id:'english-notes',data:notes});});if(id===lookupId)$('translation-status').textContent='已加入阅读笔记';}
  catch(error){if(id===lookupId)$('translation-status').textContent=error.message;}
  finally{if(id===lookupId)$('add-note').disabled=false;}
}
async function showNotes(){
  await saving;const notes=await rpc('note',{id:'english-notes'});
  showInfo('阅读笔记',notes.entries?.length?[...notes.entries].reverse().map(n=>'<section class="reading-note"><small>'+escape(n.title)+' · '+escape(new Date(n.createdAt).toLocaleDateString())+'</small><pre>'+escape(n.text)+'</pre><button data-remove-note="'+escape(n.id)+'">删除</button></section>').join(''):'<p class="hint">双击单词，在释义窗中点击“加入笔记”。</p>');
  $('info-content').querySelectorAll('[data-remove-note]').forEach(button=>button.onclick=async()=>{if(!confirm('删除这条笔记？'))return;try{await queue(async()=>{const latest=await rpc('note',{id:'english-notes'});latest.entries=latest.entries.filter(n=>n.id!==button.dataset.removeNote);await rpc('saveNote',{id:'english-notes',data:latest});});button.closest('section').remove();}catch(error){toast(error.message);}});
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
$('scroll').addEventListener('scroll',()=>{hideTranslation();if(active&&!restoring){updateProgress();saveNote();saveState();}},{passive:true});
async function importFiles(tree){
  await flush();if(busyImport)return;setImportBusy(true);
  try{if(native){await rpc('pick',{tree,mode,folder});toast('选择'+(tree?'文件夹':'文件')+'后将复制到应用目录');}
  else{$('preview-import').value='';$('preview-import').webkitdirectory=tree;$('preview-import').multiple=tree;$('preview-import').accept='.txt,.md,.markdown,.pdf';$('preview-import').click();}}
  catch(error){setImportBusy(false);throw error;}
}
function setImportBusy(value){busyImport=value;$('library').inert=value;$('settings').disabled=value;$('open-notes').disabled=value;}
window.addEventListener('study:import',async({detail})=>{
  try{if(detail.cancelled)return;if(detail.error){toast(detail.error);return;}state=await rpc('load');folder=state.prefs.documents?.folder??folder;library();toast('已导入 '+detail.count+' 项');if(detail.warnings?.length)showInfo('导入提示',detail.warnings.map(m=>'<p>'+escape(m)+'</p>').join(''));}catch(error){toast(error.message);}finally{setImportBusy(false);}
});
bind('preview-import','cancel',()=>{setImportBusy(false);});
bind('preview-import','change',async e=>{
  try{
    const files=[...e.target.files];if(!files.length)return;const tree=e.target.webkitdirectory,rootName=tree?files[0].webkitRelativePath.split('/')[0]:'';
    const entries=files.map(file=>({path:tree?file.webkitRelativePath.slice(rootName.length+1):file.name,size:file.size,file})),manifestFile=entries.find(f=>f.path==='reading-pack.json');let selected;
    if(manifestFile?.size>1024**2)throw Error('清单超过 1 MB');selected=readingPlan(entries,manifestFile?JSON.parse((await manifestFile.file.text()).replace(/^\uFEFF/,'')):null);
    const staged=clone(state),ids=new Map([['',folder]]);if(tree){const id=crypto.randomUUID();staged.folders.push({id,name:manifestFile?JSON.parse((await manifestFile.file.text()).replace(/^\uFEFF/,'')).title??rootName:rootName,parent:folder,mode});ids.set('',id);}
    function ensure(path){if(ids.has(path))return ids.get(path);const parts=path.split('/'),name=parts.pop(),parent=ensure(parts.join('/')),id=crypto.randomUUID();staged.folders.push({id,name,parent,mode});ids.set(path,id);return id;}
    let count=0;const blobs=[];
    for(const file of selected){const parent=file.path.includes('/')?file.path.slice(0,file.path.lastIndexOf('/')):'',folder=ensure(parent);
      const id=crypto.randomUUID();staged.documents.push({id,name:file.name,folder,ext:extension(file.path),readingMode:'english',added:Date.now()});blobs.push([id,file.file]);count++;
    }
    if(!count)throw Error('没有可导入内容');try{for(const [id,blob] of blobs)await localPut('file:'+id,blob);await rpc('save',staged);}catch(error){await rpc('cleanup').catch(()=>{});throw error;}state=staged;library();toast('浏览器预览已导入 '+count+' 项');
  }finally{setImportBusy(false);}
});
async function openSettings(){const p=viewPrefs();$('theme').value=state.prefs.theme??'system';$('font-size').value=p.font;$('line-height').value=p.line;$('settings-dialog').showModal();}
async function aiSettings(){
  const config=await rpc('aiConfig'),form=$('ai-config-form');form.elements.endpoint.value=config.endpoint??'';form.elements.model.value=config.model??'';form.elements.key.value='';form.elements.key.placeholder=config.hasKey?'已保存加密密钥；留空保留':'输入 API Key';form.elements.clearKey.checked=false;form.elements.prompt.value=config.prompt??'简要给出英语单词或短语的词性和中文释义。';$('ai-config-dialog').showModal();
}
async function back(){
  const dialogs=[...document.querySelectorAll('dialog[open]')];if(dialogs.length){dialogs.at(-1).close();return;}
  if(busyImport){toast('正在导入，请稍候');return;}
  if(active){const exiting=active;await flush();state.lastOpen=null;await saveState(true);library();exiting.cleanup?.();return;}if(folder){goFolder(state.folders.find(f=>f.id===folder)?.parent??'');return;}if(native){await flush();await rpc('exit');}else toast('内容已保存，可关闭浏览器预览');
}
window.studyBack=back;
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
bind('back','click',back);bind('new-folder','click',newFolder);bind('folder-up','click',()=>goFolder(state.folders.find(f=>f.id===folder)?.parent??''));
bind('import-file','click',()=>importFiles(false));bind('import-folder','click',()=>importFiles(true));
bind('sort','change',()=>{state.prefs[mode]??={};state.prefs[mode].sort=$('sort').value;library();});bind('view','click',()=>{state.prefs[mode]??={};state.prefs[mode].view=state.prefs[mode].view==='grid'?'list':'grid';library();});
bind('phrase-lookup','click',()=>{const selection=getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):phraseRange;if(!range||!$('content').contains(range.commonAncestorContainer))throw Error('请先选择正文中的英文短语');phraseRange=range.cloneRange();return translate(range.toString().replace(/\s+/g,' ').trim(),range.getBoundingClientRect());});
bind('settings','click',openSettings);bind('theme','change',()=>{state.prefs.theme=$('theme').value;theme();saveState(true);});
for(const id of ['font-size','line-height'])bind(id,'input',()=>{const display={font:Number($('font-size').value),line:Number($('line-height').value)};if(active){active.note.display=display;saveNote();}else{state.prefs.reading=display;saveState();}const ratio=readingRatio();applyDisplay();$('scroll').scrollTop=ratio*readingExtent();updateProgress();if(active)saveNote();});
bind('settings-dialog','close',()=>flush());bind('ai-settings','click',aiSettings);
bind('licenses','click',async()=>{const texts=await Promise.all(['THIRD-PARTY.md','vendor/ecdict/SOURCE.json','vendor/ecdict/LICENSE','vendor/katex/LICENSE','vendor/pdfjs/LICENSE','vendor/PROJECT-LICENSE'].map(path=>fetch(path).then(r=>r.text())));showInfo('许可与来源',texts.map(t=>'<pre style="white-space:pre-wrap;font-size:12px">'+escape(t)+'</pre>').join(''));});
bind('ai-config-form','submit',async e=>{e.preventDefault();const form=e.target,payload={endpoint:form.elements.endpoint.value.trim(),model:form.elements.model.value.trim(),prompt:form.elements.prompt.value};if(form.elements.clearKey.checked)payload.key='';else if(form.elements.key.value)payload.key=form.elements.key.value;await rpc('saveAi',payload);form.elements.key.value='';$('ai-config-dialog').close();toast('AI 设置已保存');});
bind('translate-ai','click',aiTranslate);bind('add-note','click',addReadingNote);bind('translation-close','click',hideTranslation);bind('open-notes','click',showNotes);
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush().catch(()=>{});});window.addEventListener('pagehide',()=>flush().catch(()=>{}));
async function boot(){
  state=await rpc('load');state.prefs??={};state.documents??=[];state.courses??=[];state.folders??=[];mode='documents';folder=state.prefs.documents?.folder??(state.prefs.location?.mode==='documents'?state.prefs.location.folder:'')??'';
  systemTheme=await rpc('systemTheme');theme();document.body.hidden=false;library();
  const last=state.lastOpen,item=last?.type==='doc'&&state.documents.find(i=>i.id===last.id&&['txt','md','markdown','pdf'].includes(i.ext));if(item)await openDoc(item);
}
boot().catch(error=>{document.body.hidden=false;showInfo('启动失败','<p>'+escape(error.message)+'</p><p>保存的文件保持原样，请检查应用存储空间后重新打开。</p>');});
