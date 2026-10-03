import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {readingPlan,safePath,normalizeCourse,expandBounds,doubleTap} from '../app/src/main/assets/core.mjs';
const pack=process.env.STUDY_READING_PACK?path.resolve(process.env.STUDY_READING_PACK):null;
async function walk(root,relative=''){const result=[];for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){const name=path.posix.join(relative,entry.name);if(entry.isDirectory())result.push(...await walk(root,name));else result.push({path:name,size:(await stat(path.join(root,name))).size});}return result;}
test('reading pack imports exactly its 50 articles and rejects unsafe/duplicate/partial plans',async()=>{
  const documents=Array.from({length:50},(_,index)=>({file:`articles/${index+1}.txt`}));
  const manifest=pack?JSON.parse(await readFile(path.join(pack,'reading-pack.json'),'utf8')):{version:1,readingMode:'english',documents};
  const files=pack?await walk(pack):[...documents.map(item=>({path:item.file,size:100})),{path:'materials/vocabulary.txt',size:100},{path:'complete-reading.txt',size:100}];
  const plan=readingPlan(files,manifest);
  assert.equal(plan.length,50);assert(plan.every(f=>f.path.startsWith('articles/')&&f.readingMode==='english'));assert(!plan.some(f=>f.path.includes('materials')||f.path==='complete-reading.txt'));
  for(const unsafe of ['../outside.txt','a/../../b.txt','C:/a.txt','/a.txt','a/.secret','a//b.txt','a/./b.txt'])assert.throws(()=>safePath(unsafe));
  assert.throws(()=>readingPlan(files,{...manifest,documents:[manifest.documents[0],manifest.documents[0]]}),/重复/);
  assert.throws(()=>readingPlan(files,{...manifest,documents:[{file:'articles/missing.txt'}]}),/不存在/);
  assert.throws(()=>readingPlan([{path:'a.txt',size:0}],{version:1,documents:[{file:'a.txt'}]}),/为空/);
});
test('desktop ordinary question fields remain compatible and executable targets are discarded',()=>{
  const course=normalizeCourse({title:'兼容课',knowledge:'$x^2$',workTarget:{type:'app',appPath:'C:/x.exe'},questions:[{id:'a',text:'选一个',type:'choice',options:['甲','乙'],multiple:false,grading:{answer:'甲',criteria:[{points:2,text:'选甲'}]}},{id:'b',text:'填空',type:'blank'},{id:'c',text:'书写题'}]});
  assert.equal(course.workTarget,undefined);assert.deepEqual(course.questions[1].blanks,['答案']);assert.equal(course.questions[2].type,'written');assert.equal(course.questions[0].grading.criteria[0].points,2);
  assert.throws(()=>normalizeCourse({kind:'programming'}),/暂不支持/);assert.throws(()=>normalizeCourse({...course,questions:[{text:'题',type:'choice',options:['只有一个']}]}),/无效/);
});
test('scrolling and erasing never extend; drawing at either edge preserves world coordinates',()=>{
  const bounds={minY:0,maxY:600};assert.deepEqual(expandBounds(bounds,590,600,'hand'),{...bounds,shift:0});assert.deepEqual(expandBounds(bounds,590,600,'eraser'),{...bounds,shift:0});
  assert.deepEqual(expandBounds(bounds,590,600,'pen'),{minY:0,maxY:1200,shift:0});const top=expandBounds(bounds,20,600,'marker');assert.equal(top.minY,-600);assert.equal(20-top.minY-top.shift,20);
  assert(doubleTap({x:100,y:200,time:100},{x:105,y:205,time:300}));assert(!doubleTap({x:100,y:200,time:100},{x:105,y:205,time:900}));
});
