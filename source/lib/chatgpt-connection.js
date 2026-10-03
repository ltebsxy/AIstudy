// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
// Official OSS Sign in with ChatGPT. Tokens never cross the main-process boundary.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {filePart}=require('./ai-http');
const {API_SYSTEM_PROMPT}=require('./api-system-prompt');
const ISSUER='https://auth.openai.com';
const RESOURCE='https://api.openai.com/v1';
const SCOPE='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const DIRECT='chatgpt.tokens.use.direct';
const LOGIN_STAGES={discovery:'获取登录配置',browser:'打开授权浏览器',callback:'等待浏览器授权返回',token:'交换授权凭据',identity:'验证账号身份',save:'保存登录',complete:'登录完成'};
const USAGE_URL='https://chatgpt.com/settings/usage';
const TERMINAL_REFRESH=new Set(['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused']);
function serviceError(status,code){
  const messages={
    access_denied:'已取消 ChatGPT 授权。',
    invalid_client:'OpenAI 未接受此应用注册，请检查客户端注册配置。',
    unauthorized_client:'OpenAI 尚未允许此客户端使用该授权流程。',
    invalid_scope:'OpenAI 未接受请求的授权范围。',
    invalid_grant:'ChatGPT 授权已失效，请重新登录。',
    subscription_sharing_user_not_eligible:'此账号或工作区暂不允许共享 ChatGPT 订阅额度。请在 ChatGPT 中检查资格及工作区政策。',
    subscription_sharing_usage_limit_exceeded:'ChatGPT 订阅额度已达到限制，请点击“管理额度”查看并调整。',
    subscription_sharing_usage_unavailable:'ChatGPT 额度服务暂不可用，请稍后重试。',
    subscription_sharing_user_unavailable:'ChatGPT 账号服务暂不可用，请稍后重试。',
    subscription_sharing_unsupported_capability:'当前 ChatGPT 订阅连接不支持此输入或能力，请更换模型或材料。',
    subscription_sharing_route_not_supported:'当前接口不支持 ChatGPT 订阅授权。',
    subscription_sharing_invalid_user:'ChatGPT 授权已失效，请重新登录。',
    chatpass_v2_scope_not_authorized:'尚未授权使用 ChatGPT 订阅，请在设置中重新授权。',
    invalid_authorization_context:'ChatGPT 授权上下文无效，请在设置中重新登录。',
    chatpass_v2_invalid_authorization_context:'ChatGPT 授权上下文无效，请在设置中重新登录。'
  };
  const error=new Error(messages[code]||(status===401?'ChatGPT 授权已失效，请重新登录。':status===429?'ChatGPT 请求受到限制，请点击“管理额度”检查。':`ChatGPT 服务返回 HTTP ${status||'错误'}，请稍后重试。`));
  error.code=typeof code==='string'&&/^[a-z0-9_]{1,100}$/i.test(code)?code:'';
  error.status=status;return error;
}
function equalSecret(a,b){const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function textPart(text,files=[]){
  return [{type:'input_text',text:String(text||'')},...files.filter(f=>fs.existsSync(f)).map(f=>{
    const part=filePart(f);return part.type==='file'?{type:'input_file',...part.file}:{type:'input_image',image_url:part.image_url.url};
  })];
}
async function consumeResponse(response,onUpdate){
  if(!response.body)throw new Error('ChatGPT 未返回回复流。');
  let buffer='',answer='',completed=false;
  const decoder=new TextDecoder();
  const event=frame=>{
    const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return;
    let value;try{value=JSON.parse(data);}catch{throw new Error('ChatGPT 回复流格式无效。');}
    if(value.type==='response.output_text.delta'){answer+=value.delta||'';onUpdate?.(answer);}
    if(value.type==='response.completed'){
      if(value.response?.status&&value.response.status!=='completed')throw new Error('ChatGPT 回复未完成，请重试。');
      completed=true;
    }
    if(['response.failed','response.incomplete','error'].includes(value.type)){
      throw serviceError(0,value.response?.error?.code||value.error?.code||value.code);
    }
  };
  for await(const chunk of response.body){
    buffer=(buffer+decoder.decode(chunk,{stream:true})).replace(/\r\n/g,'\n');
    let end;while((end=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,end));buffer=buffer.slice(end+2);}
    if(buffer.length>4*1024*1024)throw new Error('ChatGPT 回复流过大。');
  }
  buffer+=decoder.decode();if(buffer.trim())event(buffer);
  if(!completed)throw new Error('ChatGPT 回复被中断，尚未完成，请重试。');
  if(!answer.trim())throw new Error('ChatGPT 没有返回文字回复。');
  return answer;
}
class ChatGPTConnection{
  constructor(root,safeStorage,{fetch:fetcher=(...args)=>globalThis.fetch(...args),now=Date.now,loginTimeout=300000}={}){
    Object.assign(this,{root,safe:safeStorage,fetcher,now,loginTimeout});
    this.file=path.join(root,'chatgpt-accounts.json');this.pending=null;this.refreshes=new Map();this.models=new Map();this.signingOut=new Set();
    this.loginStatus=null;
    try{const saved=JSON.parse(fs.readFileSync(path.join(root,'chatgpt-login-status.json'),'utf8'));if(LOGIN_STAGES[saved.stage])this.loginStatus={stage:saved.stage,label:LOGIN_STAGES[saved.stage],outcome:['failed','complete'].includes(saved.outcome)?saved.outcome:'interrupted',at:saved.at};}catch{}
  }
  setLoginStage(stage,outcome='pending',error){
    // Only fixed stage labels and bounded machine metadata; never URLs, codes, tokens or response bodies.
    this.loginStatus={stage,label:LOGIN_STAGES[stage],outcome,at:new Date(this.now()).toISOString()};
    if(error?.status)this.loginStatus.status=error.status;
    if(error?.code&&/^[a-z0-9_]{1,100}$/i.test(error.code))this.loginStatus.code=error.code;
    try{fs.mkdirSync(this.root,{recursive:true});fs.writeFileSync(path.join(this.root,'chatgpt-login-status.json'),JSON.stringify(this.loginStatus),{mode:0o600});}catch{}
  }
  read(){
    let data;
    try{data=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('ChatGPT 账号文件读取失败，原文件已保留。');return {version:1,hostId:'urn:uuid:'+crypto.randomUUID(),accounts:[],welcomedSubjects:[]};}
    // Older builds saved a bare UUID. Preserve its identity while adopting the official URI format.
    if(typeof data.hostId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.hostId)){
      data.hostId='urn:uuid:'+data.hostId;this.write(data);
    }
    return data;
  }
  write(data){fs.mkdirSync(this.root,{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
  account(id){const account=this.read().accounts.find(a=>a.id===id);if(!account)throw new Error('请选择已保存的 ChatGPT 账号。');return account;}
  credentials(account){
    if(!account.encrypted)throw new Error('请在 AI 设置中登录 ChatGPT。');
    try{return JSON.parse(this.safe.decryptString(Buffer.from(account.encrypted,'base64')));}catch{throw new Error('无法解密 ChatGPT 凭据，请重新登录。');}
  }
  encrypt(tokens){if(!this.safe.isEncryptionAvailable()||this.safe.getSelectedStorageBackend?.()==='basic_text')throw new Error('系统安全加密不可用，无法保存 ChatGPT 凭据。');return this.safe.encryptString(JSON.stringify(tokens)).toString('base64');}
  publicState(){const data=this.read(),welcomeAccountIds=data.accounts.filter(a=>a.encrypted&&a.planEnabled&&!(data.welcomedSubjects||[]).includes(a.subject)).map(a=>a.id);return {pending:Boolean(this.pending),loginStatus:this.loginStatus,accounts:data.accounts.map(a=>({id:a.id,label:a.label,email:a.email||'',connected:Boolean(a.encrypted),planEnabled:Boolean(a.encrypted&&a.planEnabled),models:this.models.get(a.id)||[]})),needsWelcome:Boolean(welcomeAccountIds.length),welcomeAccountIds};}
  acknowledgeWelcome(id){const data=this.read(),selected=id?data.accounts.filter(a=>a.id===id):data.accounts.filter(a=>a.encrypted&&a.planEnabled);data.welcomedSubjects=[...new Set([...(data.welcomedSubjects||[]),...selected.map(a=>a.subject).filter(Boolean)])];this.write(data);}
  async fetch(url,options={}){
    try{return await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.any([options.signal||new AbortController().signal,AbortSignal.timeout(30000)])});}
    catch{if(options.signal?.aborted)throw new Error('已停止 ChatGPT 请求。');throw new Error('无法连接 OpenAI，请检查网络或稍后重试。');}
  }
  async json(url,options){
    const response=await this.fetch(url,options);let body;
    try{body=await response.json();}catch{
      if(!response.ok){const error=new Error(`OpenAI 返回 HTTP ${response.status}（非 JSON 页面）。请检查网络／系统代理及 OpenAI 的访问限制。`);error.status=response.status;throw error;}
      throw new Error('OpenAI 返回非 JSON 数据，请检查网络／系统代理是否返回了登录或验证页面。');
    }
    if(!response.ok)throw serviceError(response.status,body.error?.code||body.error||body.detail);return body;
  }
  async discovery(signal){
    const data=await this.json(ISSUER+'/.well-known/openid-configuration',{signal});
    // Never send credentials to endpoints supplied by an unexpected origin.
    for(const key of ['authorization_endpoint','token_endpoint','jwks_uri','revocation_endpoint']){
      let url;try{url=new URL(data[key]);}catch{throw new Error('OpenAI 授权端点配置无效。');}
      if(url.origin!==ISSUER||url.username||url.password||url.search||url.hash)throw new Error('OpenAI 授权端点配置无效。');
    }
    if(data.issuer!==ISSUER)throw new Error('OpenAI 身份签发者无效。');return data;
  }
  async verifyIdToken(token,clientId,nonce,expectedSubject,discovery,signal){
    try{
      const parts=String(token||'').split('.');if(parts.length!==3)throw new Error();
      const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
      if(header.alg!=='RS256'||typeof header.kid!=='string'||header.crit)throw new Error();
      const jwks=await this.json(discovery.jwks_uri,{signal});
      const key=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
      if(!key||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error();
      const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud],seconds=this.now()/1000;
      if(claims.iss!==ISSUER||!audience.includes(clientId)||(audience.length>1&&claims.azp!==clientId)||(claims.azp&&claims.azp!==clientId)||!Number.isFinite(claims.exp)||claims.exp<=seconds||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>1024||(claims.nbf!=null&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds+60))||(claims.iat!=null&&(!Number.isFinite(claims.iat)||claims.iat>seconds+60)))throw new Error();
      if(nonce&&!equalSecret(claims.nonce,nonce))throw new Error();
      if(expectedSubject&&claims.sub!==expectedSubject)throw new Error();
      return claims;
    }catch{throw new Error('ChatGPT 身份验证失败，未替换已保存账号，请重新登录。');}
  }
  tokens(response,previous){
    if(typeof response.access_token!=='string'||!response.access_token||response.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(response.expires_in)||response.expires_in<=0)throw new Error('ChatGPT 授权凭据无效。');
    const scopes=typeof response.scope==='string'?response.scope.split(/\s+/).filter(Boolean):previous?.scopes||[];
    return {accessToken:response.access_token,refreshToken:response.refresh_token||previous?.refreshToken||'',idToken:response.id_token||previous?.idToken||'',expiresAt:this.now()+response.expires_in*1000,scopes};
  }
  async login({accountId='',consent=false}={},openBrowser){
    if(this.pending)throw new Error('已有 ChatGPT 登录正在进行。');
    if(!this.safe.isEncryptionAvailable()||this.safe.getSelectedStorageBackend?.()==='basic_text')throw new Error('系统安全加密不可用，无法登录 ChatGPT。');
    const old=accountId?this.account(accountId):null,data=this.read();this.write(data);
    const pending={controller:new AbortController(),server:null,stop:null};this.pending=pending;
    try{
      this.setLoginStage('discovery');
      const discovery=await this.discovery(pending.controller.signal);if(pending.controller.signal.aborted)throw new Error('已取消 ChatGPT 登录。');
      const state=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
      let resolveCallback,rejectCallback,accepted=false;
      const callback=new Promise((resolve,reject)=>{resolveCallback=resolve;rejectCallback=reject;});callback.catch(()=>{});
      pending.stop=()=>rejectCallback(new Error('已取消 ChatGPT 登录。'));
      const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
        const reply=(status,message)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end('<!doctype html><meta charset="utf-8"><title>AI-StudyDesk</title><p>'+message+'</p>');};
        let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{return reply(400,'请求无效。');}
        if(req.method!=='GET'||url.pathname!=='/auth/callback')return reply(404,'未找到。');
        if(accepted||url.searchParams.getAll('state').length!==1||!equalSecret(url.searchParams.get('state'),state))return reply(400,'授权状态不匹配，请返回正确的登录窗口。');
        accepted=true;
        if(url.searchParams.has('error')){reply(400,'授权未完成，请返回 AI-StudyDesk。');rejectCallback(serviceError(0,url.searchParams.get('error')));return;}
        const clientId=url.searchParams.get('client_id')||old?.clientId;
        const code=url.searchParams.get('code');
        if(!clientId||!/^oaiapp_[A-Za-z0-9_-]+$/.test(clientId)||(old&&clientId!==old.clientId)||!code||url.searchParams.getAll('code').length!==1||url.searchParams.getAll('client_id').length>1){reply(400,'授权信息无效，请返回应用重新登录。');rejectCallback(new Error('ChatGPT 授权回调无效。'));return;}
        reply(200,'授权已返回。请关闭此页面，回到 AI-StudyDesk 等待身份验证完成。');resolveCallback({clientId,code});
      });
      pending.server=server;server.requestTimeout=10000;server.headersTimeout=10000;
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      const redirectUri=`http://127.0.0.1:${server.address().port}/auth/callback`;
      const params=new URLSearchParams({client_id:old?.clientId||'dynamic_agent_client',ext_agent_host_id:data.hostId,response_type:'code',redirect_uri:redirectUri,scope:SCOPE,resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
      if(!old)params.set('agent_name_hint','AI-StudyDesk');
      if(old?.encrypted){const credentials=this.credentials(old);if(credentials.idToken)params.set('id_token_hint',credentials.idToken);}
      if(old?.email)params.set('login_hint',old.email);if(consent)params.set('prompt','consent');
      const timer=setTimeout(()=>rejectCallback(new Error('ChatGPT 登录超时，请重试。')),this.loginTimeout);
      let result;
      try{
        if(pending.controller.signal.aborted)throw new Error('已取消 ChatGPT 登录。');
        this.setLoginStage('browser');
        try{await openBrowser(discovery.authorization_endpoint+'?'+params);}catch{throw new Error('无法打开系统浏览器，请检查默认浏览器后重试。');}
        this.setLoginStage('callback');
        result=await callback;
      }finally{clearTimeout(timer);server.closeAllConnections();server.close();}
      let response;
      this.setLoginStage('token');
      try{response=await this.json(discovery.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:result.clientId,code:result.code,code_verifier:verifier,redirect_uri:redirectUri,resource:RESOURCE}),signal:pending.controller.signal});}
      catch(e){
        // Keep a newly issued registration for a fresh code, without trusting an unverified identity.
        if(e.code==='invalid_grant'&&!old){const data=this.read();if(!data.accounts.some(a=>a.clientId===result.clientId)){data.accounts.push({id:crypto.randomUUID(),clientId:result.clientId,subject:'',label:`ChatGPT 账号 ${data.accounts.length+1}`,planEnabled:false});this.write(data);}}
        throw e;
      }
      this.setLoginStage('identity');
      const identity=await this.verifyIdToken(response.id_token,result.clientId,nonce,old?.subject,discovery,pending.controller.signal);
      const tokens=this.tokens(response),current=this.read();if(pending.controller.signal.aborted)throw new Error('已取消 ChatGPT 登录。');
      if(current.accounts.some(a=>a.clientId===result.clientId&&a.subject&&a.subject!==identity.sub))throw new Error('ChatGPT 身份与此注册不匹配，原账号已保留。');
      let profile=current.accounts.find(a=>a.clientId===result.clientId&&(a.subject===identity.sub||a.id===old?.id&&!a.subject));
      if(!profile){profile={id:old?.id||crypto.randomUUID(),clientId:result.clientId,subject:identity.sub,label:`ChatGPT 账号 ${current.accounts.length+1}`};current.accounts.push(profile);}
      profile.subject=identity.sub;
      profile.email=typeof identity.email==='string'?identity.email.slice(0,320):'';
      this.setLoginStage('save');
      profile.encrypted=this.encrypt(tokens);profile.planEnabled=tokens.scopes.includes(DIRECT);this.write(current);this.models.delete(profile.id);
      this.setLoginStage('complete','complete');
      return {accountId:profile.id,...this.publicState(),pending:false};
    }catch(error){
      const stage=this.loginStatus?.stage||'discovery';this.setLoginStage(stage,'failed',error);
      const failure=new Error(`ChatGPT 登录失败（${LOGIN_STAGES[stage]}）：${error.message}`);failure.code=error.code;failure.status=error.status;throw failure;
    }finally{pending.server?.closeAllConnections();pending.server?.close();if(this.pending===pending)this.pending=null;}
  }
  cancelLogin(){this.pending?.controller.abort();this.pending?.stop?.();this.pending?.server?.closeAllConnections();this.pending?.server?.close();return true;}
  async accessToken(id){
    if(this.signingOut.has(id))throw new Error('此 ChatGPT 账号正在退出。');
    const account=this.account(id),tokens=this.credentials(account);
    if(!tokens.scopes.includes(DIRECT))throw new Error('此账号已登录，但尚未授权使用 ChatGPT 订阅。请在设置中点击重新授权。');
    if(tokens.expiresAt>this.now()+60000)return tokens.accessToken;
    if(!this.refreshes.has(id)){
      const refresh=this.refresh(id).finally(()=>this.refreshes.delete(id));this.refreshes.set(id,refresh);
    }
    return this.refreshes.get(id);
  }
  async refresh(id){
    const account=this.account(id),previous=this.credentials(account);if(!previous.refreshToken)throw new Error('ChatGPT 登录已过期，请重新登录。');
    const discovery=await this.discovery();let response;
    try{response=await this.json(discovery.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:account.clientId,refresh_token:previous.refreshToken,resource:RESOURCE})});}
    catch(e){if(TERMINAL_REFRESH.has(e.code)){const data=this.read(),profile=data.accounts.find(a=>a.id===id);if(profile){delete profile.encrypted;profile.planEnabled=false;this.write(data);}this.models.delete(id);throw new Error('ChatGPT 登录已过期，请重新登录。');}throw e;}
    if(response.id_token)await this.verifyIdToken(response.id_token,account.clientId,null,account.subject,discovery);
    const tokens=this.tokens(response,previous),data=this.read(),profile=data.accounts.find(a=>a.id===id);
    if(!profile?.encrypted)throw new Error('ChatGPT 账号已退出。');
    profile.encrypted=this.encrypt(tokens);profile.planEnabled=tokens.scopes.includes(DIRECT);this.write(data);
    if(!profile.planEnabled)throw new Error('ChatGPT 订阅授权已停用，请重新授权。');return tokens.accessToken;
  }
  async listModels(id,signal){
    const token=await this.accessToken(id);
    const data=await this.json(RESOURCE+'/models',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal});
    if(!Array.isArray(data.models))throw new Error('ChatGPT 未提供有效模型目录。');
    const models=data.models.filter(m=>m.visibility==='list'&&typeof m.slug==='string'&&typeof m.display_name==='string').map(m=>({slug:m.slug,displayName:m.display_name}));
    this.models.set(id,models);return models;
  }
  async logout(id){
    this.account(id);this.signingOut.add(id);let revoked=false;
    try{
      await this.refreshes.get(id)?.catch(()=>{});
      const profile=this.account(id),tokens=profile.encrypted?this.credentials(profile):null;
      if(!tokens?.refreshToken)revoked=true;
      else try{
        const discovery=await this.discovery();
        for(let attempt=0;attempt<2;attempt++){
          try{const response=await this.fetch(discovery.revocation_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refreshToken,token_type_hint:'refresh_token',client_id:profile.clientId})});if(response.status===200){revoked=true;break;}if(response.status<500)break;}catch{}
          if(attempt===0)await new Promise(resolve=>setTimeout(resolve,500));
        }
      }catch{}
      return {message:revoked?'已退出 ChatGPT，并结束可续期会话。':'已清除本机 ChatGPT 凭据，但未确认远程撤销。请在 ChatGPT 设置中断开此应用。',revoked};
    }finally{const data=this.read(),profile=data.accounts.find(a=>a.id===id);if(profile){delete profile.encrypted;profile.planEnabled=false;this.write(data);}this.models.delete(id);this.signingOut.delete(id);}
  }
  async ask(config,{message,files=[],history=[],signal,onUpdate}){
    const {accountId,model,systemPrompt}=config.chatgpt||{};if(!accountId||!model)throw new Error('请在 AI 设置中登录 ChatGPT 并选择模型。');
    const models=this.models.get(accountId)||await this.listModels(accountId,signal);if(!models.some(m=>m.slug===model))throw new Error('此账号已无法使用所选模型，请刷新模型列表后重新选择。');
    const token=await this.accessToken(accountId);
    const input=history.map(item=>item.role==='assistant'?{role:'assistant',content:String(item.prompt||item.text||'')}:{role:'user',content:textPart(item.prompt||item.text,item.files||[])});
    input.push({role:'user',content:textPart(message,files)});
    const body={model,instructions:systemPrompt??API_SYSTEM_PROMPT,input,store:false,stream:true};
    try{
      const response=await this.fetcher(RESOURCE+'/responses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(300000)])});
      if(!response.ok){let data;try{data=await response.json();}catch{}throw serviceError(response.status,data?.error?.code||data?.error||data?.detail);}
      return await consumeResponse(response,onUpdate);
    }catch(e){if(signal?.aborted)throw new Error('已停止等待。');if(e.status!==undefined||e.message.startsWith('ChatGPT'))throw e;throw new Error('ChatGPT 连接中断，请检查网络或稍后重试。');}
  }
}
module.exports={ChatGPTConnection,consumeResponse,USAGE_URL};
