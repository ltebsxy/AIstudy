const lessonChats = new Map();
let disposeLessonChat = () => {};
function setupLessonChat(course) {
  const state = lessonChats.get(course.id) || { messages: [], draft: '', busy: false, fragments: [] };
  lessonChats.set(course.id, state);
  const layout = document.querySelector('.lesson-layout');
  const panel = document.createElement('aside'); panel.className = 'lesson-ai'; panel.hidden = true;
  panel.innerHTML = '<header><strong>侧边聊天</strong><button class="icon-button" id="close-lesson-ai" aria-label="关闭提问">×</button></header><div class="context-actions"><button id="lesson-ai-compact" class="compact-button" title="压缩发送的上下文，保留本地聊天记录">压缩上下文</button><button id="lesson-ai-reset" class="compact-button" title="清除当前对话的历史上下文和摘要；本地聊天记录保留" hidden>清除上下文</button></div><div id="lesson-ai-messages" class="lesson-ai-messages"></div><div id="lesson-ai-status" role="status"></div><button id="lesson-ai-clear" class="link-button" hidden>清除选取</button><button id="lesson-ai-desktop" class="btn btn-plain" hidden>在 Codex 中继续</button><textarea id="lesson-ai-input" placeholder="输入问题…" rows="3" maxlength="2500"></textarea><div class="ai-compose-actions"><select id="lesson-ai-mode" class="ai-mode-select" aria-label="切换 AI 连接" disabled><option>读取连接…</option></select><button id="lesson-ai-send" class="btn btn-primary">发送</button></div>';
  document.body.append(panel);
  const floating=setupFloatingChat(panel);
  let panelAnimation=null,panelClosing=false;
  const fragments=document.createElement('div');fragments.className='lesson-fragments';fragments.id='lesson-fragments';
  panel.querySelector('textarea').before(fragments);
  const toggle=document.createElement('button');toggle.className='btn btn-soft';toggle.id='ask-lesson-ai';toggle.textContent='问 AI';
  document.querySelector('#view .toolbar').append(toggle);
  const input=panel.querySelector('textarea'), send=panel.querySelector('#lesson-ai-send'), list=panel.querySelector('#lesson-ai-messages'), status=panel.querySelector('#lesson-ai-status'), desktop=panel.querySelector('#lesson-ai-desktop'), clear=panel.querySelector('#lesson-ai-clear');
  input.value=state.draft;
  const modeSelect=panel.querySelector('#lesson-ai-mode');
  let connection=null,switching=false,compacting=false;
  const compactButton=panel.querySelector('#lesson-ai-compact'),resetButton=panel.querySelector('#lesson-ai-reset');
  const updateConnection=config=>{connection=config;StudyAI.populate(modeSelect,config);modeSelect.disabled=state.busy||switching;compactButton.disabled=state.busy||switching||loadingHistory;resetButton.hidden=!['api','chatgpt'].includes(config.mode);resetButton.disabled=state.busy||switching||loadingHistory;};
  window.study.getAISettings().then(config=>{if(panel.isConnected&&!connection)updateConnection(config);}).catch(e=>{state.status=e.message;render();});
  modeSelect.onchange=async()=>{
    if(state.busy||switching||!connection)return;
    const mode=modeSelect.value;switching=true;render();
    try{updateConnection(await window.study.switchAIMode(mode));state.status='';}
    catch(e){StudyAI.populate(modeSelect,connection);state.status=e.message;}
    finally{switching=false;render();}
  };
  let historyPage={before:null,hasMore:false}, loadingHistory=false, historyGeneration=0, lastScroll=0;
  function render(preserve=false) {
    if(!panel.isConnected)return;
    const oldHeight=list.scrollHeight,oldTop=list.scrollTop;
    list.replaceChildren();
    if(historyPage.hasMore){const more=document.createElement('button');more.className='link-button history-more';more.textContent='加载更早消息';more.disabled=loadingHistory||state.busy;more.onclick=()=>load(false);list.append(more);}
    for(const message of state.messages){const item=document.createElement('div');item.className=`lesson-ai-message ${message.role}`;renderGradingReport(item,message.text);list.append(item);}
    if(!state.messages.length){const empty=document.createElement('p');empty.className='subtitle';empty.textContent='选中正文，点击“加入侧边聊天”，再输入问题。';list.append(empty);}
    list.scrollTop=preserve?oldTop+list.scrollHeight-oldHeight:list.scrollHeight;lastScroll=list.scrollTop;send.textContent=state.busy?'停止等待':'发送';send.disabled=loadingHistory||switching;input.disabled=state.busy;modeSelect.disabled=state.busy||switching||!connection;
    compactButton.disabled=state.busy||switching||loadingHistory||!connection;compactButton.textContent=compacting?'压缩中…':'压缩上下文';
    compactButton.title=historyPage.summary?'当前上下文摘要（AI 生成，可对照历史核查）：\n'+historyPage.summary.text:'压缩发送的上下文，保留本地聊天记录';
    resetButton.hidden=!['api','chatgpt'].includes(connection?.mode);resetButton.disabled=state.busy||switching||loadingHistory;
    clear.hidden=!state.fragments.length;clear.disabled=state.busy;
    fragments.replaceChildren();
    state.fragments.forEach((text,i)=>{
      const chip=document.createElement('span');chip.className='fragment-chip';chip.title=text;chip.tabIndex=0;
      const label=document.createElement('span');label.textContent=`片段 ${i+1}`;
      const remove=document.createElement('button');remove.className='icon-button';remove.textContent='×';remove.setAttribute('aria-label',`移除片段 ${i+1}`);remove.disabled=state.busy;
      remove.onclick=()=>{state.fragments.splice(i,1);render();};
      chip.append(label,remove);fragments.append(chip);
    });
    status.textContent=state.status||'';desktop.hidden=!state.pending||state.busy;
  }
  async function load(reset=true) {
    if(state.busy||(!reset&&loadingHistory))return;
    const generation=reset?++historyGeneration:historyGeneration;
    loadingHistory=true;send.disabled=true;
    try {
      const page=await window.study.chatHistory({scope:'lesson',courseId:course.id,before:reset?undefined:historyPage.before});
      if(generation!==historyGeneration||!panel.isConnected)return;
      if(reset||historyPage.key!==page.key)state.messages=page.items;else state.messages=[...page.items,...state.messages];
      historyPage=page;state.pending=state.messages.findLast(m=>m.pending)?.pending||null;
      render(!reset);
    }catch(e){state.status=e.message;render();}
    finally{if(generation===historyGeneration){loadingHistory=false;if(panel.isConnected){send.disabled=switching;compactButton.disabled=state.busy||switching||!connection;resetButton.disabled=state.busy||switching||!connection;const more=list.querySelector('.history-more');if(more)more.disabled=state.busy;}}}
  }
  list.onscroll=()=>{const top=list.scrollTop;if(top<lastScroll&&top<16&&historyPage.hasMore&&!loadingHistory&&!state.busy)load(false);lastScroll=top;};
  function open() {
    panelAnimation?.cancel();panelAnimation=null;panelClosing=false;panel.hidden=false;panel.inert=false;
    floating.show();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)panelAnimation=panel.animate([{opacity:0,transform:'translateY(8px) scale(.98)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
    render();if(!state.busy)load(true);input.focus();
  }
  function close(){
    if(panel.hidden||panelClosing)return;
    panelClosing=true;panel.inert=true;panelAnimation?.cancel();panelAnimation=null;layout.classList.remove('with-ai');
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){panel.hidden=true;return;}
    panelAnimation=panel.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.98)'}],{duration:150,easing:'ease-in'});
    panelAnimation.onfinish=()=>{if(panelClosing)panel.hidden=true;panelAnimation=null;};
  }
  toggle.onclick=()=>{if(panel.hidden||panelClosing)open();else close();};
  panel.querySelector('#close-lesson-ai').onclick=close;
  clear.onclick=()=>{state.fragments=[];render();input.focus();};
  const disposeSelection=setupLessonSelection(layout.querySelector('.lesson-content'),text=>{
    if(state.fragments.includes(text)){open();return;}
    if([...state.fragments,text].join('\n\n').length>8500){notify('选取内容过长，请缩小范围或清除已有选取。');return;}
    state.fragments.push(text);open();notify('已加入侧边聊天');
  },()=>state.busy);
  input.oninput=()=>{state.draft=input.value;};
  async function ask() {
    if(state.busy){await window.study.cancelCodex();return;}
    if(loadingHistory||switching)return;
    if(!input.value.trim()&&!state.fragments.length){state.status='请输入问题，或先选取正文片段。';render();return;}
    const question=input.value.trim()||'解释选取片段';
    const context=state.fragments.join('\n\n');
    state.messages.push({role:'user',text:question});
    const reply={role:'assistant',text:'正在解释…'};state.messages.push(reply);
    state.busy=true;state.status='';state.pending=null;state.draft='';input.value='';render();
    try {
      const answer=await window.study.askLesson({courseId:course.id,context,question});
      if(answer?.needsDesktop){state.pending=answer;reply.pending=answer;reply.text='请在 Codex 中继续，回复会返回这里。';}
      else reply.text=answer;
      state.fragments=[];
    }catch(e){reply.text=e.message;state.draft=question;input.value=question;}
    finally{state.busy=false;render();}
  }
  compactButton.onclick=async()=>{
    if(state.busy||loadingHistory||switching)return;
    state.busy=true;compacting=true;state.status='正在压缩上下文…';render();
    try{const result=await window.study.compactContext({scope:'lesson',courseId:course.id});state.status=result.message;if(result.summary)historyPage.summary=result.summary;}
    catch(e){state.status=e.message;}
    finally{state.busy=false;compacting=false;render();}
  };
  resetButton.onclick=async()=>{
    if(state.busy||loadingHistory||switching||!['api','chatgpt'].includes(connection?.mode))return;
    state.busy=true;render();
    try{const result=await window.study.clearContext({scope:'lesson',courseId:course.id});historyPage.summary=null;state.status=result.message;}
    catch(e){state.status=e.message;}
    finally{state.busy=false;render();}
  };
  send.onclick=()=>ask().catch(e=>{state.status=e.message;render();});
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send.click();}};
  desktop.onclick=async()=>{if(!state.pending||state.busy)return;const target=state.messages.findLast(m=>m.pending===state.pending)||state.messages.at(-1);state.busy=true;render();try{target.text=await window.study.continueInCodex(state.pending);delete target.pending;state.pending=state.messages.findLast(m=>m.pending)?.pending||null;}catch(e){state.status=e.message;}finally{state.busy=false;render();}};
  const unsubscribe=window.study.onLessonAnswer(text=>{if(state.busy&&!compacting&&state.messages.length){state.messages[state.messages.length-1].text=text;render();}});
  const settingsChanged=window.study.onAISettings(config=>{updateConnection(config);state.status='';state.messages=[];state.pending=null;load(true);});
  disposeLessonChat=()=>{historyGeneration++;panelAnimation?.cancel();settingsChanged();disposeSelection();floating.dispose();panel.remove();unsubscribe();};
  render();load(true);
}
