// SPDX-License-Identifier: GPL-3.0-only
let noteGeneration=0,activeNoteId=null,flushNoteEditor=async()=>{};
let disposeNoteEditor=()=>{noteGeneration++;};
const noteDrafts=new Map();
function noteFolderOptions(){return `<option value="">知识点 / 全部笔记</option>`+libraryState.folders.filter(x=>x.mode==='knowledge').map(x=>`<option value="${esc(x.id)}">知识点 / ${esc(folderPath(x.id).map(p=>p.name).join(' / '))}</option>`).join('');}
function setupNoteDestinationEditor(){
  const field=document.createElement('div');field.className='field note-destination-field';
  field.innerHTML=`<label for="note-destination">笔记自动保存位置</label><select id="note-destination">${noteFolderOptions()}</select><p class="target-help">课程中加入笔记的文字和截图，会追加到此位置的一份课程笔记。</p>`;
  document.querySelector('.form-grid').append(field);field.querySelector('select').value=draft.noteFolderId||'';
}
async function addCourseNoteText(courseId,text){
  const note=await window.study.appendNoteText({courseId,text});libraryState=await window.study.library();notify('已加入「'+note.name+'」');return note;
}
function setupCourseNotes(course){
  const panel=document.createElement('div');panel.className='course-note-tools';
  panel.innerHTML=`<label for="course-note-folder">笔记保存到</label><select id="course-note-folder" aria-label="笔记自动保存位置">${noteFolderOptions()}</select><button class="btn btn-plain" id="capture-course-note">▣ 截图笔记</button><button class="btn btn-plain" id="open-course-note">查看笔记</button>`;
  document.querySelector('.lesson-layout').before(panel);
  const select=panel.querySelector('select');select.value=libraryState.noteDestinations[course.id]?.folderId||'';
  select.onchange=async()=>{select.disabled=true;try{libraryState=await window.study.saveNoteDestination({courseId:course.id,folderId:select.value});notify('笔记保存位置已更新');}catch(e){select.value=libraryState.noteDestinations[course.id]?.folderId||'';errorMessage(e);}finally{select.disabled=false;}};
  panel.querySelector('#capture-course-note').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await window.study.captureNote(course.id);}catch(e){errorMessage(e);}finally{button.disabled=false;}};
  panel.querySelector('#open-course-note').onclick=async()=>{try{await startCourseMode('note:'+(await window.study.courseNote(course.id)).id,'reading');}catch(e){errorMessage(e);}};
}
function renameNoteDialog(id,reopen=false){
  const note=libraryState.notes.find(x=>x.id===id);if(!note)return;
  libraryDialog('重命名笔记',`<label for="note-name">名称</label><input id="note-name" required maxlength="80" value="${esc(note.name)}">`,dialog=>window.study.renameNote({id,name:dialog.querySelector('#note-name').value}),async state=>{libraryState=state;if(reopen)await renderNote(id);else await refresh(state);});
}
async function deleteNote(id){
  if(!confirm('确定删除这份笔记及其中的文字和图片吗？'))return;
  try{if(activeNoteId===id)await flushNoteEditor();libraryState=await window.study.removeNote(id);noteDrafts.delete(id);await setLibraryView({mode:'knowledge'});notify('笔记已删除');}catch(e){errorMessage(e);}
}
async function renderNote(id){
  nav('knowledge');const version=noteGeneration;
  const note=await window.study.getNote(id);if(version!==noteGeneration)return;
  const state=await window.study.selectFolder({mode:'knowledge',folderId:note.folderId});if(version!==noteGeneration)return;libraryState=state;activeNoteId=id;
  const drafts=noteDrafts.get(id)||new Map();noteDrafts.set(id,drafts);
  view.innerHTML=`<div class="content note-page"><button class="back" id="back-notes">← 返回笔记</button><header class="toolbar"><div><div class="eyebrow">KNOWLEDGE NOTE</div><h1 class="page-title">${esc(note.name)}</h1><p class="subtitle">${esc('知识点 / '+(folderPath(note.folderId).map(x=>x.name).join(' / ')||'全部笔记'))}</p></div><div><button class="btn btn-plain" id="rename-current-note">重命名</button>${note.courseId&&byId(note.courseId)?'<button class="btn btn-plain" id="note-source-course">返回课程</button>':''}</div></header><div class="note-toolbar"><button class="btn btn-primary" id="note-open-canvas">打开笔记画布</button><button class="btn btn-soft" id="note-add-text">＋ 添加文字</button><button class="btn btn-plain" id="note-add-image">添加图片</button>${note.courseId&&byId(note.courseId)?'<button class="btn btn-plain" id="note-capture">▣ 截图笔记</button>':''}<span id="note-save-status" role="status">已自动保存</span><button class="link-button" id="note-retry" hidden>重试保存</button></div><div id="note-entries"></div></div>`;
  const list=document.getElementById('note-entries'),status=document.getElementById('note-save-status'),retry=document.getElementById('note-retry');let timer=0,chain=Promise.resolve();
  async function flush(){
    clearTimeout(timer);const changes=[...drafts];
    chain=chain.catch(()=>{}).then(async()=>{for(const [entryId,text]of changes){await window.study.updateNoteText({id,entryId,text});if(drafts.get(entryId)===text)drafts.delete(entryId);}});
    try{await chain;if(status.isConnected){status.textContent=drafts.size?'等待保存…':'已自动保存';retry.hidden=true;}}
    catch(e){if(status.isConnected){status.textContent='保存失败：'+friendlyError(e);retry.hidden=false;}throw e;}
  }
  flushNoteEditor=flush;retry.onclick=()=>flush().catch(errorMessage);
  const observer=new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting){observer.unobserve(item.target);window.study.noteImage({id,entryId:item.target.dataset.entryId}).then(src=>{if(item.target.isConnected)item.target.src=src;}).catch(e=>{if(status.isConnected)status.textContent='图片载入失败：'+friendlyError(e);});}});
  if(!note.entries.length){const empty=document.createElement('p');empty.className='subtitle note-empty';empty.textContent='添加文字或图片，内容会自动保存。';list.append(empty);}
  for(const entry of note.entries){
    const block=document.createElement('article');block.className='note-block';block.dataset.entryId=entry.id;
    block.innerHTML=`<header><span>${esc(entry.source||'笔记')}</span><div>${entry.type==='text'?'<button class="link-button" data-edit-text>编辑文字</button>':''}<button class="link-button" data-remove-entry>删除</button></div></header>`;
    if(entry.type==='text'){
      const preview=document.createElement('div');preview.className='note-text';const input=document.createElement('textarea');input.className='note-input';input.maxLength=50000;input.rows=5;input.placeholder='输入笔记内容，自动保存';input.value=drafts.get(entry.id)??entry.text;input.hidden=Boolean(input.value);preview.hidden=!input.hidden;StudyMath.setText(preview,input.value);block.append(preview,input);
      block.querySelector('[data-edit-text]').textContent=input.hidden?'编辑文字':'完成编辑';block.querySelector('[data-edit-text]').onclick=event=>{input.hidden=!input.hidden;preview.hidden=!input.hidden;event.currentTarget.textContent=input.hidden?'编辑文字':'完成编辑';if(!input.hidden)input.focus();else{StudyMath.setText(preview,input.value);flush().catch(errorMessage);}};
      input.oninput=()=>{drafts.set(entry.id,input.value);status.textContent='等待保存…';clearTimeout(timer);timer=setTimeout(()=>flush().catch(errorMessage),300);};input.onblur=()=>flush().catch(errorMessage);
    }else if(entry.type==='image'){
      const img=document.createElement('img');img.className='note-image';img.alt='笔记截图';img.dataset.entryId=entry.id;img.loading='lazy';block.append(img);observer.observe(img);
    }
    block.querySelector('[data-remove-entry]').onclick=async()=>{if(!confirm('删除这段笔记内容吗？'))return;try{await flush();await window.study.removeNoteEntry({id,entryId:entry.id});drafts.delete(entry.id);await renderNote(id);}catch(e){errorMessage(e);}};list.append(block);
  }
  async function append(action){try{await flush();await action();await renderNote(id);}catch(e){errorMessage(e);}}
  document.getElementById('note-open-canvas').onclick=()=>append(async()=>{await startCourseMode('note:'+id,'reading');});
  document.getElementById('note-add-text').onclick=()=>append(()=>window.study.appendNoteText({id,text:''}));
  document.getElementById('note-add-image').onclick=async()=>{try{const image=await window.study.chooseImage();if(image)await append(()=>window.study.appendNoteImage({id,image:image.data}));}catch(e){errorMessage(e);}};
  document.getElementById('note-capture')?.addEventListener('click',()=>window.study.captureNote(note.courseId).catch(errorMessage));
  document.getElementById('back-notes').onclick=()=>setLibraryView({mode:'knowledge',folderId:note.folderId});
  document.getElementById('rename-current-note').onclick=()=>renameNoteDialog(id,true);
  document.getElementById('note-source-course')?.addEventListener('click',async()=>{libraryState=await window.study.selectFolder({mode:'study'});renderLesson(note.courseId);});
  disposeNoteEditor=()=>{noteGeneration++;clearTimeout(timer);if(drafts.size)flush().catch(errorMessage);observer.disconnect();activeNoteId=null;disposeNoteEditor=()=>{noteGeneration++;};};
}
window.study.onNoteCaptured(async({noteId})=>{try{libraryState=await window.study.library();if(activeNoteId===noteId){await flushNoteEditor();await renderNote(noteId);}notify('截图已加入笔记');}catch(e){errorMessage(e);}});
