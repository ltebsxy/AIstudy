const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {AISettings,endpoint}=require('../lib/ai-settings');
const {ChatHistory}=require('../lib/chat-history');
const {AIService}=require('../lib/ai-service');
const {askHTTP}=require('../lib/ai-http');
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'study-ai-unit-'));
test('retired connections stay offline until explicitly selected; data and credentials are preserved',async t=>{
 const root=temporary();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encoded:'+s),decryptString:b=>b.toString().slice(8)};
 const settings=new AISettings(root,safe);assert.equal(settings.public().mode,'unconfigured');
 const file=path.join(root,'ai-settings.json');
 for(const kind of ['codex','http']){
  const old={mode:'harness',api:{provider:'custom',baseUrl:'https://api.example/v1',model:'saved-model',encryptedKey:Buffer.from('encoded:api-test').toString('base64')},harness:{kind,threadId:'saved-thread',endpoint:'http://localhost:8000/agent',encryptedToken:'untouched-encrypted-token'},chatgpt:{model:'saved-subscription-model'}};
  const original=JSON.stringify(old);fs.writeFileSync(file,original);let c=settings.public();assert.equal(c.mode,'unconfigured');assert(c.connectionNotice.includes('主动选择'));assert(!('harness' in c));assert(!JSON.stringify(c).includes('encrypted'));assert.equal(fs.readFileSync(file,'utf8'),original);
  let requests=0;const service=new AIService(settings,{context(){assert.fail('must not read history');}}, {ask(){requests++;}});
  await assert.rejects(service.chat({scope:'lesson',courseId:'test',question:'test',message:'test'}),/主动选择/);
  await assert.rejects(service.direct(settings.read(),'test',[]),/主动选择/);await assert.rejects(service.compact({scope:'lesson',courseId:'test'}),/主动选择/);assert.equal(requests,0);
  assert.throws(()=>settings.switchMode('harness'),/请选择/);await assert.rejects(askHTTP(old,'old-secret',{message:'test'}),/选择 API/);
  const selected=settings.switchMode('api');assert.equal(selected.mode,'api');assert.equal(settings.secret(settings.read()),'api-test');assert.deepEqual(JSON.parse(fs.readFileSync(file)).harness,old.harness);
  settings.switchMode('chatgpt');settings.switchMode('api');assert.equal(settings.secret(settings.read()),'api-test');
  c=settings.public();c.api.baseUrl='https://other.example/v1';c=settings.save(c);assert(!c.api.hasKey);assert.deepEqual(JSON.parse(fs.readFileSync(file)).harness,old.harness);
 }
 assert.throws(()=>endpoint('http://remote.example/v1'),/HTTPS/);assert.throws(()=>endpoint('https://user:password@example.com'),/账号/);
});
test('history cursor survives new messages; only completed context is sent; pending user text is preserved',()=>{
 const history=new ChatHistory(temporary()),key='a'.repeat(64);
 for(let i=0;i<12;i++)history.append(key,{role:i%2?'assistant':'user',text:'m'+i,state:'done'});
 const latest=history.page(key);assert.deepEqual(latest.items.map(x=>x.id),[8,9,10,11,12]);
 const pending=history.append(key,{role:'user',text:'pending question',prompt:'private selected text',state:'pending'});
 assert.deepEqual(history.page(key,latest.before).items.map(x=>x.id),[3,4,5,6,7]);assert.equal(history.context(key).length,12);
 const visible=new AIService().publicItem(pending);assert.equal(visible.text,'pending question');assert(!('prompt' in visible));
 fs.writeFileSync(history.file(key),'invalid json');assert.throws(()=>history.append(key,{}),/读取失败/);assert.equal(fs.readFileSync(history.file(key),'utf8'),'invalid json');
});
test('HTTP cancellation, errors and redirects do not leak or forward credentials',async()=>{
 let destinationHits=0;
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/slow'))return;
  if(req.url.startsWith('/redirect')){res.writeHead(302,{Location:'/destination'});res.end();return;}
  if(req.url.startsWith('/destination'))destinationHits++;
  res.writeHead(401);res.end('sensitive response content');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const config={mode:'api',api:{model:'test',baseUrl:base}};
 try{
  await assert.rejects(askHTTP(config,'fake-secret',{message:'test'}),e=>e.message.includes('401')&&!e.message.includes('sensitive'));
  config.api.baseUrl=base+'/redirect';await assert.rejects(askHTTP(config,'fake-secret',{message:'test'}),/无法连接/);assert.equal(destinationHits,0);
  config.api.baseUrl=base+'/slow';const controller=new AbortController();const request=askHTTP(config,'fake-secret',{message:'test',signal:controller.signal});controller.abort();await assert.rejects(request,/已停止/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
