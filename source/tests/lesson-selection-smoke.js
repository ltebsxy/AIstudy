const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {_electron}=require('playwright-core');
const {normalizeCourse}=require('../lib/model');
async function main(){
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-selection-'));
 const course=normalizeCourse({title:'选取片段验证',knowledgeFormat:'sections',knowledge:'## 定义\n不要发送开头。只选这句 $\\frac{x^2}{2}$。第二个片段。不要发送结尾。\n## 另一小节\n不要自动发送整节内容。',questions:[{text:'练习'}]});
 fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));
 const exe=process.env.STUDY_TEST_EXE;
 const app=await _electron.launch({executablePath:exe||require('electron'),args:exe?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
 try{
  await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
  let page;for(const p of app.windows())if(await p.title()==='AI-StudyDesk')page=p;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({ipcMain,app})=>{
   const id='11111111-1111-1111-1111-111111111111';
   ipcMain.removeHandler('codex:list');ipcMain.handle('codex:list',()=>[{id,title:'测试任务'}]);
   ipcMain.removeHandler('codex:preferences');ipcMain.handle('codex:preferences',()=>({codexThreadId:id}));
   globalThis.__sent=[];
   const ask=async(_id,message)=>{globalThis.__sent.push(message);if(message.includes('模拟失败'))throw new Error('模拟失败');return '简短回答 $x^2$';};
   process.mainModule.require('./lib/desktop-codex').DesktopCodex.prototype.ask=ask;
   process.mainModule.require('./lib/codex-client').CodexClient.prototype.ask=ask;
  });
  await page.setViewportSize({width:1920,height:1080});
  await page.evaluate(()=>window.study.selectCodexThread('11111111-1111-1111-1111-111111111111'));
  await page.getByRole('button',{name:'开始学习'}).click();
  async function selectText(text){
   await page.locator('.reader-body').evaluate((el,text)=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()){const start=n.textContent.indexOf(text);if(start<0)continue;const r=document.createRange();r.setStart(n,start);r.setEnd(n,start+text.length);const s=getSelection();s.removeAllRanges();s.addRange(r);return;}
    throw new Error('Text missing');
   },text);
   await page.getByRole('button',{name:'加入侧边聊天',exact:true}).click();
  }
  await page.locator('.reader-body').evaluate(el=>{
   const r=document.createRange();r.setStart(el.firstChild,el.firstChild.textContent.indexOf('只选这句'));r.setEndAfter(el.querySelector('.math-expression'));
   const s=getSelection();s.removeAllRanges();s.addRange(r);
  });
  await page.getByRole('button',{name:'加入侧边聊天',exact:true}).waitFor();
  await page.screenshot({path:path.join(root,'.tmp','selection-action.png')});
  await page.getByRole('button',{name:'加入侧边聊天',exact:true}).click();
  await selectText('第二个片段');
  assert.equal(await page.locator('.fragment-chip').count(),2);
  assert((await page.locator('.fragment-chip').first().getAttribute('title')).includes('\\frac{x^2}{2}'));
  const cardBefore=await page.locator('.lesson-card').boundingBox();
  const panelBefore=await page.locator('.lesson-ai').boundingBox();
  const header=await page.locator('.lesson-ai header').boundingBox();
  await page.mouse.move(header.x+30,header.y+10);await page.mouse.down();await page.mouse.move(header.x-70,header.y+50);await page.mouse.up();
  const moved=await page.locator('.lesson-ai').boundingBox();assert(Math.abs(moved.x-(panelBefore.x-100))<2);
  await page.mouse.move(moved.x+moved.width-3,moved.y+moved.height-3);await page.mouse.down();await page.mouse.move(moved.x+moved.width+57,moved.y+moved.height+37);await page.mouse.up();
  const resized=await page.locator('.lesson-ai').boundingBox();assert(resized.width>moved.width+40);assert(resized.height>moved.height+20);
  assert.deepEqual(await page.locator('.lesson-card').boundingBox(),cardBefore);
  assert(!(await page.locator('.lesson-ai').innerText()).includes('只选这句'));
  assert.equal(await page.locator('#lesson-ai-input').inputValue(),'');
  await page.locator('#lesson-sections').selectOption('1');
  async function send(question){
   await page.waitForFunction(()=>!document.querySelector('#lesson-ai-send').disabled);
   const replies=await page.locator('.lesson-ai-message.assistant').count()+1;
   await page.locator('#lesson-ai-input').fill(question);
   await page.locator('#lesson-ai-send').click();
   await page.waitForFunction(n=>{const a=document.querySelectorAll('.lesson-ai-message.assistant');return a.length===n&&!a[n-1].textContent.includes('正在解释');},replies);
   return app.evaluate(()=>globalThis.__sent.at(-1));
  }
  let prompt=await send('说明含义');
  assert.equal(prompt,'解释知识点，语言精简。\n\n选取片段：\n只选这句 \\(\\frac{x^2}{2}\\)\n\n第二个片段\n\n问题：说明含义');
  assert.equal(await page.locator('.lesson-ai-message.user').last().innerText(),'说明含义');
  assert.equal(await page.locator('#lesson-ai-clear').isVisible(),false);
  prompt=await send('继续解释');assert(!prompt.includes('选取片段'));assert(!prompt.includes('不要自动发送'));
  await page.locator('#lesson-sections').selectOption('0');
  // Selecting inside a rendered formula recovers one intact LaTeX formula.
  await page.locator('.math-expression .katex-html').first().evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  await page.getByRole('button',{name:'加入侧边聊天',exact:true}).click();
  prompt=await send('模拟失败');assert(prompt.includes('\\frac{x^2}{2}'));
  assert.equal(await page.locator('#lesson-ai-clear').isVisible(),true);
  prompt=await send('重试');assert.equal(prompt.match(/frac/g).length,1);
  await selectText('第二个片段');await page.locator('#lesson-ai-clear').click();
  prompt=await send('只问这个');assert(!prompt.includes('选取片段'));
  await page.setViewportSize({width:1120,height:760});
  assert.equal(await page.locator('.lesson-ai').evaluate(el=>getComputedStyle(el).position),'fixed');
  await page.screenshot({path:path.join(root,'.tmp','selection-chat-small.png')});
  await page.getByRole('button',{name:'返回课程列表'}).click();
  assert.equal(await page.locator('#add-to-lesson-chat').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Selection chat passed: scoped fragments, math recovery, hidden context, cross-section selection, consume/clear, retry preservation, real IPC prompt, small-window float, listener cleanup.');
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
