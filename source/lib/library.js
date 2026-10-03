const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { inspectDocument,extensions } = require('./reading-document');
const {readReadingPack}=require('./reading-pack');
const modes = ['study','reading'];
const blank = () => ({version:2,folders:[],courses:{},documents:[],selection:{mode:'study'},views:{study:{folderId:'',layout:'cards'},reading:{folderId:'',layout:'cards'}}});
class Library {
  constructor(root) { this.root=root;this.file=path.join(root,'library.json'); }
  read() {
    let data;
    try { data=JSON.parse(fs.readFileSync(this.file,'utf8')); }
    catch(e){if(e.code==='ENOENT')return blank();throw e;}
    if(data.version===1)return this.migrate(data);
    if(data.version!==2||!Array.isArray(data.folders)||!Array.isArray(data.documents)||!data.courses||!modes.includes(data.selection?.mode)||!modes.every(mode=>data.views?.[mode]))throw new Error('文件夹索引格式无效。');
    return data;
  }
  migrate(old) {
    if(!Array.isArray(old.books)||!Array.isArray(old.types)||!Array.isArray(old.documents)||!old.courses)throw new Error('旧分区文件格式无效。');
    const data=blank(),maps={study:new Map(),reading:new Map()},now=new Date().toISOString();
    // Preserve the old hierarchy in two independent trees. PDF identities stay unchanged.
    for(const mode of modes){
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
    data.selection.mode=modes.includes(old.selection?.mode)?old.selection.mode:'study';
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
    if(data.folders.some(x=>x.parentId===id)||data.documents.some(x=>x.folderId===id)||Object.entries(data.courses).some(([key,x])=>courseIds.includes(key)&&x.folderId===id))throw new Error('请先移出其中的内容，再删除空文件夹。');
    data.folders=data.folders.filter(x=>x.id!==id);if(data.views[mode].folderId===id)data.views[mode].folderId=folder.parentId;
    return this.write(data);
  }
  assign({kind,id,folderId=''},courseIds){
    const data=this.read(),mode=kind==='course'?'study':kind==='document'?'reading':null,destination=this.location(data,{mode,folderId});
    if(kind==='course'&&courseIds.includes(id))Object.defineProperty(data.courses,id,{value:destination,enumerable:true,writable:true,configurable:true});
    else if(kind==='document'){const item=data.documents.find(x=>x.id===id);if(!item)throw new Error('PDF 不存在。');Object.assign(item,destination,{updatedAt:new Date().toISOString()});}
    else throw new Error('课程不存在。');
    return this.write(data);
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
