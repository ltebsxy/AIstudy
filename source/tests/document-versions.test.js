const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../lib/library'),{MAX_BYTES}=require('../lib/document-versions');
test('autosave storage is bounded, originals and unrelated files survive, recovery and rollback remain usable',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-versions-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const library=new Library(root),input=path.join(root,'original.txt');fs.writeFileSync(input,'x'.repeat(1024*1024));
 const doc=library.importPDF(input,{}).documents[0],unknown=path.join(root,'documents','12345678-1234-1234-1234-123456789abc.txt');fs.writeFileSync(unknown,'private');
 for(let i=0;i<20;i++)library.editDocument({id:doc.id,name:doc.name,text:String(i)+'x'.repeat(1024*1024)});
 const files=fs.readdirSync(path.join(root,'documents'));assert.equal(files.length,8);assert.equal(library.document(doc.id).history.length,5);assert(fs.existsSync(unknown));assert.equal(fs.readFileSync(input,'utf8'),'x'.repeat(1024*1024));
 assert(library.document(doc.id).history.reduce((s,v)=>s+v.size,0)<=MAX_BYTES);
 const before=library.document(doc.id),write=library.write;library.write=()=>{throw Error('index failure');};assert.throws(()=>library.editDocument({id:doc.id,name:doc.name,text:'failure'}),/index failure/);library.write=write;assert.deepEqual(fs.readdirSync(path.join(root,'documents')),files);assert.equal(library.document(doc.id).relativeFile,before.relativeFile);
 library.restoreDocument(doc.id,before.history[0].relativeFile);assert(fs.readFileSync(library.document(doc.id).file,'utf8').startsWith('18x'));
 library.restoreDocument(doc.id,before.originalVersion.relativeFile);assert.equal(fs.readFileSync(library.document(doc.id).file,'utf8'),'x'.repeat(1024*1024));
 assert.throws(()=>library.restoreDocument(doc.id,'../original.txt'),/不存在/);
 for(let i=0;i<7;i++)library.editDocument({id:doc.id,name:doc.name,text:String(i)+'y'.repeat(4*1024*1024)});
 const last=library.document(doc.id);assert(last.history.length<5);assert(last.history.reduce((s,v)=>s+v.size,0)<=MAX_BYTES);assert.equal(fs.readFileSync(unknown,'utf8'),'private');
});
test('failed tracked cleanup retries after restart without pruning unknown UUID files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-versions-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let library=new Library(root);
 const input=path.join(root,'original.txt');fs.writeFileSync(input,'original');const doc=library.importPDF(input,{}).documents[0];
 for(let i=0;i<6;i++)library.editDocument({id:doc.id,name:doc.name,text:'revision '+i});
 const previous=library.document(doc.id),obsolete=path.join(root,previous.history.at(-1).relativeFile),unlink=fs.unlinkSync;
 try{fs.unlinkSync=function(file,...args){if(file===obsolete)throw Object.assign(Error('busy'),{code:'EBUSY'});return unlink.call(this,file,...args);};library.editDocument({id:doc.id,name:doc.name,text:'cleanup pending'});}finally{fs.unlinkSync=unlink;}
 assert(fs.existsSync(obsolete));library=new Library(root);assert.equal(fs.readFileSync(library.document(doc.id).file,'utf8'),'cleanup pending');
 library.editDocument({id:doc.id,name:doc.name,text:'cleanup retry'});assert(!fs.existsSync(obsolete));assert.equal(fs.readdirSync(path.join(root,'documents')).length,7);
 const original=library.document(doc.id).originalVersion.relativeFile;library=new Library(root);library.restoreDocument(doc.id,original);assert.equal(fs.readFileSync(library.document(doc.id).file,'utf8'),'original');
});
