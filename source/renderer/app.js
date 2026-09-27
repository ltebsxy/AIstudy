const view = document.getElementById('view');
const toast = document.getElementById('toast');
let courses = [];
let courseRevision=null,refreshGeneration=0,openingSession=false;
let libraryState = null;
let draft = null;
let currentCourseId = null;
let answerFile = '';
let targetDrafts = {};
let toastTimer;
let lastSessionMode = 'exercise';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byId = (id) => courses.find((course) => course.id === id);
function notify(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500); }
function nav(which) { disposeLessonChat(); document.getElementById('nav-home').classList.toggle('active', which === 'home'); document.getElementById('nav-settings').classList.toggle('active',which==='settings'); }
function friendlyError(error) { return (error?.message || String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
function errorMessage(error) { notify(friendlyError(error)); }

async function refresh(nextLibrary) {
  const generation=++refreshGeneration;
  const [result,folders]=await Promise.all([window.study.syncCourses(courseRevision),nextLibrary||window.study.library()]);
  if(generation!==refreshGeneration)return;
  if(result.courses!==null)courses=result.courses;courseRevision=result.revision;libraryState=folders;renderHome();
}

function questionMarkup(question, index) {
  const type = question.type || 'written';
  const controls = type === 'choice' ? `<div class="field"><label>选项（每行一个，不必填写 A、B 编号）</label><textarea class="question-options" rows="4" placeholder="第一个选项&#10;第二个选项">${esc((question.options || ['', '']).join('\n'))}</textarea><label class="question-multiple-label"><input type="checkbox" class="question-multiple" ${question.multiple ? 'checked' : ''}>允许多选</label></div>` : type === 'blank' ? `<div class="field"><label>填空标签（每行一个，按题干顺序）</label><textarea class="question-blanks" rows="2" placeholder="第 1 空&#10;第 2 空">${esc((question.blanks || ['答案']).join('\n'))}</textarea></div>` : '';
  return `<div class="question-editor" data-index="${index}"><div class="question-head"><span>题目 ${String(index + 1).padStart(2, '0')}</span><select class="question-type" aria-label="第 ${index + 1} 题类型">${[['written','解答题'],['choice','选择题'],['blank','填空题']].map(([value,label])=>`<option value="${value}" ${type===value?'selected':''}>${label}</option>`).join('')}</select><button class="icon-button remove-question" title="删除题目">×</button></div><div class="field"><textarea class="question-text" placeholder="输入题目内容，支持文字与图片">${esc(question.text)}</textarea></div>${controls}<div class="image-row"><button class="btn btn-plain choose-image">${question.image ? '更换图片' : '＋ 添加图片'}</button>${question.image ? `<img class="image-preview" src="${question.image}" alt="题目图片"><button class="link-button clear-image">移除</button>` : '<span class="filename">可选；PNG / JPG / WebP / GIF</span>'}</div></div>`;
}
function renderEditor(id) {
  nav('editor');
  draft = id ? structuredClone(byId(id)) : { title: '', description: '', knowledge: '', questions: [{ text: '', image: '' }], workTarget: { type: 'default' } };
  draft.workTarget ||= { type: 'file', filePath: draft.workFile || '' };
  delete draft.workFile;
  targetDrafts = { [draft.workTarget.type]: structuredClone(draft.workTarget) };
  drawEditor();
}
function syncEditor() {
  if (!draft) return;
  draft.title = document.getElementById('course-title')?.value ?? draft.title;
  draft.description = document.getElementById('course-description')?.value ?? draft.description;
  draft.knowledge = document.getElementById('knowledge')?.value ?? draft.knowledge;
  draft.knowledgeFormat = document.getElementById('knowledge-sections')?.checked ? 'sections' : undefined;
  if (draft.workTarget.type === 'onenote') draft.workTarget.url = document.getElementById('onenote-url')?.value ?? draft.workTarget.url;
  view.querySelectorAll('.question-editor').forEach((row) => {
    const question = draft.questions[Number(row.dataset.index)];
    question.text = row.querySelector('.question-text').value;
    question.type = row.querySelector('.question-type').value;
    if (row.querySelector('.question-options')) question.options = row.querySelector('.question-options').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if (row.querySelector('.question-multiple')) question.multiple = row.querySelector('.question-multiple').checked;
    if (row.querySelector('.question-blanks')) question.blanks = row.querySelector('.question-blanks').value.split('\n').map(s=>s.trim()).filter(Boolean);
  });
}
function workTargetMarkup() {
  const target = draft.workTarget;
  const tabs = [['default', '使用默认程序'], ['builtin', '内置写字板'], ['file', '默认应用打开文件'], ['onenote', 'OneNote'], ['app', '指定程序']].map(([type, label]) => `<button type="button" class="target-tab ${target.type === type ? 'selected' : ''}" data-type="${type}">${label}</button>`).join('');
  let details;
  if (target.type === 'default') {
    details = '<p class="target-help">使用设置中的默认写字程序；未配置时使用内置写字板。</p>';
  } else if (target.type === 'builtin') {
    details = '<p class="target-help">直接使用内置写字板，支持手写、橡皮、撤销和自动保存。未设置外部工具时默认使用。</p>';
  } else if (target.type === 'onenote') {
    details = `<div class="field"><label for="onenote-url">OneNote 页面链接</label><input id="onenote-url" placeholder="onenote:https://..." value="${esc(target.url || '')}"><p class="target-help">在 OneNote 中右键页面，选择“复制指向页面的链接”，粘贴以 onenote: 开头的客户端链接。</p></div>`;
  } else if (target.type === 'app') {
    details = `<div class="field"><label>做题程序</label><div class="file-row"><button class="btn btn-plain" id="choose-app">选择 .exe 程序</button><span class="filename">${esc(target.appPath || '尚未选择')}</span>${target.appPath ? '<button class="link-button" id="clear-app">移除</button>' : ''}</div></div><div class="field target-extra"><label>交给程序打开的文件 <span class="hint">可选</span></label><div class="file-row"><button class="btn btn-plain" id="choose-app-file">选择文件</button><span class="filename">${esc(target.filePath || '尚未选择')}</span>${target.filePath ? '<button class="link-button" id="clear-app-file">移除</button>' : ''}</div></div>`;
  } else {
    details = `<div class="field"><label>做题文件 <span class="hint">用 Windows 默认关联程序打开</span></label><div class="file-row"><button class="btn btn-plain" id="choose-work">选择文件</button><span class="filename">${esc(target.filePath || '尚未选择')}</span>${target.filePath ? '<button class="link-button" id="clear-work">移除</button>' : ''}</div></div>`;
  }
  return `<div class="field-header"><h3>做题软件</h3></div><p class="subtitle">为这份课程选择做题时打开的位置。</p><div class="target-tabs">${tabs}</div><div class="target-detail">${details}</div>`;
}
function drawEditor() {
  const editing = Boolean(draft.id);
  view.innerHTML = `<div class="content"><button class="back" id="back-home">← 返回课程列表</button><header class="toolbar"><div><div class="eyebrow">CREATE YOUR LEARNING PATH</div><h1 class="page-title">${editing ? '编辑课程' : '新建课程'}</h1><p class="subtitle">只需要知识点、题目和一份做题文件。</p></div></header><div class="editor-card"><div class="form-grid"><div class="field"><label for="course-title">课程名称</label><input id="course-title" maxlength="80" placeholder="例如：一元二次方程" value="${esc(draft.title)}"></div><div class="field"><label for="course-description">一句话简介 <span class="hint">可选</span></label><input id="course-description" maxlength="240" placeholder="简要介绍这个课程" value="${esc(draft.description)}"></div><div class="field"><label for="knowledge">知识点介绍</label><textarea id="knowledge" placeholder="在这里写入这节课需要掌握的知识点">${esc(draft.knowledge)}</textarea></div></div><div class="divider"></div><div class="field-header"><h3>练习题目</h3><button class="btn btn-soft" id="add-question">＋ 添加题目</button></div><p class="subtitle">每题可以输入文字，也可以添加一张图片。</p><div id="question-list">${draft.questions.map(questionMarkup).join('')}</div><div class="divider"></div><div class="field"><label>做题时打开的文件 <span class="hint">可选，可选择 PDF 或 Goodnotes 已关联的文件</span></label><div class="file-row"><button class="btn btn-plain" id="choose-work">选择文件</button><span class="filename" id="work-filename">${esc(draft.workFile || '尚未选择')}</span>${draft.workFile ? '<button class="link-button" id="clear-work">移除</button>' : ''}</div></div><div class="editor-actions">${editing ? '<button class="btn btn-danger" id="delete-course">删除课程</button>' : ''}<button class="btn btn-plain" id="cancel-edit">取消</button><button class="btn btn-primary" id="save-course">保存课程</button></div></div></div>`;
  document.getElementById('choose-work').closest('.field').outerHTML = workTargetMarkup();
  const format = document.createElement('label');
  format.className = 'knowledge-format';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.id = 'knowledge-sections'; checkbox.checked = draft.knowledgeFormat === 'sections';
  format.append(checkbox, '按小节阅读（用单独一行“## 小节标题”分段）');
  document.getElementById('knowledge').after(format);
  StudyMath.editor(document.getElementById('knowledge'));
  view.querySelectorAll('.question-editor textarea').forEach((textarea) => StudyMath.editor(textarea));
  if (editing) {
    const hint = document.createElement('p'); hint.className = 'target-help';
    hint.textContent = '已有批改参考会随原题保留；修改题干、图片或题型选项后，该题旧参考将清除。';
    document.getElementById('question-list').before(hint);
  }
  view.querySelector('.toolbar .subtitle').textContent = '添加知识点与题目，并选择做题软件。';
  document.getElementById('back-home').onclick = renderHome;
  document.getElementById('cancel-edit').onclick = renderHome;
  document.getElementById('add-question').onclick = () => { syncEditor(); draft.questions.push({ text: '', image: '' }); drawEditor(); };
  view.querySelectorAll('.target-tab').forEach((button) => button.onclick = () => {
    syncEditor();
    targetDrafts[draft.workTarget.type] = structuredClone(draft.workTarget);
    const type = button.dataset.type;
    draft.workTarget = targetDrafts[type] || (type === 'onenote' ? { type, url: '' } : type === 'app' ? { type, appPath: '', filePath: '' } : { type, filePath: '' });
    drawEditor();
  });
  document.getElementById('choose-work')?.addEventListener('click', async () => { try { syncEditor(); const file = await window.study.chooseWorkFile(); if (file) { draft.workTarget.filePath = file; drawEditor(); } } catch (e) { errorMessage(e); } });
  document.getElementById('clear-work')?.addEventListener('click', () => { syncEditor(); draft.workTarget.filePath = ''; drawEditor(); });
  document.getElementById('choose-app')?.addEventListener('click', async () => { try { syncEditor(); const file = await window.study.chooseWorkApp(); if (file) { draft.workTarget.appPath = file; drawEditor(); } } catch (e) { errorMessage(e); } });
  document.getElementById('clear-app')?.addEventListener('click', () => { syncEditor(); draft.workTarget.appPath = ''; drawEditor(); });
  document.getElementById('choose-app-file')?.addEventListener('click', async () => { try { syncEditor(); const file = await window.study.chooseWorkFile(); if (file) { draft.workTarget.filePath = file; drawEditor(); } } catch (e) { errorMessage(e); } });
  document.getElementById('clear-app-file')?.addEventListener('click', () => { syncEditor(); draft.workTarget.filePath = ''; drawEditor(); });
  document.getElementById('save-course').onclick = async () => { try { syncEditor(); const saved=await window.study.saveCourse(draft); if(!draft.id)await window.study.assignFolder({kind:'course',id:saved.id,...libraryLocation()}); await window.study.selectFolder({...libraryLocation(),mode:'study'}); await refresh(); notify('课程已保存。'); } catch (e) { errorMessage(e); } };
  document.getElementById('delete-course')?.addEventListener('click', async () => { if (!confirm('确定删除这个课程和其中的题目吗？')) return; try { await window.study.deleteCourse(draft.id); await refresh(); notify('课程已删除。'); } catch (e) { errorMessage(e); } });
  view.querySelectorAll('.question-editor').forEach((row) => {
    const index = Number(row.dataset.index);
    row.querySelector('.question-type').onchange = () => { syncEditor(); drawEditor(); };
    row.querySelector('.remove-question').onclick = () => { syncEditor(); draft.questions.splice(index, 1); if (!draft.questions.length) draft.questions.push({ text: '', image: '' }); drawEditor(); };
    row.querySelector('.choose-image').onclick = async () => { try { syncEditor(); const image = await window.study.chooseImage(); if (image) { draft.questions[index].image = image.data; drawEditor(); } } catch (e) { errorMessage(e); } };
    row.querySelector('.clear-image')?.addEventListener('click', () => { syncEditor(); draft.questions[index].image = ''; drawEditor(); });
  });
}

function renderLesson(id) {
  const course = byId(id); if (!course) return renderHome();
  currentCourseId = id; nav('home');
  view.innerHTML = `<div class="content"><button class="back" id="back-home">← 返回课程列表</button><header class="toolbar"><div><div class="eyebrow">STEP 01 / KNOWLEDGE</div><h1 class="page-title">${esc(course.title)}</h1><p class="subtitle">先理解知识点，再动手练习。</p></div></header><div class="lesson-layout"><article class="lesson-card"><div class="eyebrow">知识点介绍</div><div class="lesson-content">${esc(course.knowledge)}</div><div class="lesson-meta"><button class="btn btn-primary" id="finish-lesson">完成，开始做题 →</button></div></article><aside class="side-note"><div class="number">${String(course.questions.length).padStart(2, '0')}</div><h3>道练习题</h3><p>完成阅读后，右下角会出现题目悬浮窗。你可以在其他应用中作答。</p></aside></div></div>`;
  document.getElementById('back-home').onclick = renderHome;
  document.getElementById('finish-lesson').onclick = () => startCourseMode(id, 'exercise');
  setupLessonChat(course);
  setupLessonReader(course);
}

async function startCourseMode(id, mode) {
  if(openingSession)return;openingSession=true;
  const buttons=[...view.querySelectorAll('.read-document,#finish-lesson')],labels=buttons.map(b=>[...b.childNodes]);
  for(const b of buttons)b.disabled=true;
  const current=buttons.find(b=>b.id==='finish-lesson'||'document:'+b.dataset.id===id);if(current){current.textContent='正在打开…';current.setAttribute('aria-busy','true');}
  try {
    const result = await window.study.startSession(id, mode);
    if (result?.cancelled) return;
    currentCourseId = result.courseId || id; lastSessionMode = mode;
    if (result?.warning) notify(result.warning);
  } catch (e) { errorMessage(e); }
  finally{openingSession=false;buttons.forEach((b,i)=>{b.disabled=false;b.replaceChildren(...labels[i]);b.removeAttribute('aria-busy');});}
}

document.getElementById('nav-home').onclick = () => setLibraryView({mode:'study'});
window.study.onSubmit((id, options) => renderSubmit(id, options));
window.study.onPaused((state) => {
  const mode = state?.mode || lastSessionMode;
  if (state?.courseId) currentCourseId = state.courseId;
  notify(mode === 'reading' ? '读写已暂停。' : '练习已暂停，作答已保留。');
  const button = document.getElementById(mode === 'reading' ? 'start-reading' : 'finish-lesson');
  if (button) { button.textContent = mode === 'reading' ? '继续读写 →' : '继续做题 →'; button.onclick = () => window.study.resumeSession().catch(errorMessage); }
  else {
    document.getElementById('resume-session')?.remove();
    const resume = document.createElement('button'); resume.id = 'resume-session'; resume.className = 'btn btn-soft'; resume.textContent = mode === 'reading' ? '继续读写 →' : '继续做题 →';
    resume.onclick = () => window.study.resumeSession().catch(errorMessage); view.querySelector('.toolbar')?.append(resume);
  }
});
function loadHome(){
  view.innerHTML='<div class="content loading-state" role="status">正在加载学习空间…</div>';
  refresh().catch(e=>{view.innerHTML='<div class="content loading-state"><p role="alert">学习空间加载失败，请重试。</p><button class="btn btn-soft" id="retry-home">重新加载</button></div>';document.getElementById('retry-home').onclick=loadHome;errorMessage(e);});
}
loadHome();

document.getElementById('nav-settings').onclick=()=>renderSettings();
window.study.onOpenSettings(options=>renderSettings(options));
const sidebarToggle=document.getElementById('sidebar-toggle');
function setSidebar(collapsed){document.body.classList.toggle('sidebar-collapsed',collapsed);sidebarToggle.setAttribute('aria-expanded',String(!collapsed));sidebarToggle.setAttribute('aria-label',collapsed?'展开侧边栏':'收起侧边栏');sidebarToggle.title=collapsed?'展开侧边栏':'收起侧边栏';try{localStorage.setItem('sidebar-collapsed',String(collapsed));}catch{}}
try{setSidebar(localStorage.getItem('sidebar-collapsed')==='true');}catch{}
sidebarToggle.onclick=()=>setSidebar(!document.body.classList.contains('sidebar-collapsed'));
