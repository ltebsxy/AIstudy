// SPDX-License-Identifier: GPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {ChatGPTConnection,consumeResponse}=require('../lib/chatgpt-connection');
const {AISettings}=require('../lib/ai-settings');
const {AIService}=require('../lib/ai-service');
const {ChatHistory}=require('../lib/chat-history');
const issuer='https://auth.openai.com',resource='https://api.openai.com/v1',clientId='oaiapp_test';
const discovery={issuer,authorization_endpoint:issuer+'/api/accounts/authorize',token_endpoint:issuer+'/api/accounts/oauth/token',jwks_uri:issuer+'/.well-known/jwks.json',revocation_endpoint:issuer+'/api/accounts/oauth/revoke'};
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
function sign(claims,alg='RS256'){
  const a=Buffer.from(JSON.stringify({alg,kid:'fixture'})).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url');
  return a+'.'+b+'.'+crypto.sign('RSA-SHA256',Buffer.from(a+'.'+b),privateKey).toString('base64url');
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-chatgpt-test-')),key=crypto.randomBytes(32);
  const safe={isEncryptionAvailable:()=>true,encryptString:s=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(s),cipher.final(),cipher.getAuthTag()]);},decryptString:b=>{const decipher=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(-16));return Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString();}};
  const state={nonce:'',subject:'subject-1',scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',requests:[],refreshes:0,revokeFails:false,refreshError:'',inference:[]};
  const claims=()=>({iss:issuer,aud:clientId,exp:Math.floor(Date.now()/1000)+3600,nonce:state.nonce,sub:state.subject,email:'fixture@example.test'});
  const fetcher=async(url,options={})=>{
    state.requests.push({url,options});
    if(url===issuer+'/.well-known/openid-configuration')return json(discovery);
    if(url===discovery.jwks_uri)return json({keys:[jwk]});
    if(url===discovery.token_endpoint){
      const form=new URLSearchParams(options.body);assert.equal(form.get('client_id'),clientId);assert.equal(form.get('resource'),resource);assert.equal(form.get('client_secret'),null);
      if(form.get('grant_type')==='refresh_token'){
        state.refreshes++;assert.equal(form.get('scope'),null);if(state.refreshError)return json({error:state.refreshError},400);
        await new Promise(r=>setTimeout(r,10));return json({access_token:'test-access-rotated',refresh_token:'test-refresh-rotated',token_type:'Bearer',expires_in:3600,scope:state.scope});
      }
      assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),state.redirectUri);
      assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'),state.challenge);
      return json({access_token:'test-access',refresh_token:'test-refresh',id_token:sign(claims()),token_type:'Bearer',expires_in:3600,scope:state.scope});
    }
    if(url===resource+'/models'){assert.equal(options.cache,'no-store');return json({models:[{slug:'m-hidden',display_name:'Hidden',visibility:'hide'},{slug:'m-first',display_name:'First model',visibility:'list'},{slug:'m-second',display_name:'Second model',visibility:'list'},{slug:'gpt-6-sol',display_name:'GPT-6 Sol',visibility:'list'},{slug:'gpt-6.1-sol',display_name:'GPT-6.1 Sol',visibility:'list'}]});}
    if(url===resource+'/responses'){state.inference.push(JSON.parse(options.body));return new Response('data: {"type":"response.output_text.delta","delta":"Hello"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n');}
    if(url===discovery.revocation_endpoint){assert.equal(new URLSearchParams(options.body).get('token_type_hint'),'refresh_token');if(state.revokeFails)return new Response('',{status:503});return new Response('',{status:200});}
    throw new Error('Unexpected network destination in test');
  };
  const connection=new ChatGPTConnection(root,safe,{fetch:fetcher,loginTimeout:5000});
  const browser=async(auth,{wrongState=false,returning=false,changedClient=false}={})=>{
    const url=new URL(auth);state.nonce=url.searchParams.get('nonce');state.redirectUri=url.searchParams.get('redirect_uri');state.challenge=url.searchParams.get('code_challenge');
    assert.equal(url.origin,issuer);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('client_id'),returning?clientId:'dynamic_agent_client');
    assert.match(url.searchParams.get('ext_agent_host_id'),/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(url.searchParams.get('ext_agent_host_id'),connection.read().hostId);
    assert.equal(url.searchParams.get('agent_name_hint'),returning?null:'AI-StudyDesk');
    const target=new URL(state.redirectUri);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/auth/callback');
    target.searchParams.set('state',wrongState?'wrong':url.searchParams.get('state'));target.searchParams.set('code','fixture-code');target.searchParams.set('client_id',changedClient?'oaiapp_other':clientId);
    const response=await fetch(target);return response.status;
  };
  return {root,safe,state,connection,claims,browser,dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('legacy host IDs migrate once to UUID URIs without replacing UUIDs, registrations or encrypted credentials',()=>{
  const f=fixture();try{
    const uuid=crypto.randomUUID(),legacy={version:1,hostId:uuid,accounts:[{id:'saved-profile',clientId,encrypted:'opaque-encrypted-record',subject:'saved-identity'}],welcomedSubjects:['saved-identity']};
    f.connection.write(legacy);
    const migrated=f.connection.read();assert.equal(migrated.hostId,'urn:uuid:'+uuid);assert.deepEqual(migrated.accounts,legacy.accounts);assert.deepEqual(migrated.welcomedSubjects,legacy.welcomedSubjects);
    const before=fs.readFileSync(f.connection.file,'utf8');assert.equal(f.connection.read().hostId,migrated.hostId);assert.equal(fs.readFileSync(f.connection.file,'utf8'),before);
    assert.equal(new ChatGPTConnection(f.root,f.safe).read().hostId,migrated.hostId);
  }finally{f.dispose();}
});
test('official OAuth validates state, PKCE, ID signature/nonce/account, encrypts tokens and preserves returning registration',async()=>{
  const f=fixture();try{
    const result=await f.connection.login({},async url=>{assert.equal(await f.browser(url,{wrongState:true}),400);assert.equal(await f.browser(url),200);});
    assert.equal(result.pending,false);assert(result.accounts[0].planEnabled);assert(result.needsWelcome);
    const stored=f.connection.read(),host=stored.hostId,encoded=stored.accounts[0].encrypted;
    assert(!fs.readFileSync(f.connection.file,'utf8').includes('test-access'));assert(!JSON.stringify(f.connection.publicState()).includes('refreshToken'));
    await f.connection.login({accountId:result.accountId},url=>f.browser(url,{returning:true}));assert.equal(f.connection.read().hostId,host);assert.equal(f.connection.read().accounts.length,1);
    f.state.subject='other-subject';await assert.rejects(f.connection.login({accountId:result.accountId},url=>f.browser(url,{returning:true})),/身份验证失败/);assert.equal(f.connection.read().accounts[0].subject,'subject-1');
    await assert.rejects(f.connection.login({accountId:result.accountId},url=>{throw new Error(url);}),e=>e.message.includes('系统浏览器')&&!e.message.includes('id_token_hint'));
    const token=sign({...f.claims(),sub:'subject-1',nonce:'wrong'});await assert.rejects(f.connection.verifyIdToken(token,clientId,'right',null,discovery),/身份验证失败/);
    await assert.rejects(f.connection.verifyIdToken(sign(f.claims(),'none'),clientId,f.state.nonce,null,discovery),/身份验证失败/);
    await assert.rejects(f.connection.verifyIdToken(sign({...f.claims(),aud:'other'}),clientId,f.state.nonce,null,discovery),/身份验证失败/);
    assert(encoded);f.connection.acknowledgeWelcome();assert.equal(f.connection.publicState().needsWelcome,false);
  }finally{f.connection.cancelLogin();f.dispose();}
});
test('identity-only grant stays signed in but cannot infer; callback mismatches and cancel leave saved credentials intact',async()=>{
  const f=fixture();try{
    f.state.scope='openid profile email';const result=await f.connection.login({},f.browser);assert(result.accounts[0].connected);assert(!result.accounts[0].planEnabled);
    await assert.rejects(f.connection.accessToken(result.accountId),/尚未授权/);
    const before=fs.readFileSync(f.connection.file,'utf8');
    await assert.rejects(f.connection.login({accountId:result.accountId},url=>f.browser(url,{returning:true,changedClient:true})),/回调无效/);
    assert.equal(fs.readFileSync(f.connection.file,'utf8'),before);
    await assert.rejects(f.connection.login({accountId:result.accountId},()=>f.connection.cancelLogin()),/取消/);assert.equal(f.connection.publicState().pending,false);
  }finally{f.dispose();}
});
test('refresh is serialized, rotates credentials atomically; terminal failure clears tokens; logout retains client mapping',async()=>{
  const f=fixture();try{
    const result=await f.connection.login({},f.browser),id=result.accountId;
    const expire=()=>{const data=f.connection.read(),tokens=f.connection.credentials(data.accounts[0]);tokens.expiresAt=0;data.accounts[0].encrypted=f.connection.encrypt(tokens);f.connection.write(data);};
    expire();assert.deepEqual(await Promise.all([f.connection.accessToken(id),f.connection.accessToken(id)]),['test-access-rotated','test-access-rotated']);assert.equal(f.state.refreshes,1);assert.equal(f.connection.credentials(f.connection.account(id)).refreshToken,'test-refresh-rotated');
    f.state.refreshError='temporarily_unavailable';expire();await assert.rejects(f.connection.accessToken(id));assert(f.connection.account(id).encrypted);
    f.state.refreshError='invalid_grant';await assert.rejects(f.connection.accessToken(id),/已过期/);assert(!f.connection.account(id).encrypted);
    f.state.refreshError='';await f.connection.login({accountId:id},url=>f.browser(url,{returning:true}));
    f.state.revokeFails=true;const logout=await f.connection.logout(id);assert(!logout.revoked);assert.match(logout.message,/未确认远程撤销/);assert(!f.connection.account(id).encrypted);assert.equal(f.connection.account(id).clientId,clientId);assert(!JSON.stringify(f.connection.publicState()).includes('test-access'));
  }finally{f.dispose();}
});
test('account catalog and Responses use only granted account/models, explicit context and store:false streaming; clear preserves local history',async()=>{
  const f=fixture();try{
    const result=await f.connection.login({},f.browser),models=await f.connection.listModels(result.accountId);assert.deepEqual(models.map(m=>m.slug),['m-first','m-second','gpt-6-sol','gpt-6.1-sol']);
    const settings=new AISettings(f.root,f.safe),config=settings.public();config.mode='chatgpt';config.chatgpt={accountId:result.accountId,model:'m-first',systemPrompt:'Be concise.'};settings.save(config);
    const history=new ChatHistory(path.join(f.root,'chats')),service=new AIService(settings,history,{cancel(){}},{cancel(){}},f.connection),key=settings.key('lesson','course');
    history.append(key,{role:'user',text:'earlier',state:'done'});history.append(key,{role:'assistant',text:'previous answer',state:'done'});
    const updates=[];assert.equal(await service.chat({scope:'lesson',courseId:'course',question:'hello',message:'hello',onUpdate:x=>updates.push(x)}),'Hello');
    const body=f.state.inference[0];assert.deepEqual(Object.keys(body).sort(),['input','instructions','model','store','stream']);assert.equal(body.instructions,'Be concise.');assert.equal(body.input.length,3);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(updates.at(-1),'Hello');
    assert.equal(settings.secret(settings.read()),'');const apiKey=settings.key('lesson','course',{...settings.read(),mode:'api'});assert.notEqual(apiKey,key);
    service.clearContext({scope:'lesson',courseId:'course'});await service.chat({scope:'lesson',courseId:'course',question:'new',message:'new'});assert.equal(f.state.inference[1].input.length,1);assert.equal(history.read(key).length,6);
    config.chatgpt.model='unlisted';await assert.rejects(f.connection.ask(config,{message:'x'}),/无法使用/);assert.equal(f.state.inference.length,2);
  }finally{f.dispose();}
});
test('SSE rejects failed/incomplete/interrupted text instead of committing a partial answer, and supports split CRLF',async()=>{
  const frames='data: {"type":"response.output_text.delta","delta":"partial"}\n\n';
  await assert.rejects(consumeResponse(new Response(frames)),/中断/);
  await assert.rejects(consumeResponse(new Response(frames+'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n')),/管理额度/);
  await assert.rejects(consumeResponse(new Response(frames+'data: {"type":"response.incomplete"}\n\n')));
  const content=frames+'data: {"type":"response.completed"}\n\n',crlf=content.replace(/\n/g,'\r\n');
  const chunks=new ReadableStream({start(c){for(const char of crlf)c.enqueue(Buffer.from(char));c.close();}});
  assert.equal(await consumeResponse(new Response(chunks)),'partial');
});
test('network rejection pages show HTTP/access failure and never expose raw HTML as an OAuth JSON error',async()=>{
  const f=fixture();try{
    f.connection.fetcher=async()=>new Response('<html>sensitive diagnostic page</html>',{status:403});
    await assert.rejects(f.connection.discovery(),e=>e.message.includes('HTTP 403')&&!e.message.includes('sensitive'));
    await assert.rejects(f.connection.login({},()=>assert.fail('Browser must not open on discovery failure')),e=>e.message.includes('获取登录配置')&&e.status===403&&!e.message.includes('sensitive'));
    const status=JSON.parse(fs.readFileSync(path.join(f.root,'chatgpt-login-status.json'),'utf8'));
    assert.equal(status.stage,'discovery');assert.equal(status.outcome,'failed');assert.equal(status.status,403);
    assert(!JSON.stringify(status).includes('https://'));assert(!JSON.stringify(status).includes('sensitive'));
    assert(!f.connection.publicState().accounts.length);
  }finally{f.dispose();}
});
