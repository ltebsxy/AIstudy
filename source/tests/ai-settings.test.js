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
test('settings isolate credentials, retain legacy task, clear secrets on endpoint change',()=>{
 const safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encoded:'+s),decryptString:b=>b.toString().slice(8)};
 const settings=new AISettings(temporary(),safe,()=>({codexThreadId:'11111111-1111-1111-1111-111111111111'}));
 assert.equal(settings.read().harness.threadId,'11111111-1111-1111-1111-111111111111');
 let c=settings.public();c.mode='api';c.api.apiKey='api-test';c.harness.endpoint='http://localhost:8000/agent';c.harness.token='harness-test';c=settings.save(c);
 assert(c.api.hasKey&&c.harness.hasToken);assert(!JSON.stringify(c).includes('encoded:'));
 const encryptedBefore=settings.read();settings.switchMode('harness');settings.switchMode('api');
 assert.deepEqual(settings.read().api,encryptedBefore.api);assert.deepEqual(settings.read().harness,encryptedBefore.harness);
 assert.equal(settings.secret(settings.read()),'api-test');assert.throws(()=>settings.switchMode('unknown'),/请选择/);
 c.mode='harness';settings.save(c);assert.equal(settings.secret(settings.read()),'harness-test');
 c.api.baseUrl='https://other.example/v1';c=settings.save(c);assert(!c.api.hasKey&&c.harness.hasToken);
 c.harness.endpoint='http://localhost:9000/agent';c=settings.save(c);assert(!c.harness.hasToken);
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
