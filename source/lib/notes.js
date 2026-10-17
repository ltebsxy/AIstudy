// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const imagePath=/^notes\/images\/[0-9a-f-]{36}\.(png|jpeg|webp|gif)$/i;
class Notes{
  constructor(library){this.library=library;this.root=library.root;}
  file(id){if(typeof id!=='string'||!uuid.test(id))throw new Error('笔记编号无效。');return path.join(this.root,'notes',id+'.json');}
  metadata(id){const item=this.library.read().notes.find(x=>x.id===id);if(!item)throw new Error('笔记不存在。');return item;}
  read(id){const item=this.metadata(id),document=JSON.parse(fs.readFileSync(this.file(id),'utf8'));if(document.version!==1||!Array.isArray(document.entries))throw new Error('笔记格式无效，原文件已保留。');return {...item,entries:document.entries};}
  write(item,entries){
    if(entries.length>500)throw new Error('一份笔记最多保存 500 段内容。');
    const file=this.file(item.id),bytes=Buffer.from(JSON.stringify({version:1,entries}));fs.mkdirSync(path.dirname(file),{recursive:true});
    const previous=fs.existsSync(file)?fs.readFileSync(file):null;
    fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);
    const size=bytes.length+entries.reduce((n,e)=>n+(e.type==='image'?(e.size||0):0),0);
    try{this.library.saveNote({...item,size});}catch(error){if(previous){fs.writeFileSync(file+'.tmp',previous);fs.renameSync(file+'.tmp',file);}else fs.unlinkSync(file);throw error;}return this.read(item.id);
  }
  create({name='新建笔记',folderId='',courseId,readingId}={}){
    const data=this.library.read();this.library.location(data,{mode:'knowledge',folderId});
    const base=String(name).trim().slice(0,80);if(!base)throw new Error('请填写笔记名称。');let unique=base,n=2;
    while(data.notes.some(x=>x.folderId===folderId&&x.name===unique))unique=base.slice(0,70)+` (${n++})`;
    const item={id:randomUUID(),name:unique,folderId,...(courseId?{courseId}:{}),...(readingId?{readingId}:{})},file=this.file(item.id);
    try{return this.write(item,[]);}catch(error){try{fs.unlinkSync(file);}catch{}throw error;}
  }
  forCourse(course){
    const data=this.library.read(),existing=data.notes.find(x=>x.courseId===course.id);if(existing)return this.read(existing.id);
    const folderId=data.noteDestinations[course.id]?.folderId||'';
    return this.create({name:(course.title.slice(0,74)+' · 笔记'),folderId,courseId:course.id});
  }
  forReading(document){
    const data=this.library.read(),target=data.noteDestinations[document.id]||{};
    if(target.noteId){if(!data.notes.some(n=>n.id===target.noteId))throw new Error('默认笔记已删除，请重新选择保存位置。');return this.read(target.noteId);}
    const existing=data.notes.find(x=>x.readingId===document.id);
    return existing?this.read(existing.id):this.create({name:document.title.slice(0,70)+' · 阅读笔记',folderId:target.folderId||'',readingId:document.id});
  }
  appendText(id,text,{allowEmpty=false,source}={}){
    if(typeof text!=='string'||text.length>50000||(!allowEmpty&&!text.trim()))throw new Error('请选择 1–50000 字的文字。');
    const item=this.read(id);return this.write(item,[...item.entries,{id:randomUUID(),type:'text',text,...(source?{source}:{}),createdAt:new Date().toISOString()}]);
  }
  updateText(id,entryId,text){
    if(typeof text!=='string'||text.length>50000)throw new Error('文字不能超过 50000 字。');
    const item=this.read(id),entry=item.entries.find(e=>e.id===entryId&&e.type==='text');if(!entry)throw new Error('文字段落不存在。');entry.text=text;return this.write(item,item.entries);
  }
  appendImage(id,image,{source}={}){
    const match=typeof image==='string'&&image.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw new Error('图片格式无效。');
    const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>20*1024*1024)throw new Error('图片不能超过 20 MB。');
    const item=this.read(id),relativeFile=`notes/images/${randomUUID()}.${match[1]}`,file=path.join(this.root,relativeFile);
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});
    try{return this.write(item,[...item.entries,{id:randomUUID(),type:'image',relativeFile,size:bytes.length,...(source?{source}:{}),createdAt:new Date().toISOString()}]);}
    catch(error){if(!this.read(id).entries.some(e=>e.relativeFile===relativeFile))fs.unlinkSync(file);throw error;}
  }
  image(id,entryId){
    const entry=this.read(id).entries.find(e=>e.id===entryId&&e.type==='image');if(!entry||!imagePath.test(entry.relativeFile)||!uuid.test(path.basename(entry.relativeFile).split('.')[0]))throw new Error('图片记录无效。');
    return `data:image/${path.extname(entry.relativeFile).slice(1)};base64,`+fs.readFileSync(path.join(this.root,entry.relativeFile)).toString('base64');
  }
  removeEntry(id,entryId){
    const item=this.read(id),entry=item.entries.find(e=>e.id===entryId);if(!entry)throw new Error('笔记内容不存在。');
    const result=this.write(item,item.entries.filter(e=>e.id!==entryId));
    if(entry.type==='image'&&imagePath.test(entry.relativeFile))try{fs.unlinkSync(path.join(this.root,entry.relativeFile));}catch(error){if(error.code!=='ENOENT')throw error;}return result;
  }
  rename(id,name){const item=this.metadata(id);this.library.saveNote({...item,name});return this.library.read();}
  remove(id){
    const item=this.read(id),data=this.library.read();data.notes=data.notes.filter(x=>x.id!==id);for(const target of Object.values(data.noteDestinations))if(target.noteId===id)target.noteId='';this.library.write(data);
    try{fs.unlinkSync(this.file(id));}catch(error){if(error.code!=='ENOENT')throw error;}
    for(const entry of item.entries)if(entry.type==='image'&&imagePath.test(entry.relativeFile))try{fs.unlinkSync(path.join(this.root,entry.relativeFile));}catch(error){if(error.code!=='ENOENT')throw error;}
    return data;
  }
}
module.exports={Notes};
