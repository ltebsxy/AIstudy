// Keep display names separate from the model IDs accepted by each API.
const StudyAI = (() => {
  const templates = [{id:'deepseek',name:'DeepSeek · V4.1 Flash',provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',modelName:'DeepSeek-V4.1-Flash'}];
  function apiName(config) {
    const template=templates.find(t=>t.provider===config.api.provider&&t.model===config.api.model);
    return template?.modelName||config.api.model||'API（未配置模型）';
  }
  function harnessName(config) { return config.harness.kind==='codex'?'Codex':config.harness.name||'自定义 Harness'; }
  function label(config) {return config.mode==='api'?apiName(config):harnessName(config);}
  function populate(select,config) {
    select.replaceChildren(new Option(harnessName(config),'harness'),new Option(apiName(config),'api'));
    select.value=config.mode;select.title='切换 AI 连接 · '+label(config);
  }
  return {templates,apiName,harnessName,label,populate};
})();
