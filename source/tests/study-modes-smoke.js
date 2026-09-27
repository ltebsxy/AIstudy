async function captureAnswer(writer,app){const pending=app.waitForEvent('window');await writer.locator('#capture-answer').click();const cap=await pending;await cap.getByText('框选需要提交的作答区域').waitFor();await cap.evaluate(()=>window.study.commitCapture({x:90,y:150,width:320,height:240})).catch(e=>{if(!cap.isClosed())throw e;});}
const {pdfFixture}=require('./reading-fixtures');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {_electron}=require('playwright-core');
const {normalizeCourse}=require('../lib/model');

async function main(){
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-modes-'));
  const course=normalizeCourse({title:'读写与题型测试',knowledge:'这是合成测试知识。',questions:[
    {id:'single',type:'choice',text:'请选择 $1+1$ 的值',options:['1','2','3']},
    {id:'multiple',type:'choice',multiple:true,text:'选择偶数',options:['2','3','4']},
    {id:'blank',type:'blank',text:'填写两个结果',blanks:['第一空','第二空']},
    {id:'written',text:'写出计算过程'}
  ]});
  fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));
  const pdf=path.join(data,'reading.pdf');fs.writeFileSync(pdf,pdfFixture());
  const requests=[],errors=[];
  const server=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;requests.push(JSON.parse(text));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'本地测试回复。'}}]}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let app,page,overlay,writer,chat;
  async function launch(){
    app=await _electron.launch({executablePath:process.env.STUDY_TEST_EXE||require('electron'),args:process.env.STUDY_TEST_EXE?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
    await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
    for(const p of app.windows()){const title=await p.title();if(title==='AI-StudyDesk')page=p;if(title==='题目悬浮窗')overlay=p;}
    for(const p of [page,overlay])p.on('pageerror',e=>errors.push(e.message));
    await page.getByText('我的学习空间',{exact:true}).waitFor();
    await app.evaluate(({shell,desktopCapturer,nativeImage,screen})=>{
      globalThis.opened=[];shell.openPath=async file=>{globalThis.opened.push(file);return '';};
      desktopCapturer.getSources=async()=>{const d=screen.getPrimaryDisplay(),size=d.size;return [{display_id:String(d.id),thumbnail:nativeImage.createFromBitmap(Buffer.alloc(size.width*size.height*4,255),size)}];};
    });
  }
  async function findWriter(){writer=app.windows().find(p=>p.url().endsWith('/writer.html'));if(!writer)writer=await app.waitForEvent('window',{predicate:p=>p.url().endsWith('/writer.html')});writer.on('pageerror',e=>errors.push(e.message));await writer.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('自动保存'));chat=writer.frameLocator('#writer-ai-frame');}
  async function choose(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>file?{canceled:false,filePaths:[file]}:{canceled:true,filePaths:[]};},file);}
  async function drawInk(){
    await writer.bringToFront();const box=await writer.locator('#paper').boundingBox();
    await writer.mouse.move(box.x+90,box.y+180);await writer.mouse.down();await writer.mouse.move(box.x+150,box.y+220,{steps:8});await writer.mouse.up();
    await writer.getByText('已自动保存',{exact:true}).waitFor();
  }
  try{
    await launch();
    await page.evaluate(base=>window.study.saveAISettings({mode:'api',api:{provider:'custom',baseUrl:base,model:'local-test',apiKey:'synthetic-test-key'},harness:{kind:'codex',threadId:'',endpoint:'',sessionId:'study'}}),`http://127.0.0.1:${server.address().port}/v1`);
    // Verify that the editor can create all types and preserve references/options on save.
    await page.getByTitle('编辑',{exact:true}).click();
    assert.equal(await page.locator('.question-type').nth(0).inputValue(),'choice');
    assert.equal(await page.locator('.question-type').nth(2).inputValue(),'blank');
    await page.locator('.question-type').nth(3).selectOption('blank');
    await page.locator('.question-blanks').last().fill('临时空');
    await page.locator('.question-type').nth(3).selectOption('written');
    assert.equal(await page.locator('.target-tab.selected').textContent(),'使用默认程序');
    await page.locator('#save-course').click();await page.getByText('我的学习空间',{exact:true}).waitFor();
    await page.getByRole('button',{name:'开始学习'}).click();
    await page.locator('#finish-lesson').click();await findWriter();await writer.locator('[name="answer-option"]').first().waitFor();
    await writer.bringToFront();await writer.locator('[name="answer-option"][value="1"]').check();
    assert.equal(await writer.locator('#question-number').innerText(),'题目 1 / 4');
    await writer.locator('#next-question').click();await writer.locator('[type="checkbox"]').first().waitFor();
    await writer.locator('input[value="0"]').check();await writer.locator('input[value="2"]').check();await writer.locator('#next-question').click();
    await writer.locator('.blank-answer').nth(0).fill('$x^2$');await writer.locator('.blank-answer').nth(1).pressSequentially('hello');
    assert.equal(await writer.locator('.blank-answer').nth(1).inputValue(),'hello');
    assert.equal(await writer.locator('.blank-answer').nth(1).evaluate(el=>el===document.activeElement),true);
    await writer.locator('#question-select').selectOption('1');await writer.waitForFunction(()=>index===1);assert.equal(await writer.locator('[type="checkbox"]:checked').count(),2);
    await writer.locator('#question-select').selectOption('2');await writer.waitForFunction(()=>index===2);assert.equal(await writer.locator('.blank-answer').nth(0).inputValue(),'$x^2$');
    await writer.screenshot({path:path.join(root,'.tmp','inline-answers.png')});
    await writer.locator('#next-question').click();await writer.getByText('写出计算过程',{exact:true}).waitFor();
    await writer.evaluate(()=>window.study.finishSession());await page.getByText('第 03 题 · 已作答',{exact:true}).waitFor();
    assert.equal(await page.locator('.typed-answer-preview').count(),3);assert.equal(await page.locator('#export').isEnabled(),true);
    await choose(data);await page.locator('#export').click();await page.getByText('批改包已生成',{exact:false}).waitFor();
    const folder=path.join(data,fs.readdirSync(data).find(n=>n.includes('-提交-'))),manifest=JSON.parse(fs.readFileSync(path.join(folder,'作答对应.json')));
    assert.deepEqual(manifest.responses.map(x=>[x.number,x.questionId]),[[1,'single'],[2,'multiple'],[3,'blank']]);
    await page.locator('[name="grading-mode"][value="ai"]').check();await page.locator('#export').click();await page.locator('#grading-report').getByText('本地测试回复。',{exact:true}).waitFor();
    assert(JSON.stringify(requests.at(-1)).includes('B. 2'));assert(JSON.stringify(requests.at(-1)).includes('第一空：$x^2$'));
    // Add actual ink, verify undo/redo, close/reopen, and submit a numbered image.
    await page.locator('.answer-tile').nth(3).getByRole('button',{name:'去做题'}).click();
    await drawInk();const ink=await writer.evaluate(()=>window.study.writerLoad());assert(ink.pages[3].board.strokes[0].points.length>1);
    await writer.locator('#undo').click();await writer.getByText('已自动保存',{exact:true}).waitFor();assert.equal((await writer.evaluate(()=>window.study.writerLoad())).pages[3].board.strokes.length,0);
    await writer.locator('#redo').click();await writer.getByText('已自动保存',{exact:true}).waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='AI-StudyDesk · 写字').close());
    await page.evaluate(()=>window.study.openWriter());await writer.screenshot({path:path.join(root,'.tmp','builtin-writer.png')});
    assert.equal((await writer.evaluate(()=>window.study.writerLoad())).pages[3].board.strokes.length,1);
    await captureAnswer(writer,app);await page.getByText('第 04 题 · 已截图',{exact:true}).waitFor();
    assert.equal(await page.locator('.submission-preview').count(),1);
    // Cancelled reading leaves the current session intact.
    await choose(null);assert((await page.evaluate(id=>window.study.startSession(id,'reading'),course.id)).cancelled);
    await choose(pdf);await page.evaluate(()=>window.study.startSession(null,'reading'));await findWriter();await writer.locator('#toggle-ai').click();await chat.getByText('AI 问答',{exact:true}).waitFor();
    await chat.locator('#chat-input').waitFor();assert.equal(await chat.locator('#finish,#toggle-chat,.question-count').count(),0);
    const opened=await app.evaluate(()=>globalThis.opened);assert.deepEqual(opened,[]);
    await chat.locator('#chat-input').fill('解释这段文字');await chat.locator('#send-message').click();await chat.locator('.message.assistant').getByText('本地测试回复。',{exact:true}).waitFor();
    assert((await writer.evaluate(async()=>window.study.clearContext({scope:'reading',courseId:(await window.study.writerLoad()).courseId}))).message.includes('已清除'));
    const readingRequest=JSON.stringify(requests.at(-1));assert(!readingRequest.includes('写出计算过程'));assert(!readingRequest.includes('请选择'));assert(!readingRequest.includes(pdf));
    const pending=app.waitForEvent('window');await chat.locator('#capture').click();const cap=await pending;
    await cap.getByText('框选要向 AI 提问的内容').waitFor();await cap.evaluate(()=>window.study.commitCapture({x:50,y:50,width:100,height:100})).catch(e=>{if(!cap.isClosed())throw e;});
    await chat.locator('.chat-attachment').waitFor();assert.equal(await chat.locator('#finish').count(),0);
    await page.evaluate(()=>window.study.openWriter());await findWriter();assert.equal(await writer.locator('#capture-answer').isVisible(),false);
    assert.equal((await writer.evaluate(()=>window.study.writerLoad())).pages.length,0);await drawInk();
    await writer.locator('#back-course').click();
    // Restart: separate reading/exercise history and pen pages, with persisted ink and reordered question IDs.
    await app.close();await launch();
    await choose(pdf);await page.evaluate(()=>window.study.startSession(null,'reading'));await findWriter();await writer.locator('#toggle-ai').click();await chat.locator('.message.assistant').getByText('本地测试回复。',{exact:true}).waitFor();
    await page.evaluate(()=>window.study.openWriter());await findWriter();assert.equal((await writer.evaluate(()=>window.study.writerLoad())).workspace.strokes.length,1);
    await writer.locator('#back-course').click();
    await page.evaluate(async()=>{const c=(await window.study.listCourses())[0];c.questions.reverse();await window.study.saveCourse(c);});
    await page.evaluate(id=>window.study.startSession(id),course.id);await findWriter();
    const restored=await writer.evaluate(()=>window.study.writerLoad());assert.equal(restored.pages[0].board.strokes.length,1);assert.equal((restored.pages[3].board?.strokes||restored.pages[3].strokes).length,0);
    await writer.locator('#toggle-ai').click();await chat.locator('#chat-ai-mode:enabled').waitFor();assert.equal(await chat.locator('.message').count(),0);
    await writer.evaluate(async()=>{try{await window.study.writerSave({sessionId:'stale',pages:[]});throw new Error('accepted stale writer');}catch(e){if(e.message.includes('accepted stale writer'))throw e;}});
    assert.deepEqual(errors,[]);
    console.log('Study modes passed: editor types; single/multiple/blank input; focus and navigation; typed-only teacher/API grading; handwriting save/undo/redo/submit/restart/reorder; standalone PDF reading; chat-only capture; separate history and notes.');
  }finally{if(app)await app.close().catch(()=>{});await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
