// Bounded investigation: real pointer input plus explicitly marked faults in isolated data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),{Library}=require('../lib/library'),{Notes}=require('../lib/notes');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-shape-diag-'));
const label=(process.argv.find(x=>x.startsWith('--label='))||'--label=check').slice(8).replace(/[^a-z0-9_-]/gi,'').slice(0,40);
const output=path.join(root,'.tmp','shape-investigation',Date.now()+'-'+label);fs.mkdirSync(output,{recursive:true});
const notes=new Notes(new Library(path.join(data,'library'))),note=notes.create({name:'Synthetic shape diagnostics'});notes.appendText(note.id,'Synthetic fixture');let app,writer;
async function evidence(name){const result=await writer.evaluate(()=>({diagnostics:StudyShapeDiagnostics.snapshot(),fit:board.strokes.at(-1)?StudyShapes.explain(board.strokes.at(-1)):null,stroke:board.strokes.at(-1)}));fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(result,null,2));return result;}
async function main(){try{
 app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');
 const page=app.windows().find(p=>p.url().endsWith('index.html'));await page.locator('.library-page').waitFor();await page.evaluate(id=>window.study.startSession('note:'+id,'reading'),note.id);
 writer=app.windows().find(p=>p.url().endsWith('/writer.html'));writer.setDefaultTimeout(9000);await writer.waitForFunction(()=>ready&&cache.has(0));assert.equal(await writer.evaluate(()=>StudyShapeDiagnostics.snapshot()),null);
 for(const kind of ['hover-event','hover-coalesced']){
  await writer.evaluate(()=>{cancelShape('test-reset');board.strokes=[];StudyShapeDiagnostics.start();StudyShapeDiagnostics.mark('real mouse path with injected same-owner hover');});await writer.bringToFront();
  await writer.mouse.move(300,600);await writer.mouse.down();
  for(let i=1;i<=30;i++){
   await writer.mouse.move(300+i*8,600+Math.sin(i));
   if(i===15)await writer.evaluate(kind=>{
    const hover=new PointerEvent('pointermove',{pointerId:gesturePointerId,pointerType:'mouse',buttons:0,isPrimary:true,clientX:20,clientY:80});
    if(kind==='hover-event')canvas.dispatchEvent(hover);
    else{const move=new PointerEvent('pointermove',{pointerId:gesturePointerId,pointerType:'mouse',buttons:1,isPrimary:true,clientX:420,clientY:600+Math.sin(15)});Object.defineProperty(move,'getCoalescedEvents',{value:()=>[hover,move]});canvas.dispatchEvent(move);}
   },kind);
  }
  await writer.mouse.up();await writer.waitForFunction(()=>StudyShapeDiagnostics.snapshot().events.some(e=>e.type==='fit'));
  const result=await evidence(kind);assert.equal(result.diagnostics.dropped,0);assert.equal(result.diagnostics.events.findLast(e=>e.type==='fit').result.shape,'直线',kind+' corrupted the line');assert.equal(result.stroke.points.length,2);
  await writer.locator('#undo').click();const original=await writer.evaluate(()=>structuredClone(board.strokes.at(-1)));assert(original.points.length>2);await writer.locator('#redo').click();await writer.evaluate(()=>saveChain);assert.equal(await writer.evaluate(async()=>(await window.study.writerLoad()).workspace.strokes.at(-1).points.length),2);
 }
 // Replace only the 1800ms shape timer, so branch faults are deterministic, not timing retries.
 await writer.evaluate(()=>{
  cancelShape('test-clock-install');const set=window.setTimeout,clear=window.clearTimeout,tasks=new Map();let next=1000000;
  window.shapeTestClock={tasks,restore(){window.setTimeout=set;window.clearTimeout=clear;},fire(){const entry=[...tasks].at(-1);if(!entry)return false;tasks.delete(entry[0]);entry[1]();return true;}};
  window.setTimeout=(fn,delay,...args)=>{if(delay!==1800)return set(fn,delay,...args);const id=++next;tasks.set(id,()=>fn(...args));return id;};
  window.clearTimeout=id=>{if(!tasks.delete(id))clear(id);};
 });
 const cases=['normal','sparse-four','same-owner-distortion','coalesced-order','viewport-change','tool-cancel','generation','board-replaced','another-active-stroke','not-last-stroke','busy','not-ready','hidden','focus-loss','paint-and-save'];
 const summary=[];
 for(const scenario of cases){
  await writer.evaluate(async scenario=>{
   cancelShape('test-reset');await saveChain;active=null;gesturePointerId=null;selectTool('pen');StudyShapeDiagnostics.start();StudyShapeDiagnostics.mark('controlled fault: '+scenario);
   const points=Array.from({length:31},(_,i)=>({x:300+i*8,y:600+Math.sin(i),p:.5}));
   if(scenario==='sparse-four')points.splice(0,points.length,...[points[0],points[10],points[20],points[30]]);
   if(scenario==='same-owner-distortion')points.splice(15,0,{x:20,y:80,p:.5});
   if(scenario==='coalesced-order')points.splice(20,0,{...points[5]});
   const stroke={tool:'pen',color:'#253445',width:3,points};board.strokes=[stroke];window.shapeSeed=stroke;scheduleShape(stroke);
   if(scenario==='tool-cancel'){selectTool('hand');return;}
   const oldBoard=board,oldGeneration=generation,oldViewport={...board.viewport};
   if(scenario==='viewport-change'){
    board.strokes=[];stroke.points=points.slice(0,15);active=stroke;gesturePointerId=1;
    area.scrollTop+=120;area.onscroll();
    for(let i=15;i<31;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:1,isPrimary:true,clientX:300+i*8,clientY:600+Math.sin(i)}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,pointerType:'mouse',button:0,isPrimary:true}));
   }
   if(scenario==='generation')generation++;
   if(scenario==='board-replaced')board=StudyBoard.normalize(board);
   if(scenario==='another-active-stroke')active={...stroke,points:[{x:1,y:1,p:.5}]};
   if(scenario==='not-last-stroke')board.strokes.push({...stroke,points:points.map((p,i)=>({...p,y:p.y+(i%2)*100}))});
   if(scenario==='busy')busy=true;
   if(scenario==='not-ready')ready=false;
   if(scenario==='hidden')Object.defineProperty(document,'hidden',{configurable:true,value:true});
   if(scenario==='focus-loss')Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});
   if(scenario==='paint-and-save'){paint();persist();await saveChain;paint();}
   shapeTestClock.fire();
   generation=oldGeneration;if(scenario==='board-replaced')board=oldBoard;active=null;gesturePointerId=null;busy=false;ready=true;if(scenario==='hidden')delete document.hidden;if(scenario==='focus-loss')delete document.hasFocus;
   if(scenario==='viewport-change'){board.viewport=oldViewport;syncScroll();}
   StudyShapeDiagnostics.mark('fault restored; end state may look normal');await saveChain;
  },scenario);
  const result=await evidence(scenario),events=result.diagnostics.events,fit=events.findLast(e=>e.type==='fit'),skip=events.findLast(e=>e.type==='timer-skip');
  assert.equal(result.diagnostics.dropped,0);
  if(['normal','paint-and-save','focus-loss'].includes(scenario)){assert.equal(fit.result.shape,'直线');assert.equal(result.stroke.points.length,2);}
  else if(scenario==='tool-cancel'){assert(events.some(e=>e.type==='timer-cancel'&&e.reason==='tool-switch'));assert(!events.some(e=>e.type==='timer-fire'));assert.equal(result.fit.shape,'直线');}
  else if(['generation','board-replaced','another-active-stroke','not-last-stroke','busy','not-ready','hidden'].includes(scenario)){assert.equal(skip.reason,scenario);assert.equal(result.fit.shape,scenario==='not-last-stroke'?null:'直线');}
  else{assert.equal(fit.result.shape,null);assert(result.stroke.points.length>2);if(scenario==='sparse-four')assert.equal(fit.result.reason,'too-few-raw-points');}
  summary.push({scenario,fit:fit?.result||null,skip:skip?.reason||null,rawCount:result.stroke.points.length});
 }
 await writer.evaluate(()=>{cancelShape('test-clock-restore');shapeTestClock.restore();StudyShapeDiagnostics.start();StudyShapeDiagnostics.mark('real event-loop delay, no fake timers');board.strokes=[{tool:'pen',color:'#253445',width:3,points:Array.from({length:31},(_,i)=>({x:300+i*8,y:600+Math.sin(i),p:.5}))}];scheduleShape(board.strokes[0]);const start=performance.now();while(performance.now()-start<2100){};});
 await writer.waitForFunction(()=>board.strokes[0].points.length===2);const delayed=await evidence('event-loop-delay');assert.equal(delayed.diagnostics.events.findLast(e=>e.type==='fit').result.shape,'直线');
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log('Shape diagnostics passed: hover filtering, real delayed fit/undo/save, 15 controlled branches and real event-loop delay. Evidence: '+output);
}catch(error){if(writer&&!writer.isClosed()){await evidence('failure').catch(()=>{});await writer.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw error;
}finally{if(app){if(writer&&!writer.isClosed())await writer.evaluate(()=>{window.shapeTestClock?.restore();busy=false;ready=true;delete document.hidden;}).catch(()=>{});await app.close().catch(()=>{});}if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-shape-diag-'))fs.rmSync(data,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);console.error('Evidence: '+output);process.exitCode=1;});
