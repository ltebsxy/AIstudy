const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {_electron}=require('playwright-core');
const {normalizeCourse}=require('../lib/model');
async function main(){
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'study-workflow-'));
  const course=normalizeCourse({title:'逐题练习',workTarget:{type:'file',filePath:'synthetic-test.txt'},knowledgeFormat:'sections',knowledge:'## 映射\n每个输入有唯一输出。\n## 定义域\n定义域是允许的输入集合。',questions:[{text:'第一个问题 $x^2$'},{text:'第二个问题 $x+1$'},{text:'第三个问题 $x-1$'}]});
  fs.writeFileSync(path.join(temp,'courses.json'),JSON.stringify([course]));
  const app=await _electron.launch({executablePath:process.env.STUDY_TEST_EXE||require('electron'),args:process.env.STUDY_TEST_EXE?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:temp}});
  try{
    await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
    let page,overlay;for(const p of app.windows()){if(await p.title()==='AI-StudyDesk')page=p;else overlay=p;}
    const errors=[];page.on('pageerror',e=>errors.push(e.message));overlay.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({ipcMain,shell})=>{
      shell.openPath=async()=>'';
      ipcMain.removeHandler('codex:list');ipcMain.handle('codex:list',()=>[{id:'11111111-1111-1111-1111-111111111111',title:'学习测试'}]);
      ipcMain.removeHandler('lesson:ask');ipcMain.handle('lesson:ask',(_event,input)=>{globalThis.__lessonInput=input;return '定义域是允许输入的集合，例如 $x\\ge0$。';});
    });
    await page.getByRole('button',{name:'开始学习'}).click();
    await page.getByRole('button',{name:'问 AI',exact:true}).click();
    await page.locator('#lesson-sections').selectOption('1');
    await page.locator('.reader-body').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
    await page.getByRole('button',{name:'加入侧边聊天',exact:true}).click();
    await page.locator('#lesson-ai-input').fill('定义域是什么意思？');
    await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.locator('.lesson-ai-message.assistant .katex').waitFor();
    const sent=await app.evaluate(()=>globalThis.__lessonInput);
    assert.equal(sent.context,'定义域是允许的输入集合。');assert.equal(sent.question,'定义域是什么意思？');
    assert(!sent.context.includes('唯一输出'));
    await page.screenshot({path:path.join(root,'.tmp','lesson-ai.png')});
    await page.getByRole('button',{name:'关闭提问'}).click();
    await page.getByRole('button',{name:'完成，开始做题'}).click();
    await overlay.locator('#exercise-ball').click();await overlay.locator('#capture').waitFor({state:'visible'});
    await overlay.getByText('第一个问题',{exact:false}).waitFor();
    const visible=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='AI-StudyDesk').isVisible());
    async function capture(number,width,cancel=false){
      const pending=app.waitForEvent('window',{predicate:async p=>{await p.waitForLoadState();return await p.title()==='框选截图';}});await overlay.getByRole('button',{name:'截图',exact:false}).click();const cap=await pending;
      await cap.getByText('框选需要提交的作答区域').waitFor();
      if(cancel){const closed=cap.waitForEvent('close');await cap.keyboard.press('Escape').catch(e=>{if(!cap.isClosed())throw e;});await closed;return;}
      await cap.mouse.move(100,150);await cap.mouse.down();await cap.mouse.move(100+width,240);await cap.mouse.up();
      await cap.getByRole('button',{name:`保存第 ${number} 题并继续`}).click();
    }
    await capture(1,100);await overlay.getByText('第二个问题', {exact:false}).waitFor();assert.equal(await visible(),false);
    await capture(2,110,true);await overlay.getByText('第二个问题', {exact:false}).waitFor();assert.equal(await visible(),false);
    await overlay.getByRole('button',{name:'完成，下一题'}).click();await overlay.getByText('第三个问题',{exact:false}).waitFor();assert.equal(await visible(),false);
    await overlay.getByRole('button',{name:'上一题'}).click();await capture(2,120);await overlay.getByText('第三个问题',{exact:false}).waitFor();assert.equal(await visible(),false);
    await capture(3,160);await page.getByText('第 03 题 · 已截图').waitFor();assert.equal(await visible(),true);
    assert.equal(await page.locator('.submission-preview').count(),3);
    const before=await page.locator('.submission-preview').evaluateAll(imgs=>imgs.map(i=>i.src));
    await page.locator('.answer-tile').first().getByRole('button',{name:'重新截图'}).click();
    await overlay.getByText('第一个问题',{exact:false}).waitFor();await capture(1,180);
    await overlay.getByRole('button',{name:'下一题',exact:true}).click();
    await overlay.getByRole('button',{name:'完成并提交'}).click();await page.getByText('第 03 题 · 已截图').waitFor();
    const after=await page.locator('.submission-preview').evaluateAll(imgs=>imgs.map(i=>i.src));
    assert.notEqual(after[0],before[0]);assert.equal(after[1],before[1]);assert.equal(after[2],before[2]);
    await page.screenshot({path:path.join(root,'.tmp','per-question-submit.png')});
    await app.evaluate(({dialog},temp)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[temp]});},temp);
    await page.getByRole('button',{name:'生成批改包'}).click();await page.getByText('批改包已生成').waitFor();
    const folder=path.join(temp,fs.readdirSync(temp).find(n=>n.includes('-提交-')));
    const map=JSON.parse(fs.readFileSync(path.join(folder,'作答对应.json')));
    assert.deepEqual(map.answers.map(a=>a.questionId),course.questions.map(q=>q.id));
    for(const item of map.answers){assert.equal(fs.readFileSync(path.join(folder,item.fileName)).toString('base64'),after[item.number-1].split(',')[1]);}
    const html=fs.readFileSync(path.join(folder,'批改材料.html'),'utf8');assert(html.includes('第 1 题作答'));assert(html.includes('第 3 题作答'));
    assert.deepEqual(errors,[]);
    console.log('Workflow passed: selected-fragment AI sidebar, first/middle capture without submission, cancel, final auto-submit, retake isolation, numbered preview/export mappings.');
  }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
