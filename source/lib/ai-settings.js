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
  constructor(root, safeStorage, legacy = () => ({})) { this.root=root;this.safe=safeStorage;this.legacy=legacy; }
  read() {
    try { return JSON.parse(fs.readFileSync(path.join(this.root,'ai-settings.json'),'utf8')); }
    catch(e) { if(e.code!=='ENOENT')throw e;return { mode:'harness',api:{provider:'deepseek',baseUrl:'https://api.deepseek.com',model:''},harness:{kind:'codex',threadId:this.legacy().codexThreadId||'',endpoint:'',sessionId:'study'} }; }
  }
  public(config=this.read()) {
    const {encryptedKey,...api}=config.api;const {encryptedToken,...harness}=config.harness;
    return {...config,api:{...api,hasKey:Boolean(encryptedKey)},harness:{...harness,hasToken:Boolean(encryptedToken)}};
  }
  save(input) {
    const old=this.read();
    if(!['api','harness'].includes(input.mode))throw new Error('请选择 API 或 Harness。');
    const a=input.api||{},h=input.harness||{};
    if(!['deepseek','openai','custom'].includes(a.provider)||!['codex','http'].includes(h.kind))throw new Error('连接类型无效。');
    const api={provider:a.provider,baseUrl:endpoint(a.baseUrl),model:String(a.model||'').trim().slice(0,160)};
    const harness={kind:h.kind,name:String(h.name||'').trim().slice(0,80),threadId:String(h.threadId||'').trim(),endpoint:endpoint(h.endpoint,true),sessionId:String(h.sessionId||'study').trim().slice(0,160)};
    if(harness.threadId&&!/^[0-9a-f-]{20,}$/i.test(harness.threadId))throw new Error('Codex 任务 ID 无效。');
    const secret=(plain,remove,previous,same)=>{
      if(remove)return undefined;
      if(plain){if(String(plain).length>8192)throw new Error('密钥过长。');if(!this.safe.isEncryptionAvailable())throw new Error('系统加密不可用，无法保存密钥。');return this.safe.encryptString(String(plain).trim()).toString('base64');}
      return same?previous:undefined;
    };
    api.encryptedKey=secret(a.apiKey,a.clearKey,old.api.encryptedKey,api.baseUrl===old.api.baseUrl);
    harness.encryptedToken=secret(h.token,h.clearToken,old.harness.encryptedToken,harness.endpoint===old.harness.endpoint);
    const config={mode:input.mode,api,harness};
    fs.mkdirSync(this.root,{recursive:true});const file=path.join(this.root,'ai-settings.json');
    fs.writeFileSync(file+'.tmp',JSON.stringify(config,null,2));fs.renameSync(file+'.tmp',file);
    return this.public(config);
  }
  secret(config) {
    const encrypted=config.mode==='api'?config.api.encryptedKey:config.harness.encryptedToken;
    if(!encrypted)return '';
    try{return this.safe.decryptString(Buffer.from(encrypted,'base64'));}catch{throw new Error('无法解密密钥，请在设置中重新填写。');}
  }
  switchMode(mode) {
    if(!['api','harness'].includes(mode))throw new Error('请选择 API 或 Harness。');
    return this.save({...this.public(),mode});
  }
  identity(config=this.read()) {
    return config.mode==='api'?['api',config.api.baseUrl,config.api.model]:['harness',config.harness.kind,config.harness.kind==='codex'?config.harness.threadId:config.harness.endpoint,config.harness.kind==='http'?config.harness.sessionId:''];
  }
  key(scope,courseId,config=this.read()) { return crypto.createHash('sha256').update(JSON.stringify([scope,String(courseId),this.identity(config)])).digest('hex'); }
}
module.exports={AISettings,endpoint};
