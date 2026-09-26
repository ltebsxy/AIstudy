const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {_electron}=require('playwright-core');
const {normalizeCourse}=require('../lib/model');
async function main(){
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-chat-capture-'));
 const course=normalizeCourse({title:'截图用途验证',knowledge:'内容',questions:[{text:'第一题'},{text:'最后一题'}]});
 fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));
 const exe=process.env.STUDY_TEST_EXE;
 const app=await _electron.launch({executablePath:exe||require('electron'),args:exe?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
 try{
  await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
  let page,overlay;for(const p of app.windows()){if(await p.title()==='知序学习')page=p;else overlay=p;}
  const errors=[];overlay.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({ipcMain})=>{
   const id='11111111-1111-1111-1111-111111111111';
   ipcMain.removeHandler('codex:list');ipcMain.handle('codex:list',()=>[{id,title:'测试任务'}]);
   ipcMain.removeHandler('codex:preferences');ipcMain.handle('codex:preferences',()=>({codexThreadId:id}));
   ipcMain.removeHandler('codex:connection');ipcMain.handle('codex:connection',()=>({label:'测试连接'}));
   const ask=async(_id,message)=>{globalThis.__chatMessage=message;if(message.includes('模拟失败'))throw new Error('模拟失败');return '已查看截图。';};
   process.mainModule.require('./lib/desktop-codex').DesktopCodex.prototype.ask=ask;
   process.mainModule.require('./lib/codex-client').CodexClient.prototype.ask=ask;
  });
  await page.getByRole('button',{name:'开始学习'}).click();await page.getByRole('button',{name:'完成，开始做题'}).click();
  const visible=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='知序学习').isVisible());
  async function capture(chat,number,cancel=false){
   const pending=app.waitForEvent('window');await overlay.locator('#capture').click();const cap=await pending;
   await cap.getByText(chat?'框选要向 AI 提问的内容':'框选需要提交的作答区域').waitFor();
   if(cancel){const closed=cap.waitForEvent('close');await cap.keyboard.press('Escape').catch(e=>{if(!cap.isClosed())throw e;});await closed;return;}
   await cap.mouse.move(100,180);await cap.mouse.down();await cap.mouse.move(260,280);await cap.mouse.up();
   await cap.getByRole('button',{name:chat?'加入 AI 输入':`保存第 ${number} 题并继续`}).click();
  }
  await page.evaluate(()=>window.study.selectCodexThread('11111111-1111-1111-1111-111111111111'));
  await overlay.locator('#toggle-chat').click();
  await capture(true,1);await overlay.locator('.chat-attachment').waitFor();
  assert.equal(await overlay.evaluate(()=>index),0);assert.deepEqual(await overlay.evaluate(()=>captured),[]);assert.equal(await visible(),false);
  const preview=await overlay.locator('.chat-attachment img').getAttribute('src');
  await overlay.locator('#chat-input').fill('模拟失败');await overlay.locator('#send-message').click();
  await overlay.locator('.message.error').waitFor();assert.equal(await overlay.locator('.chat-attachment').count(),1);
  await overlay.locator('#chat-input').fill('这一步对吗？');await overlay.locator('#send-message').click();await overlay.getByText('已查看截图。',{exact:true}).waitFor();
  const prompt=await app.evaluate(()=>globalThis.__chatMessage);
  assert(prompt.includes('第一题'));assert(prompt.includes('这一步对吗？'));
  const file=prompt.split('\n').at(-1);assert.equal(fs.readFileSync(file).toString('base64'),preview.split(',')[1]);assert.equal(await overlay.locator('.chat-attachment').count(),0);
  await overlay.locator('#toggle-chat').click();await capture(false,1);await overlay.getByText('最后一题',{exact:true}).waitFor();
  assert.deepEqual(await overlay.evaluate(()=>captured),[0]);
  await overlay.locator('#toggle-chat').click();await capture(true,2,true);assert.equal(await overlay.locator('.chat-attachment').count(),0);
  await capture(true,2);await overlay.locator('.chat-attachment').waitFor();assert.equal(await overlay.evaluate(()=>index),1);assert.equal(await visible(),false);assert.deepEqual(await overlay.evaluate(()=>captured),[0]);
  await overlay.screenshot({path:path.join(root,'.tmp','chat-capture-input.png')});
  await overlay.getByRole('button',{name:'移除截图 1'}).click();assert.equal(await overlay.locator('.chat-attachment').count(),0);
  await overlay.locator('#toggle-chat').click();await capture(false,2);await page.getByText('第 02 题 · 已截图').waitFor();
  assert.equal(await visible(),true);assert.equal(await page.locator('.submission-preview').count(),2);assert.deepEqual(errors,[]);
  console.log('Chat screenshots passed: prompt references exact PNG, retry retains input, no AI capture advances/submits even on last question; normal captures still advance/submit, cancel/remove work.');
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
