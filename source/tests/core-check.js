// A bounded, sequential local regression gate. Each Electron test owns isolated data.
const {spawn,execFile}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const checks=[
 ['storage and canvas units',['--test','tests/notes.test.js','tests/document-versions.test.js','tests/board-model.test.js','tests/shape-fit.test.js','tests/writer-lifecycle.test.js']],
 ['AI connection units',['--test','tests/ai-settings.test.js','tests/context-compaction.test.js','tests/chatgpt-connection.test.js']],
 ['AI settings and routing',['tests/ai-connections-check.js']],
 ['save lifecycle',['tests/save-lifecycle-check.js']],
 ['reader integrity',['tests/reader-smoke.js']],
 ['inline editor and shape conversion',['tests/writer-edit-check.js']],
 ['reading and notes integration',['tests/reading-notes-check.js']],
];
async function run(name,args){
 console.log('\n[core] '+name);
 const env={...process.env};delete env.STUDY_TEST_EXE;delete env.ELECTRON_RUN_AS_NODE;
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true,detached:process.platform!=='win32'});
  let expired=false;
  const timer=setTimeout(()=>{
   expired=true;
   if(process.platform==='win32')execFile('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true},error=>{if(error)child.kill();});
   else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
  },90000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',(code,signal)=>{clearTimeout(timer);code===0&&!expired?resolve():reject(new Error(`${name}: ${expired?'90 second timeout':`exit ${code}, signal ${signal}`}`));});
 });
}
(async()=>{for(const [name,args]of checks)await run(name,args);console.log(`\n[core] All ${checks.length} groups passed.`);})().catch(error=>{console.error(error);process.exitCode=1;});
