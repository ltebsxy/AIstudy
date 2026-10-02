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
  let config;try{config=await window.study.getAISettings();}catch(e){errorMessage(e);return;}
  if(request!==settingsRequest||!document.getElementById('nav-settings').classList.contains('active'))return;
  mountSettingsPage(`<div class="content settings-page"><button class="back" id="settings-back">← ${options.exercise?'返回做题':'返回课程'}</button>${settingsTabs('ai')}<h1 class="page-title">AI 设置</h1><p class="subtitle">API 和 Harness 分开配置，聊天与批改使用当前选中的方式。</p><div class="connection-mode"><label><input type="radio" name="ai-mode" value="api" ${config.mode==='api'?'checked':''}> API</label><label><input type="radio" name="ai-mode" value="harness" ${config.mode==='harness'?'checked':''}> Harness <small>（暂不维护）</small></label></div>
  <section class="editor-card settings-section"><h2>API</h2><div class="api-template-row"><span>快速配置</span>${StudyAI.templates.map(t=>`<button class="btn btn-soft" data-api-template="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div><div class="form-grid"><div class="field"><label for="api-provider">服务商</label><select id="api-provider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">自定义兼容接口</option></select></div><div class="field"><label for="api-url">接口地址（Base URL）</label><input id="api-url" value="${esc(config.api.baseUrl)}" placeholder="https://api.deepseek.com"></div><div class="field"><label for="api-model">模型</label><input id="api-model" value="${esc(config.api.model)}" placeholder="填写服务商提供的模型 ID"></div><div class="field"><label for="api-key">API Key</label><input id="api-key" type="password" autocomplete="new-password" placeholder="${config.api.hasKey?'已保存，留空保留':'填写 API Key'}"><label class="settings-check"><input type="checkbox" id="clear-api-key">清除已保存的 Key</label></div></div><div class="field"><label for="api-system-prompt">API 系统提示词</label><textarea id="api-system-prompt" rows="6" maxlength="20000">${esc(config.api.systemPrompt)}</textarea><div><button class="btn btn-plain" id="reset-system-prompt">恢复默认提示词</button></div><p class="target-help">保存后从下一次 API 请求生效；Harness 沿用所连接代理的提示配置。</p></div><p class="target-help">支持 Chat Completions 兼容接口。截图和 PDF 批改需所选模型支持对应文件输入。</p></section>
  <section class="editor-card settings-section"><h2>Harness</h2><p class="harness-notice"><strong>存在诸多问题，建议不使用</strong><span>Harness 暂不维护。</span></p><div class="field"><label for="harness-kind">代理连接</label><select id="harness-kind"><option value="codex">Codex</option><option value="http">自定义 Harness（HTTP 桥接）</option></select></div><div id="codex-fields"><div class="field"><label for="settings-thread">Codex 任务</label><div class="settings-task-row"><select id="settings-thread"><option value="${esc(config.harness.threadId)}">${config.harness.threadId?'已保存的任务 · '+esc(config.harness.threadId.slice(0,8)):'请选择任务'}</option></select><button class="btn btn-plain" id="refresh-settings-tasks">刷新任务</button></div></div><p class="target-help">沿用本机 Codex 连接；桌面自动转发需要从 Codex 启动软件。</p></div><div id="http-fields"><div class="form-grid"><div class="field"><label for="harness-name">Harness 名称</label><input id="harness-name" value="${esc(config.harness.name||'')}" placeholder="例如：OpenCode"></div><div class="field"><label for="harness-url">桥接地址</label><input id="harness-url" value="${esc(config.harness.endpoint)}" placeholder="http://127.0.0.1:8000/chat"></div><div class="field"><label for="harness-session">会话 ID</label><input id="harness-session" value="${esc(config.harness.sessionId)}"></div><div class="field"><label for="harness-token">访问令牌（可选）</label><input id="harness-token" type="password" autocomplete="new-password" placeholder="${config.harness.hasToken?'已保存，留空保留':'独立于 API Key'}"><label class="settings-check"><input type="checkbox" id="clear-harness-token">清除已保存的令牌</label></div></div><details class="target-help"><summary>桥接协议</summary><p>软件向该地址 POST JSON：{ sessionId, message, attachments, history }。服务返回 { "reply": "回复文本" }。需由桥接服务对接对应 Harness。</p></details></div></section><p class="target-help">密钥在本机加密保存。切换接口地址后需重新填写该地址的密钥。</p><div id="settings-status" role="status"></div><button class="btn btn-primary" id="save-settings">保存设置</button></div>`);
  bindSettingsTabs(options);
  const $=id=>document.getElementById(id);
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
      config=await window.study.saveAISettings({mode:document.querySelector('[name="ai-mode"]:checked').value,api:{systemPrompt:$('api-system-prompt').value,provider:$('api-provider').value,baseUrl:$('api-url').value.trim(),model:$('api-model').value.trim(),apiKey:$('api-key').value.trim(),clearKey:$('clear-api-key').checked},harness:{kind:$('harness-kind').value,name:$('harness-name').value.trim(),threadId:$('settings-thread').value,endpoint:$('harness-url').value.trim(),sessionId:$('harness-session').value,token:$('harness-token').value.trim(),clearToken:$('clear-harness-token').checked}});
      if(!$('save-settings'))return;
      $('api-key').value='';$('harness-token').value='';$('clear-api-key').checked=false;$('clear-harness-token').checked=false;
      $('api-key').placeholder=config.api.hasKey?'已保存，留空保留':'填写 API Key';$('harness-token').placeholder=config.harness.hasToken?'已保存，留空保留':'独立于 API Key';
      $('settings-status').textContent='已保存，当前使用 '+aiConnectionLabel(config)+'。';
    }catch(e){if($('settings-status'))$('settings-status').textContent=e.message;}finally{if($('save-settings'))$('save-settings').disabled=false;}
  };
}
