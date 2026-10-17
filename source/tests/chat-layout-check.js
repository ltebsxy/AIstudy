// SPDX-License-Identifier: GPL-3.0-only
// One targeted layout flow, real renderer files with stubbed IPC and no personal data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),root=path.resolve(__dirname,'..'),output=path.join(root,'.tmp','ui-layout');
const lesson='<html><head><meta charset="utf-8">'+['style','lesson','ai-connections','theme','ui-tokens','ui','chat-layout'].map(n=>`<link rel="stylesheet" href="${n}.css">`).join('')+'</head><body><div id="view"><div class="toolbar"></div><div class="lesson-layout"><div class="lesson-content">Knowledge</div></div></div>'+['theme','chat-ui','ai-connections','floating-chat','lesson-chat'].map(n=>`<script src="${n}.js"></script>`).join('')+'</body></html>';
async function main(){
 fs.mkdirSync(output,{recursive:true});const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/renderer/lesson-fixture.html'){res.setHeader('content-type','text/html');return res.end(lesson);}const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.STUDY_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),errors=[],pages=[];
 try{
  const context=await browser.newContext({viewport:{width:430,height:560}});
  await context.addInitScript(()=>{
   const events={};let config={mode:'api',api:{provider:'custom',model:'测试模型'},chatgpt:{model:'测试订阅模型'}};
   const history=[{role:'user',text:'解释这个知识点。'},{role:'assistant',text:'布局测试回复。\n长消息换行，输入栏保持可见。'}];
   window.study=new Proxy({emit(name,data){for(const f of events[name]||[])f(data);},themeSnapshot:()=>({dark:false,mode:'light'}),onTheme:f=>{window.themeChange=f;return ()=>{};},getAISettings:async()=>config,switchAIMode:async mode=>config={...config,mode},chatHistory:async()=>({items:history,hasMore:false,nextBefore:null,key:'test'}),programmingActive:async()=>({courseId:'test',title:'编程课程'}),askLesson:()=>new Promise(r=>window.finishRequest=r),programmingAsk:()=>new Promise(r=>window.finishRequest=r),askAI:()=>new Promise(r=>window.finishRequest=r),cancelAI:async()=>window.finishRequest?.('请求已停止')},{get(target,key){if(key in target)return target[key];if(String(key).startsWith('on'))return f=>{(events[key]??=[]).push(f);return ()=>{};};return async()=>({});}});
   window.renderGradingReport=(el,text)=>el.textContent=text;window.setupLessonSelection=()=>()=>{};window.notify=()=>{};window.errorMessage=()=>{};
  });
  const url=`http://127.0.0.1:${server.address().port}/renderer/`;
  for(const name of ['lesson','reading','external','programming']){
   const page=await context.newPage();pages.push(page);page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(name+': '+e.message));
   if(name==='lesson'){await page.setViewportSize({width:1000,height:720});await page.goto(url+'lesson-fixture.html');await page.evaluate(()=>setupLessonChat({id:'test',title:'知识点课程'}));await page.locator('#ask-lesson-ai').click();}
   else if(name==='programming'){await page.goto(url+'programming-chat.html');await page.evaluate(()=>window.study.emit('onProgrammingChatMode',true));}
   else{await page.goto(url+'overlay.html'+(name==='reading'?'?embedded=1':''));await page.evaluate(mode=>window.study.emit('onCourse',{id:'test',sessionId:'test-session',title:'测试课程',sessionMode:mode,externalWriter:mode==='exercise',questions:[{text:'题目'}]}),name==='reading'?'reading':'exercise');if(name==='external'){await page.evaluate(()=>window.study.emit('onExerciseOverlayExpanded',true));await page.locator('#toggle-chat').click();}}
   const panel=page.locator(name==='lesson'?'.lesson-ai':name==='programming'?'#panel':'body'),input=panel.locator('.chat-composer textarea');await input.waitFor();await panel.locator('.assistant').getByText('布局测试回复。',{exact:false}).waitFor();
   const m=await panel.evaluate(el=>{const input=el.querySelector('.chat-composer textarea'),send=el.querySelector('.chat-send'),select=el.querySelector('.chat-connection-row select'),r=el.getBoundingClientRect();return {height:input.offsetHeight,send:send.offsetWidth,header:el.querySelector('.chat-header').offsetHeight,below:select.getBoundingClientRect().top>=input.getBoundingClientRect().bottom,overflow:el.scrollHeight>el.clientHeight+2,fit:[input,send,select].every(n=>{const x=n.getBoundingClientRect();return x.right<=r.right+1&&x.bottom<=r.bottom+1;}),font:getComputedStyle(el.querySelector('.assistant')).fontSize};});assert.equal(m.height,58,name);assert.equal(m.send,38,name);assert.equal(m.header,48,name);assert(m.below&&m.fit&&!m.overflow,`${name}: ${JSON.stringify(m)}`);assert.equal(m.font,'13px');
   await input.fill('保留的草稿');await page.screenshot({path:path.join(output,name+'-light.png'),animations:'disabled'});await page.evaluate(()=>window.themeChange({dark:true,mode:'dark'}));assert.equal(await panel.locator('.chat-send').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(163, 216, 191)',name);await page.screenshot({path:path.join(output,name+'-dark.png'),animations:'disabled'});
   await panel.locator('.chat-connection-row select').selectOption('chatgpt');await panel.locator('.chatgpt-usage').waitFor();assert.equal(await input.inputValue(),'保留的草稿',name);
   await input.press('Enter');await page.waitForFunction(()=>typeof window.finishRequest==='function');assert(await input.isDisabled());assert.equal(await panel.locator('.chat-send').getAttribute('aria-label'),'停止等待');await panel.locator('.chat-send').click();await page.waitForFunction(()=>!document.querySelector('.chat-composer textarea').disabled);
   if(name==='external'){await panel.locator('#close-ai').click();await page.locator('#toggle-chat').click();}
   if(name==='programming')await page.setViewportSize({width:360,height:420});
   assert(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('.chat-composer,.chat-footer')].every(n=>{const x=n.getBoundingClientRect();return x.right<=r.right+1&&x.bottom<=r.bottom+1;});}),name+' compact overflow');
  }
  assert.deepEqual(errors,[]);console.log('PASS: four AI layouts, light/dark colors, connection placement, draft preservation, send/stop and compact controls. IPC/AI stubbed.');
 }catch(error){for(const [i,page]of pages.entries())await page.screenshot({path:path.join(output,'failure-'+i+'.png')}).catch(()=>{});console.error(errors);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
