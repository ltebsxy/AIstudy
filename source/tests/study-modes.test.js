const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {normalizeCourse,normalizeQuestion,normalizeResponse,learnerCourse,preserveGrading,renderSubmission}=require('../lib/model');
const {ExerciseSession,normalizeWriterDocument}=require('../lib/exercise-session');
const {prepareGrading}=require('../lib/grading');
const makeCourse=()=>normalizeCourse({title:'类型验证',knowledge:'测试知识',questions:[
  {id:'single',type:'choice',text:'选一个',options:['一','二'],grading:{answer:'二',criteria:[{points:2,text:'选二'}]}},
  {id:'multiple',type:'choice',multiple:true,text:'选多个',options:['甲','乙','丙']},
  {id:'blank',type:'blank',text:'填写',blanks:['第一空','第二空']},
  {id:'written',text:'写出过程'}
]});

test('typed question validation and legacy course defaults protect hidden references',()=>{
  const course=makeCourse(),publicCourse=learnerCourse(course);
  assert.deepEqual(course.workTarget,{type:'default'});
  assert.equal(course.questions[3].type,'written');
  assert.equal(publicCourse.questions[0].grading,undefined);
  assert.deepEqual(normalizeQuestion({type:'blank',text:'x'}).blanks,['答案']);
  assert.throws(()=>normalizeQuestion({type:'choice',options:['one']}),/选项/);
  assert.throws(()=>normalizeQuestion({type:'choice',options:['one','two'],multiple:'true'}),/布尔/);
  assert.throws(()=>normalizeQuestion({type:'blank',blanks:['']}),/标签/);
  assert.throws(()=>normalizeQuestion({type:'unknown'}),/类型/);
  assert.deepEqual(preserveGrading(publicCourse,course).questions[0].grading,course.questions[0].grading);
  publicCourse.questions[0].options.reverse();
  assert.equal(preserveGrading(publicCourse,course).questions[0].grading,undefined);
});

test('inline answers do not advance; values survive navigation without crossing question ids',()=>{
  const course=makeCourse(),session=new ExerciseSession(course);
  let progress=session.saveResponse(0,[1]);
  assert.equal(progress.index,0);assert.deepEqual(progress.completed,[]);assert.equal(progress.submit,undefined);
  progress.responses[0].push(0);assert.deepEqual(session.progress().responses[0],[1]);
  assert.throws(()=>session.saveResponse(0,[0,1]),/选项/);
  assert.throws(()=>session.saveResponse(1,[1]),/改变/);
  session.finish();session.saveResponse(1,[2,0]);session.finish();
  session.saveResponse(2,['  $x^2$  ','']);session.navigate(0);
  assert.deepEqual(session.progress().responses,{0:[1],1:[0,2],2:['$x^2$','']});
  assert.deepEqual(session.typedAnswers().map(x=>[x.number,x.questionId,x.text]),[[1,'single','B. 二'],[2,'multiple','A. 甲；C. 丙'],[3,'blank','第一空：$x^2$\n第二空：未填写']]);
  session.saveResponse(0,[]);assert.equal(session.typedAnswers().length,2);
  assert.throws(()=>normalizeResponse(course.questions[1],[1,1]),/选项/);
  assert.throws(()=>normalizeResponse(course.questions[1],[3]),/选项/);
  assert.throws(()=>normalizeResponse(course.questions[2],['missing']),/空格/);
  assert.throws(()=>normalizeResponse(course.questions[3],['text']),/写字/);
  session.navigate(3);assert.equal(session.finish().submit,true);
});

test('typed-only and mixed grading retain question mappings and escape teacher output',()=>{
  const course=makeCourse(),session=new ExerciseSession(course),root=fs.mkdtempSync(path.join(os.tmpdir(),'study-typed-grade-'));
  session.saveResponse(0,[1]);session.navigate(2);session.saveResponse(2,['<script>bad()</script>','答案']);
  const input={root,course,answerInput:{kind:'responses'},typedAnswers:session.typedAnswers()};
  const prepared=prepareGrading(input),manifest=JSON.parse(fs.readFileSync(path.join(prepared.folder,'批改材料.json')));
  assert.equal(manifest.answerFile,null);assert.deepEqual(manifest.answers,[]);
  assert.equal(manifest.questions[0].response.text,'B. 二');assert.equal(manifest.questions[1].response,null);
  assert.deepEqual(manifest.questions[0].options,['一','二']);assert.equal(manifest.questions[0].grading.answer,'二');
  assert.equal(manifest.questions[2].response.questionId,'blank');
  assert.throws(()=>prepareGrading({...input,typedAnswers:[{...input.typedAnswers[0],questionId:'wrong'}]}),/不匹配/);
  assert.throws(()=>prepareGrading({...input,typedAnswers:[input.typedAnswers[0],input.typedAnswers[0]]}),/不匹配/);
  session.saveResponse(2,['changed','答案']);assert.notEqual(prepareGrading({...input,typedAnswers:session.typedAnswers()}).key,prepared.key);
  session.navigate(3);session.saveScreenshot(3,Buffer.from('png test'));
  const mixed=prepareGrading({...input,screenshots:session.answers()}),mixedManifest=JSON.parse(fs.readFileSync(path.join(mixed.folder,'批改材料.json')));
  assert.equal(mixedManifest.questions[3].answerFile,'第04题-作答.png');assert.equal(mixedManifest.responses.length,2);
  const html=renderSubmission(course,'today',null,[],input.typedAnswers);
  assert.match(html,/第 1 题窗口作答/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

test('writer document bounds, pressure, and copy isolation prevent invalid persisted ink',()=>{
  const stroke={tool:'pen',color:'#123abc',width:3,points:[{x:1,y:2},{x:999,y:1399,p:1}]};
  const input={pages:[null,{strokes:[stroke]}]},clean=normalizeWriterDocument(input,2);
  assert.deepEqual(clean.pages[0],{strokes:[]});assert.equal(clean.pages[1].strokes[0].points[0].p,0.5);
  clean.pages[1].strokes[0].points[0].x=7;assert.equal(stroke.points[0].x,1);
  assert.throws(()=>normalizeWriterDocument(input,1),/页数/);
  for(const invalid of [{...stroke,width:101},{...stroke,color:'url(x)'},{...stroke,tool:'script'}])assert.throws(()=>normalizeWriterDocument({pages:[{strokes:[invalid]}]}),/格式/);
  for(const p of [{x:-1,y:1},{x:1,y:1401},{x:1,y:2,p:2}])assert.throws(()=>normalizeWriterDocument({pages:[{strokes:[{...stroke,points:[p]}]}]}),/坐标/);
});
