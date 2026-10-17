// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {normalizeCourse}=require('./model');

function readCourseFile(file,{optional=false}={}){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('请选择普通课程 JSON 文件。');
  if(stat.size>24*1024*1024)throw new Error('课程文件不能超过 24 MB。');
  let raw;
  try{raw=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
  catch{throw new Error('无法读取课程 JSON，请检查文件格式。');}
  if(optional&&(!raw||typeof raw!=='object'||(!Object.hasOwn(raw,'knowledge')&&!Object.hasOwn(raw,'questions')&&!Object.hasOwn(raw,'programming'))))return null;
  return normalizeCourse({...raw,workTarget:{type:'default'},...(raw?.kind==='programming'?{programming:{...raw.programming,editorPath:''}}:{})});
}

async function readCourseFolder(directory){
  const root=await fs.promises.realpath(directory),items=[];
  if(!(await fs.promises.stat(root)).isDirectory())throw new Error('请选择课程文件夹。');
  let visited=0,bytes=0,skipped=0;
  async function walk(relative='',depth=0){
    if(depth>20)throw new Error('文件夹层级超过 20 层，请选择更具体的课程目录。');
    const entries=(await fs.promises.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
    for(const entry of entries){
      if(++visited>10000)throw new Error('目录内容过多，请选择课程所在的子文件夹。');
      if(entry.name.startsWith('.')||entry.name==='node_modules'||entry.isSymbolicLink()){skipped++;continue;}
      const name=path.join(relative,entry.name),file=path.join(root,name);
      if(entry.isDirectory()){await walk(name,depth+1);continue;}
      if(!entry.isFile()||path.extname(name).toLowerCase()!=='.json'){skipped++;continue;}
      bytes+=(await fs.promises.stat(file)).size;
      if(bytes>128*1024*1024)throw new Error('每次课程 JSON 总大小不能超过 128 MB。');
      try{
        const course=readCourseFile(file,{optional:true});
        if(!course){skipped++;continue;}
        if(items.length>=500)throw new Error('每次最多导入 500 个课程。');
        items.push({relative:name,course});
      }catch(error){throw new Error(`${name}：${error.message}`);}
    }
  }
  await walk();
  if(!items.length)throw new Error('这个文件夹中没有课程 JSON 文件，请选择包含课程文件的目录。');
  return {title:(path.basename(root)||'导入课程').slice(0,80),items,skipped};
}

// Commit only after every course has been validated; no async work between the two indexes.
function commitCourseFolder(pack,{library,readCourses,writeCourses},input={}){
  const before=library.read(),data=structuredClone(before),parentId=input.folderId||'';
  library.location(data,{mode:'study',folderId:parentId});
  const previous=readCourses(),now=new Date().toISOString(),rootId=randomUUID();
  let name=pack.title,n=2;
  while(data.folders.some(f=>f.mode==='study'&&f.parentId===parentId&&f.name===name))name=pack.title.slice(0,70)+` (${n++})`;
  data.folders.push({id:rootId,name,parentId,mode:'study',updatedAt:now});
  const folders=new Map([['',rootId]]);
  for(const {relative,course} of pack.items){
    const parts=relative.split(path.sep);parts.pop();let key='',folderId=rootId;
    for(const part of parts){
      key=key?path.join(key,part):part;
      if(!folders.has(key)){const id=randomUUID();folders.set(key,id);data.folders.push({id,name:part,parentId:folderId,mode:'study',updatedAt:now});}
      folderId=folders.get(key);
    }
    data.courses[course.id]={folderId};
  }
  data.selection={mode:'study'};data.views.study.folderId=rootId;
  library.write(data);
  try{writeCourses([...pack.items.map(item=>item.course),...previous]);}
  catch(error){library.write(before);throw error;}
  return {library:data,imported:pack.items.length,skipped:pack.skipped,folderName:name};
}
module.exports={readCourseFile,readCourseFolder,commitCourseFolder};
