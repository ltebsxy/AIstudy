const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {ChatHistory}=require('../lib/chat-history');
const {AIService}=require('../lib/ai-service');
const {CodexClient}=require('../lib/codex-client');
const {API_SYSTEM_PROMPT}=require('../lib/api-system-prompt');
const key='a'.repeat(64),threadId='11111111-1111-1111-1111-111111111111';
async function fixture(run){
 const requests=[];let failure=false,hold=false;
 const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const data=JSON.parse(body);requests.push(data);if(hold)return;res.setHeader('Content-Type','application/json');if(failure){res.writeHead(500);res.end('{}');return;}res.end(JSON.stringify(data.messages?{choices:[{message:{content:'学习摘要：保留定义条件与公式，尚需讨论反函数定义域。'}}]}:{reply:'学习摘要：保留反函数定义条件。'}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const config={mode:'api',api:{baseUrl:`http://127.0.0.1:${server.address().port}`,model:'test'},harness:{kind:'http',endpoint:`http://127.0.0.1:${server.address().port}/agent`,sessionId:'learning'}};
 const history=new ChatHistory(fs.mkdtempSync(path.join(os.tmpdir(),'study-compact-')));
 for(let i=0;i<12;i++)history.append(key,{role:i%2?'assistant':'user',text:`消息 ${i}：`+'定义的适用条件必须保留，函数与反函数的定义域相互对应。'.repeat(10),state:'done'});
 const service=new AIService({read:()=>config,key:()=>key,secret:()=>''},history,{cancel(){}},{cancel:async()=>{}});
 service.settings.secret=()=>config.mode==='api'?'fake-api-key':'';
 try{await run({service,history,config,requests,setFailure:value=>failure=value,setHold:value=>hold=value});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('summary reduces future context, survives restart, keeps full history and recent four; errors roll back',()=>fixture(async({service,history,requests,setFailure})=>{
 const original=fs.readFileSync(history.file(key),'utf8');
 const result=await service.compact({scope:'lesson',courseId:'course'});assert(result.after<result.before);
 assert.equal(fs.readFileSync(history.file(key),'utf8'),original);
 const restarted=new ChatHistory(history.root);assert.equal(restarted.summary(key).throughId,8);
 assert.deepEqual(restarted.context(key).slice(1).map(x=>x.id),[9,10,11,12]);assert.equal(restarted.page(key).items.length,5);
 await service.chat({scope:'lesson',courseId:'course',question:'继续',message:'解释知识点，语言精简。继续'});
 const sent=requests.at(-1).messages;assert.equal(sent[0].role,'system');assert.equal(sent[0].content,API_SYSTEM_PROMPT);assert(sent[1].content.includes('学习摘要'));assert.equal(sent.length,7);assert(!JSON.stringify(sent).includes('消息 0：'));
 const previous=fs.readFileSync(history.summaryFile(key),'utf8');setFailure(true);
 await assert.rejects(service.compact({scope:'lesson',courseId:'course'}),/HTTP 500/);assert.equal(fs.readFileSync(history.summaryFile(key),'utf8'),previous);
}));
test('HTTP Harness summarizes in a separate session and sends compressed history on next request',()=>fixture(async({service,history,config,requests})=>{
 config.mode='harness';await service.compact({scope:'exercise',courseId:'course'});
 assert(requests[0].sessionId.startsWith('learning-summary-'));assert.equal(requests[0].history.length,8);
 assert(!requests[0].history.some(x=>x.role==='system'));assert(!JSON.stringify(requests[0]).includes(API_SYSTEM_PROMPT));
 await service.chat({scope:'exercise',courseId:'course',question:'继续',message:'继续'});
 assert.equal(requests[1].sessionId,'learning');assert.equal(requests[1].history.length,5);assert.equal(history.read(key).length,14);
}));
test('cancelled compaction keeps original context and blocks concurrent sends',()=>fixture(async({service,history,setHold})=>{
 setHold(true);const pending=service.compact({scope:'lesson',courseId:'course'});const stopped=assert.rejects(pending,/停止/);
 await assert.rejects(service.chat({scope:'lesson',courseId:'course',question:'a',message:'a'}),/处理中/);
 assert.throws(()=>service.clearContext({scope:'lesson',courseId:'course'}),/回复完成/);
 await service.cancel();await stopped;assert.equal(history.summary(key),null);assert.equal(history.read(key).length,12);assert.equal(service.active,null);
}));
test('API clear drops previous messages, images and summary from requests, persists through restart, keeps local records',()=>fixture(async({service,history,config,requests})=>{
 await service.compact({scope:'lesson',courseId:'course'});
 const file=path.join(history.root,'old.png');fs.writeFileSync(file,Buffer.from('old-image'));
 history.append(key,{role:'user',text:'清除前的图片问题',prompt:'旧片段',files:[file],state:'done'});
 const original=fs.readFileSync(history.file(key),'utf8'),otherKey='b'.repeat(64);
 history.append(otherKey,{role:'user',text:'其他课程',state:'done'});
 service.clearContext({scope:'lesson',courseId:'course'});
 const restarted=new ChatHistory(history.root);assert.deepEqual(restarted.context(key),[]);assert.equal(restarted.summary(key),null);
 assert.equal(fs.readFileSync(history.file(key),'utf8'),original);assert.equal(restarted.context(otherKey).length,1);assert(fs.existsSync(file));
 await service.chat({scope:'lesson',courseId:'course',question:'新问题',message:'新的当前问题'});
 let sent=requests.at(-1).messages;assert.deepEqual(sent.map(x=>x.role),['system','user']);assert.equal(sent[0].content,API_SYSTEM_PROMPT);assert.equal(sent[1].content,'新的当前问题');
 await service.chat({scope:'lesson',courseId:'course',question:'接着问',message:'新的追问'});
 sent=requests.at(-1).messages;assert.deepEqual(sent.map(x=>x.role),['system','user','assistant','user']);assert.equal(sent.filter(x=>x.role==='system').length,1);assert(!JSON.stringify(sent).includes('旧片段'));
 for(let i=0;i<4;i++)history.append(key,{role:i%2?'assistant':'user',text:'清除后的新增材料。'.repeat(50),state:'done'});
 await service.compact({scope:'lesson',courseId:'course'});assert(!JSON.stringify(requests.at(-1)).includes('消息 0：'));assert(!JSON.stringify(history.context(key)).includes('消息 0：'));
 config.mode='harness';const preserved=fs.readFileSync(history.summaryFile(key),'utf8');assert.throws(()=>service.clearContext({scope:'lesson',courseId:'course'}),/仅适用于 API/);assert.equal(fs.readFileSync(history.summaryFile(key),'utf8'),preserved);
}));
test('Codex waits for matching compaction completion, not the initial acknowledgement',async()=>{
 const client=new CodexClient();client.readThread=async()=>({status:{type:'idle'},turns:[]});let acknowledged;
 const ready=new Promise(r=>acknowledged=r);client.request=async method=>{if(method==='thread/compact/start')acknowledged();return {};};
 let finished=false;const task=client.compact(threadId).then(()=>finished=true);await ready;await Promise.resolve();assert(!finished);
 client.receive({method:'item/completed',params:{threadId:'another',turnId:'other',item:{type:'contextCompaction'}}});assert(!finished);
 client.receive({method:'turn/started',params:{threadId,turn:{id:'compact1'}}});
 client.receive({method:'item/completed',params:{threadId,turnId:'compact1',item:{type:'contextCompaction'}}});
 client.receive({method:'turn/completed',params:{threadId,turn:{id:'compact1',status:'completed'}}});await task;assert(finished);assert.equal(client.compaction,null);
});
test('Codex reports desktop ownership without sending a fake compact message',async()=>{
 const client=new CodexClient(),calls=[];client.readThread=async()=>({status:{type:'idle'},turns:[]});client.request=async method=>{calls.push(method);throw new Error('active writer');};
 await assert.rejects(client.compact(threadId),/桌面管理/);assert.deepEqual(calls,['thread/resume']);assert.equal(client.asking,false);
});
test('Codex handles completion before compact acknowledgement and failed completion',async()=>{
 for(const status of ['completed','failed']){
  const client=new CodexClient();client.readThread=async()=>({status:{type:'idle'},turns:[]});client.loadedThreadId=threadId;
  client.request=async()=>{client.receive({method:'item/completed',params:{threadId,turnId:'early',item:{type:'contextCompaction'}}});client.receive({method:'turn/completed',params:{threadId,turn:{id:'early',status}}});return {};};
  if(status==='failed')await assert.rejects(client.compact(threadId),/未确认/);else await client.compact(threadId);
 }
});
