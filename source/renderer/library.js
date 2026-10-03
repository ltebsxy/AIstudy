function libraryLocation() { const mode=libraryState.selection.mode;return {mode,...libraryState.views[mode]}; }
let libraryNavigating=false;
async function setLibraryView(change) {
  if(libraryNavigating||!libraryState)return;libraryNavigating=true;
  try { const state=await window.study.selectFolder({mode:change.mode||libraryLocation().mode,...change});await refresh(state); }
  catch(e){errorMessage(e);}
  finally{libraryNavigating=false;}
}
function libraryDialog(title,fields,onSave){
  const dialog=document.createElement('dialog');dialog.className='library-dialog';
  dialog.innerHTML=`<form><h2>${esc(title)}</h2>${fields}<p class="dialog-error" role="status"></p><div class="dialog-actions"><button class="btn btn-plain" type="button" data-cancel>取消</button><button class="btn btn-primary" type="submit">保存</button></div></form>`;
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('[type="submit"]');button.disabled=true;try{const state=await onSave(dialog);dialog.close();await refresh(state);}catch(e){dialog.querySelector('.dialog-error').textContent=friendlyError(e);}finally{button.disabled=false;}};
  dialog.showModal();return dialog;
}
function editFolder(item){
  const location=libraryLocation();
  libraryDialog(item?'重命名文件夹':'新建文件夹',`<label for="folder-name">名称</label><input id="folder-name" maxlength="80" required value="${esc(item?.name||'')}">`,dialog=>window.study.saveFolder({id:item?.id,name:dialog.querySelector('#folder-name').value,mode:location.mode,parentId:item?.parentId??location.folderId}));
}
function folderPath(id){
  const parts=[],seen=new Set();while(id&&!seen.has(id)){seen.add(id);const folder=libraryState.folders.find(x=>x.id===id);if(!folder)break;parts.unshift(folder);id=folder.parentId;}return parts;
}
function moveLibraryItem(kind,id){
  const mode=libraryLocation().mode,current=kind==='folder'?libraryState.folders.find(x=>x.id===id):kind==='course'?libraryState.courses[id]||{}:libraryState.documents.find(x=>x.id===id);
  const folders=libraryState.folders.filter(x=>x.mode===mode&&(kind!=='folder'||!folderPath(x.id).some(p=>p.id===id)));
  const dialog=libraryDialog('移动到文件夹',`<label for="move-folder">位置</label><select id="move-folder"><option value="">全部文件</option>${folders.map(x=>`<option value="${esc(x.id)}">${esc(folderPath(x.id).map(p=>p.name).join(' / '))}</option>`).join('')}</select>`,dialog=>kind==='folder'?window.study.saveFolder({id,name:current.name,mode,parentId:dialog.querySelector('#move-folder').value}):window.study.assignFolder({kind,id,folderId:dialog.querySelector('#move-folder').value}));
  dialog.querySelector('#move-folder').value=(kind==='folder'?current.parentId:current.folderId)||'';
}
const folderIcon='<svg viewBox="0 0 48 40" width="42" height="36" aria-hidden="true"><path d="M3 10a4 4 0 0 1 4-4h12l5 5h17a4 4 0 0 1 4 4v19H3Z" fill="#dceae2"/><path d="M3 17h42v17a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" fill="#80a99a"/></svg>';
let librarySort={key:'name',direction:1};
function libraryDate(value){const date=new Date(value);return Number.isNaN(+date)?'—':date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
function librarySize(value){return !Number.isFinite(value)?'—':value<1024?value+' B':value<1024*1024?(value/1024).toFixed(1)+' KB':(value/1024/1024).toFixed(1)+' MB';}
function entryActions(entry){return entry.kind==='folder'?`<button class="link-button" data-rename="${esc(entry.id)}">重命名</button><button class="link-button" data-move="${esc(entry.id)}" data-kind="folder">移动</button><button class="link-button" data-delete="${esc(entry.id)}">删除</button>`:`${entry.kind==='course'?`<button class="link-button edit" data-id="${esc(entry.id)}" title="编辑">编辑</button>`:''}<button class="link-button" data-move="${esc(entry.id)}" data-kind="${entry.kind}">移动到…</button>`;}
function entryOpen(entry){return entry.kind==='folder'?`data-folder="${esc(entry.id)}" class="folder-open"`:entry.kind==='course'?`data-id="${esc(entry.id)}" class="open"`:`data-id="${esc(entry.id)}" class="read-document"`;}
function renderHome(){
  if(!libraryState)return;nav('home');
  const location=libraryLocation(),reading=location.mode==='reading',list=location.layout==='list';
  const folders=libraryState.folders.filter(x=>x.mode===location.mode&&x.parentId===location.folderId);
  const items=reading?libraryState.documents.filter(x=>(x.folderId||'')===location.folderId):courses.filter(c=>(libraryState.courses[c.id]?.folderId||'')===location.folderId);
  const entries=[...folders.map(x=>({...x,kind:'folder',type:'文件夹'})),...items.map(x=>({...x,name:reading?x.name:x.title,kind:reading?'document':'course',type:reading?(x.format||x.name.split('.').pop()||'文件').toUpperCase():x.kind==='programming'?'编程课程':'课程'}))];
  entries.sort((a,b)=>{if((a.kind==='folder')!==(b.kind==='folder'))return a.kind==='folder'?-1:1;const av=a[librarySort.key]??'',bv=b[librarySort.key]??'';return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'zh-CN',{numeric:true}))*librarySort.direction;});
  const breadcrumb=folderPath(location.folderId).map(x=>`<span>／</span><button class="link-button" data-path="${esc(x.id)}">${esc(x.name)}</button>`).join('');
  let body;
  if(list){body=`<div class="library-table-wrap"><table class="library-table"><thead><tr>${[['name','名称'],['updatedAt','修改日期'],['type','类型'],['size','大小']].map(([key,label])=>`<th scope="col"><button data-sort="${key}">${label}${librarySort.key===key?(librarySort.direction===1?' ↑':' ↓'):''}</button></th>`).join('')}<th scope="col">操作</th></tr></thead><tbody>${entries.map(entry=>`<tr data-entry="${esc(entry.id)}"><td><button ${entryOpen(entry)}>${entry.kind==='folder'?folderIcon:'<span class="list-file-icon">'+(reading?entry.type:'▧')+'</span>'}<span>${esc(entry.name)}</span></button></td><td>${esc(libraryDate(entry.updatedAt))}</td><td>${entry.type}</td><td>${librarySize(entry.size)}</td><td class="row-actions">${entryActions(entry)}</td></tr>`).join('')}</tbody></table></div>`;}
  else{body=`<div class="grid library-cards">${entries.map(entry=>entry.kind==='folder'?`<article class="folder-card"><button ${entryOpen(entry)}>${folderIcon}<strong>${esc(entry.name)}</strong></button><div class="folder-actions">${entryActions(entry)}</div></article>`:`<article class="course-card"><div class="card-top"><div class="card-icon">${reading?entry.type:entry.kind==='programming'?'⌨':'▧'}</div><div>${entryActions(entry)}</div></div><h3>${esc(entry.name)}</h3>${entry.description?`<p>${esc(entry.description)}</p>`:''}<div class="card-footer">${reading?'':`<span>${entry.kind==='programming'?(entry.programming?.files?.length||0)+' 个文件':entry.questions.length+' 道题目'}</span>`}<button ${entryOpen(entry)}>${reading?'进入读写 →':'开始学习 →'}</button></div></article>`).join('')}</div>`;}
  view.innerHTML=`<div class="content library-page"><header class="toolbar"><div><div class="eyebrow">MY LEARNING SPACE</div><h1 class="page-title">我的学习空间</h1></div></header><div class="library-modes" role="group" aria-label="学习方式"><button class="${reading?'':'selected'}" data-mode="study">课程模式</button><button class="${reading?'selected':''}" data-mode="reading">读写模式</button></div><div class="library-path"><button class="link-button" data-path="">全部文件</button>${breadcrumb}</div><div class="library-toolbar"><div><button class="btn btn-soft" id="new-folder">＋ 新建文件夹</button>${reading?'<button class="btn btn-primary" id="import-pdf">导入文件</button><button class="btn btn-plain" id="import-reading-folder">导入文件夹</button>':'<button class="btn btn-primary" id="new-course">＋ 新建课程</button><button class="btn btn-plain" id="import-course-file">导入课程文件</button>'}</div><div class="library-layout" role="group" aria-label="显示方式"><button data-layout="cards" aria-pressed="${!list}" title="卡片视图">▦ 卡片</button><button data-layout="list" aria-pressed="${list}" title="列表视图">☷ 列表</button></div></div>${body}</div>`;
  view.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setLibraryView({mode:button.dataset.mode}));
  view.querySelectorAll('[data-layout]').forEach(button=>button.onclick=()=>setLibraryView({layout:button.dataset.layout}));
  view.querySelectorAll('[data-path]').forEach(button=>button.onclick=()=>setLibraryView({folderId:button.dataset.path}));
  view.querySelectorAll('[data-folder]').forEach(button=>button.onclick=()=>setLibraryView({folderId:button.dataset.folder}));
  view.querySelectorAll('[data-rename]').forEach(button=>button.onclick=()=>editFolder(folders.find(x=>x.id===button.dataset.rename)));
  view.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{try{const state=await window.study.removeFolder({id:button.dataset.delete,mode:location.mode});await refresh(state);}catch(e){errorMessage(e);}});
  document.getElementById('new-folder').onclick=()=>editFolder();
  document.getElementById('new-course')?.addEventListener('click',()=>renderEditor());
  document.getElementById('import-pdf')?.addEventListener('click',async()=>{try{const state=await window.study.importPDF(location);if(state)await refresh(state);}catch(e){errorMessage(e);}});
  document.getElementById('import-reading-folder')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='正在导入…';
    try{const result=await window.study.importReadingFolder(location);if(result){await refresh(result.library);notify('已导入 '+result.imported+' 个文件'+(result.skipped?'，跳过 '+result.skipped+' 项不支持的内容':'')+'。');}}
    catch(error){errorMessage(error);}finally{button.disabled=false;button.textContent='导入文件夹';}
  });
  document.getElementById('import-course-file')?.addEventListener('click',async()=>{try{const course=await window.study.importCourseFile();if(course){await window.study.assignFolder({kind:'course',id:course.id,...location});await refresh();}}catch(e){errorMessage(e);}});
  view.querySelectorAll('.open').forEach(button=>button.onclick=()=>renderLesson(button.dataset.id));
  view.querySelectorAll('.edit').forEach(button=>button.onclick=()=>renderEditor(button.dataset.id));
  view.querySelectorAll('.read-document').forEach(button=>button.onclick=()=>startCourseMode('document:'+button.dataset.id,'reading'));
  view.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>moveLibraryItem(button.dataset.kind,button.dataset.move));
  view.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{librarySort={key:button.dataset.sort,direction:librarySort.key===button.dataset.sort?-librarySort.direction:1};renderHome();});
  view.querySelectorAll('tbody tr').forEach(row=>row.onclick=()=>{view.querySelectorAll('tbody tr').forEach(x=>x.classList.toggle('selected',x===row));});
}
