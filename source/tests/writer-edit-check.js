// Isolated check of inline editing and delayed shape conversion; no real AI or user data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),{Library}=require('../lib/library'),{Notes}=require('../lib/notes');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-inline-')),library=new Library(path.join(data,'library')),notes=new Notes(library);
const note=notes.create({name:'文字与图形'});notes.appendText(note.id,'原有笔记文字');let app;
async function main(){try{
 app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
 await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');const page=app.windows().find(p=>p.url().endsWith('index.html'));await page.locator('.library-page').waitFor();
 const errors=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 async function open(id){await page.evaluate(id=>window.study.startSession(id,'reading'),id);const w=app.windows().find(p=>p.url().endsWith('/writer.html'));w.setDefaultTimeout(9000);await w.waitForFunction(()=>ready&&cache.has(0));return w;}
 let writer=await open('note:'+note.id);
 const metrics=await writer.evaluate(()=>({left:board.file.left,width:board.file.width,screen:screenWidth}));assert(Math.abs(metrics.left-(metrics.screen-metrics.width)/2)<1,JSON.stringify(metrics));
 const pos=await writer.evaluate(()=>{const r=StudyBoard.rect(board.file,0),s=board.file.width/1000;return {x:r.x+70*s,y:r.y+170*s-board.viewport.y};});await writer.mouse.dblclick(pos.x,pos.y);
 await writer.locator('#canvas-text-editor').fill('直接修改后的笔记');assert.equal(await writer.locator('#canvas-text-editor button').count(),0);assert.equal(await writer.locator('#canvas-text-editor').evaluate(el=>getComputedStyle(el).borderWidth),'0px');await writer.mouse.click(920,450);await writer.locator('#canvas-text-editor').waitFor({state:'hidden'});assert.equal(notes.read(note.id).entries[0].text,'直接修改后的笔记');
 assert.equal(await writer.evaluate(()=>board.strokes.length),0);assert.equal(await writer.evaluate(()=>board.texts.length),0);
 await writer.locator('#hand').click();await writer.mouse.dblclick(pos.x,pos.y);await writer.locator('#canvas-text-editor').fill('手形工具下直接修改');await writer.mouse.click(920,450);await writer.locator('#canvas-text-editor').waitFor({state:'hidden'});assert.equal(notes.read(note.id).entries[0].text,'手形工具下直接修改');assert.equal(await writer.evaluate(()=>board.strokes.length),0);
 await writer.locator('#text-tool').click();
 await writer.mouse.click(350,400);await writer.locator('#canvas-text-editor').fill('新的文字框');await writer.locator('#canvas-text-editor').press('Control+Enter');await writer.locator('#canvas-text-editor').waitFor({state:'hidden'});
 assert.equal(await writer.evaluate(()=>board.texts[0].text),'新的文字框');await writer.locator('#pen').click();
 await writer.mouse.dblclick(375,415);await writer.locator('#canvas-text-editor').fill('双击修改新增文字');await writer.mouse.click(920,450);await writer.locator('#canvas-text-editor').waitFor({state:'hidden'});assert.equal(await writer.evaluate(()=>board.texts[0].text),'双击修改新增文字');assert.equal(await writer.evaluate(()=>board.texts.length),1);assert.equal(await writer.evaluate(()=>board.strokes.length),0);
 if(!process.argv.includes('--text-only')){
  const traceDir=path.join(root,'.tmp','shape-investigation',Date.now()+'-writer-edit');fs.mkdirSync(traceDir,{recursive:true});let drawn=null;
  await writer.bringToFront();await writer.evaluate(()=>StudyShapeDiagnostics.start());
  try{
   await writer.mouse.move(300,600);await writer.mouse.down();for(let i=1;i<=30;i++){
    await writer.mouse.move(300+i*8,600+Math.sin(i));
    if(i===15)await writer.evaluate(()=>{for(const type of ['pointermove','pointerup','pointercancel'])canvas.dispatchEvent(new PointerEvent(type,{pointerId:77,pointerType:'pen',isPrimary:true,buttons:1,clientX:20,clientY:80,bubbles:true}));});
   }await writer.mouse.up();
   const raw=await writer.evaluate(()=>board.strokes.at(-1).points.length);assert(raw>2);
   drawn=await writer.evaluate(()=>{const stroke=board.strokes.at(-1);return {fit:StudyShapes.explain(stroke),stroke,end:StudyBoard.worldPoint(stroke.points.at(-1),stroke,board.file)};});
   assert.equal(drawn.fit.shape,'直线','Input rejected before timer wait: '+JSON.stringify(drawn.fit));
   assert(Math.abs(drawn.end.x-540)<1&&Math.abs(drawn.end.y-(600+Math.sin(30)))<1,'Another pointer must not end or alter the owned stroke');
   await writer.waitForFunction(()=>board.strokes.at(-1).points.length===2);
   await writer.locator('#undo').click();assert.equal(await writer.evaluate(()=>board.strokes.at(-1).points.length),raw);
  }finally{
   const diagnostics=await writer.evaluate(()=>StudyShapeDiagnostics.snapshot());
   fs.writeFileSync(path.join(traceDir,'trace.json'),JSON.stringify({drawn,diagnostics},null,2));console.log('Shape timeline: '+traceDir);await writer.evaluate(()=>StudyShapeDiagnostics.stop());
  }
 }
 await writer.locator('#back-course').click();writer=await open('note:'+note.id);assert.equal(await writer.evaluate(()=>board.texts[0].text),'双击修改新增文字');
 const output=path.join(root,'.tmp','writer-edit');fs.mkdirSync(output,{recursive:true});await writer.screenshot({path:path.join(output,'inline.png')});
 await writer.locator('#back-course').click();const txt=path.join(data,'reading.txt');fs.writeFileSync(txt,'Original text');const doc=library.importPDF(txt,{}).documents.at(-1);writer=await open('document:'+doc.id);
 const p=await writer.evaluate(()=>({x:board.file.left+60*board.file.width/1000,y:65*board.file.width/1000-board.viewport.y}));await writer.mouse.dblclick(p.x,p.y);await writer.locator('#canvas-text-editor').fill('Edited directly');await writer.mouse.click(920,450);await writer.locator('#canvas-text-editor').waitFor({state:'hidden'});
 assert.equal(fs.readFileSync(library.document(doc.id).file,'utf8'),'Edited directly');assert.equal(fs.readFileSync(txt,'utf8'),'Original text');assert.deepEqual(errors,[]);
 console.log('Double-click editing with pen/hand tools, blank-click saving, typed text persistence and centered layout passed.'+(process.argv.includes('--text-only')?'':' Delayed shape fit and original-stroke undo passed.'));
}finally{if(app)await app.close().catch(()=>{});if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-inline-'))fs.rmSync(data,{recursive:true,force:true});}}
main().catch(e=>{console.error(e);process.exitCode=1;});
