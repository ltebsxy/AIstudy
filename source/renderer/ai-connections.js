// Keep display names separate from the model IDs accepted by each API.
const StudyAI = (() => {
  const templates = [
    {id:'deepseek',name:'DeepSeek · V4.1 Flash',provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',modelName:'DeepSeek-V4.1-Flash'},
    {id:'openai-6.1-sol',name:'OpenAI · GPT-6.1 Sol',provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol',modelName:'GPT-6.1 Sol'},
    {id:'openai-6-sol',name:'OpenAI · GPT-6 Sol',provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-6-sol',modelName:'GPT-6 Sol'},
    {id:'openai-6-astra',name:'OpenAI · GPT-6 Astra',provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-6-astra',modelName:'GPT-6 Astra'},
    {id:'openai-6-luna',name:'OpenAI · GPT-6 Luna',provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-6-luna',modelName:'GPT-6 Luna'}
  ];
  function apiName(config) {
    const template=templates.find(t=>t.provider===config.api.provider&&t.model===config.api.model);
    return template?.modelName||config.api.model||'API（未配置模型）';
  }
  function harnessName(config) { return config.harness.kind==='codex'?'Codex':config.harness.name||'自定义 Harness'; }
  function chatgptName(config){return 'ChatGPT 订阅 · '+(config.chatgpt?.modelName||config.chatgpt?.model||'未配置');}
  function label(config) {return config.mode==='chatgpt'?chatgptName(config):config.mode==='api'?apiName(config):harnessName(config);}
  function populate(select,config) {
    select.replaceChildren(new Option(harnessName(config),'harness'),new Option(apiName(config),'api'),new Option(chatgptName(config),'chatgpt'));
    select.value=config.mode;select.title='切换 AI 连接 · '+label(config);
    const parent=select.parentElement;
    let usage=parent.querySelector('.chatgpt-usage');
    if(!usage){usage=document.createElement('small');usage.className='chatgpt-usage';const text=document.createElement('span');text.textContent='使用 ChatGPT 订阅';const button=document.createElement('button');button.className='link-button';button.type='button';button.textContent='管理额度';button.onclick=()=>window.study.manageChatGPTUsage().catch(()=>{});usage.append(text,button);parent.append(usage);}
    usage.hidden=config.mode!=='chatgpt';
    usage.title=config.chatgpt?.accountLabel||'在 AI 设置中选择 ChatGPT 账号';
  }
  return {templates,apiName,harnessName,label,populate};
})();
