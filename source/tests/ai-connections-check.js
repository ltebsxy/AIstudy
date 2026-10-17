// Real settings/chat UI with local API transport and a stubbed subscription adapter.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),{normalizeCourse}=require('../lib/model'),{Library}=require('../lib/library');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-connections-'));
const course=normalizeCourse({title:'Connection check',knowledge:'Isolated test',questions:[{text:'Test'}],workTarget:{type:'builtin'}});
fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));
const library=new Library(path.join(data,'library')),input=path.join(data,'reading.txt');fs.writeFileSync(input,'Local reading');const doc=library.importPDF(input,{}).documents[0];
const old={mode:'harness',api:{provider:'custom',baseUrl:'https://old.example/v1',model:'old'},harness:{kind:'http',endpoint:'http://127.0.0.1:1/retired',encryptedToken:'retained-only'}};
const settingsFile=path.join(data,'ai-settings.json'),credentialFile=path.join(data,'desktop-pending.json'),historyFile=path.join(data,'chats','legacy.json');
fs.writeFileSync(settingsFile,JSON.stringify(old));fs.writeFileSync(credentialFile,'private retired journal');fs.mkdirSync(path.dirname(historyFile));fs.writeFileSync(historyFile,'retained history');
const requests=[];let app;
const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;requests.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'Local API answer'}}]}));});
async function main(){try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
 await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');const page=app.windows().find(p=>p.url().endsWith('index.html'));page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.library-page').waitFor();assert.equal(fs.readFileSync(settingsFile,'utf8'),JSON.stringify(old));
 await assert.rejects(page.evaluate(id=>window.study.askLesson({courseId:id,question:'must not send'}),course.id),/主动选择/);assert.equal(requests.length,0);
 assert.deepEqual(await page.evaluate(()=>['askCodex','continueInCodex','listCodexThreads','selectCodexThread'].filter(name=>name in window.study)),[]);
 assert.equal(await app.evaluate(({ipcMain})=>[...ipcMain._invokeHandlers.keys()].some(key=>key.startsWith('codex:'))),false);
 await page.locator('#nav-settings').click();await page.locator('#api-url').waitFor();assert.deepEqual(await page.locator('[name="ai-mode"]').evaluateAll(items=>items.map(item=>item.value)),['chatgpt','api']);
 assert.equal(await page.locator('[name="ai-mode"]:checked').count(),0);assert((await page.locator('#settings-status').textContent()).includes('主动选择'));
 await page.locator('[name="ai-mode"][value="api"]').check();await page.locator('#api-url').fill(`http://127.0.0.1:${server.address().port}/v1`);await page.locator('#api-model').fill('local-test');await page.locator('#api-key').fill('fake-api-key');await page.locator('#save-settings').click();await page.locator('#settings-status').filter({hasText:'已保存'}).waitFor();
 assert.equal(await page.evaluate(id=>window.study.askLesson({courseId:id,question:'API question'}),course.id),'Local API answer');assert.equal(requests.length,1);assert.equal(requests[0].model,'local-test');
 // Keep subscription auth/network unit coverage separate; this checks the routing boundary and UI.
 await app.evaluate(()=>{globalThis.subscriptionCalls=[];process.mainModule.require('./lib/chatgpt-connection').ChatGPTConnection.prototype.ask=async function(config,input){globalThis.subscriptionCalls.push({mode:config.mode,message:input.message});input.onUpdate?.('Subscription progress');return 'Subscription answer';};});
 await page.evaluate(id=>window.study.startSession('document:'+id,'reading'),doc.id);const writer=app.windows().find(p=>p.url().endsWith('/writer.html'));writer.on('pageerror',e=>errors.push(e.message));await writer.waitForFunction(()=>ready);await writer.locator('#toggle-ai').click();const chat=writer.frameLocator('#writer-ai-frame');
 await chat.locator('#chat-ai-mode').waitFor();assert.deepEqual(await chat.locator('#chat-ai-mode option').evaluateAll(items=>items.map(item=>item.value)),['api','chatgpt']);
 await chat.locator('#chat-input').fill('Retained draft');await chat.locator('#chat-ai-mode').selectOption('chatgpt');
 await writer.waitForFunction(()=>document.querySelector('#writer-ai-frame').contentWindow.document.querySelector('#chat-ai-mode').disabled===false);
 assert.equal(await chat.locator('#chat-input').inputValue(),'Retained draft');await chat.locator('#send-message').click();await chat.locator('.message.assistant').filter({hasText:'Subscription answer'}).waitFor();assert.equal(requests.length,1);assert.equal(await app.evaluate(()=>globalThis.subscriptionCalls.length),1);
 await chat.locator('#chat-ai-mode').selectOption('api');await writer.waitForFunction(()=>!document.querySelector('#writer-ai-frame').contentWindow.document.querySelector('#chat-ai-mode').disabled);await chat.locator('#chat-input').fill('API again');await chat.locator('#send-message').click();await chat.locator('.message.assistant').filter({hasText:'Local API answer'}).waitFor();assert.equal(requests.length,2);
 assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile)).harness,old.harness);assert.equal(fs.readFileSync(credentialFile,'utf8'),'private retired journal');assert.equal(fs.readFileSync(historyFile,'utf8'),'retained history');assert.equal(fs.readFileSync(input,'utf8'),'Local reading');assert(!fs.readFileSync(settingsFile,'utf8').includes('fake-api-key'));assert.deepEqual(errors,[]);
 console.log('Connections passed: legacy stays offline, settings/IPC removal, explicit API save, real local HTTP, subscription routing, mode/draft preservation and private-file retention.');
}finally{if(app)await app.close().catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-connections-'))fs.rmSync(data,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1;});
