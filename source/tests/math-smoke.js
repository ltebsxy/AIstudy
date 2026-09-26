const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');
const { normalizeCourse } = require('../lib/model');
const fixture={"title":"数学渲染验证","knowledgeFormat":"sections","knowledge":"## 分式\n$\\frac{1}{\\sqrt{x}}$\n## 分段\n\\[f(x)=\\begin{cases}x&x>0\\\\0&x\\le 0\\end{cases}\\]","questions":[{"text":"计算 $\\frac{1}{2}$"},{"text":"\\[f(x)=\\begin{cases}x&x>0\\\\0&x\\le 0\\end{cases}\\]"}]};
async function main() {
  const root=path.resolve(__dirname,'..'), temp=fs.mkdtempSync(path.join(os.tmpdir(),'study-math-'));
  const previous=normalizeCourse(fixture,'math-fixture');
  fs.writeFileSync(path.join(temp,'courses.json'),JSON.stringify([previous]));
  const app=await _electron.launch({executablePath:process.env.STUDY_TEST_EXE||require('electron'),args:process.env.STUDY_TEST_EXE?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:temp}});
  try {
    await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
    let page,overlay;for(const p of app.windows()){if(await p.title()==='知序学习')page=p;else overlay=p;}
    const errors=[],external=[];
    for(const p of [page,overlay]){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});}
    await page.getByRole('button',{name:'开始学习'}).click();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp,'courses.json'))),[previous]);
    for(let i=0;i<2;i++){
      await page.locator('#lesson-sections').selectOption(String(i));
      assert.equal(await page.locator('.math-error').count(),0);
      if(i>=0)assert(await page.locator('.reader-body .katex').count()>0);
    }
    await page.locator('#lesson-sections').selectOption('0');
    await page.evaluate(()=>document.fonts.ready);
    assert(await page.evaluate(()=>document.fonts.check('16px KaTeX_Main')));
    assert(await page.locator('.frac-line').first().evaluate(e=>parseFloat(getComputedStyle(e).borderBottomWidth)>0));
    await page.locator('.reader-body').screenshot({path:path.join(root,'.tmp','math-lesson.png')});
    await page.getByRole('button',{name:'完成，开始做题'}).click();
    for(let i=0;i<2;i++){
      assert.equal(await overlay.locator('.math-error').count(),0);
      assert(await overlay.locator('.question-text .katex').count()>0);
      if(i===0)await overlay.screenshot({path:path.join(root,'.tmp','math-question.png')});
      if(i===1){assert(await overlay.locator('.math-block .mtable').count()>0);await overlay.screenshot({path:path.join(root,'.tmp','math-cases.png')});}
      if(i<1)await overlay.getByRole('button',{name:'下一题',exact:true}).click();
    }
    const reply=String.raw`计算结果：$\frac{1}{\sqrt{x}}$。
\[
\begin{aligned}f(x)&=x^2\\f(2)&=4\end{aligned}
\]`;
    await app.evaluate(({ipcMain},reply)=>{
      for(const [name,value] of [['codex:list',[{id:'11111111-1111-1111-1111-111111111111',title:'公式测试'}]],['codex:connection',{mode:'desktop',label:'公式测试'}],['codex:ask',reply]]){ipcMain.removeHandler(name);ipcMain.handle(name,()=>value);}
    },reply);
    await overlay.getByRole('button',{name:'AI 聊天'}).click();
    await overlay.locator('#chat-input').fill('测试公式');
    await overlay.getByRole('button',{name:'发送',exact:true}).click();
    await overlay.locator('.message.assistant .katex-display').waitFor();
    assert.equal(await overlay.locator('.math-error').count(),0);
    await overlay.getByRole('button',{name:'完成',exact:false}).click();
    await page.evaluate(reply=>renderGradingReport(document.getElementById('grading-report'),reply+'\n\n| 项目 | 结果 |\n| --- | --- |\n| 绝对值 | $|x|$ |'),reply);
    assert.equal(await page.locator('#grading-report .katex').count(),3);
    assert.equal(await page.locator('#grading-report table td').count(),2);
    const answer=path.join(temp,'answer.png');fs.writeFileSync(answer,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=','base64'));
    await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files.shift()]});},[answer,temp]);
    await page.getByRole('button',{name:'选择 PDF 或图片'}).click();
    await page.getByRole('button',{name:'生成批改包'}).click();
    await page.getByText('批改包已生成').waitFor();
    const folder=path.join(temp,fs.readdirSync(temp).find(n=>n.includes('-提交-')));
    assert(fs.existsSync(path.join(folder,'math/fonts/KaTeX_Main-Regular.woff2')));
    const exportWindow=app.waitForEvent('window');
    await app.evaluate(({BrowserWindow},file)=>{const win=new BrowserWindow({show:false});win.loadFile(file);},path.join(folder,'批改材料.html'));
    const teacher=await exportWindow;await teacher.locator('.katex').first().waitFor();
    assert.equal(await teacher.locator('.math-error').count(),0);
    await teacher.evaluate(()=>document.fonts.ready);
    assert(await teacher.evaluate(()=>document.fonts.check('16px KaTeX_Main')));
    await page.getByRole('button',{name:'新建课程'}).click();
    const knowledge=page.locator('#knowledge');await knowledge.fill('公式：');
    await page.locator('.math-editor').first().getByRole('button',{name:'分式',exact:true}).click();
    await page.locator('.math-preview .katex').waitFor();
    assert((await knowledge.inputValue()).includes(String.raw`$\frac{a}{b}$`));
    assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    console.log('Math UI passed: user data preservation, synthetic lesson/quiz formulae, fraction borders, local fonts, cases, chat, multiline report/table, offline teacher package and editor preview.');
  } finally {await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
