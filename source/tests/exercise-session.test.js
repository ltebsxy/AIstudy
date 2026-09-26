const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const { ExerciseSession }=require('../lib/exercise-session');
const { prepareGrading }=require('../lib/grading');
const { explainPrompt, gradePrompt }=require('../lib/prompts');
const course={id:'c',title:'练习',knowledge:'知识',questions:[{id:'a',text:'第一题'},{id:'b',text:'第二题'},{id:'c',text:'第三题'}]};
test('capture is bound to its question; only completion of final question opens submission',()=>{
  const session=new ExerciseSession(course);
  assert.equal(session.saveScreenshot(0,Buffer.from('answer a')).submit,false);
  assert.equal(session.index,1);
  assert.throws(()=>session.saveScreenshot(0,Buffer.from('stale')),/已改变/);
  assert.equal(session.finish().submit,false);assert.equal(session.index,2);
  assert.equal(session.navigate(2).submit,undefined);
  assert.equal(session.saveScreenshot(2,Buffer.from('answer c')).submit,true);
  session.navigate(0);session.saveScreenshot(0,Buffer.from('replacement a'));
  assert.deepEqual(session.answers().map(a=>[a.number,a.questionId,a.bytes.toString()]),[[1,'a','replacement a'],[3,'c','answer c']]);
  assert.equal(session.previews()[0].fileName,'第01题-作答.png');
});
test('AI submission keeps per-question answer mapping and missing answers explicit',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-per-question-'));
  const session=new ExerciseSession(course);session.saveScreenshot(0,Buffer.from('first'));session.navigate(2);session.saveScreenshot(2,Buffer.from('third'));
  const input={root,course,answerInput:{kind:'screenshots'},screenshots:session.answers()};
  const prepared=prepareGrading(input);
  const manifest=JSON.parse(fs.readFileSync(path.join(prepared.folder,'批改材料.json')));
  assert.deepEqual(manifest.questions.map(q=>q.answerFile),['第01题-作答.png',null,'第03题-作答.png']);
  assert.equal(fs.readFileSync(path.join(prepared.folder,'第03题-作答.png')).toString(),'third');
  assert.equal(prepareGrading(input).key,prepared.key);
  assert.throws(()=>prepareGrading({...input,screenshots:[{...input.screenshots[0],questionId:'b'}]}),/不匹配/);
  assert.throws(()=>prepareGrading({...input,screenshots:[]}),/截图已失效/);
});
test('AI prompts consist of the concise instruction plus relevant data',()=>{
  assert.equal(explainPrompt('函数定义','解释定义域'),'解释知识点，语言精简。\n\n知识点：\n函数定义\n\n问题：解释定义域');
  assert.equal(gradePrompt('材料.json'),'题目评分，指出问题，语言精简。\n材料：材料.json（含题目、评分依据及作答文件）。');
});
