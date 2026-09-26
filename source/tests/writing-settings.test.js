const test=require('node:test'),assert=require('node:assert/strict');
const {resolveWorkTarget,validateDefaultWriter}=require('../lib/writing-settings');
const {normalizeWriterDocument}=require('../lib/exercise-session');
test('global writing choice resolves defaults and empty legacy targets while retaining explicit course overrides',()=>{
  const app={type:'app',appPath:'C:\\Tools\\Writer.exe'};
  assert.deepEqual(resolveWorkTarget({}),{type:'builtin'});
  assert.deepEqual(resolveWorkTarget({},app),app);
  assert.deepEqual(resolveWorkTarget({workTarget:{type:'file',filePath:''}},app),app);
  assert.deepEqual(resolveWorkTarget({workTarget:{type:'builtin'}},app),{type:'builtin'});
  assert.throws(()=>validateDefaultWriter({type:'default'}),/有效/);
  assert.throws(()=>validateDefaultWriter({type:'app',appPath:'script.cmd'}),/exe/);
  assert.throws(()=>validateDefaultWriter({type:'onenote',url:'javascript:alert(1)'}),/OneNote/);
});
test('expanded canvas preserves coordinates beyond original page and validates its actual bounds',()=>{
  const stroke={tool:'pen',color:'#123456',width:3,points:[{x:10,y:2400,p:.4}]};
  const input={pages:[{height:2800,strokes:[stroke]}]},saved=normalizeWriterDocument(input);
  assert.deepEqual(saved,input);input.pages[0].strokes[0].points[0].y=2900;
  assert.equal(saved.pages[0].strokes[0].points[0].y,2400);assert.throws(()=>normalizeWriterDocument(input),/坐标/);
  assert.throws(()=>normalizeWriterDocument({pages:[{height:15000,strokes:[]}]}),/高度/);
  assert.deepEqual(normalizeWriterDocument({pages:[{strokes:[]}]}),{pages:[{strokes:[]}]});
});
