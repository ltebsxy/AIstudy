const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library}=require('../lib/library'),{Notes}=require('../lib/notes');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXr8AAAAASUVORK5CYII=';
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-notes-'));t.after(()=>{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('study-notes-'))fs.rmSync(root,{recursive:true,force:true});});const library=new Library(root);return {root,library,notes:new Notes(library)};}
test('v2 upgrade backs up the full index and creates an independent knowledge tree without touching imports',t=>{
  const {root,library}=setup(t),old={version:2,folders:[{id:'study',name:'A',mode:'study',parentId:''},{id:'read',name:'A',mode:'reading',parentId:''}],courses:{c:{folderId:'study'}},documents:[{id:'doc',folderId:'read',relativeFile:'documents/original.pdf'}],selection:{mode:'reading'},views:{study:{folderId:'study',layout:'cards'},reading:{folderId:'read',layout:'list'}}};
  fs.mkdirSync(path.join(root,'documents'));fs.writeFileSync(path.join(root,'documents/original.pdf'),'original');fs.writeFileSync(library.file,JSON.stringify(old));
  const upgraded=library.read();assert.equal(upgraded.version,3);assert.deepEqual(upgraded.folders,old.folders);assert.deepEqual(upgraded.documents,old.documents);assert.deepEqual(upgraded.courses,old.courses);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'library-v2.backup.json'))),old);
  assert.deepEqual(upgraded.views.knowledge,{folderId:'',layout:'cards'});assert.equal(fs.readFileSync(path.join(root,'documents/original.pdf'),'utf8'),'original');
  library.folder({name:'A',mode:'knowledge'});assert.equal(library.read().folders.length,3);assert.deepEqual(library.read().views.reading,old.views.reading);
});
test('course text and screenshot append to one persistent note; changing or moving its folder keeps the same contents',t=>{
  const {library,notes}=setup(t),course={id:'course',title:'数学'};
  const first=library.folder({name:'数学笔记',mode:'knowledge'}).folders.at(-1).id,second=library.folder({name:'复习',mode:'knowledge'}).folders.at(-1).id;
  library.noteDestination(course.id,first);const note=notes.forCourse(course);notes.appendText(note.id,'保留公式 \\(x^2\\)',{source:course.title});notes.appendImage(note.id,image);
  assert.equal(notes.forCourse(course).id,note.id);assert.equal(notes.read(note.id).entries.length,2);assert.equal(notes.image(note.id,notes.read(note.id).entries[1].id),image);
  library.noteDestination(course.id,second);assert.equal(notes.read(note.id).folderId,second);assert.equal(notes.read(note.id).entries[0].text,'保留公式 \\(x^2\\)');
  library.assign({kind:'note',id:note.id,folderId:first},[]);assert.equal(library.read().noteDestinations.course.folderId,first);assert.throws(()=>library.removeFolder({id:first,mode:'knowledge'},['course']),/先移出/);
  const study=library.folder({name:'课程',mode:'study'}).folders.at(-1).id;assert.throws(()=>library.noteDestination(course.id,study),/不属于/);
  notes.rename(note.id,'定义与公式');assert.equal(new Notes(new Library(library.root)).read(note.id).name,'定义与公式');
});
test('index failures roll back note edits and image copies; removal cannot read outside owned paths',t=>{
  const {root,library,notes}=setup(t),note=notes.create(),entry=notes.appendText(note.id,'原文').entries[0],original=fs.readFileSync(notes.file(note.id)),write=library.saveNote;
  library.saveNote=()=>{throw Error('simulated index failure');};assert.throws(()=>notes.updateText(note.id,entry.id,'替换'),/simulated/);assert.deepEqual(fs.readFileSync(notes.file(note.id)),original);
  assert.throws(()=>notes.appendImage(note.id,image),/simulated/);assert.equal(fs.readdirSync(path.join(root,'notes/images')).length,0);library.saveNote=write;
  assert.throws(()=>notes.file('../outside'),/无效/);const updated=notes.appendImage(note.id,image),imageEntry=updated.entries[1];
  const bad={version:1,entries:[{...imageEntry,relativeFile:'../outside.png'}]};fs.writeFileSync(notes.file(note.id),JSON.stringify(bad));assert.throws(()=>notes.image(note.id,imageEntry.id),/无效/);fs.writeFileSync(notes.file(note.id),JSON.stringify({version:1,entries:updated.entries}));
  notes.removeEntry(note.id,imageEntry.id);assert.equal(fs.readdirSync(path.join(root,'notes/images')).length,0);notes.remove(note.id);assert.equal(library.read().notes.length,0);assert(!fs.existsSync(notes.file(note.id)));
});

test('reading vocabulary notes are separate from course notes and keep their association after rename, move and restart',t=>{
  const {library,notes}=setup(t),reading={id:'document:article',title:'AI reading'};
  const note=notes.forReading(reading);notes.appendText(note.id,'her\npron. 她的，她\nAI 翻译：她的',{source:reading.title});
  const destination=library.folder({name:'英语',mode:'knowledge'}).folders.at(-1).id;library.assign({kind:'note',id:note.id,folderId:destination},[]);notes.rename(note.id,'英语词语');
  const restored=new Notes(new Library(library.root)).forReading(reading);assert.equal(restored.id,note.id);assert.equal(restored.folderId,destination);assert.equal(restored.name,'英语词语');assert.equal(restored.readingId,reading.id);assert(restored.entries[0].text.includes('AI 翻译'));assert.equal(restored.courseId,undefined);
  const courseNote=notes.forCourse({id:reading.id,title:'Different course'});assert.notEqual(courseNote.id,note.id);assert.equal(courseNote.courseId,reading.id);
});

test('reading edits and explicit destinations preserve originals, redirect additions and roll back content on index failure',t=>{
  const {root,library,notes}=setup(t),file=path.join(root,'input.txt');fs.writeFileSync(file,'Original');
  const doc=library.importPDF(file,{}).documents[0],source={id:'document:'+doc.id,title:doc.name},auto=notes.forReading(source),shared=notes.create({name:'共享笔记'});
  const folder=library.folder({name:'阅读',mode:'knowledge'}).folders.at(-1).id;
  library.readingDestination(doc.id,{folderId:folder});assert.equal(notes.forReading(source).folderId,folder);
  library.editDocument({id:doc.id,name:'New title',text:'Edited',folderId:folder,noteId:shared.id,readingMode:'english'});
  assert.equal(fs.readFileSync(file,'utf8'),'Original');assert.equal(fs.readFileSync(library.document(doc.id).file,'utf8'),'Edited');
  notes.appendText(notes.forReading(source).id,'phrase');assert.equal(notes.read(shared.id).entries.length,1);assert.equal(notes.read(auto.id).entries.length,0);
  const before=fs.readdirSync(path.join(root,'documents')),write=library.write;library.write=()=>{throw Error('simulated failure');};
  assert.throws(()=>library.editDocument({id:doc.id,name:'Failed',text:'Not committed'}),/simulated/);library.write=write;
  assert.deepEqual(fs.readdirSync(path.join(root,'documents')),before);assert.equal(fs.readFileSync(library.document(doc.id).file,'utf8'),'Edited');
  notes.remove(shared.id);assert.equal(notes.forReading(source).id,auto.id);
  library.removeDocument(doc.id);assert.equal(notes.read(auto.id).id,auto.id);
});
