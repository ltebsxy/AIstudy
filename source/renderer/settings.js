function aiConnectionLabel(config) {
  return StudyAI.label(config);
}
function leaveSettings(options={}) { if(options.exercise)window.study.resumeSession().catch(errorMessage);else renderHome(); }
function renderSettings(options={}) { return renderAISettings(options); }
let settingsRequest=0;
function settingsTabs(active){return `<nav class="settings-tabs" aria-label="设置栏目"><button class="${active==='ai'?'selected':''}" data-settings-tab="ai" ${active==='ai'?'aria-current="page"':''}>AI 设置</button><button class="${active==='appearance'?'selected':''}" data-settings-tab="appearance" ${active==='appearance'?'aria-current="page"':''}>外观</button><button class="${active==='writing'?'selected':''}" data-settings-tab="writing" ${active==='writing'?'aria-current="page"':''}>默认写字程序</button><button class="${active==='workspaces'?'selected':''}" data-settings-tab="workspaces" ${active==='workspaces'?'aria-current="page"':''}>练习工作区</button></nav>`;}
function bindSettingsTabs(options){view.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>({ai:renderAISettings,appearance:renderAppearanceSettings,writing:renderWritingSettings,workspaces:renderWorkspaceSettings})[button.dataset.settingsTab](options));}
function mountSettingsPage(markup){
  const draft=document.createElement('div');draft.innerHTML=markup;
  const next=draft.firstElementChild,tabs=next.querySelector('.settings-tabs'),body=document.createElement('div');body.className='settings-body';
  while(tabs.nextSibling)body.append(tabs.nextSibling);
  tabs.after(body);
  const current=view.querySelector(':scope > .settings-page');
  if(!current){view.replaceChildren(next);return;}
  const back=current.querySelector(':scope > .back'),nextBack=next.querySelector(':scope > .back');
  back.id=nextBack.id;back.textContent=nextBack.textContent;
  const selected=tabs.querySelector('[aria-current="page"]')?.dataset.settingsTab;
  current.querySelectorAll('[data-settings-tab]').forEach(button=>{const active=button.dataset.settingsTab===selected;button.classList.toggle('selected',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  current.querySelector(':scope > .settings-body').replaceWith(body);
}
function chatGPTSettingsMarkup(config,state){
  return `<section class="editor-card settings-section"><h2>ChatGPT 订阅</h2><p class="target-help">使用你已授权的 ChatGPT 订阅额度。账号是否符合资格、可用模型与限额由 OpenAI 决定；如允许使用 ChatGPT 点数，也受你在 ChatGPT 设置中的选择控制。</p><p class="target-help">仅在你发送问题、压缩上下文或请求批改／修改建议时，向 OpenAI 发送该请求所需的文字和附件。不读取你的 ChatGPT 历史对话。</p><div class="field"><label for="chatgpt-account">ChatGPT 账号／工作区</label><select id="chatgpt-account"><option value="">选择已保存账号</option>${state.accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.label)}${a.email?' · '+esc(a.email):''}${a.connected?'':'（已退出）'}</option>`).join('')}</select></div><div class="file-row"><button class="btn chatgpt-signin" id="chatgpt-login">Continue with ChatGPT</button><button class="btn btn-plain" id="chatgpt-add">添加账号／工作区</button><button class="btn btn-plain" id="chatgpt-consent">重新授权订阅</button><button class="btn btn-plain" id="chatgpt-logout">退出此账号</button><button class="btn btn-plain" id="chatgpt-cancel" ${state.pending?'':'hidden'}>取消登录</button></div><p id="chatgpt-status" role="status"></p><div class="field"><label for="chatgpt-model">模型</label><div class="settings-task-row"><select id="chatgpt-model"><option value="${esc(config.chatgpt.model)}">${esc(config.chatgpt.model||'登录后读取可用模型')}</option></select><button class="btn btn-plain" id="chatgpt-refresh">刷新模型</button></div></div><div class="field"><label for="chatgpt-system-prompt">ChatGPT 系统提示词</label><textarea id="chatgpt-system-prompt" rows="4" maxlength="20000">${esc(config.chatgpt.systemPrompt)}</textarea><button class="btn btn-plain" id="chatgpt-reset-prompt">恢复默认提示词</button></div><button class="btn btn-plain" id="chatgpt-usage">管理额度 · ChatGPT 设置</button><p class="target-help">登录凭据由系统加密保存在本机。退出会尝试撤销会话。此连接用于本地开源版，不会自动切换到 API 计费。</p></section>`;
}
async function showChatGPTWelcome(accountId){
  if(document.querySelector('.chatgpt-welcome'))return;
  const modal=document.createElement('dialog');modal.className='chatgpt-welcome';
  modal.innerHTML='<h2>你已授权使用 ChatGPT 订阅</h2><p>选择此连接后，符合条件的 AI 请求将使用你的 ChatGPT 订阅额度或已允许的点数。你可以在 ChatGPT 设置中管理用量和授权。</p><div class="file-row"><button class="btn btn-primary" data-dismiss>知道了</button><button class="btn btn-plain" data-usage>管理额度</button></div>';
  document.body.append(modal);modal.showModal();
  modal.querySelector('[data-usage]').onclick=()=>window.study.manageChatGPTUsage();
  const close=async()=>{try{await window.study.acknowledgeChatGPTWelcome(accountId);modal.close();modal.remove();}catch(e){errorMessage(e);}};
  modal.querySelector('[data-dismiss]').onclick=close;modal.oncancel=e=>{e.preventDefault();close();};
}
function bindChatGPTSettings(config,initial,request){
  const $=id=>document.getElementById(id),alive=()=>request===settingsRequest&&Boolean($('chatgpt-account'));
  let state=initial,busy=state.pending,loggingIn=state.pending,generation=0;
  const controls=['chatgpt-login','chatgpt-add','chatgpt-consent','chatgpt-logout','chatgpt-refresh','chatgpt-account'];
  const modelStatus=document.createElement('p');modelStatus.id='chatgpt-model-status';modelStatus.className='target-help';modelStatus.setAttribute('role','status');
  $('chatgpt-model').closest('.field').append(modelStatus);
  function show(){
    if(!alive())return;
    const account=state.accounts.find(a=>a.id===$('chatgpt-account').value);
    controls.forEach(id=>$(id).disabled=busy);
    $('chatgpt-consent').disabled=busy||!account;$('chatgpt-logout').disabled=busy||!account?.connected;
    $('chatgpt-refresh').disabled=busy||!account?.planEnabled;$('chatgpt-cancel').hidden=!loggingIn;
    const progress=state.loginStatus;
    $('chatgpt-status').textContent=loggingIn?`${progress?.label||'正在准备登录'}…${progress?.stage==='callback'?'请在浏览器中完成 ChatGPT 授权。':''}`:busy?'正在退出 ChatGPT…':!account?(progress?.outcome==='failed'?`上次登录未完成：${progress.label}。点击 Continue with ChatGPT 重试。`:'登录后选择模型，再保存设置。'):!account.connected?'此账号已退出，点击 Continue with ChatGPT 重新登录。':!account.planEnabled?'已登录，但未授权订阅额度。可点击“重新授权订阅”。':'已授权使用 ChatGPT 订阅，模型选择在保存设置后生效。';
  }
  function setModels(models,previous=''){
    $('chatgpt-model').replaceChildren(...models.map(m=>new Option(m.displayName,m.slug)));
    if(models.some(m=>m.slug===previous))$('chatgpt-model').value=previous;
    if(!models.length)$('chatgpt-model').add(new Option('没有可用模型',''));
    const account=state.accounts.find(a=>a.id===$('chatgpt-account').value);
    if(!account?.planEnabled){modelStatus.textContent='登录并授权订阅后，读取此账号可用的模型。';return;}
    const missing=[{slug:'gpt-6-sol',name:'GPT-6 Sol'},{slug:'gpt-6.1-sol',name:'GPT-6.1 Sol'}].filter(m=>!models.some(available=>available.slug===m.slug));
    modelStatus.textContent=models.length?`已读取 ${models.length} 个账号可用模型。${missing.length?'当前订阅目录未提供 '+missing.map(m=>m.name).join('、')+'。':''}`:'当前没有读取到可用模型，请刷新或查看上方提示。';
  }
  async function refresh(){
    const id=$('chatgpt-account').value,account=state.accounts.find(a=>a.id===id),current=++generation;
    if(!account?.planEnabled){setModels([]);return;}
    const previous=id===config.chatgpt.accountId?config.chatgpt.model:$('chatgpt-model').value;
    $('chatgpt-refresh').disabled=true;$('chatgpt-status').textContent='正在读取此账号的可用模型…';modelStatus.textContent='正在更新模型目录…';
    try{const models=await window.study.chatGPTModels(id);if(alive()&&current===generation&&id===$('chatgpt-account').value){setModels(models,previous);show();}}
    catch(e){if(alive()&&current===generation){setModels([]);show();$('chatgpt-status').textContent=friendlyError(e);}}
  }
  async function login(add=false,consent=false){
    if(busy)return;busy=true;loggingIn=true;show();
    let polling=false;
    const timer=setInterval(async()=>{if(polling||!alive()||!loggingIn)return;polling=true;try{state=await window.study.getChatGPTState();if(alive()&&loggingIn)show();}catch{}finally{polling=false;}},600);
    try{
      const result=await window.study.loginChatGPT({accountId:add?'':$('chatgpt-account').value,consent});
      if(!alive())return;state=await window.study.getChatGPTState();if(!alive())return;
      $('chatgpt-account').replaceChildren(new Option('选择已保存账号',''),...state.accounts.map(a=>new Option(a.label+(a.email?' · '+a.email:''),a.id)));
      $('chatgpt-account').value=result.accountId;busy=false;loggingIn=false;show();
      if(state.welcomeAccountIds.includes(result.accountId))await showChatGPTWelcome(result.accountId);
      await refresh();if(alive()&&state.accounts.find(a=>a.id===result.accountId)?.planEnabled)document.querySelector('[name="ai-mode"][value="chatgpt"]').checked=true;
    }catch(e){if(alive()){busy=false;loggingIn=false;state=await window.study.getChatGPTState();if(!alive())return;const selected=$('chatgpt-account').value;$('chatgpt-account').replaceChildren(new Option('选择已保存账号',''),...state.accounts.map(a=>new Option(a.label+(a.email?' · '+a.email:''),a.id)));$('chatgpt-account').value=selected||state.accounts.at(-1)?.id||'';show();$('chatgpt-status').textContent=friendlyError(e);}}
    finally{clearInterval(timer);busy=false;loggingIn=false;if(alive())controls.forEach(id=>{if(['chatgpt-login','chatgpt-add','chatgpt-account'].includes(id))$(id).disabled=false;});}
  }
  $('chatgpt-account').value=config.chatgpt.accountId;
  $('chatgpt-login').onclick=()=>login();$('chatgpt-add').onclick=()=>login(true);$('chatgpt-consent').onclick=()=>login(false,true);
  $('chatgpt-cancel').onclick=async()=>{await window.study.cancelChatGPTLogin();busy=false;loggingIn=false;show();};
  $('chatgpt-account').onchange=()=>{show();refresh();};$('chatgpt-refresh').onclick=refresh;
  $('chatgpt-logout').onclick=async()=>{busy=true;show();try{const result=await window.study.logoutChatGPT($('chatgpt-account').value);state=await window.study.getChatGPTState();if(alive()){busy=false;show();setModels([]);$('chatgpt-status').textContent=result.message;}}catch(e){if(alive()){busy=false;show();$('chatgpt-status').textContent=friendlyError(e);}}};
  $('chatgpt-usage').onclick=()=>window.study.manageChatGPTUsage();
  $('chatgpt-reset-prompt').onclick=()=>{$('chatgpt-system-prompt').value=config.defaultSystemPrompt;};
  show();if(initial.needsWelcome&&!initial.pending)showChatGPTWelcome(initial.welcomeAccountIds[0]);if(!busy&&$('chatgpt-account').value)refresh();
}
async function renderAppearanceSettings(options={}){
  nav('settings');const request=++settingsRequest;
  let theme;try{theme=await window.study.getTheme();}catch(e){errorMessage(e);return;}
  if(request!==settingsRequest||!document.getElementById('nav-settings').classList.contains('active'))return;
  mountSettingsPage(`<div class="content settings-page"><button class="back" id="appearance-back">← ${options.exercise?'返回做题':'返回课程'}</button>${settingsTabs('appearance')}<h1 class="page-title">外观</h1><p class="subtitle">选择适合当前光线的主题，切换后自动保存。</p><section class="editor-card settings-section"><h2>主题</h2><div class="appearance-options" role="group" aria-label="主题">${[['light','浅色'],['dark','夜间模式'],['system','跟随系统']].map(([value,label])=>`<label><input type="radio" name="appearance" value="${value}" ${theme.mode===value?'checked':''}>${label}</label>`).join('')}</div><p class="target-help">主界面、画布和 AI 问答同步切换。文件原件和已保存的笔迹颜色不变。</p><p id="appearance-status" role="status"></p></section></div>`);
  bindSettingsTabs(options);document.getElementById('appearance-back').onclick=()=>leaveSettings(options);
  const inputs=[...view.querySelectorAll('[name="appearance"]')],status=document.getElementById('appearance-status');
  for(const input of inputs)input.onchange=async()=>{
    if(!input.checked)return;inputs.forEach(item=>item.disabled=true);
    try{theme=await window.study.saveTheme(input.value);status.textContent='已保存。';}
    catch(e){inputs.forEach(item=>item.checked=item.value===theme.mode);status.textContent=friendlyError(e);}
    finally{inputs.forEach(item=>item.disabled=false);}
  };
}
async function renderWorkspaceSettings(options={}){
  nav('settings');
  const request=++settingsRequest;
  let items;try{items=await window.study.programmingWorkspaces();}catch(e){errorMessage(e);return;}
  if(request!==settingsRequest||!document.getElementById('nav-settings').classList.contains('active'))return;
  mountSettingsPage(`<div class="content settings-page"><button class="back" id="workspaces-back">← ${options.exercise?'返回做题':'返回课程'}</button>${settingsTabs('workspaces')}<h1 class="page-title">练习工作区</h1><p class="subtitle">编程课程的修改文件保存在应用数据目录。清理后，下次进入课程会从课程原件重新开始。</p><div class="editor-card settings-section">${items.length?items.map(item=>`<div class="workspace-setting-row"><div><strong>${esc(item.title)}</strong><small>${item.fileCount==null?'无法读取文件数':item.fileCount+' 个文件'} · ${esc(item.courseId)}</small></div><button class="btn btn-danger" data-clear-workspace="${esc(item.courseId)}">清理</button></div>`).join(''):'暂无编程练习工作区。'}</div></div>`);
  bindSettingsTabs(options);
  document.getElementById('workspaces-back').onclick=()=>leaveSettings(options);
  view.querySelectorAll('[data-clear-workspace]').forEach(button=>button.onclick=async()=>{const id=button.dataset.clearWorkspace;if(!confirm('确定清理此工作区？所有练习修改将永久删除。'))return;try{await window.study.programmingClearWorkspace(id);renderWorkspaceSettings(options);}catch(e){errorMessage(e);}});
}
async function renderWritingSettings(options={}) {
  nav('settings');
  const request=++settingsRequest;
  let target;try{target=await window.study.getWritingSettings();}catch(e){errorMessage(e);return;}
  if(request!==settingsRequest||!document.getElementById('nav-settings').classList.contains('active'))return;
  mountSettingsPage(`<div class="content settings-page"><button class="back" id="writing-back">← ${options.exercise?'返回做题':'返回课程'}</button>${settingsTabs('writing')}<h1 class="page-title">默认写字程序</h1><section class="editor-card settings-section"><div class="field"><label for="default-writer">做题时使用</label><select id="default-writer"><option value="builtin">内置写字板</option><option value="onenote">OneNote</option><option value="app">指定程序</option></select></div><div class="field" id="writer-app-field"><label>程序位置</label><div class="file-row"><button class="btn btn-plain" id="choose-default-writer">选择 .exe 程序</button><span class="filename" id="default-writer-path"></span></div></div><div class="field" id="writer-onenote-field"><label for="default-onenote">OneNote 页面链接</label><input id="default-onenote" value="${esc(target.url||'')}" placeholder="onenote:https://..."></div><p class="target-help">课程选择“使用默认程序”时生效；课程单独指定的程序优先。读写模式使用内置阅读与批注工具。</p></section><p id="writing-status" role="status"></p><button class="btn btn-primary" id="save-writing-settings">保存设置</button></div>`);
  bindSettingsTabs(options);
  const $=id=>document.getElementById(id);let appPath=target.appPath||'';
  $('default-writer').value=target.type;$('default-writer-path').textContent=appPath||'尚未选择';
  const show=()=>{$('writer-app-field').hidden=$('default-writer').value!=='app';$('writer-onenote-field').hidden=$('default-writer').value!=='onenote';};show();$('default-writer').onchange=show;
  $('writing-back').onclick=()=>leaveSettings(options);
  $('choose-default-writer').onclick=async()=>{try{const selected=await window.study.chooseWorkApp();if(selected&&$('default-writer-path')){appPath=selected;$('default-writer-path').textContent=selected;}}catch(e){errorMessage(e);}};
  $('save-writing-settings').onclick=async()=>{
    const button=$('save-writing-settings');button.disabled=true;
    try{await window.study.saveWritingSettings({type:$('default-writer').value,appPath,url:$('default-onenote').value});if($('writing-status'))$('writing-status').textContent='已保存默认写字程序。';}
    catch(e){if($('writing-status'))$('writing-status').textContent=friendlyError(e);}finally{if(button.isConnected)button.disabled=false;}
  };
}
async function renderAISettings(options={}) {
  nav('settings');
  const request=++settingsRequest;
  if(!view.querySelector(':scope > .settings-page'))view.innerHTML='<div class="content"><h1 class="page-title">设置</h1><p>正在读取设置…</p></div>';
  let config,chatgptState;try{[config,chatgptState]=await Promise.all([window.study.getAISettings(),window.study.getChatGPTState()]);}catch(e){errorMessage(e);return;}
  if(request!==settingsRequest||!document.getElementById('nav-settings').classList.contains('active'))return;
  mountSettingsPage(`<div class="content settings-page"><button class="back" id="settings-back">← ${options.exercise?'返回做题':'返回课程'}</button>${settingsTabs('ai')}<h1 class="page-title">AI 设置</h1><p class="subtitle">分别配置 API、ChatGPT 订阅和 Harness，聊天与批改使用当前选中的方式。</p><div class="connection-mode"><label><input type="radio" name="ai-mode" value="chatgpt" ${config.mode==='chatgpt'?'checked':''}> ChatGPT 订阅</label><label><input type="radio" name="ai-mode" value="api" ${config.mode==='api'?'checked':''}> API</label><label><input type="radio" name="ai-mode" value="harness" ${config.mode==='harness'?'checked':''}> Harness <small>（暂不维护）</small></label></div>
  ${chatGPTSettingsMarkup(config,chatgptState)}<section class="editor-card settings-section"><h2>API</h2><div class="api-template-row"><span>快速配置</span>${StudyAI.templates.map(t=>`<button class="btn btn-soft" data-api-template="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div><div class="form-grid"><div class="field"><label for="api-provider">服务商</label><select id="api-provider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">自定义兼容接口</option></select></div><div class="field"><label for="api-url">接口地址（Base URL）</label><input id="api-url" value="${esc(config.api.baseUrl)}" placeholder="https://api.deepseek.com"></div><div class="field"><label for="api-model">模型</label><input id="api-model" value="${esc(config.api.model)}" placeholder="填写服务商提供的模型 ID"></div><div class="field"><label for="api-key">API Key</label><input id="api-key" type="password" autocomplete="new-password" placeholder="${config.api.hasKey?'已保存，留空保留':'填写 API Key'}"><label class="settings-check"><input type="checkbox" id="clear-api-key">清除已保存的 Key</label></div></div><div class="field"><label for="api-system-prompt">API 系统提示词</label><textarea id="api-system-prompt" rows="6" maxlength="20000">${esc(config.api.systemPrompt)}</textarea><div><button class="btn btn-plain" id="reset-system-prompt">恢复默认提示词</button></div><p class="target-help">保存后从下一次 API 请求生效；Harness 沿用所连接代理的提示配置。</p></div><p class="target-help">支持 Chat Completions 兼容接口。截图和 PDF 批改需所选模型支持对应文件输入。</p></section>
  <section class="editor-card settings-section"><h2>Harness</h2><p class="harness-notice"><strong>存在诸多问题，建议不使用</strong><span>Harness 暂不维护。</span></p><div class="field"><label for="harness-kind">代理连接</label><select id="harness-kind"><option value="codex">Codex</option><option value="http">自定义 Harness（HTTP 桥接）</option></select></div><div id="codex-fields"><div class="field"><label for="settings-thread">Codex 任务</label><div class="settings-task-row"><select id="settings-thread"><option value="${esc(config.harness.threadId)}">${config.harness.threadId?'已保存的任务 · '+esc(config.harness.threadId.slice(0,8)):'请选择任务'}</option></select><button class="btn btn-plain" id="refresh-settings-tasks">刷新任务</button></div></div><p class="target-help">沿用本机 Codex 连接；桌面自动转发需要从 Codex 启动软件。</p></div><div id="http-fields"><div class="form-grid"><div class="field"><label for="harness-name">Harness 名称</label><input id="harness-name" value="${esc(config.harness.name||'')}" placeholder="例如：OpenCode"></div><div class="field"><label for="harness-url">桥接地址</label><input id="harness-url" value="${esc(config.harness.endpoint)}" placeholder="http://127.0.0.1:8000/chat"></div><div class="field"><label for="harness-session">会话 ID</label><input id="harness-session" value="${esc(config.harness.sessionId)}"></div><div class="field"><label for="harness-token">访问令牌（可选）</label><input id="harness-token" type="password" autocomplete="new-password" placeholder="${config.harness.hasToken?'已保存，留空保留':'独立于 API Key'}"><label class="settings-check"><input type="checkbox" id="clear-harness-token">清除已保存的令牌</label></div></div><details class="target-help"><summary>桥接协议</summary><p>软件向该地址 POST JSON：{ sessionId, message, attachments, history }。服务返回 { "reply": "回复文本" }。需由桥接服务对接对应 Harness。</p></details></div></section><p class="target-help">密钥在本机加密保存。切换接口地址后需重新填写该地址的密钥。</p><div id="settings-status" role="status"></div><button class="btn btn-primary" id="save-settings">保存设置</button></div>`);
  bindSettingsTabs(options);
  const $=id=>document.getElementById(id);
  bindChatGPTSettings(config,chatgptState,request);
  $('reset-system-prompt').onclick=()=>{$('api-system-prompt').value=config.defaultSystemPrompt;};
  $('api-provider').value=config.api.provider;$('harness-kind').value=config.harness.kind;
  const showKind=()=>{$('codex-fields').hidden=$('harness-kind').value!=='codex';$('http-fields').hidden=$('harness-kind').value!=='http';};showKind();$('harness-kind').onchange=showKind;
  $('settings-back').onclick=()=>leaveSettings(options);
  $('api-provider').onchange=()=>{const preset={deepseek:'https://api.deepseek.com',openai:'https://api.openai.com/v1'}[$('api-provider').value];if(preset)$('api-url').value=preset;$('api-model').value='';$('api-key').value='';};
  async function tasks(){
    const button=$('refresh-settings-tasks');button.disabled=true;
    try{const items=await window.study.listCodexThreads();if(!$('settings-thread'))return;const select=$('settings-thread'),current=select.value;select.replaceChildren(new Option('请选择任务',''));for(const item of items)select.add(new Option(item.title,item.id));if(current&&!items.some(x=>x.id===current))select.add(new Option('已保存的任务',current));select.value=current;}
    catch(e){if($('settings-status'))$('settings-status').textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}
  }
  $('refresh-settings-tasks').onclick=tasks;
  document.querySelectorAll('[data-api-template]').forEach(button=>button.onclick=()=>{
    const template=StudyAI.templates.find(t=>t.id===button.dataset.apiTemplate);
    if($('api-url').value.trim().replace(/\/+$/,'')!==template.baseUrl)$('api-key').value='';
    $('api-provider').value=template.provider;$('api-url').value=template.baseUrl;$('api-model').value=template.model;
    $('clear-api-key').checked=false;document.querySelector('[name="ai-mode"][value="api"]').checked=true;
    $('settings-status').textContent='已填入 '+template.modelName+' 模板，填写 API Key 后保存。';$('api-key').focus();
  });
  $('save-settings').onclick=async()=>{
    $('save-settings').disabled=true;
    try{
      config=await window.study.saveAISettings({mode:document.querySelector('[name="ai-mode"]:checked').value,chatgpt:{accountId:$('chatgpt-account').value,model:$('chatgpt-model').value,systemPrompt:$('chatgpt-system-prompt').value},api:{systemPrompt:$('api-system-prompt').value,provider:$('api-provider').value,baseUrl:$('api-url').value.trim(),model:$('api-model').value.trim(),apiKey:$('api-key').value.trim(),clearKey:$('clear-api-key').checked},harness:{kind:$('harness-kind').value,name:$('harness-name').value.trim(),threadId:$('settings-thread').value,endpoint:$('harness-url').value.trim(),sessionId:$('harness-session').value,token:$('harness-token').value.trim(),clearToken:$('clear-harness-token').checked}});
      if(!$('save-settings'))return;
      $('api-key').value='';$('harness-token').value='';$('clear-api-key').checked=false;$('clear-harness-token').checked=false;
      $('api-key').placeholder=config.api.hasKey?'已保存，留空保留':'填写 API Key';$('harness-token').placeholder=config.harness.hasToken?'已保存，留空保留':'独立于 API Key';
      $('settings-status').textContent='已保存，当前使用 '+aiConnectionLabel(config)+'。';
    }catch(e){if($('settings-status'))$('settings-status').textContent=e.message;}finally{if($('save-settings'))$('save-settings').disabled=false;}
  };
}
