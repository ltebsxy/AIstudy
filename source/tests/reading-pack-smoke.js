const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{_electron}=require('playwright-core');
async function main(){
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'study-reading-folder-ui-')),input=path.join(temp,'pack'),data=path.join(temp,'data');let app;
  fs.mkdirSync(path.join(input,'articles'),{recursive:true});fs.mkdirSync(path.join(input,'materials'));
  fs.writeFileSync(path.join(input,'articles','01.txt'),'Learning with AI\n\nIn order to learn, ask clear questions.');
  fs.writeFileSync(path.join(input,'materials','answers.md'),'An answer kept separate.');
  fs.writeFileSync(path.join(input,'reading-pack.json'),JSON.stringify({version:1,title:'AI Reading',readingMode:'english',documents:[{file:'articles/01.txt',name:'01 · Learning with AI'}]}));
  try{
    app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});await app.firstWindow();
    const page=app.windows().find(page=>page.url().endsWith('/index.html'));page.setDefaultTimeout(10000);
    await page.getByText('我的学习空间',{exact:true}).waitFor();await page.locator('[data-mode="reading"]').click();
    await app.evaluate(({dialog},input)=>{dialog.showOpenDialog=async(_window,options)=>{if(!options.properties.includes('openDirectory'))throw Error('Folder dialog expected');return {canceled:false,filePaths:[input]};};},input);
    await page.locator('#import-reading-folder').click();await page.getByText('已导入 1 个文件。',{exact:true}).waitFor();
    await page.locator('[data-folder]').click();await page.getByText('01 · Learning with AI',{exact:true}).waitFor();assert(!(await page.getByText('answers.md',{exact:true}).count()));
    const opened=app.waitForEvent('window',{timeout:10000});await page.locator('.read-document').click();const writer=await opened;await writer.waitForURL('**/writer.html');await writer.waitForFunction(()=>ready&&legacy.readingMode==='english',null,{timeout:10000});
    assert.equal(await writer.evaluate(()=>tool),'hand');assert.equal(await writer.evaluate(()=>board.strokes.length),0);
    console.log('Reading-folder UI passed: folder picker, manifest, hierarchy, article-only import and first-open English mode.');
  }finally{if(app)await app.close().catch(()=>{});fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
