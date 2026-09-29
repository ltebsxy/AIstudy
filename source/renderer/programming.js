// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
function drawProgrammingEditor(){
  const editing=Boolean(draft.id),programming=draft.programming||{files:[],entryFile:'',editorPath:''};
  draft.programming=programming;
  view.innerHTML=`<div class="content"><button class="back" id="back-home">← 返回课程列表</button><header class="toolbar"><div><div class="eyebrow">PROGRAMMING COURSE</div><h1 class="page-title">${editing?'编辑编程课程':'新建编程课程'}</h1><p class="subtitle">题目写在课程文件的注释里；练习时复制到独立工作区。</p></div></header><div class="editor-card"><div class="form-grid">${editing?'':`<div class="field"><label for="course-kind">课程类别</label><select id="course-kind"><option value="standard">普通课程</option><option value="programming" selected>编程课程</option></select></div>`}<div class="field"><label for="course-title">课程名称</label><input id="course-title" maxlength="80" value="${esc(draft.title)}"></div><div class="field"><label for="course-description">一句话简介</label><input id="course-description" maxlength="240" value="${esc(draft.description)}"></div><div class="field"><label for="knowledge">知识点介绍</label><textarea id="knowledge">${esc(draft.knowledge)}</textarea></div></div><label class="knowledge-format"><input type="checkbox" id="knowledge-sections" ${draft.knowledgeFormat==='sections'?'checked':''}>按小节阅读（用单独一行“## 小节标题”分段）</label><div class="divider"></div><div class="field-header"><h3>课程文件</h3><button class="btn btn-soft" id="choose-programming-folder">选择文件夹</button></div><p class="subtitle">文件夹内的代码与题目注释会一起保存到课程；支持 UTF-8 文本文件。</p><div class="programming-file-list">${programming.files.length?programming.files.map(file=>`<div>▤ ${esc(file.path)}</div>`).join(''):'尚未选择文件夹'}</div><div class="field"><label for="programming-entry">入口文件</label><select id="programming-entry">${programming.files.map(file=>`<option value="${esc(file.path)}" ${file.path===programming.entryFile?'selected':''}>${esc(file.path)}</option>`).join('')}</select></div><div class="field"><label>编程程序（可选）</label><div class="file-row"><button class="btn btn-plain" id="choose-programming-editor">选择 .exe</button><span class="filename">${esc(programming.editorPath||'未指定；按文件类型打开关联的编辑程序')}</span>${programming.editorPath?'<button class="link-button" id="clear-programming-editor">移除</button>':''}</div></div><div class="editor-actions">${editing?'<button class="btn btn-danger" id="delete-course">删除课程</button>':''}<button class="btn btn-plain" id="cancel-edit">取消</button><button class="btn btn-primary" id="save-course">保存课程</button></div></div></div>`;
  StudyMath.editor(document.getElementById('knowledge'));
  document.getElementById('back-home').onclick=renderHome;
  document.getElementById('cancel-edit').onclick=renderHome;
  document.getElementById('course-kind')?.addEventListener('change',()=>{syncEditor();draft.kind='standard';draft.questions=[{text:'',image:''}];drawEditor();});
  document.getElementById('choose-programming-folder').onclick=async()=>{try{syncEditor();const files=await window.study.chooseProgrammingFolder();if(files){draft.programming.files=files;draft.programming.entryFile=files[0].path;drawProgrammingEditor();}}catch(e){errorMessage(e);}};
  document.getElementById('choose-programming-editor').onclick=async()=>{try{syncEditor();const file=await window.study.chooseWorkApp();if(file){draft.programming.editorPath=file;drawProgrammingEditor();}}catch(e){errorMessage(e);}};
  document.getElementById('clear-programming-editor')?.addEventListener('click',()=>{syncEditor();draft.programming.editorPath='';drawProgrammingEditor();});
  document.getElementById('save-course').onclick=async()=>{try{syncEditor();const saved=await window.study.saveCourse(draft);if(!draft.id)await window.study.assignFolder({kind:'course',id:saved.id,...libraryLocation()});await window.study.selectFolder({...libraryLocation(),mode:'study'});await refresh();notify('编程课程已保存。');}catch(e){errorMessage(e);}};
  document.getElementById('delete-course')?.addEventListener('click',async()=>{if(!confirm('确定删除课程吗？已有练习工作区会保留，可在设置中清理。'))return;try{await window.study.deleteCourse(draft.id);await refresh();notify('课程已删除。');}catch(e){errorMessage(e);}});
}

let openingProgramming=false;
async function renderProgrammingWorkspace(id){
  const course=byId(id);if(!course||course.kind!=='programming')return renderHome();
  if(openingProgramming)return;
  openingProgramming=true;
  const button=document.getElementById('finish-lesson');if(button){button.disabled=true;button.textContent='正在打开工作区…';}
  try{await window.study.startProgramming(id);await window.study.openProgrammingExternal(id);}
  catch(e){errorMessage(e);}
  finally{openingProgramming=false;if(button?.isConnected){button.disabled=false;button.textContent='完成，进入编程练习 →';}}
}
function renderProgrammingSubmission(id,preview){
  const files=preview.files;
  const course=byId(id);if(!course)return renderHome();
  view.innerHTML=`<div class="content programming-submission"><button class="back" id="programming-resume">← 返回练习</button><header class="toolbar"><div><div class="eyebrow">REVIEW SUBMISSION</div><h1 class="page-title">确认提交 · ${esc(course.title)}</h1><p class="subtitle">请先在外部程序保存，再检查以下文件；提交后会保存一份独立快照。</p></div></header><div class="editor-card"><p>共 ${files.length} 个文件</p>${files.map(file=>`<details><summary>${esc(file.path)}</summary><pre>${esc(file.content)}</pre></details>`).join('')}<div class="editor-actions"><button class="btn btn-plain" id="programming-leave">结束练习</button><button class="btn btn-primary" id="programming-confirm">确认提交</button></div></div></div>`;
  document.getElementById('programming-resume').onclick=()=>renderProgrammingWorkspace(id);
  document.getElementById('programming-leave').onclick=async()=>{try{await window.study.programmingLeave(id);renderLesson(id);}catch(e){errorMessage(e);}};
  document.getElementById('programming-confirm').onclick=async()=>{const button=document.getElementById('programming-confirm');button.disabled=true;try{const folder=await window.study.programmingSubmit({id,token:preview.token});view.innerHTML=`<div class="content"><h1 class="page-title">已保存提交快照</h1><p>位置：${esc(folder)}</p><div class="programming-toolbar"><button class="btn btn-plain" id="programming-open-submission">打开文件夹</button><button class="btn btn-plain" id="programming-leave">结束练习</button><button class="btn btn-primary" id="programming-done">继续练习</button></div></div>`;document.getElementById('programming-open-submission').onclick=()=>window.study.openFolder(folder).catch(errorMessage);document.getElementById('programming-leave').onclick=async()=>{try{await window.study.programmingLeave(id);renderLesson(id);}catch(e){errorMessage(e);}};document.getElementById('programming-done').onclick=()=>renderProgrammingWorkspace(id);}catch(e){errorMessage(e);button.disabled=false;}};
}
window.study.onProgrammingSubmission(({id,preview})=>renderProgrammingSubmission(id,preview));
