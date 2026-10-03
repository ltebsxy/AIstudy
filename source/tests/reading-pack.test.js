const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../lib/library'),{readReadingPack}=require('../lib/reading-pack');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-reading-pack-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const input=path.join(root,'input');fs.mkdirSync(input);return {root,input,library:new Library(path.join(root,'library'))};}
function file(input,name,text='An English article.'){const target=path.join(input,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);return target;}
test('folder import preserves nonempty reading hierarchy and copies originals',async t=>{
  const {input,library}=setup(t);file(input,'01-first.txt');file(input,'sub/02-second.md');file(input,'sub/notes.csv');file(input,'.cache/hidden.txt');fs.mkdirSync(path.join(input,'empty'));
  library.folder({mode:'study',name:'existing'});const result=await library.importFolder(input);
  assert.equal(result.imported,2);assert.equal(result.skipped,2);assert.equal(result.library.documents.length,2);
  const folders=result.library.folders.filter(x=>x.mode==='reading');assert.equal(folders.length,2);assert(!folders.some(x=>x.name==='empty'));
  assert.equal(result.library.selection.mode,'reading');assert.equal(result.library.views.reading.folderId,folders[0].id);
  fs.unlinkSync(path.join(input,'01-first.txt'));assert.equal(fs.readFileSync(library.document(result.library.documents[0].id).file,'utf8'),'An English article.');
  assert.equal((await library.importFolder(input)).folderName,'input (2)');assert.equal(library.read().folders.filter(x=>x.mode==='study').length,1);
});
test('reading-pack manifest imports only articles with English defaults and chosen names',async t=>{
  const {input,library}=setup(t);file(input,'articles/01.txt');file(input,'materials/answers.md');file(input,'complete-reading.txt');
  file(input,'reading-pack.json',JSON.stringify({version:1,title:'AI 3500',readingMode:'english',documents:[{file:'articles/01.txt',name:'01 · Learning with AI'}]}));
  const result=await library.importFolder(input);assert.equal(result.imported,1);assert.equal(result.folderName,'AI 3500');
  const item=library.document(result.library.documents[0].id);assert.equal(item.name,'01 · Learning with AI');assert.equal(item.readingMode,'english');
  assert(!result.library.documents.some(item=>/answers|complete/.test(item.name)));
});
test('unsafe paths, repeated files and empty documents reject the whole import',async t=>{
  const {input,library}=setup(t);file(input,'safe.txt');file(input,'empty.txt','');const before=library.read();
  await assert.rejects(()=>library.importFolder(input),/为空/);assert.deepEqual(library.read(),before);assert(!fs.existsSync(path.join(library.root,'documents')));
  for(const documents of [[{file:'../outside.txt'}],[{file:'C:/outside.txt'}],[{file:'safe.txt'},{file:'safe.txt'}]]){
    file(input,'reading-pack.json',JSON.stringify({version:1,documents}));await assert.rejects(()=>library.importFolder(input),/路径|包内|重复/);assert.deepEqual(library.read(),before);
  }
  file(input,'reading-pack.json',JSON.stringify({version:1,documents:[{file:'safe.txt'}]}));
  const write=library.write;library.write=()=>{throw Error('Save failed');};await assert.rejects(()=>library.importFolder(input),/Save failed/);library.write=write;
  assert.deepEqual(fs.readdirSync(path.join(library.root,'documents')),[]);assert.deepEqual(library.read(),before);
  const pack=await readReadingPack(input);assert.equal(pack.readingMode,'standard');assert.equal(pack.documents.length,1);
});
