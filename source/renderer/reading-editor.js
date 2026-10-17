// SPDX-License-Identifier: GPL-3.0-only
function readingNoteOptions(selected=''){
  return '<option value="">自动使用此文件的阅读笔记</option>'+libraryState.notes.map(n=>`<option value="${esc(n.id)}" ${n.id===selected?'selected':''}>${esc([...folderPath(n.folderId).map(f=>f.name),n.name].join(' / '))}</option>`).join('');
}
async function renderReadingEditor(id){
  const doc=await window.study.editReading(id);nav('home');let replacement=null;
  view.innerHTML=`<div class="content"><button class="back" id="reading-back">← 返回读写列表</button><header class="toolbar"><div><div class="eyebrow">READING DOCUMENT</div><h1 class="page-title">编辑读写文件</h1></div></header><div class="editor-card"><div class="form-grid"><div class="field"><label for="reading-name">文件名称</label><input id="reading-name" maxlength="160" value="${esc(doc.name)}"></div><div class="field"><label for="reading-description">一句话简介 <span class="hint">可选</span></label><input id="reading-description" maxlength="240" value="${esc(doc.description||'')}"></div><div class="field"><label for="reading-kind">阅读模式</label><select id="reading-kind"><option value="standard">普通读写</option><option value="english">英语阅读模式</option></select></div><div class="field"><label for="reading-note">默认保存到笔记</label><select id="reading-note">${readingNoteOptions(doc.destination.noteId)}</select><p class="target-help">截图、选取文字和词语释义追加到所选笔记。</p></div><div class="field" id="reading-folder-field"><label for="reading-note-folder">自动创建笔记的位置</label><select id="reading-note-folder">${noteFolderOptions()}</select></div>${doc.text!==undefined?`<div class="field reading-body-field"><label for="reading-body">正文</label><textarea id="reading-body" spellcheck="false">${esc(doc.text)}</textarea></div>`:''}</div><div class="divider"></div><div class="field"><label>原文文件</label><div class="file-row"><button class="btn btn-plain" id="reading-replace">更换文件</button><span class="filename" id="reading-filename">${esc(doc.name)}</span><button class="link-button" id="reading-replace-cancel" hidden>取消更换</button></div><p class="target-help">PDF 和图片可通过更换文件更新。已有笔记与手写批注会保留；更换正文后可自行检查批注位置。</p></div><p id="reading-error" role="status"></p><div class="editor-actions"><button class="btn btn-danger" id="reading-delete">删除文件</button><button class="btn btn-plain" id="reading-cancel">取消</button><button class="btn btn-primary" id="reading-save">保存文件</button></div></div></div>`;
  const get=id=>document.getElementById(id);
  if(doc.history?.length){
    const section=document.createElement('div');section.className='field';section.innerHTML='<label for="reading-history">历史版本</label><div class="file-row"><select id="reading-history"></select><button class="btn btn-plain" id="restore-reading">恢复版本</button></div><p class="target-help">保留原始副本与最多 5 份历史版本（历史合计上限 20 MB）。恢复前请先保存当前编辑。</p>';
    get('reading-error').before(section);const select=section.querySelector('select');
    for(const version of doc.history)select.add(new Option(version.label+' · '+new Date(version.updatedAt).toLocaleString(),version.relativeFile));
    section.querySelector('button').onclick=async event=>{if(!confirm('恢复所选版本？当前编辑页尚未保存的改动将放弃。'))return;const button=event.currentTarget;button.disabled=true;try{libraryState=await window.study.restoreReading({id,relativeFile:select.value});await renderReadingEditor(id);notify('已恢复所选版本');}catch(e){errorMessage(e);}finally{button.disabled=false;}};
  }

  get('reading-kind').value=doc.readingMode||'standard';get('reading-note-folder').value=doc.destination.folderId||'';
  const target=()=>get('reading-folder-field').hidden=Boolean(get('reading-note').value);get('reading-note').onchange=target;target();
  const back=()=>setLibraryView({mode:'reading',folderId:doc.folderId});get('reading-back').onclick=back;get('reading-cancel').onclick=back;
  get('reading-replace').onclick=async()=>{try{const file=await window.study.chooseReadingFile();if(!file)return;replacement=file;get('reading-filename').textContent=file.split(/[\\/]/).pop();get('reading-replace-cancel').hidden=false;if(get('reading-body'))get('reading-body').disabled=true;}catch(e){errorMessage(e);}};
  get('reading-replace-cancel').onclick=()=>{replacement=null;get('reading-filename').textContent=doc.name;get('reading-replace-cancel').hidden=true;if(get('reading-body'))get('reading-body').disabled=false;};
  get('reading-save').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;get('reading-error').textContent='';
    try{libraryState=await window.study.saveReading({id,name:get('reading-name').value,description:get('reading-description').value,readingMode:get('reading-kind').value,noteId:get('reading-note').value,folderId:get('reading-note-folder').value,replacement,...(!replacement&&get('reading-body')&&get('reading-body').value!==doc.text?{text:get('reading-body').value}:{})});await back();notify('读写文件已保存');}
    catch(e){get('reading-error').textContent=friendlyError(e);}finally{button.disabled=false;}
  };
  get('reading-delete').onclick=async()=>{if(!confirm('从读写列表删除此文件？已保存的笔记会保留。'))return;try{libraryState=await window.study.removeReading(id);await back();}catch(e){errorMessage(e);}};
}
window.study.onReadingEditor(async({id})=>{try{libraryState=await window.study.library();if(id.startsWith('note:'))await renderNote(id.slice(5));else if(id.startsWith('document:'))await renderReadingEditor(id.slice(9));}catch(e){errorMessage(e);}});
