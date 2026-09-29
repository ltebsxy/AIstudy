const $=id=>document.getElementById(id);
let active=null,before=null,busy=false;
let snippets=[],images=[];
let aiConfig=null;
function status(text){$('status').textContent=text||'';}
function renderContext(){
  $('context-items').replaceChildren();
  for(const [index,item] of snippets.entries()){
    const chip=document.createElement('button');chip.className='context-chip';chip.textContent=`片段 ${index+1} ×`;chip.title=`${item.file}\n${item.text}`;chip.onclick=()=>{snippets.splice(index,1);renderContext();};$('context-items').append(chip);
  }
  for(const [index,item] of images.entries()){
    const chip=document.createElement('button');chip.className='context-chip';chip.textContent=`截图 ${index+1} ×`;chip.title='点击移除这张截图';chip.onclick=()=>{images.splice(index,1);renderContext();};$('context-items').append(chip);
  }
}
function append(role,text,prepend=false){const node=document.createElement('article');node.className=role;node.textContent=text;if(prepend)$('messages').prepend(node);else $('messages').append(node);$('messages').scrollTop=$('messages').scrollHeight;return node;}
async function loadHistory(older=false){if(!active)return;const result=await window.study.chatHistory({scope:'programming',courseId:active.courseId,before:older?before:undefined});before=result.nextBefore||null;if(!older)$('messages').replaceChildren();for(const item of (older?[...result.items].reverse():result.items))append(item.role,item.text,older);$('load-more').hidden=!before;}
function renderAIConfig(config){aiConfig=config;const select=$('ai-mode');select.replaceChildren(new Option(config.api.model||'API','api'),new Option(config.harness.kind==='codex'?'Codex':config.harness.name||'Harness','harness'));select.value=config.mode;$('clear-context').disabled=config.mode!=='api';$('propose').disabled=config.mode!=='api';$('propose').title=config.mode==='api'?'':'文件修改建议仅支持 API 连接';}
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
$('submit').onclick=async()=>{if(!active||busy)return;const button=$('submit');button.disabled=true;try{await window.study.programmingShowSubmission(active.courseId);}catch(e){status(e.message);button.disabled=false;}};
$('ai-mode').onchange=async()=>{try{renderAIConfig(await window.study.switchAIMode($('ai-mode').value));await loadHistory();}catch(e){status(e.message);if(aiConfig)$('ai-mode').value=aiConfig.mode;}};
$('compact').onclick=async()=>{if(!active||busy)return;try{status('正在压缩…');const result=await window.study.compactContext({scope:'programming',courseId:active.courseId});status(result.message);}catch(e){status(e.message);}};
$('clear-context').onclick=async()=>{if(!active||busy)return;try{const result=await window.study.clearContext({scope:'programming',courseId:active.courseId});status(result.message);}catch(e){status(e.message);}};
$('screenshot').onclick=async()=>{if(images.length>=4){status('每次最多添加 4 张截图。');return;}try{await window.study.startCapture('programming-chat');}catch(e){status(e.message);}};
$('ask').onclick=async()=>{if(busy||!active)return;const question=$('question').value.trim();if(!question)return;busy=true;$('ask').disabled=true;$('propose').disabled=true;append('user',question);const reply=append('assistant','正在回答…');try{const result=await window.study.programmingAsk({courseId:active.courseId,question,attachmentIds:images.map(x=>x.id),snippets});reply.textContent=typeof result==='string'?result:result?.needsDesktop?'当前 Codex 桌面任务占用中，请在 Codex 中继续。':JSON.stringify(result);$('question').value='';images=[];snippets=[];renderContext();}catch(e){reply.textContent=e.message;}finally{busy=false;$('ask').disabled=false;$('propose').disabled=aiConfig?.mode!=='api';}};
$('propose').onclick=async()=>{if(busy||!active)return;const instruction=$('question').value.trim();if(!instruction){status('先描述希望 AI 如何修改文件。');return;}busy=true;$('ask').disabled=true;$('propose').disabled=true;status('正在生成修改建议…');$('proposal').replaceChildren();try{const result=await window.study.programmingPropose({courseId:active.courseId,instruction,attachmentIds:images.map(x=>x.id),snippets});const title=document.createElement('h3');title.textContent=`修改建议 · ${result.changes.length} 个文件`;$('proposal').append(title);for(const change of result.changes){const details=document.createElement('details');details.open=true;const summary=document.createElement('summary');summary.textContent=change.path;details.append(summary);for(const [label,content] of [['修改前',change.before],['修改后',change.after]]){const head=document.createElement('strong');head.textContent=label;const pre=document.createElement('pre');pre.textContent=content;details.append(head,pre);}$('proposal').append(details);}const row=document.createElement('div');row.className='review-actions';const cancel=document.createElement('button');cancel.textContent='放弃';cancel.onclick=()=>$('proposal').replaceChildren();const apply=document.createElement('button');apply.textContent='确认写入这些文件';apply.onclick=async()=>{apply.disabled=true;try{await window.study.programmingApply(result.token);$('proposal').replaceChildren();status('已写入工作区；外部编程软件如已打开文件，请重新加载后再编辑。');}catch(e){status(e.message);apply.disabled=false;}};row.append(cancel,apply);$('proposal').append(row);status('请逐个检查修改前后内容，再确认写入。');images=[];snippets=[];renderContext();}catch(e){status(e.message);}finally{busy=false;$('ask').disabled=false;$('propose').disabled=aiConfig?.mode!=='api';}};
initialize();
