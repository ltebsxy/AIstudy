const {API_SYSTEM_PROMPT}=require('./api-system-prompt');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function endpoint(value, optional = false) {
  if (!value && optional) return '';
  let url; try { url = new URL(String(value)); } catch { throw new Error('请输入完整的接口地址。'); }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('接口地址不支持账号、查询参数或片段。');
  if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('远程接口请使用 HTTPS；本机服务可以使用 HTTP。');
  return url.href.replace(/\/+$/, '');
}
class AISettings {
  constructor(root, safeStorage) { this.root=root;this.safe=safeStorage; }
  read() {
    let saved={};
    try { saved=JSON.parse(fs.readFileSync(path.join(this.root,'ai-settings.json'),'utf8')); }
    catch(e) { if(e.code!=='ENOENT')throw e; }
    const supported=['api','chatgpt'].includes(saved.mode);
    return {...saved,mode:supported?saved.mode:'unconfigured',api:{provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'',...saved.api},
      connectionNotice:supported?'':saved.mode&&saved.mode!=='unconfigured'?'原代理接入已移除，请在 AI 设置中主动选择 API 或 ChatGPT 订阅。旧配置与聊天记录仍保留，不会自动发送请求。':'请在 AI 设置中选择 API 或 ChatGPT 订阅。'};
  }
  public(config=this.read()) {
    const {encryptedKey,...api}=config.api;
    return {mode:config.mode,connectionNotice:config.connectionNotice||'',chatgpt:{accountId:'',model:'',systemPrompt:API_SYSTEM_PROMPT,...config.chatgpt},api:{systemPrompt:API_SYSTEM_PROMPT,...api,hasKey:Boolean(encryptedKey)},defaultSystemPrompt:API_SYSTEM_PROMPT};
  }
  save(input) {
    const old=this.read();
    if(!['api','chatgpt'].includes(input.mode))throw new Error('请选择 API 或 ChatGPT 订阅。');
    const a=input.api||{},c=input.chatgpt||old.chatgpt||{};
    if(!['deepseek','openai','custom'].includes(a.provider))throw new Error('连接类型无效。');
    if(a.systemPrompt!=null&&(typeof a.systemPrompt!=='string'||a.systemPrompt.length>20000))throw new Error('系统提示词请控制在 20000 字以内。');
    if(c.systemPrompt!=null&&(typeof c.systemPrompt!=='string'||c.systemPrompt.length>20000))throw new Error('系统提示词请控制在 20000 字以内。');
    const chatgpt={accountId:String(c.accountId||'').slice(0,100),model:String(c.model||'').trim().slice(0,160),modelName:String(c.modelName||'').slice(0,200),accountLabel:String(c.accountLabel||'').slice(0,400),systemPrompt:c.systemPrompt??API_SYSTEM_PROMPT};
    if(chatgpt.accountId&&!/^[0-9a-f-]{36}$/i.test(chatgpt.accountId))throw new Error('ChatGPT 账号 ID 无效。');
    const api={systemPrompt:a.systemPrompt??old.api.systemPrompt??API_SYSTEM_PROMPT,provider:a.provider,baseUrl:endpoint(a.baseUrl),model:String(a.model||'').trim().slice(0,160)};
    const secret=(plain,remove,previous,same)=>{
      if(remove)return undefined;
      if(plain){if(String(plain).length>8192)throw new Error('密钥过长。');if(!this.safe.isEncryptionAvailable())throw new Error('系统加密不可用，无法保存密钥。');return this.safe.encryptString(String(plain).trim()).toString('base64');}
      return same?previous:undefined;
    };
    api.encryptedKey=secret(a.apiKey,a.clearKey,old.api.encryptedKey,api.baseUrl===old.api.baseUrl);
    // Preserve retired settings and encrypted credentials on disk without exposing or using them.
    const {connectionNotice,...retained}=old;
    const config={...retained,mode:input.mode,api,chatgpt};
    fs.mkdirSync(this.root,{recursive:true});const file=path.join(this.root,'ai-settings.json');
    fs.writeFileSync(file+'.tmp',JSON.stringify(config,null,2));fs.renameSync(file+'.tmp',file);
    return this.public(config);
  }
  secret(config) {
    if(config.mode!=='api')return '';
    const encrypted=config.api.encryptedKey;
    if(!encrypted)return '';
    try{return this.safe.decryptString(Buffer.from(encrypted,'base64'));}catch{throw new Error('无法解密密钥，请在设置中重新填写。');}
  }
  switchMode(mode) {
    if(!['api','chatgpt'].includes(mode))throw new Error('请选择 API 或 ChatGPT 订阅。');
    return this.save({...this.public(),mode});
  }
  identity(config=this.read()) {
    if(config.mode==='chatgpt')return ['chatgpt',config.chatgpt?.accountId||'',config.chatgpt?.model||''];
    return config.mode==='api'?['api',config.api.baseUrl,config.api.model]:['unconfigured'];
  }
  key(scope,courseId,config=this.read()) { return crypto.createHash('sha256').update(JSON.stringify([scope,String(courseId),this.identity(config)])).digest('hex'); }
}
module.exports={AISettings,endpoint};
