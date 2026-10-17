// Focused UI check, isolated data; native pickers use synthetic paths.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-library-actions-'));
let app;
async function main(){try{
 const pack=path.join(data,'课程包');fs.mkdirSync(path.join(pack,'子目录'),{recursive:true});
 const raw={title:'文件夹导入测试',knowledge:'合成知识',questions:[{text:'合成题目'}]};
 fs.writeFileSync(path.join(pack,'子目录','course.json'),JSON.stringify(raw));
 app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
 await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
 const page=app.windows().find(p=>p.url().endsWith('/index.html'));page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.library-page').waitFor();
 await app.evaluate(({dialog},pack)=>{globalThis.pickers=[];globalThis.cancelPicker=false;dialog.showOpenDialog=async(_win,options)=>{globalThis.pickers.push(options);return globalThis.cancelPicker?{canceled:true,filePaths:[]}:{canceled:false,filePaths:[pack]};};},pack);
 assert.equal(await page.locator('.library-actions > button:visible').count(),2);
 assert.equal(await page.locator('#new-folder').isVisible(),false);
 await page.locator('#library-new').click();await page.locator('#new-folder').waitFor();
 const button=await page.locator('#library-new').boundingBox(),menu=await page.locator('#library-new-menu').boundingBox();assert(menu.x>button.x+button.width);
 await page.keyboard.press('Escape');await page.locator('#new-folder').waitFor({state:'hidden'});
 await page.locator('#library-import').click();await page.locator('#import-course-file').waitFor();await page.locator('#library-import').click();await page.locator('#import-course-file').waitFor({state:'hidden'});
 await page.locator('#library-new').click();await page.locator('#new-folder').click();await page.locator('#folder-name').fill('目标');await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});
 await page.locator('.folder-open').filter({hasText:'目标'}).click();
 await page.locator('#library-import').click();assert.equal(await app.evaluate(()=>globalThis.pickers.length),0);
 await page.locator('#import-course-folder').click();await page.locator('.folder-open').filter({hasText:'子目录'}).waitFor();
 const state=await page.evaluate(()=>window.study.library());const imported=state.folders.find(f=>f.name==='课程包'),target=state.folders.find(f=>f.name==='目标');assert.equal(imported.parentId,target.id);
 assert.deepEqual(await app.evaluate(()=>globalThis.pickers[0].properties),['openDirectory']);
 await page.locator('.folder-open').filter({hasText:'子目录'}).click();await page.locator('.course-card').filter({hasText:raw.title}).waitFor();
 await app.evaluate(()=>{globalThis.cancelPicker=true;});await page.locator('#library-import').click();await page.locator('#import-course-file').click();
 assert.equal((await page.evaluate(()=>window.study.listCourses())).length,1);
 assert.deepEqual(await app.evaluate(()=>globalThis.pickers.at(-1).properties),['openFile']);
 await page.locator('#library-new').click();await page.locator('#new-course').click();await page.locator('#course-title').waitFor();await page.locator('#back-home').click();
 await page.locator('[data-mode=reading]').click();await page.locator('#library-import').click();await page.locator('#import-pdf').waitFor();await page.locator('#import-reading-folder').waitFor();
 await page.locator('.page-title').click();await page.locator('#import-pdf').waitFor({state:'hidden'});
 await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.locator('#library-import').click();
 assert.notEqual(await page.locator('#library-import-menu').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 const output=path.join(root,'.tmp','library-actions');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'menu-dark.png')});
 assert.deepEqual(errors,[]);console.log('Library menus, right-side position, dismissal, course-folder hierarchy, file picker/cancel, editor and dark mode passed.');
}finally{if(app)await app.close();if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-library-actions-'))fs.rmSync(data,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1;});
