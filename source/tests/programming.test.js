const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {normalizeCourse}=require('../lib/model');
const {ProgrammingWorkspaces,importFolder}=require('../lib/programming-workspace');

test('programming courses keep annotated files and resume an isolated workspace',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-programming-'));
  try{
    const template=path.join(root,'template');fs.mkdirSync(path.join(template,'src'),{recursive:true});
    fs.writeFileSync(path.join(template,'src','answer.py'),'# 题目：完成函数\n\ndef answer():\n    pass\n');
    const files=importFolder(template);
    const course=normalizeCourse({title:'Python 第一课',knowledge:'函数',kind:'programming',programming:{files,entryFile:'src/answer.py'},questions:[]});
    assert.equal(course.kind,'programming');assert.equal(course.questions.length,0);
    const workspaces=new ProgrammingWorkspaces(root),directory=workspaces.ensure(course);
    assert.equal(directory,path.join(root,'programming-workspaces',course.id));
    const original=workspaces.read(course.id,'src/answer.py');
    const answer=workspaces.write(course.id,'src/answer.py','# 题目：完成函数\n\ndef answer():\n    return 42\n',original.hash);
    assert.match(answer.content,/return 42/);
    assert.throws(()=>workspaces.write(course.id,'src/answer.py','stale',original.hash),/其他程序修改/);
    workspaces.ensure(course);assert.equal(workspaces.read(course.id,'src/answer.py').content,answer.content);
    assert.match(workspaces.context(course.id),/题目：完成函数/);
    assert.equal(fs.readFileSync(path.join(template,'src','answer.py'),'utf8'),original.content);
    workspaces.remove(course.id);assert.equal(fs.existsSync(directory),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('programming course files reject traversal, links and oversized content',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-programming-check-'));
  try{
    assert.throws(()=>normalizeCourse({title:'x',knowledge:'x',kind:'programming',programming:{files:[{path:'../outside',content:'x'}]}}),/路径/);
    assert.throws(()=>normalizeCourse({title:'x',knowledge:'x',kind:'programming',programming:{files:[{path:'a.py',content:'x'}],entryFile:'else.py'}}),/入口文件/);
    const source=path.join(root,'source');fs.mkdirSync(source);
    fs.writeFileSync(path.join(source,'too-large.py'),'x'.repeat(10*1024*1024+1));
    assert.throws(()=>importFolder(source),/10 MB/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
