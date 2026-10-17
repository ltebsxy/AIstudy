const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),{Library}=require('../lib/library'),{Notes}=require('../lib/notes');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-lifecycle-')),library=new Library(path.join(data,'library')),notes=new Notes(library);
const note=notes.create({name:'Lifecycle'});notes.appendText(note.id,'Original');
const other=notes.create({name:'Other'});notes.appendText(other.id,'Other original');let app,page,writer;
async function launch(){app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');page=app.windows().find(p=>p.url().endsWith('index.html'));await page.locator('.library-page').waitFor();}
async function open(id='note:'+note.id){await page.evaluate(id=>window.study.startSession(id,'reading'),id);writer=app.windows().find(p=>p.url().endsWith('/writer.html'));await writer.waitForFunction(()=>ready&&cache.has(0));}
async function edit(text){await writer.evaluate(()=>textEditor.editExisting({x:board.file.left+60*board.file.width/1000,y:170*board.file.width/1000}));await writer.locator('#canvas-text-editor').fill(text);}
async function nativeClose(){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/writer.html')).close());}
async function inject(mode){await app.evaluate((_,{modulePath,mode})=>{
 const proto=process.mainModule.require(modulePath).Notes.prototype;
 globalThis.restoreLifecycleSave?.();const original=proto.updateText;
 globalThis.restoreLifecycleSave=()=>{proto.updateText=original;};
 if(mode==='failure')proto.updateText=function(){throw Error('Injected save failure');};
 if(mode==='slow')proto.updateText=async function(...args){await new Promise(resolve=>setTimeout(resolve,1200));return original.apply(this,args);};
},{modulePath:path.join(root,'lib','notes.js'),mode});}
async function main(){try{
 await launch();await open();await edit('Saved on native close');
 await nativeClose();
 await open();assert.equal(notes.read(note.id).entries[0].text,'Saved on native close');
 // A failed disk save must block both close and replacement, without losing editable text.
 await inject('failure');await edit('Retry must preserve this');await nativeClose();
 await writer.locator('#retry-writer-save').waitFor({state:'visible'});
 assert.equal(notes.read(note.id).entries[0].text,'Saved on native close');
 assert.equal(await writer.locator('#canvas-text-editor').innerText(),'Retry must preserve this');
 assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/writer.html')).isVisible()));
 await assert.rejects(page.evaluate(id=>window.study.startSession(id,'reading'),'note:'+other.id),/Injected save failure/);
 await inject('restore');await writer.locator('#retry-writer-save').click();
 await writer.locator('#canvas-text-editor').waitFor({state:'hidden'});assert.equal(notes.read(note.id).entries[0].text,'Retry must preserve this');
 // Slow flush followed immediately by another session must finish before replacement.
 await inject('slow');await edit('Slow save before switch');await open('note:'+other.id);
 assert.equal(notes.read(note.id).entries[0].text,'Slow save before switch');assert.equal(notes.read(other.id).entries[0].text,'Other original');await inject('restore');
 // Real ink and typed boxes survive the same native close handshake.
 await writer.locator('#pen').click();await writer.mouse.move(300,400);await writer.mouse.down();await writer.mouse.move(420,450,{steps:10});await writer.mouse.up();
 await writer.locator('#text-tool').click();await writer.mouse.click(350,520);await writer.locator('#canvas-text-editor').fill('Canvas text before close');
 await nativeClose();await open('note:'+other.id);
 assert.equal(await writer.evaluate(()=>board.strokes.length),1);assert.equal(await writer.evaluate(()=>board.texts[0].text),'Canvas text before close');
 // Application quit also refuses to discard a failed save, then succeeds after retry.
 await inject('failure');await edit('Saved on application quit');await app.evaluate(({app})=>app.quit());
 await writer.locator('#retry-writer-save').waitFor({state:'visible'});assert.equal(notes.read(other.id).entries[0].text,'Other original');
 assert.equal(await writer.locator('#canvas-text-editor').innerText(),'Saved on application quit');await inject('restore');
 const closed=app.waitForEvent('close',{timeout:15000});await app.evaluate(({app})=>{setTimeout(()=>app.quit(),0);});await closed;app=null;
 await launch();await open('note:'+other.id);assert.equal(notes.read(other.id).entries[0].text,'Saved on application quit');
 assert.equal(await writer.evaluate(()=>board.texts[0].text),'Canvas text before close');assert.equal(await writer.evaluate(()=>board.strokes.length),1);
 console.log('Lifecycle passed: native close/reopen, failed save blocks close/switch/quit, retry, slow session switch, ink/text persistence and quit/restart.');
}finally{if(app){await app.evaluate(()=>globalThis.restoreLifecycleSave?.()).catch(()=>{});await app.close().catch(()=>{});}if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-lifecycle-'))fs.rmSync(data,{recursive:true,force:true});}}
main().catch(e=>{console.error(e);process.exitCode=1;});
