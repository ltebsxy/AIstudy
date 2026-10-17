// One isolated flow: reading edits, explicit note destination, and the shared note canvas.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),{Library}=require('../lib/library'),{Notes}=require('../lib/notes');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-reading-notes-'));
const library=new Library(path.join(data,'library')),notes=new Notes(library);
const file=path.join(data,'article.txt');fs.writeFileSync(file,'English reading. 中文阅读笔记。');
const doc=library.importPDF(file,{}).documents[0],note=notes.create({name:'学习摘录'});let app;
async function main(){try{
 app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
 await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
 const page=app.windows().find(p=>p.url().endsWith('index.html'));page.setDefaultTimeout(12000);
 const errors=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.library-page').waitFor();await page.locator('[data-mode=reading]').click();await page.locator('[data-document-edit]').click();
 await page.locator('#reading-name').fill('编辑后的阅读文件');await page.locator('#reading-description').fill('读写与笔记');await page.locator('#reading-body').fill('English reading. 中文阅读笔记。\n修改后的正文。');await page.locator('#reading-note').selectOption(note.id);await page.locator('#reading-save').click();await page.locator('.read-document').waitFor();
 assert.equal(fs.readFileSync(file,'utf8'),'English reading. 中文阅读笔记。');assert(library.document(doc.id).description.includes('笔记'));
 async function open(id){await page.evaluate(id=>window.study.startSession(id,'reading'),id);const writer=app.windows().find(p=>p.url().endsWith('/writer.html'));writer.setDefaultTimeout(12000);await writer.waitForFunction(()=>ready);return writer;}
 let writer=await open('document:'+doc.id);await writer.waitForFunction(()=>cache.has(0));
 assert.equal(await writer.locator('#reading-note-target').inputValue(),note.id);
 await writer.evaluate(()=>window.study.addReadingNote({sessionId:course.sessionId,text:'her\n她的'}));assert.equal(notes.read(note.id).entries[0].text,'her\n她的');
 const words=await writer.evaluate(()=>StudyReader.words(0,true));assert(words.some(w=>w.word==='中'));
 await app.evaluate(({desktopCapturer,nativeImage,screen})=>{desktopCapturer.getSources=async({thumbnailSize:{width,height}})=>[{display_id:String(screen.getPrimaryDisplay().id),thumbnail:nativeImage.createFromBitmap(Buffer.alloc(width*height*4,210),{width,height})}];});
 const pending=app.waitForEvent('window');await writer.locator('#capture-note').click();const capture=await pending;await capture.locator('#screen-image').waitFor();await capture.mouse.move(150,150);await capture.mouse.down();await capture.mouse.move(350,250);await capture.mouse.up();const closed=capture.waitForEvent('close');await capture.locator('#confirm').click();await closed;
 assert.equal(notes.read(note.id).entries[1].type,'image');
 await writer.locator('#view-settings-toggle').click();await writer.locator('#edit-reading-file').click();await page.locator('#reading-name').waitFor();assert.equal(await page.locator('#reading-name').inputValue(),'编辑后的阅读文件');await page.locator('#reading-cancel').click();
 writer=await open('note:'+note.id);await writer.waitForFunction(()=>cache.has(0));assert.equal(await writer.evaluate(()=>readerPages),1);assert(await writer.locator('#note-add-text').isVisible());
 await writer.locator('#note-add-text').click();await writer.locator('#note-new-text').fill('在画布中添加的文字');await writer.locator('#note-text-dialog [type=submit]').click();await writer.waitForFunction(()=>cache.has(0));
 await writer.mouse.move(750,250);await writer.mouse.down();await writer.mouse.move(850,290,{steps:10});await writer.mouse.up();await writer.waitForFunction(()=>board.strokes.length===1);await writer.locator('#back-course').click();
 writer=await open('note:'+note.id);assert.equal(await writer.evaluate(()=>board.strokes.length),1);assert.equal(notes.read(note.id).entries.length,3);
 await writer.evaluate(async()=>{await window.study.saveTheme('dark');});await writer.waitForFunction(()=>cache.has(0));
 const output=path.join(root,'.tmp','reading-notes');fs.mkdirSync(output,{recursive:true});await writer.screenshot({path:path.join(output,'note-canvas.png')});
 assert(!(await writer.locator('#save-status').textContent()).includes('失败'));assert.deepEqual(errors,[]);console.log('Reading edit, original preservation, specific note destination, synthetic capture, Chinese selection, note canvas, text append and ink reopen passed.');
}finally{if(app)await app.close().catch(()=>{});if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-reading-notes-'))fs.rmSync(data,{recursive:true,force:true});}}
main().catch(e=>{console.error(e);process.exitCode=1;});
