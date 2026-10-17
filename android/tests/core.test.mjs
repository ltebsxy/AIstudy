import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {readingPlan,safePath,doubleTap} from '../app/src/main/assets/core.mjs';
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
test('English reader excludes course/images and distinguishes taps from scrolling',()=>{
  assert.throws(()=>readingPlan([{path:'course.json',size:100},{path:'photo.jpg',size:100}],null),/正文数量/);
  assert.equal(readingPlan([{path:'article.md',size:100}],null)[0].readingMode,'english');
  assert.equal(readingPlan([{path:'article.txt',size:100}],{version:1,readingMode:'standard',documents:[{file:'article.txt'}]})[0].readingMode,'english');
  assert(doubleTap({x:100,y:200,time:100},{x:105,y:205,time:300}));
  assert(!doubleTap({x:100,y:200,time:100},{x:105,y:205,time:900}));
  assert(!doubleTap({x:100,y:200,time:100},{x:100,y:300,time:300}));
});
