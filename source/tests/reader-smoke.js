const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright-core');const {pdfFixture}=require('./reading-fixtures');
async function main(){
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-reader-')),pdf=path.join(data,'example.pdf');fs.writeFileSync(pdf,pdfFixture());
  const text=path.join(data,'notes.md');fs.writeFileSync(text,'# 测试阅读\n'+Array.from({length:100},(_,i)=>`第 ${i+1} 行：测试文字 <script>不执行</script>。`).join('\n'));
  let app,page,overlay,writer;const errors=[];
  async function launch(){app=await _electron.launch({executablePath:process.env.STUDY_TEST_EXE||require('electron'),args:process.env.STUDY_TEST_EXE?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();if(app.windows().length<2)await app.waitForEvent('window');for(const p of app.windows()){if(await p.title()==='知序学习')page=p;else overlay=p;p.on('pageerror',e=>errors.push(e.message));}await page.getByText('我的学习空间',{exact:true}).waitFor();await app.evaluate(({shell})=>{globalThis.external=0;shell.openPath=async()=>{globalThis.external++;return '';};});}
  async function importFile(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#import-pdf').click();await page.locator('.read-document').last().waitFor();return (await page.evaluate(()=>window.study.library())).documents.at(-1);}
  async function open(id){await page.evaluate(id=>window.study.startSession('document:'+id,'reading'),id);writer=app.windows().find(p=>p.url().endsWith('/writer.html'));writer.on('pageerror',e=>errors.push(e.message));await writer.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('自动保存'));}
  async function ink(){await writer.bringToFront();const b=await writer.locator('#paper').boundingBox();await writer.mouse.move(b.x+65,b.y+180);await writer.mouse.down();await writer.mouse.move(b.x+180,b.y+220,{steps:8});await writer.mouse.up();await writer.getByText('已自动保存',{exact:true}).waitFor();}
  try{
    await launch();await page.locator('[data-mode="reading"]').click();await page.locator('#import-pdf').waitFor();const doc=await importFile(pdf);await open(doc.id);
    await writer.waitForFunction(()=>cache.has(0));assert.equal(await writer.evaluate(()=>readerPages),2);assert.equal(await app.evaluate(()=>globalThis.external),0);await writer.locator('#back-course').click();
    const textDoc=await importFile(text);await open(textDoc.id);assert.equal(await writer.evaluate(()=>readerPages),3);assert.equal(await writer.locator('script:not([src])').count(),0);await ink();await writer.locator('#back-course').click();
    const imageFile=path.join(data,'image.png');const bitmap=await app.evaluate(({nativeImage})=>nativeImage.createFromBitmap(Buffer.alloc(400*400*4,150),{width:400,height:400}).toDataURL());fs.writeFileSync(imageFile,Buffer.from(bitmap.split(',')[1],'base64'));
    const imageDoc=await importFile(imageFile);await open(imageDoc.id);assert.equal(await writer.evaluate(()=>readerPages),1);await ink();await writer.locator('#back-course').click();
    const invalid=path.join(data,'broken.pdf');fs.writeFileSync(invalid,'broken');const bad=await importFile(invalid);await page.evaluate(id=>window.study.startSession('document:'+id,'reading'),bad.id);writer=app.windows().find(p=>p.url().endsWith('/writer.html'));await writer.locator('#save-status').filter({hasText:'载入失败'}).waitFor();await writer.locator('#back-course').click();
    assert.deepEqual(errors,[]);console.log('Reader passed: internal PDF, text/image import and continuous annotation; damaged-file recovery; no external viewer.');
  }finally{if(app)await app.close().catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
