const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright-core'),{normalizeCourse}=require('../lib/model'),{pdfFixture}=require('./reading-fixtures');
async function main(){
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-loading-'));
 const courses=Array.from({length:24},(_,i)=>normalizeCourse({title:'加载测试 '+i,knowledge:'合成资料，仅用于加载测试。'.repeat(4500),questions:[{text:'测试题目'}]}));
 const courseFile=path.join(data,'courses.json');fs.writeFileSync(courseFile,JSON.stringify(courses));
 const text=path.join(data,'notes.txt'),pdf=path.join(data,'fixture.pdf');fs.writeFileSync(text,'测试段落\n'.repeat(20000));fs.writeFileSync(pdf,pdfFixture());
 let app;const errors=[],requests=new Map();
 try{
  app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();
  app.on('window',p=>{requests.set(p,[]);p.on('request',r=>requests.get(p).push(r.url()));});
  const page=app.windows().find(p=>p.url().endsWith('/index.html'));page.on('pageerror',e=>errors.push(e.message));await page.getByText('我的学习空间',{exact:true}).waitFor();
  const metrics=await page.evaluate(async()=>{const full=await window.study.syncCourses(null),unchanged=await window.study.syncCourses(full.revision);const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;globalThis.loadingCourses=courses;return {fullBytes:bytes(full),unchangedBytes:bytes(unchanged),unchanged:unchanged.courses===null};});assert(metrics.unchanged);assert(metrics.unchangedBytes<200);assert(metrics.fullBytes>1000000);
  await page.locator('[data-layout="list"]').click();await page.locator('.library-table').waitFor();assert(await page.evaluate(()=>courses===globalThis.loadingCourses));
  courses[0].title='外部更新已读取';fs.writeFileSync(courseFile+'.tmp',JSON.stringify(courses));fs.renameSync(courseFile+'.tmp',courseFile);await page.locator('[data-layout="cards"]').click();await page.getByText('外部更新已读取',{exact:true}).waitFor();
  await page.evaluate(id=>window.study.startSession(id),courses[0].id);let writer=app.windows().find(p=>p.url().endsWith('/writer.html'));writer.on('pageerror',e=>errors.push(e.message));await writer.waitForFunction(()=>ready);assert.equal((requests.get(writer)||[]).some(url=>url.includes('/pdfjs/pdf.mjs')),false);await writer.locator('#back-course').click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},text);await page.evaluate(()=>window.study.startSession(null,'reading'));writer=app.windows().find(p=>p.url().endsWith('/writer.html'));writer.on('pageerror',e=>errors.push(e.message));await writer.waitForFunction(()=>ready);assert.equal((requests.get(writer)||[]).some(url=>url.includes('/pdfjs/pdf.mjs')),false);assert((await writer.evaluate(()=>readerPages))>100);await writer.locator('#back-course').click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},pdf);await page.evaluate(()=>window.study.startSession(null,'reading'));writer=app.windows().find(p=>p.url().endsWith('/writer.html'));await writer.waitForFunction(()=>ready&&cache.has(0));assert((requests.get(writer)||[]).some(url=>url.includes('/pdfjs/pdf.mjs')));
  const rendered=await writer.evaluate(async()=>{await renderQueue;cache.clear();const original=StudyReader.render,calls=[];StudyReader.render=async(i,c)=>{calls.push(i);return original(i,c);};let release;renderQueue=new Promise(r=>release=r);board.file.width=800;moveTo(0,0);requestPage(0);moveTo(0,100000);requestPage(1);release();await renderQueue;StudyReader.render=original;return calls;});assert.deepEqual(rendered,[1]);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({courseTransfer:metrics,pdfEngine:'not loaded for writing/text; loaded on PDF demand',staleQueuedPage:'skipped',externalCourseEdit:'refreshed'}));
 }finally{if(app)await app.close().catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
