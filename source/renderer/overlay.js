const embedded=new URLSearchParams(location.search).has('embedded');
const chatOnly=()=>embedded||reading();
const content = document.getElementById('content');
let course = null;
let index = 0;
let captured = [];
let responses={},responseSave=Promise.resolve(),responseError=null,moving=false;
const reading=()=>course?.sessionMode==='reading';
const chatScope=()=>reading()?'reading':'exercise';
async function afterResponse(action){if(moving)return;moving=true;try{await responseSave;if(responseError)throw responseError;await action();}catch(e){alert(e.message||String(e));}finally{moving=false;}}
function queueResponse(value){const savedIndex=index,savedSession=course.sessionId;responses[savedIndex]=value;responseError=null;responseSave=responseSave.then(()=>window.study.saveResponse({index:savedIndex,value,sessionId:savedSession})).then(()=>{responseError=null;},e=>{responseError=e;const status=document.getElementById('response-status');if(status)status.textContent=e.message;});}
let mode = 'question';
let messages = [];
let busy = false;
let draft = '';
let desktopMessage = null;
let attachments = [];
let connectionLabel = '正在读取 AI 连接…';
let connectionConfig=null,switchingConnection=false;
let compacting=false,contextStatus='';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function footer() {
  if(chatOnly())return '<footer class="footer reading-footer"><select id="chat-ai-mode" class="ai-mode-select" aria-label="切换 AI 连接" disabled><option>读取连接…</option></select><button class="footer-button" id="capture" '+(busy||attachments.length>=4?'disabled':'')+'>▣ 截图提问</button><button class="footer-button" id="open-writer">✎ 文件与笔记</button></footer>';
  return `<footer class="footer"><button class="footer-button" id="capture" ${busy || (mode === 'chat' && attachments.length >= 4) ? 'disabled' : ''}>${mode === 'chat' ? '▣ 截图提问' : '▣ 截图作答'}</button><button class="footer-button" id="toggle-chat">${mode === 'chat' ? '▤ 返回题目' : '✦ AI 聊天'}</button><button class="footer-button finish" id="finish" ${busy ? 'disabled' : ''}>${index === course.questions.length - 1 ? '完成并提交' : '完成，下一题'}</button></footer>`;
}

function bindFooter() {
  document.getElementById('capture').onclick = async () => {
    await afterResponse(()=>window.study.startCapture(mode === 'chat' ? 'chat' : 'answer'));
  };
  document.getElementById('open-writer')?.addEventListener('click',()=>window.study.openWriter().catch(e=>alert(e.message)));
  if(chatOnly())return;
  document.getElementById('toggle-chat').onclick = () => afterResponse(async () => {
    mode = mode === 'chat' ? 'question' : 'chat';
    draw();
    if (mode === 'chat' && !busy) await loadConnection();
  });
  document.getElementById('finish').onclick = () => afterResponse(()=>window.study.finishSession());
}

function responseMarkup(question) {
  const value=responses[index]||[];
  if(question.type==='choice')return '<div class="response-options">'+question.options.map((option,i)=>'<label class="response-option"><input type="'+(question.multiple?'checkbox':'radio')+'" name="answer-option" value="'+i+'" '+(value.includes(i)?'checked':'')+'><span>'+String.fromCharCode(65+i)+'. <span class="option-text">'+esc(option)+'</span></span></label>').join('')+'</div>';
  if(question.type==='blank')return '<div class="response-blanks">'+(question.blanks||['答案']).map((label,i)=>'<label>'+esc(label)+'<input class="blank-answer" data-blank="'+i+'" aria-label="'+esc(label)+'" value="'+esc(value[i]||'')+'" maxlength="5000" autocomplete="off"></label>').join('')+'</div>';
  return '';
}
function drawQuestion() {
  const question = course.questions[index];
  content.innerHTML = `<div class="body"><div class="course-title">${esc(course.title)}</div><div class="question-count">题目 ${String(index + 1).padStart(2, '0')} / ${String(course.questions.length).padStart(2, '0')}</div><div class="question-scroll"><p class="question-text">${esc(question.text)}</p>${question.image ? `<img class="question-image" src="${question.image}" alt="当前题目图片">` : ''}${responseMarkup(question)}<div id="response-status" role="status"></div></div><div class="page-row"><span class="dots">${index + 1} / ${course.questions.length}</span><div><button class="nav-button" id="prev" ${index === 0 ? 'disabled' : ''}>上一题</button> <button class="nav-button" id="next" ${index === course.questions.length - 1 ? 'disabled' : ''}>下一题</button></div></div>${footer()}</div>`;
  document.getElementById('prev').onclick = () => afterResponse(()=>window.study.navigateQuestion(index - 1));
  document.getElementById('next').onclick = () => afterResponse(()=>window.study.navigateQuestion(index + 1));
  const note = document.createElement('div'); note.className = 'capture-note';
  note.textContent = ['choice','blank'].includes(question.type) ? '作答自动保存；点击完成继续。' : captured.includes(index) ? '本题截图已保存；重新截图会替换。' : (index === course.questions.length - 1 ? '截图后保存本题，进入提交页。' : '截图后自动标记题号，继续下一题。');
  content.querySelector('.page-row').before(note);
  StudyMath.render(content.querySelector('.question-text'));
  content.querySelectorAll('.option-text').forEach(el=>StudyMath.render(el));
  content.querySelectorAll('[name="answer-option"]').forEach(input=>input.onchange=()=>queueResponse([...content.querySelectorAll('[name="answer-option"]:checked')].map(el=>Number(el.value))));
  content.querySelectorAll('.blank-answer').forEach(input=>input.oninput=()=>queueResponse([...content.querySelectorAll('.blank-answer')].map(el=>el.value)));
  bindFooter();
}

function drawChat() {
  const older=historyPage.hasMore?`<button class="desktop-continue history-more" ${loadingHistory||busy?'disabled':''}>加载更早消息</button>`:'';
  const bubbles = messages.map((message) => `<div class="message ${message.role === 'user' ? 'user' : message.error ? 'error' : 'assistant'}">${esc(message.text)}${(message.images || []).map(image=>`<img class="chat-sent-image" src="${esc(image.image)}" alt="已发送截图">`).join('')}</div>`).join('');
  content.innerHTML = `<div class="body"><div class="ai-chat-tools">${chatOnly()?'':'<select id="chat-ai-mode" class="ai-mode-select" aria-label="切换 AI 连接" disabled><option>读取连接…</option></select>'}<button id="chat-compact" class="compact-button" title="压缩发送的上下文，保留本地聊天记录">${compacting?'压缩中…':'压缩上下文'}</button>${['api','chatgpt'].includes(connectionConfig?.mode)?'<button id="chat-reset" class="compact-button" title="清除当前对话的历史上下文和摘要；本地聊天记录保留">清除上下文</button>':''}</div><div class="chat-subtitle" role="status"></div><div class="messages" id="messages">${older}${bubbles || (reading()?'<div class="chat-empty">阅读文件，随时提问。<br>截图可将选中的内容加入提问。</div>':`<div class="chat-empty">在这里输入问题，<br>${chatOnly()?'下方':'左上角'}可切换模型。</div>`)}</div>${desktopMessage && !busy ? '<button class="desktop-continue" id="desktop-continue">复制问题并打开 Codex</button>' : ''}${attachments.length ? `<div class="chat-attachments">${attachments.map((item,i)=>`<div class="chat-attachment"><img src="${esc(item.image)}" alt="截图 ${i+1}"><button data-remove-image="${i}" aria-label="移除截图 ${i+1}" ${busy ? 'disabled' : ''}>×</button></div>`).join('')}</div>` : ''}<div class="chat-compose"><textarea id="chat-input" placeholder="输入你的问题…" ${busy ? 'disabled' : ''}>${esc(draft)}</textarea><div class="ai-compose-actions"><button id="send-message" aria-label="${busy ? '停止等待' : '发送'}" title="${busy ? '停止等待' : '发送'}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${busy ? '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>' : '<path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'}</svg></button></div></div>${footer()}</div>`;
  content.querySelectorAll('[data-remove-image]').forEach(button=>button.onclick=()=>{attachments.splice(Number(button.dataset.removeImage),1);drawChat();});
  const compactButton=document.getElementById('chat-compact');
  if(historyPage.summary)compactButton.title='当前上下文摘要（AI 生成，可对照历史核查）：\n'+historyPage.summary.text;
  compactButton.disabled=busy||loadingHistory||switchingConnection||!connectionConfig;
  compactButton.onclick=async()=>{
    if(busy||loadingHistory||switchingConnection)return;
    busy=true;compacting=true;contextStatus='正在压缩上下文…';drawChat();
    try{const result=await window.study.compactContext({scope:chatScope(),courseId:course.id});contextStatus=result.message;if(result.summary)historyPage.summary=result.summary;}
    catch(e){contextStatus=e.message;}
    finally{busy=false;compacting=false;if(mode==='chat')drawChat();}
  };
  const resetButton=document.getElementById('chat-reset');
  if(resetButton){
    resetButton.disabled=busy||loadingHistory||switchingConnection;
    resetButton.onclick=async()=>{
      if(busy||loadingHistory||switchingConnection)return;
      busy=true;drawChat();
      try{const result=await window.study.clearContext({scope:chatScope(),courseId:course.id});historyPage.summary=null;contextStatus=result.message;}
      catch(e){contextStatus=e.message;}
      finally{busy=false;if(mode==='chat')drawChat();}
    };
  }
  const modeSelect=document.getElementById('chat-ai-mode');
  if(connectionConfig)StudyAI.populate(modeSelect,connectionConfig);
  modeSelect.disabled=busy||switchingConnection||!connectionConfig;
  modeSelect.onchange=async()=>{
    const selectedMode=modeSelect.value;switchingConnection=true;drawChat();
    try{connectionConfig=await window.study.switchAIMode(selectedMode);connectionLabel=StudyAI.label(connectionConfig);}
    catch(e){contextStatus=e.message;}
    finally{switchingConnection=false;if(mode==='chat')drawChat();}
  };
  document.querySelector('.chat-subtitle').textContent = contextStatus;
  content.querySelectorAll('.message').forEach((bubble) => StudyMath.render(bubble));
  content.querySelector('.history-more')?.addEventListener('click',()=>loadHistory(false));
  document.getElementById('messages').onscroll=event=>{const top=event.target.scrollTop;if(top<lastScroll&&top<16&&historyPage.hasMore&&!loadingHistory&&!busy)loadHistory(false);lastScroll=top;};
  document.getElementById('send-message').onclick = () => busy ? window.study.cancelCodex().catch(console.error) : sendMessage();
  document.getElementById('chat-input').oninput = (event) => { draft = event.target.value; };
  if (document.getElementById('desktop-continue')) document.getElementById('desktop-continue').onclick = continueInDesktop;
  document.getElementById('chat-input').onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } };
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;lastScroll=document.getElementById('messages').scrollTop;
  document.getElementById('send-message').disabled=loadingHistory||switchingConnection;
  bindFooter();
}

function draw() {
  if (!course) return;
  if (mode === 'chat') drawChat(); else drawQuestion();
}

let historyPage={hasMore:false,before:null},loadingHistory=false,historyGeneration=0,lastScroll=0;
async function loadHistory(reset=true){
  if(!course||busy||(!reset&&loadingHistory))return;
  const generation=reset?++historyGeneration:historyGeneration;loadingHistory=true;
  const list=document.getElementById('messages'),oldHeight=list?.scrollHeight||0,oldTop=list?.scrollTop||0;
  try{
    const result=await window.study.chatHistory({scope:chatScope(),courseId:course.id,before:reset?undefined:historyPage.before});
    if(generation!==historyGeneration)return;
    messages=reset||result.key!==historyPage.key?result.items:[...result.items,...messages];historyPage=result;
    desktopMessage=messages.findLast(m=>m.pending)?.pending||null;
    if(mode==='chat'){drawChat();if(!reset){const target=document.getElementById('messages');target.scrollTop=oldTop+target.scrollHeight-oldHeight;lastScroll=target.scrollTop;}}
  }catch(e){contextStatus=e.message;if(mode==='chat')drawChat();}
  finally{if(generation===historyGeneration){loadingHistory=false;const send=document.getElementById('send-message');if(send)send.disabled=switchingConnection;const more=content.querySelector('.history-more');if(more)more.disabled=busy;const compact=document.getElementById('chat-compact');if(compact)compact.disabled=busy||switchingConnection||!connectionConfig;const reset=document.getElementById('chat-reset');if(reset)reset.disabled=busy||switchingConnection;}}
}
async function loadConnection(){
  try{const c=await window.study.getAISettings();connectionConfig=c;connectionLabel=StudyAI.label(c);if(mode==='chat')drawChat();await loadHistory(true);}catch(e){contextStatus=e.message;if(mode==='chat')drawChat();}
}
window.study.onAISettings(config=>{contextStatus='';connectionConfig=config;connectionLabel=StudyAI.label(config);historyGeneration++;historyPage={hasMore:false,before:null};messages=[];desktopMessage=null;if(mode==='chat')loadConnection();});

async function sendMessage() {
  if (busy) return;
  const input = document.getElementById('chat-input');
  const text = input?.value.trim() || (attachments.length ? '解释截图中的内容' : '');
  const sentImages = [...attachments];
  if(loadingHistory||switchingConnection)return;
  if (!text) return;
  messages.push({ role: 'user', text, images: sentImages });
  messages.push({ role: 'assistant', text: '正在思考…' });
  draft = '';
  desktopMessage = null;
  busy = true;
  drawChat();
  try {
    const answer = await window.study.askCodex({ question:text, attachmentIds: sentImages.map(item=>item.id) });
    if (answer?.needsDesktop) {
      desktopMessage = answer;
      messages[messages.length - 1].pending = answer;
      messages[messages.length - 1].text = '这个任务正在由 Codex 桌面版管理。请点击下方按钮，在打开的任务中粘贴并发送问题；回复完成后会自动显示在这里。';
    } else messages[messages.length - 1].text = answer;
    attachments = [];
  } catch (error) {
    messages[messages.length - 1] = { role: 'assistant', text: error.message || String(error), error: true };
    draft = text;
  } finally { busy = false; if (mode === 'chat') drawChat(); }
}

async function continueInDesktop() {
  if (!desktopMessage || busy) return;
  busy = true;
  const pending = desktopMessage;
  const target=messages.findLast(m=>m.pending===pending)||messages.at(-1);
  target.text='正在等待 Codex。请在打开的任务中按 Ctrl+V 粘贴问题，再发送。';
  drawChat();
  try {
    target.text = await window.study.continueInCodex(pending);
    delete target.pending;
    desktopMessage = messages.findLast(m=>m.pending)?.pending||null;
  } catch (error) {
    target.text=error.message||String(error);target.error=true;
  } finally { busy = false; if (mode === 'chat') drawChat(); }
}

window.study.onCodexDelta((delta) => {
  if (!busy || !messages.length) return;
  const last = messages[messages.length - 1];
  if (last.text === '正在思考…') last.text = '';
  last.text += delta;
  if (mode === 'chat') {
    const list = document.getElementById('messages');
    const bubble = list?.lastElementChild;
    if (bubble?.classList.contains('assistant')) StudyMath.setText(bubble, last.text);
    if (list) list.scrollTop = list.scrollHeight;
  }
});
window.study.onCodexAnswer((text) => {
  if (!busy || !messages.length) return;
  messages[messages.length - 1].text = text;
  if (mode === 'chat') {
    const list = document.getElementById('messages');
    if (list?.lastElementChild?.classList.contains('assistant')) StudyMath.setText(list.lastElementChild, text);
    if (list) list.scrollTop = list.scrollHeight;
  }
});
window.study.onChatCapture(image=>{attachments.push(image);mode='chat';draw();});
window.study.onCourse((next) => {contextStatus='';historyGeneration++;historyPage={hasMore:false,before:null};loadingHistory=false;attachments=[];messages=[];draft='';desktopMessage=null;course=next;index=0;captured=[];responses={};responseSave=Promise.resolve();responseError=null;mode=chatOnly()?'chat':'question';document.body.classList.toggle('external-exercise',Boolean(next.externalWriter));document.body.classList.toggle('collapsed',Boolean(next.externalWriter));document.getElementById('collapse-exercise').hidden=!next.externalWriter;document.getElementById('close-ai').hidden=!chatOnly();document.querySelector('.dragbar strong').textContent=chatOnly()?'AI 问答':'正在练习';draw();if(chatOnly())loadConnection();});
window.study.onExerciseOverlayExpanded(expanded=>document.body.classList.toggle('collapsed',!expanded));
const exerciseBall=document.getElementById('exercise-ball');let ballDown=null,ballMoved=false;
exerciseBall.onpointerdown=e=>{ballDown={x:e.screenX,y:e.screenY};ballMoved=false;exerciseBall.setPointerCapture(e.pointerId);};
exerciseBall.onpointermove=e=>{if(!ballDown)return;const dx=e.screenX-ballDown.x,dy=e.screenY-ballDown.y;if(Math.abs(dx)+Math.abs(dy)>3)ballMoved=true;if(ballMoved&&(dx||dy)){window.study.moveExerciseOverlay({dx,dy}).catch(()=>{});ballDown={x:e.screenX,y:e.screenY};}};
exerciseBall.onpointerup=()=>{if(!ballMoved)window.study.expandExerciseOverlay(true).catch(e=>alert(e.message));ballDown=null;};
exerciseBall.onpointercancel=()=>{ballDown=null;};
document.getElementById('collapse-exercise').onclick=()=>window.study.expandExerciseOverlay(false).catch(e=>alert(e.message));
window.study.onProgress((progress) => {const changed=index!==progress.index;if(changed)attachments=[];index=progress.index;captured=progress.captured;responses=changed?(progress.responses||{}):{...(progress.responses||{}),...responses};if(changed&&!embedded)draw();});
document.getElementById('back-main').onclick = () => afterResponse(()=>window.study.pauseSession());

window.study.onOpenChat(()=>{document.getElementById('close-ai').hidden=false;if(!course||mode==='chat')return;afterResponse(async()=>{mode='chat';draw();if(!busy)await loadConnection();});});

document.getElementById('close-ai').onclick=()=>window.study.toggleWriterAI({sessionId:course?.sessionId}).catch(e=>alert(e.message));
