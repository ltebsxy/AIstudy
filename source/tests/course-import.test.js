const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../lib/library');
const {readCourseFolder,commitCourseFolder}=require('../lib/course-import');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-course-import-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const pack=path.join(root,'课程包');fs.mkdirSync(path.join(pack,'进阶'),{recursive:true});return {root,pack,library:new Library(path.join(root,'library'))};}
function course(file,title='测试课程'){fs.writeFileSync(file,JSON.stringify({title,knowledge:'测试知识',questions:[{text:'测试题目'}],workTarget:{type:'app',appPath:'untrusted.exe'}}));}
test('course folder keeps hierarchy, isolates reading, sanitizes launch targets and never overwrites existing courses',async t=>{
  const {pack,library}=fixture(t);course(path.join(pack,'入门.json'));course(path.join(pack,'进阶','课程.json'),'进阶课程');
  fs.writeFileSync(path.join(pack,'stats.json'),'{}');fs.writeFileSync(path.join(pack,'说明.txt'),'不导入');
  let courses=[{id:'existing'}];const storage={library,readCourses:()=>courses,writeCourses:value=>{courses=value;}};
  const result=commitCourseFolder(await readCourseFolder(pack),storage);
  assert.equal(result.imported,2);assert.equal(result.skipped,2);assert.equal(courses.length,3);assert.equal(courses[2].id,'existing');
  assert.deepEqual(courses[0].workTarget,{type:'default'});assert.equal(result.library.documents.length,0);
  const sub=result.library.folders.find(f=>f.name==='进阶');assert.equal(sub.parentId,result.library.views.study.folderId);assert.equal(result.library.courses[courses.find(c=>c.title==='进阶课程').id].folderId,sub.id);
  const again=commitCourseFolder(await readCourseFolder(pack),storage);assert.equal(again.folderName,'课程包 (2)');assert.equal(new Set(courses.map(c=>c.id)).size,5);
});
test('invalid course aborts before saving, empty folders report an error, write failure restores library',async t=>{
  const {pack,library}=fixture(t);course(path.join(pack,'ok.json'));fs.writeFileSync(path.join(pack,'bad.json'),JSON.stringify({title:'坏课程',knowledge:'知识',questions:[]}));
  const before=library.read();await assert.rejects(readCourseFolder(pack),/bad.json.*至少/);assert.deepEqual(library.read(),before);
  fs.unlinkSync(path.join(pack,'bad.json'));const parsed=await readCourseFolder(pack);
  assert.throws(()=>commitCourseFolder(parsed,{library,readCourses:()=>[],writeCourses:()=>{throw new Error('模拟写入失败');}}),/模拟写入失败/);assert.deepEqual(library.read(),before);
  fs.unlinkSync(path.join(pack,'ok.json'));await assert.rejects(readCourseFolder(pack),/没有课程/);
});
test('programming courses retain embedded files without external editor launch configuration',async t=>{
  const {pack}=fixture(t);fs.writeFileSync(path.join(pack,'python.json'),JSON.stringify({title:'Python',knowledge:'知识',kind:'programming',programming:{files:[{path:'main.py',content:'# 题目\n'}],entryFile:'main.py',editorPath:'private.exe'}}));
  const result=await readCourseFolder(pack);assert.equal(result.items[0].course.programming.editorPath,'');assert.equal(result.items[0].course.programming.files[0].content,'# 题目\n');
});
