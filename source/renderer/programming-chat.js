const $=id=>document.getElementById(id);
let active=null,before=null,busy=false;
const noteCapture=document.createElement('button');noteCapture.textContent='截图笔记';noteCapture.title='保存到课程指定的知识点文件夹';document.querySelector('.chat-extra-actions').prepend(noteCapture);
noteCapture.onclick=async()=>{if(!active)return;try{await window.study.captureNote(active.courseId);}catch(e){status(e.message);}};
window.study.onNoteCaptured(()=>status('截图已加入课程笔记'));
let snippets=[],images=[];
let aiConfig=null;const moreButton=$('load-more');
function setBusy(value){busy=value;StudyChat.sendState($('ask'),value);$('question').disabled=value;for(const id of ['ai-mode','compact','clear-context','submit','screenshot','load-more'])$(id).disabled=value;$('propose').disabled=value||!['api','chatgpt'].includes(aiConfig?.mode);noteCapture.disabled=value;renderContext();}
StudyChat.sendState($('ask'),false);
function status(text){$('status').textContent=text||'';}
function renderContext(){
  $('context-items').replaceChildren();
  for(const [index,item] of snippets.entries()){
    const chip=document.createElement('button');chip.className='context-chip';chip.textContent=`片段 ${index+1} ×`;chip.disabled=busy;chip.title=`${item.file}\n${item.text}`;chip.onclick=()=>{snippets.splice(index,1);renderContext();};$('context-items').append(chip);
  }
  for(const [index,item] of images.entries()){
    const chip=document.createElement('button');chip.className='context-chip';chip.textContent=`截图 ${index+1} ×`;chip.title='点击移除这张截图';chip.onclick=()=>{images.splice(index,1);renderContext();};$('context-items').append(chip);
  }
}
function append(role,text,prepend=false){const node=document.createElement('article');node.className='chat-message '+role;node.textContent=text;$('messages').querySelector('.chat-empty')?.remove();if(prepend)moreButton.after(node);else $('messages').append(node);$('messages').scrollTop=$('messages').scrollHeight;return node;}
async function loadHistory(older=false){
  if(!active||busy)return;const list=$('messages'),oldHeight=list.scrollHeight,oldTop=list.scrollTop;
  const result=await window.study.chatHistory({scope:'programming',courseId:active.courseId,before:older?before:undefined});before=result.nextBefore||null;
  if(!older)list.replaceChildren(moreButton);for(const item of (older?[...result.items].reverse():result.items))append(item.role,item.text,older);moreButton.hidden=!before;
  if(!result.items.length&&!older){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent='在这里输入问题，下方可切换模型。';list.append(empty);}
  if(older)list.scrollTop=oldTop+list.scrollHeight-oldHeight;
}
function renderAIConfig(config){aiConfig=config;StudyAI.populate($('ai-mode'),config);const supported=['api','chatgpt'].includes(config.mode);$('clear-context').hidden=!supported;$('clear-context').disabled=busy||!supported;$('propose').disabled=busy||!supported;$('propose').title=supported?'':'文件修改建议仅支持 API 或 ChatGPT 订阅连接';}
async function initialize(){try{active=await window.study.programmingActive();if(!active){status('请先进入编程课程。');return;}$('course-title').textContent=active.title;renderAIConfig(await window.study.getAISettings());await loadHistory();}catch(e){status(e.message);}}
async function setExpanded(value){try{await window.study.programmingChatToggle(value);}catch(e){status(e.message);}}
window.study.onProgrammingChatMode(value=>{document.body.classList.toggle('expanded',value);if(value)$('question').focus();});
window.study.onProgrammingSnippet(item=>{if(snippets.length>=5){status('每次最多添加 5 个片段。');return;}snippets.push(item);renderContext();});
window.study.onProgrammingCapture(item=>{if(images.length>=4){status('每次最多添加 4 张截图。');return;}images.push(item);renderContext();status('截图已加入 AI 输入。');});
window.study.onAISettings(config=>{renderAIConfig(config);loadHistory().catch(e=>status(e.message));});
let ballDown=null,ballMoved=false;
$('ball').onpointerdown=e=>{ballDown={x:e.screenX,y:e.screenY};ballMoved=false;$('ball').setPointerCapture(e.pointerId);};
$('ball').onpointermove=e=>{if(!ballDown)return;const dx=e.screenX-ballDown.x,dy=e.screenY-ballDown.y;if(Math.abs(dx)+Math.abs(dy)>3)ballMoved=true;if(ballMoved&&(dx||dy)){window.study.programmingChatMove({dx,dy}).catch(()=>{});ballDown={x:e.screenX,y:e.screenY};}};
$('ball').onpointerup=e=>{if(!ballMoved)setExpanded(true);ballDown=null;};
$('collapse').onclick=()=>setExpanded(false);$('load-more').onclick=()=>loadHistory(true).catch(e=>status(e.message));
$('submit').onclick=async()=>{if(!active||busy)return;const button=$('submit');button.disabled=true;try{await window.study.programmingShowSubmission(active.courseId);}catch(e){status(e.message);}finally{button.disabled=false;}};
$('ai-mode').onchange=async()=>{if(busy)return;try{renderAIConfig(await window.study.switchAIMode($('ai-mode').value));await loadHistory();}catch(e){status(e.message);if(aiConfig)$('ai-mode').value=aiConfig.mode;}};
$('compact').onclick=async()=>{if(!active||busy)return;setBusy(true);try{status('正在压缩…');const result=await window.study.compactContext({scope:'programming',courseId:active.courseId});status(result.message);}catch(e){status(e.message);}finally{setBusy(false);}};
$('clear-context').onclick=async()=>{if(!active||busy)return;setBusy(true);try{const result=await window.study.clearContext({scope:'programming',courseId:active.courseId});status(result.message);}catch(e){status(e.message);}finally{setBusy(false);}};
$('screenshot').onclick=async()=>{if(busy)return;if(images.length>=4){status('每次最多添加 4 张截图。');return;}try{await window.study.startCapture('programming-chat');}catch(e){status(e.message);}};
$('ask').onclick=async()=>{if(busy){try{await window.study.cancelAI();}catch(e){status(e.message);}return;}if(!active)return;const question=$('question').value.trim();if(!question)return;setBusy(true);append('user',question);const reply=append('assistant','正在回答…');try{const result=await window.study.programmingAsk({courseId:active.courseId,question,attachmentIds:images.map(x=>x.id),snippets});reply.textContent=typeof result==='string'?result:JSON.stringify(result);$('question').value='';images=[];snippets=[];renderContext();}catch(e){reply.textContent=e.message;}finally{setBusy(false);}};
$('propose').onclick=async()=>{if(busy||!active)return;const instruction=$('question').value.trim();if(!instruction){status('先描述希望 AI 如何修改文件。');return;}setBusy(true);status('正在生成修改建议…');$('proposal').replaceChildren();try{const result=await window.study.programmingPropose({courseId:active.courseId,instruction,attachmentIds:images.map(x=>x.id),snippets});const title=document.createElement('h3');title.textContent=`修改建议 · ${result.changes.length} 个文件`;$('proposal').append(title);for(const change of result.changes){const details=document.createElement('details');details.open=true;const summary=document.createElement('summary');summary.textContent=change.path;details.append(summary);for(const [label,content] of [['修改前',change.before],['修改后',change.after]]){const head=document.createElement('strong');head.textContent=label;const pre=document.createElement('pre');pre.textContent=content;details.append(head,pre);}$('proposal').append(details);}const row=document.createElement('div');row.className='review-actions';const cancel=document.createElement('button');cancel.textContent='放弃';cancel.onclick=()=>$('proposal').replaceChildren();const apply=document.createElement('button');apply.textContent='确认写入这些文件';apply.onclick=async()=>{apply.disabled=true;try{await window.study.programmingApply(result.token);$('proposal').replaceChildren();status('已写入工作区；外部编程软件如已打开文件，请重新加载后再编辑。');}catch(e){status(e.message);apply.disabled=false;}};row.append(cancel,apply);$('proposal').append(row);status('请逐个检查修改前后内容，再确认写入。');images=[];snippets=[];renderContext();}catch(e){status(e.message);}finally{setBusy(false);}};
$('question').onkeydown=event=>StudyChat.enterToSend(event,()=>$('ask').click());
initialize();
