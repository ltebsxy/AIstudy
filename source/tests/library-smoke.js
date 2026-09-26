const {pdfFixture}=require('./reading-fixtures');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright-core');const {normalizeCourse}=require('../lib/model');
async function main(){
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-folder-ui-'));
  const course=normalizeCourse({title:'测试课程',knowledge:'合成知识',questions:[{text:'合成题目'}]});fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));
  const pdf=path.join(data,'fixture.pdf');fs.writeFileSync(pdf,pdfFixture());let app,page,overlay;const errors=[];
  async function launch(){app=await _electron.launch({executablePath:process.env.STUDY_TEST_EXE||require('electron'),args:process.env.STUDY_TEST_EXE?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');for(const p of app.windows()){if(await p.title()==='知序学习')page=p;else overlay=p;p.on('pageerror',e=>errors.push(e.message));}await page.getByText('我的学习空间',{exact:true}).waitFor();await app.evaluate(({shell})=>{globalThis.opened=[];shell.openPath=async file=>{globalThis.opened.push(file);return '';};});}
  async function add(name){await page.locator('#new-folder').click();await page.locator('#folder-name').fill(name);await page.locator('dialog [type="submit"]').click();await page.locator('dialog').waitFor({state:'detached'});await page.locator('.folder-open').filter({hasText:name}).waitFor();}
  try{
    await launch();assert.equal(await page.locator('#nav-create,#nav-reading,#create-btn,.empty,.library-storage').count(),0);assert.equal(await page.getByRole('button',{name:'新建课程',exact:false}).count(),1);
    await add('文件夹 A');await page.locator('.folder-open').click();await add('文件夹 B');await page.locator('.folder-open').click();await add('文件夹 C');
    const original=await page.evaluate(()=>window.study.library()),c=original.folders.find(x=>x.name==='文件夹 C');
    await page.locator('[data-path=""]').click();await page.locator('[data-move][data-kind="course"]').click();await page.locator('#move-folder').selectOption(c.id);await page.locator('dialog [type="submit"]').click();await page.locator('dialog').waitFor({state:'detached'});
    await page.waitForFunction(()=>!document.querySelector('.course-card'));await page.locator('.folder-open').click();await page.locator('.folder-open').click();await page.locator('.folder-open').click();await page.locator('.course-card').waitFor();
    await page.locator('[data-layout="list"]').click();await page.locator('.library-table').waitFor();assert.deepEqual(await page.locator('th').allTextContents(),['名称 ↑','修改日期','类型','大小','操作']);
    await page.locator('.open').click();await page.locator('#back-home').click();await page.locator('.library-table').waitFor();
    await page.locator('[data-mode="reading"]').click();await page.locator('[data-mode="reading"].selected').waitFor();assert.equal(await page.locator('.folder-open,.course-card').count(),0);assert.equal(await page.locator('.library-table').count(),0);assert.equal(await page.locator('.empty').count(),0);
    await add('阅读文件夹');await page.locator('.folder-open').click();await app.evaluate(({dialog},pdf)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[pdf]});},pdf);await page.locator('#import-pdf').click();await page.locator('.read-document').waitFor();
    const stored=await page.evaluate(()=>window.study.library()),doc=stored.documents[0];assert.notEqual(doc.folderId,c.id);const copy=path.join(data,'library',doc.relativeFile);assert.equal(fs.readFileSync(copy,'utf8'),fs.readFileSync(pdf,'utf8'));fs.unlinkSync(pdf);
    await page.locator('[data-layout="list"]').click();await page.locator('.library-table').waitFor();assert.equal(await page.locator('tbody td').nth(3).innerText(),'1.1 KB');await page.screenshot({path:path.join(root,'.tmp','folders-list.png')});
    await page.locator('.read-document').click();await overlay.evaluate(()=>new Promise(resolve=>{const check=()=>course?resolve():setTimeout(check,20);check();}));assert.deepEqual(await app.evaluate(()=>globalThis.opened),[]);await page.evaluate(()=>window.study.pauseSession());await app.close();await launch();
    await page.locator('.read-document').waitFor();assert.equal(await page.locator('.library-table').count(),1);assert.equal((await page.evaluate(()=>window.study.library())).views.reading.folderId,doc.folderId);
    await page.locator('[data-mode="study"]').click();await page.locator('.open').waitFor();assert.equal(await page.locator('.library-table').count(),1);assert.equal((await page.evaluate(()=>window.study.library())).views.study.folderId,c.id);
    await page.locator('[data-path=""]').click();await page.locator('[data-layout="cards"]').click();await page.locator('.folder-card').waitFor();assert.equal(await page.locator('.folder-open').count(),1);
    await page.locator('[data-rename]').click();await page.locator('#folder-name').fill('已改名');await page.locator('dialog [type="submit"]').click();await page.locator('dialog').waitFor({state:'detached'});await page.getByText('已改名',{exact:true}).waitFor();await page.screenshot({path:path.join(root,'.tmp','folders-cards.png')});
    await page.locator('.folder-open').click();await page.locator('#new-course').click();await page.locator('#course-title').fill('工具栏新建');await page.locator('#knowledge').fill('测试知识');await page.locator('.question-text').fill('测试题目');await page.locator('#save-course').click();await page.locator('.course-card').filter({hasText:'工具栏新建'}).waitFor();
    const created=await page.evaluate(async()=>{const c=(await window.study.listCourses()).find(x=>x.title==='工具栏新建');return (await window.study.library()).courses[c.id];});assert.equal(created.folderId,original.folders.find(x=>x.name==='文件夹 A').id);await page.locator('[data-path=""]').click();
    await page.locator('[data-delete]').click();await page.locator('#toast').filter({hasText:'请先移出'}).waitFor();
    await page.locator('[data-mode="reading"]').click();await page.locator('[data-path=""]').click();await page.locator('.folder-open').filter({hasText:'阅读文件夹'}).waitFor();assert.equal(await page.getByText('已改名',{exact:true}).count(),0);assert.deepEqual(errors,[]);
    console.log('Folders passed: single creation toolbar; no sidebar/empty prompts; three-level folders; independent modes; card/list toggles and columns; separate remembered locations/layouts; move/rename; local PDF copy and restart.');
  }finally{if(app)await app.close().catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
