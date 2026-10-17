// One focused, isolated flow; screenshot input is synthetic, never the user's desktop.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),{normalizeCourse}=require('../lib/model');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-knowledge-ui-'));
const course=normalizeCourse({title:'课程笔记验证',knowledge:'选取这句定义与公式 $x^2$，保存到知识点。',questions:[{text:'手写题目 $x+1=2$'}],workTarget:{type:'builtin'}});
fs.writeFileSync(path.join(data,'courses.json'),JSON.stringify([course]));
let app,page,writer;const errors=[];
async function launch(){
  app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
  await app.firstWindow();page=app.windows().find(p=>p.url().endsWith('index.html'));if(!page){await app.waitForEvent('window');page=app.windows().find(p=>p.url().endsWith('index.html'));}
  for(const p of app.windows())p.on('pageerror',e=>errors.push(e.message));await page.locator('.library-page').waitFor();
  await app.evaluate(({desktopCapturer,nativeImage,screen})=>{desktopCapturer.getSources=async({thumbnailSize:{width,height}})=>[{display_id:String(screen.getPrimaryDisplay().id),thumbnail:nativeImage.createFromBitmap(Buffer.alloc(width*height*4,210),{width,height})}];});
}
async function addFolder(name){await page.locator('#library-new').click();await page.locator('#new-folder').click();await page.locator('#folder-name').fill(name);await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});}
async function capture(from,selector){const next=app.waitForEvent('window');await from.locator(selector).click();const window=await next;window.on('pageerror',e=>errors.push(e.message));await window.getByText('框选要保存到课程笔记的内容',{exact:true}).waitFor();await window.mouse.move(200,150);await window.mouse.down();await window.mouse.move(340,240);await window.mouse.up();const closed=window.waitForEvent('close');await window.locator('#confirm').click();await closed;}
async function main(){
 try{
  await launch();await page.locator('#nav-knowledge').click();await page.locator('#library-new').waitFor();await addFolder('数学');await page.locator('.folder-open').click();await addFolder('定义');
  const folders=await page.evaluate(()=>window.study.library()),folder=folders.folders.find(x=>x.name==='定义');
  await page.locator('#nav-home').click();await page.locator('.edit').click();await page.locator('#note-destination').selectOption(folder.id);await page.locator('#save-course').click();await page.locator('.open').click();
  assert.equal(await page.locator('#course-note-folder').inputValue(),folder.id);
  await page.locator('.lesson-content').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);});
  await page.locator('#add-to-note').click();await page.waitForFunction(async()=>{const x=await window.study.library();return x.notes.length===1;});
  const note=(await page.evaluate(()=>window.study.library())).notes[0];assert.equal(note.folderId,folder.id);
  const stored=await page.evaluate(id=>window.study.getNote(id),note.id);assert(stored.entries[0].text.includes('\\(x^2\\)'));assert.equal(stored.entries[0].type,'text');
  await capture(page,'#capture-course-note');await page.locator('#course-note-folder').selectOption('');await page.waitForFunction(async id=>(await window.study.getNote(id)).folderId==='',note.id);
  await page.locator('#open-course-note').click();await page.locator('.note-image').waitFor();await page.waitForFunction(()=>document.querySelector('.note-image').naturalWidth>0);
  await page.locator('#note-add-text').click();const input=page.locator('.note-input:not([hidden])');await input.fill('独立补充文字');await page.waitForFunction(async id=>(await window.study.getNote(id)).entries.some(e=>e.text==='独立补充文字'),note.id);
  await page.locator('#rename-current-note').click();await page.locator('#note-name').fill('定义与截图');await page.locator('dialog [type=submit]').click();await page.locator('dialog').waitFor({state:'detached'});
  await page.locator('#note-source-course').click();const pending=app.waitForEvent('window');await page.locator('#finish-lesson').click();writer=await pending;writer.on('pageerror',e=>errors.push(e.message));await writer.getByText('笔迹自动保存在本机',{exact:true}).waitFor();
  await capture(writer,'#capture-note');assert.equal(await writer.evaluate(()=>index),0);assert(await writer.locator('#capture-answer').isVisible());await writer.locator('#back-course').click();
  await page.locator('#nav-knowledge').click();await page.locator('[data-layout=list]').click();await page.locator('.read-note').click();await page.locator('.note-image').first().waitFor();
  await page.evaluate(()=>window.study.saveTheme('dark'));assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});await page.screenshot({path:path.join(root,'.tmp','knowledge-notes.png')});
  const final=await page.evaluate(id=>window.study.getNote(id),note.id);assert.equal(final.name,'定义与截图');assert.equal(final.entries.filter(x=>x.type==='image').length,2);assert(final.entries.some(x=>x.text==='独立补充文字'));
  await app.close();app=null;await launch();await page.locator('#nav-knowledge').click();await page.locator('.read-note').click();await page.getByRole('heading',{name:'定义与截图',exact:true}).waitFor();assert.equal((await page.evaluate(id=>window.study.getNote(id),note.id)).entries.length,4);
  assert.deepEqual(errors,[]);console.log('Knowledge sidebar/folders, course destination, selected LaTeX text, synthetic screenshot capture, non-advancing writer capture, text autosave, rename/list/dark mode and restart passed.');
 }finally{if(app)await app.close().catch(()=>{});if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-knowledge-ui-'))fs.rmSync(data,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
