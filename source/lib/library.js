const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { inspectDocument,extensions } = require('./reading-document');
const {readReadingPack}=require('./reading-pack');
const documentVersions=require('./document-versions');
const modes = ['study','reading','knowledge'];
const blank = () => ({version:3,folders:[],courses:{},documents:[],notes:[],noteDestinations:{},selection:{mode:'study'},views:Object.fromEntries(modes.map(mode=>[mode,{folderId:'',layout:'cards'}]))});
class Library {
  constructor(root) { this.root=root;this.file=path.join(root,'library.json'); }
  read() {
    let data;
    try { data=JSON.parse(fs.readFileSync(this.file,'utf8')); }
    catch(e){if(e.code==='ENOENT')return blank();throw e;}
    if(data.version===1)return this.migrate(data);
    if(data.version===2){
      if(!Array.isArray(data.folders)||!Array.isArray(data.documents)||!data.courses||!['study','reading'].includes(data.selection?.mode)||!['study','reading'].every(mode=>data.views?.[mode]))throw new Error('文件夹索引格式无效。');
      const backup=path.join(this.root,'library-v2.backup.json');if(!fs.existsSync(backup))fs.copyFileSync(this.file,backup,fs.constants.COPYFILE_EXCL);
      return this.write({...data,version:3,notes:[],noteDestinations:{},views:{...data.views,knowledge:{folderId:'',layout:'cards'}}});
    }
    if(data.version!==3||!Array.isArray(data.folders)||!Array.isArray(data.documents)||!Array.isArray(data.notes)||!data.noteDestinations||!data.courses||!modes.includes(data.selection?.mode)||!modes.every(mode=>data.views?.[mode]))throw new Error('文件夹索引格式无效。');
    return data;
  }
  migrate(old) {
    if(!Array.isArray(old.books)||!Array.isArray(old.types)||!Array.isArray(old.documents)||!old.courses)throw new Error('旧分区文件格式无效。');
    const data=blank(),maps={study:new Map(),reading:new Map()},now=new Date().toISOString();
    // Preserve the old hierarchy in two independent trees. PDF identities stay unchanged.
    for(const mode of ['study','reading']){
      for(const item of [...old.books,...old.types])maps[mode].set(item.id,randomUUID());
      for(const item of old.books)data.folders.push({id:maps[mode].get(item.id),name:item.name,parentId:'',mode,updatedAt:now});
      for(const item of old.types)data.folders.push({id:maps[mode].get(item.id),name:item.name,parentId:maps[mode].get(item.bookId)||'',mode,updatedAt:now});
      data.views[mode].folderId=maps[mode].get(old.selection?.typeId||old.selection?.bookId)||'';
    }
    for(const [id,item] of Object.entries(old.courses))Object.defineProperty(data.courses,id,{value:{folderId:maps.study.get(item.typeId||item.bookId)||''},enumerable:true,writable:true,configurable:true});
    data.documents=old.documents.map(({bookId,typeId,...item})=>{
      let stat;try{if(/^documents\/[0-9a-f-]{36}\.pdf$/i.test(item.relativeFile))stat=fs.statSync(path.join(this.root,item.relativeFile));}catch(e){if(e.code!=='ENOENT')throw e;}
      return {...item,folderId:maps.reading.get(typeId||bookId)||'',...(Number.isFinite(item.size??stat?.size)?{size:item.size??stat?.size}:{}),updatedAt:item.updatedAt||stat?.mtime.toISOString()||now};
    });
    data.selection.mode=['study','reading'].includes(old.selection?.mode)?old.selection.mode:'study';
    const backup=path.join(this.root,'library-v1.backup.json');
    if(!fs.existsSync(backup))fs.copyFileSync(this.file,backup,fs.constants.COPYFILE_EXCL);
    return this.write(data);
  }
  write(data){
    try{fs.mkdirSync(this.root,{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(this.file+'.tmp',this.file);}
    catch(e){if(['EACCES','EPERM','EROFS'].includes(e.code))throw new Error('应用目录不可写，请将软件移到可写目录后再保存。');throw e;}
    return data;
  }
  location(data,{mode,folderId=''}={}){
    if(!modes.includes(mode))throw new Error('模式无效。');
    if(typeof folderId!=='string'||(folderId&&!data.folders.some(x=>x.id===folderId&&x.mode===mode)))throw new Error('文件夹不属于当前模式。');
    return {folderId};
  }
  folder({id,name,mode,parentId=''}){
    const data=this.read(),clean=String(name||'').trim();
    if(!clean||clean.length>80)throw new Error('请输入 1–80 字的文件夹名称。');
    this.location(data,{mode,folderId:parentId});
    const item=id?data.folders.find(x=>x.id===id&&x.mode===mode):null;
    if(id&&!item)throw new Error('文件夹不存在。');
    let ancestor=parentId;const seen=new Set();
    while(ancestor){if(ancestor===id||seen.has(ancestor))throw new Error('不能移到自身或子文件夹中。');seen.add(ancestor);ancestor=data.folders.find(x=>x.id===ancestor)?.parentId||'';}
    if(data.folders.some(x=>x.id!==id&&x.mode===mode&&x.parentId===parentId&&x.name===clean))throw new Error('同一位置已有这个名称。');
    const value={name:clean,parentId,mode,updatedAt:new Date().toISOString()};
    if(item)Object.assign(item,value);else data.folders.push({id:randomUUID(),...value});
    return this.write(data);
  }
  removeFolder({id,mode},courseIds){
    const data=this.read();this.location(data,{mode,folderId:id});
    const folder=data.folders.find(x=>x.id===id&&x.mode===mode);if(!folder)throw new Error('文件夹不存在。');
    if(data.folders.some(x=>x.parentId===id)||data.documents.some(x=>x.folderId===id)||data.notes.some(x=>x.folderId===id)||Object.entries(data.courses).some(([key,x])=>courseIds.includes(key)&&x.folderId===id))throw new Error('请先移出其中的内容，再删除空文件夹。');
    if(Object.entries(data.noteDestinations).some(([key,x])=>(courseIds.includes(key)||data.documents.some(d=>'document:'+d.id===key))&&x.folderId===id))throw new Error('有课程或读写文件将此文件夹设为笔记保存位置，请先更改设置。');
    data.folders=data.folders.filter(x=>x.id!==id);if(data.views[mode].folderId===id)data.views[mode].folderId=folder.parentId;
    return this.write(data);
  }
  assign({kind,id,folderId=''},courseIds){
    const data=this.read(),mode=kind==='course'?'study':kind==='document'?'reading':kind==='note'?'knowledge':null,destination=this.location(data,{mode,folderId});
    if(kind==='course'&&courseIds.includes(id))Object.defineProperty(data.courses,id,{value:destination,enumerable:true,writable:true,configurable:true});
    else if(kind==='document'){const item=data.documents.find(x=>x.id===id);if(!item)throw new Error('PDF 不存在。');Object.assign(item,destination,{updatedAt:new Date().toISOString()});}
    else if(kind==='note'){const item=data.notes.find(x=>x.id===id);if(!item)throw new Error('笔记不存在。');Object.assign(item,destination,{updatedAt:new Date().toISOString()});if(item.courseId)Object.defineProperty(data.noteDestinations,item.courseId,{value:destination,enumerable:true,writable:true,configurable:true});if(item.readingId&&!data.noteDestinations[item.readingId]?.noteId)Object.defineProperty(data.noteDestinations,item.readingId,{value:destination,enumerable:true,writable:true,configurable:true});}
    else throw new Error('课程不存在。');
    return this.write(data);
  }
  noteDestination(courseId,folderId){
    const data=this.read(),destination=this.location(data,{mode:'knowledge',folderId});
    Object.defineProperty(data.noteDestinations,courseId,{value:destination,enumerable:true,writable:true,configurable:true});
    const note=data.notes.find(x=>x.courseId===courseId);if(note)Object.assign(note,destination,{updatedAt:new Date().toISOString()});
    return this.write(data);
  }
  readingDestination(id,{folderId='',noteId=''}={}){
    const data=this.read();this.document(id);this.location(data,{mode:'knowledge',folderId});
    if(noteId&&!data.notes.some(n=>n.id===noteId))throw new Error('目标笔记不存在，请重新选择。');
    data.noteDestinations['document:'+id]={folderId,noteId};
    this.moveReadingNote(data,id,folderId,noteId);
    return this.write(data);
  }
  moveReadingNote(data,id,folderId,noteId){
    const note=data.notes.find(n=>n.readingId==='document:'+id);
    if(!noteId&&note){
      if(data.notes.some(n=>n.id!==note.id&&n.folderId===folderId&&n.name===note.name))throw new Error('目标文件夹已有同名笔记，请先重命名或选择具体笔记。');
      Object.assign(note,{folderId,updatedAt:new Date().toISOString()});
    }
  }
  editDocument({id,name,description='',readingMode='standard',text,replacement,folderId='',noteId=''}){
    const original=this.document(id),data=this.read(),item=data.documents.find(x=>x.id===id);
    const clean=String(name||'').trim();
    if(!clean||clean.length>160)throw new Error('请输入 1–160 字的文件名称。');
    if(typeof description!=='string'||description.length>240)throw new Error('简介不能超过 240 字。');
    if(!['standard','english'].includes(readingMode))throw new Error('阅读模式无效。');
    this.location(data,{mode:'knowledge',folderId});
    if(noteId&&!data.notes.some(n=>n.id===noteId))throw new Error('目标笔记不存在，请重新选择。');
    this.moveReadingNote(data,id,folderId,noteId);
    let bytes,format=original.format||path.extname(original.file).slice(1);
    if(replacement){const info=inspectDocument(replacement);bytes=fs.readFileSync(info.file);format=info.extension;}
    else if(text!==undefined){
      if(!['txt','md','markdown'].includes(format)||typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>5*1024*1024)throw new Error('文本为空、格式无效或超过 5 MB。');
      bytes=Buffer.from(text,'utf8');
    }
    // Write immutable content first; atomically replacing the index commits the current version.
    const relativeFile=bytes?`documents/${randomUUID()}.${format}`:original.relativeFile;
    if(bytes)Object.assign(item,documentVersions.plan(this.root,original));
    if(bytes)fs.writeFileSync(path.join(this.root,relativeFile),bytes,{flag:'wx'});
    Object.assign(item,{name:clean,description,readingMode,relativeFile,format,size:bytes?.length??original.size,updatedAt:new Date().toISOString()});
    data.noteDestinations['document:'+id]={folderId,noteId};
    try{this.write(data);}catch(error){if(bytes)fs.unlinkSync(path.join(this.root,relativeFile));throw error;}
    if(bytes)documentVersions.clean(this.root,item);
    return data;
  }
  documentHistory(id){const item=this.document(id);return [...(item.originalVersion?[{...item.originalVersion,label:'原始副本'}]:[]),...(item.history||[]).map(v=>({...v,label:'历史版本'}))].filter(v=>documentVersions.owned.test(v.relativeFile)&&fs.existsSync(path.join(this.root,v.relativeFile)));}
  restoreDocument(id,relativeFile){
    if(!this.documentHistory(id).some(v=>v.relativeFile===relativeFile))throw new Error('历史版本不存在。');
    const doc=this.document(id),target=this.read().noteDestinations['document:'+id]||{};
    return this.editDocument({id,name:doc.name,description:doc.description||'',readingMode:doc.readingMode||'standard',...target,replacement:path.join(this.root,relativeFile)});
  }
  removeDocument(id){
    this.document(id);const data=this.read();data.documents=data.documents.filter(x=>x.id!==id);delete data.noteDestinations['document:'+id];return this.write(data);
  }
  saveNote({id,name,folderId='',courseId,readingId,size=0}){
    const data=this.read(),clean=String(name||'').trim();this.location(data,{mode:'knowledge',folderId});
    if(!clean||clean.length>80)throw new Error('请输入 1–80 字的笔记名称。');
    const item=data.notes.find(x=>x.id===id);
    if(data.notes.some(x=>x.id!==id&&x.folderId===folderId&&x.name===clean))throw new Error('同一位置已有这个名称的笔记。');
    const value={id,name:clean,folderId,size,updatedAt:new Date().toISOString(),...(courseId?{courseId}:{}),...(readingId?{readingId}:{})};
    if(item)Object.assign(item,value);else data.notes.push(value);return this.write(data);
  }
  select({mode,folderId,layout}){
    const data=this.read();if(!modes.includes(mode))throw new Error('模式无效。');
    if(layout!==undefined&&!['cards','list'].includes(layout))throw new Error('显示方式无效。');
    data.views[mode]={...data.views[mode],...this.location(data,{mode,folderId:folderId??data.views[mode].folderId}),...(layout?{layout}:{})};
    data.selection={mode};return this.write(data);
  }
  importPDF(file,input){
    const data=this.read(),destination=this.location(data,{mode:'reading',folderId:input.folderId||''}),info=inspectDocument(file);
    const id=randomUUID(),relativeFile=`documents/${id}.${info.extension}`,target=path.join(this.root,relativeFile);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);
    data.documents.push({id,name:path.basename(file),relativeFile,...destination,size:info.size,format:info.extension,updatedAt:new Date().toISOString()});
    try{this.write(data);}catch(e){fs.unlinkSync(target);throw e;}return data;
  }
  async importFolder(directory,input={}){
    this.location(this.read(),{mode:'reading',folderId:input.folderId||''});
    const pack=await readReadingPack(directory),copied=[];
    try{
      await fs.promises.mkdir(path.join(this.root,'documents'),{recursive:true});
      for(const item of pack.documents){
        const id=randomUUID(),relativeFile=`documents/${id}.${item.info.extension}`,target=path.join(this.root,relativeFile);
        await fs.promises.copyFile(item.file,target,fs.constants.COPYFILE_EXCL);
        copied.push({id,target,relativeFile,item});
      }
      // Re-read after asynchronous copies so navigation and concurrent metadata edits survive.
      const data=this.read(),destination=this.location(data,{mode:'reading',folderId:input.folderId||''}),now=new Date().toISOString();
      let name=pack.title,n=2;
      while(data.folders.some(folder=>folder.mode==='reading'&&folder.parentId===destination.folderId&&folder.name===name))name=pack.title.slice(0,70)+` (${n++})`;
      const folderId=randomUUID(),folders=new Map([['',folderId]]);
      data.folders.push({id:folderId,name,mode:'reading',parentId:destination.folderId,updatedAt:now});
      function folderFor(relative){
        const parts=relative.split('/');parts.pop();let relativeFolder='',parentId=folderId;
        for(const part of parts){
          relativeFolder=relativeFolder?relativeFolder+'/'+part:part;
          if(!folders.has(relativeFolder)){const id=randomUUID();folders.set(relativeFolder,id);data.folders.push({id,name:part,parentId,mode:'reading',updatedAt:now});}
          parentId=folders.get(relativeFolder);
        }
        return parentId;
      }
      for(const {id,relativeFile,item} of copied)data.documents.push({id,name:item.name,relativeFile,folderId:folderFor(item.relative),size:item.info.size,format:item.info.extension,readingMode:pack.readingMode,updatedAt:now});
      data.selection={mode:'reading'};data.views.reading.folderId=folderId;this.write(data);
      return {library:data,imported:copied.length,skipped:pack.skipped,folderName:name};
    }catch(error){
      await Promise.all(copied.map(({target})=>fs.promises.unlink(target).catch(()=>{})));throw error;
    }
  }
  document(id){
    const item=this.read().documents.find(x=>x.id===id);
    if(!item||!/^documents\/[0-9a-f-]{36}\.[a-z]+$/i.test(item.relativeFile)||!extensions.includes(path.extname(item.relativeFile).slice(1).toLowerCase()))throw new Error('文件记录无效。');
    const file=path.join(this.root,item.relativeFile);if(!fs.existsSync(file))throw new Error('保存的文件不存在，请重新导入。');
    return {...item,file};
  }
}
module.exports={Library};
