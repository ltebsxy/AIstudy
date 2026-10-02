// SPDX-License-Identifier: GPL-3.0-only
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron}=require('playwright-core');
async function main(){
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-theme-'));
  const file=path.join(data,'reading.txt');fs.writeFileSync(file,'Reading with AI. A clear question can help us learn.');
  let app,page,writer;const errors=[];
  async function launch(){
    app=await _electron.launch({executablePath:process.env.STUDY_TEST_EXE||require('electron'),args:process.env.STUDY_TEST_EXE?[]:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
    await app.firstWindow();page=app.windows().find(win=>win.url().endsWith('/index.html'));
    page.on('pageerror',error=>errors.push(error.message));
    await page.getByText('我的学习空间',{exact:true}).waitFor();
  }
  async function theme(mode){
    await page.evaluate(mode=>window.study.saveTheme(mode),mode);
    await page.waitForFunction(mode=>StudyTheme.state.mode===mode,mode);
  }
  try{
    await launch();await theme('light');
    await page.locator('#nav-settings').click();await page.locator('[data-settings-tab=appearance]').click();
    const tabs=await page.locator('.settings-tabs').elementHandle();
    await page.getByLabel('夜间模式',{exact:true}).check();
    await page.waitForFunction(()=>StudyTheme.dark);
    assert(await tabs.evaluate(node=>node.isConnected),'setting tabs remain mounted');
    assert.equal(await page.locator('.editor-card').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(34, 39, 37)');
    fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});
    await page.screenshot({path:path.join(root,'.tmp','night-settings.png')});
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.evaluate(()=>window.study.importPDF({}));
    const doc=await page.evaluate(async()=>(await window.study.library()).documents[0]);
    await page.evaluate(id=>window.study.startSession('document:'+id,'reading'),doc.id);
    writer=app.windows().find(win=>win.url().endsWith('/writer.html'));writer.on('pageerror',error=>errors.push(error.message));
    await writer.waitForFunction(()=>ready&&cache.has(0)&&StudyTheme.dark);
    assert.equal(await writer.evaluate(()=>getComputedStyle(document.querySelector('#paper-area')).backgroundColor),'rgb(27, 31, 29)');
    const before=await writer.evaluate(()=>JSON.stringify(board));
    assert.equal(await writer.evaluate(()=>visibleInk('#253445')),'#e2e7e4');
    assert.equal(await writer.evaluate(()=>visibleInk('#d64e54')),'#d64e54');
    await writer.locator('#toggle-ai').click();
    const chat=writer.frameLocator('#writer-ai-frame');
    await chat.locator('html[data-theme=dark]').waitFor();
    assert.equal(await chat.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(34, 39, 37)');
    await writer.screenshot({path:path.join(root,'.tmp','night-reading.png')});
    const pixel=await writer.evaluate(()=>[...bg.getImageData(0,0,1,1).data]);
    assert(pixel[0]<50&&pixel[1]<50&&pixel[2]<50,'canvas is actually drawn dark');
    await theme('light');await writer.waitForFunction(()=>!StudyTheme.dark);
    await chat.locator('html[data-theme=light]').waitFor();
    assert.equal(await writer.evaluate(()=>visibleInk('#253445')),'#253445');
    assert.equal(await writer.evaluate(()=>JSON.stringify(board)),before,'theme does not alter saved ink, positions or layout');
    await theme('system');
    const nativeDark=await app.evaluate(({nativeTheme})=>nativeTheme.shouldUseDarkColors);
    assert.equal(await page.evaluate(()=>StudyTheme.dark),nativeDark);
    await theme('dark');
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,'preferences.json'),'utf8')).theme,'dark');
    await app.close();app=null;await launch();
    assert.equal(await page.evaluate(()=>StudyTheme.state.mode),'dark');assert(await page.evaluate(()=>StudyTheme.dark));
    assert.deepEqual(errors,[]);
    console.log('Night mode passed: settings, live canvas/embedded chat sync, system theme and restart persistence.');
  }finally{
    if(app)await app.close().catch(()=>{});
    if(path.dirname(data)===os.tmpdir()&&path.basename(data).startsWith('study-theme-'))fs.rmSync(data,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
