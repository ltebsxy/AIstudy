// SPDX-License-Identifier: GPL-3.0-only
// A single focused, isolated UI check. No real account, browser login, or OpenAI usage.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright-core'),{normalizeCourse}=require('../lib/model');
async function main(){
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-chatgpt-ui-'));
  const course=normalizeCourse({title:'Subscription UI fixture',knowledge:'A short learning passage.',questions:[{text:'Practice'}]});
  fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));let app;
  try{
    app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();
    const page=app.windows().find(p=>p.url().endsWith('/index.html'));page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.getByText('我的学习空间',{exact:true}).waitFor();
    await app.evaluate(({shell,net})=>{
      const crypto=process.mainModule.require('node:crypto'),{privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
      const jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'},issuer='https://auth.openai.com',client='oaiapp_ui_fixture';
      const nativeFetch=globalThis.fetch;let nonce='';globalThis.fixtureRequests=[];globalThis.fixtureUsageOpened=false;
      const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
      net.fetch=async(url,options={})=>{
        if(options.credentials!=='omit')throw new Error('Browser cookies must be excluded');
        if(String(url).startsWith('http://127.0.0.1:'))return nativeFetch(url,options);
        if(url===issuer+'/.well-known/openid-configuration')return json({issuer,authorization_endpoint:issuer+'/api/accounts/authorize',token_endpoint:issuer+'/api/accounts/oauth/token',revocation_endpoint:issuer+'/api/accounts/oauth/revoke',jwks_uri:issuer+'/.well-known/jwks.json'});
        if(url===issuer+'/.well-known/jwks.json')return json({keys:[jwk]});
        if(url===issuer+'/api/accounts/oauth/token'){
          const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'fixture'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:issuer,aud:client,sub:'fixture',email:'ui@example.test',exp:Math.floor(Date.now()/1000)+3600,nonce})).toString('base64url');
          return json({access_token:'ui-access-fixture',refresh_token:'ui-refresh-fixture',id_token:h+'.'+p+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url'),token_type:'Bearer',expires_in:3600,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'});
        }
        if(url==='https://api.openai.com/v1/models')return json({models:[{slug:'fixture-model',display_name:'Fixture model',visibility:'list'},{slug:'hidden',display_name:'Hidden',visibility:'hide'}]});
        if(url==='https://api.openai.com/v1/responses'){globalThis.fixtureRequests.push(JSON.parse(options.body));return new Response('data: {"type":"response.output_text.delta","delta":"A concise answer."}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n');}
        if(url===issuer+'/api/accounts/oauth/revoke')return new Response('',{status:200});
        throw new Error('Unexpected network request');
      };
      shell.openExternal=async url=>{
        if(url==='https://chatgpt.com/settings/usage'){globalThis.fixtureUsageOpened=true;return;}
        const auth=new URL(url);nonce=auth.searchParams.get('nonce');const callback=new URL(auth.searchParams.get('redirect_uri'));
        callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('client_id',client);callback.searchParams.set('code','fixture-code');await nativeFetch(callback);
      };
    });
    await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('#chatgpt-login').click();
    await page.locator('.chatgpt-welcome').waitFor();await page.getByRole('button',{name:'知道了',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#chatgpt-model')?.value==='fixture-model');
    assert.equal(await page.locator('#chatgpt-model option').count(),1);await page.locator('#chatgpt-system-prompt').fill('Keep it short.');
    await page.locator('#save-settings').click();await page.getByText('已保存，当前使用 ChatGPT 订阅 · Fixture model。',{exact:true}).waitFor();
    const config=await page.evaluate(()=>window.study.getAISettings());assert.equal(config.mode,'chatgpt');assert(!JSON.stringify(config).includes('ui-access-fixture'));assert(!fs.readFileSync(path.join(data,'chatgpt-accounts.json'),'utf8').includes('ui-refresh-fixture'));
    await page.locator('#settings-back').click();await page.locator('.open').click();await page.getByRole('button',{name:'问 AI',exact:true}).click();
    await page.locator('.chatgpt-usage').waitFor();await page.locator('.chatgpt-usage button').click();assert(await app.evaluate(()=>globalThis.fixtureUsageOpened));
    await page.locator('#lesson-ai-input').fill('hello');await page.locator('#lesson-ai-send').click();await page.getByText('A concise answer.',{exact:true}).waitFor();
    assert(await page.locator('#lesson-ai-reset').isVisible());await page.locator('#lesson-ai-reset').click();await page.locator('#lesson-ai-status').getByText('上下文已清除。下次提问从新对话开始，本地聊天记录保留。',{exact:true}).waitFor();
    const request=await app.evaluate(()=>globalThis.fixtureRequests[0]);assert.equal(request.store,false);assert.equal(request.stream,true);assert.equal(request.instructions,'Keep it short.');
    await page.getByRole('button',{name:'关闭提问',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('#chatgpt-logout').click();await page.getByText('已退出 ChatGPT，并结束可续期会话。',{exact:true}).waitFor();
    assert(!(await page.evaluate(()=>window.study.getChatGPTState())).accounts[0].connected);assert.deepEqual(errors,[]);
    console.log('ChatGPT settings UI passed: simulated official login, welcome, models, encrypted storage, chat, usage link, clear context and logout. No live subscription used.');
  }finally{if(app)await app.close().catch(()=>{});fs.rmSync(data,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
