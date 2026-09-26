const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../lib/library');
function setup(){return new Library(fs.mkdtempSync(path.join(os.tmpdir(),'study-folders-')));}
function folder(lib,name,mode='study',parentId=''){return lib.folder({name,mode,parentId}).folders.at(-1).id;}
test('nested folders isolate modes, reject cycles and retain separate locations and views',()=>{
  const lib=setup(),a=folder(lib,'A'),b=folder(lib,'B','study',a),c=folder(lib,'C','study',b),r=folder(lib,'A','reading');
  assert.throws(()=>folder(lib,'A'),/已有/);
  assert.throws(()=>folder(lib,'bad','reading',a),/不属于/);
  assert.throws(()=>lib.folder({id:a,name:'A',parentId:c,mode:'study'}),/子文件夹/);
  lib.assign({kind:'course',id:'course',folderId:c},['course']);
  assert.throws(()=>lib.assign({kind:'course',id:'course',folderId:r},['course']),/不属于/);
  lib.select({mode:'study',folderId:c,layout:'list'});lib.select({mode:'reading',folderId:r});lib.select({mode:'study'});
  const data=new Library(lib.root).read();assert.deepEqual(data.views,{study:{folderId:c,layout:'list'},reading:{folderId:r,layout:'cards'}});
  assert.throws(()=>lib.removeFolder({id:c,mode:'study'},['course']),/先移出/);
  lib.assign({kind:'course',id:'course'},['course']);lib.removeFolder({id:c,mode:'study'},['course']);assert.equal(lib.read().views.study.folderId,b);
  lib.folder({id:b,name:'B2',mode:'study',parentId:''});assert.equal(lib.read().folders.find(x=>x.id===b).parentId,'');
  assert.equal(lib.read().folders.find(x=>x.id===r).name,'A');
});
test('v1 migration backs up metadata and preserves contents in two independent folder trees',()=>{
  const lib=setup(),old={version:1,books:[{id:'book',name:'数学'}],types:[{id:'type',bookId:'book',name:'练习'}],courses:{c:{bookId:'book',typeId:'type'}},documents:[{id:'pdf-id',name:'example.pdf',bookId:'book',typeId:'type',relativeFile:'documents/11111111-1111-1111-1111-111111111111.pdf'}],selection:{mode:'reading',bookId:'book',typeId:'type'}};
  fs.writeFileSync(lib.file,JSON.stringify(old));const data=lib.read();assert.equal(data.version,2);assert.equal(data.folders.length,4);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(lib.root,'library-v1.backup.json'))),old);
  assert.equal(data.documents[0].id,'pdf-id');assert.equal(data.documents[0].relativeFile,old.documents[0].relativeFile);
  const study=data.folders.find(x=>x.mode==='study'&&x.name==='练习'),reading=data.folders.find(x=>x.mode==='reading'&&x.name==='练习');
  assert.notEqual(study.id,reading.id);assert.equal(data.courses.c.folderId,study.id);assert.equal(data.documents[0].folderId,reading.id);
  assert.deepEqual(lib.read(),data);lib.folder({...study,name:'修改后'});assert.equal(lib.read().folders.find(x=>x.id===reading.id).name,'练习');
});
test('PDF copies remain local and cross-mode moves and unsafe paths are rejected',()=>{
  const lib=setup(),file=path.join(lib.root,'original.pdf');fs.writeFileSync(file,'%PDF-1.4 synthetic');const a=folder(lib,'A'),r=folder(lib,'R','reading');
  const item=lib.importPDF(file,{folderId:r}).documents[0];fs.unlinkSync(file);assert.equal(fs.readFileSync(lib.document(item.id).file,'utf8'),'%PDF-1.4 synthetic');assert(item.size>0);
  assert.throws(()=>lib.assign({kind:'document',id:item.id,folderId:a},[]),/不属于/);
  const data=lib.read();data.documents[0].relativeFile='../outside.pdf';lib.write(data);assert.throws(()=>lib.document(item.id),/无效/);
  fs.writeFileSync(lib.file,'invalid JSON');assert.throws(()=>folder(lib,'bad'));assert.equal(fs.readFileSync(lib.file,'utf8'),'invalid JSON');
});
