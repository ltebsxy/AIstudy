const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright-core'),{pdfFixture}=require('./reading-fixtures');
async function main(){
  const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-english-reading-'));
  const pdf=path.join(data,'article.pdf'),text=path.join(data,'article.txt');
  fs.writeFileSync(pdf,pdfFixture(1));fs.writeFileSync(text,'Hello, readers! We enjoy reading books.\nIn order to learn we read.\nBright curious learners study every day.');
  let app,page,writer;const errors=[];
  async function openFile(file){
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.evaluate(()=>window.study.importPDF({}));
    const doc=await page.evaluate(async()=>(await window.study.library()).documents.at(-1));
    await page.evaluate(id=>window.study.startSession('document:'+id,'reading'),doc.id);
    writer=app.windows().find(window=>window.url().endsWith('/writer.html'));
    writer.on('pageerror',error=>errors.push(error.message));
    await writer.waitForFunction(id=>ready&&cache.has(0)&&course.id==='document:'+id,doc.id);return doc;
  }
  async function english(){
    await writer.locator('#view-settings-toggle').click();await writer.locator('#reading-mode').selectOption('english');
    await writer.locator('#view-settings-toggle').click();assert.equal(await writer.evaluate(()=>tool),'hand');
  }
  async function wordPoint(word){
    return writer.evaluate(async word=>{
      const items=await StudyReader.words(0),item=items.find(item=>item.word.toLowerCase()===word);
      if(!item)throw new Error('Missing word: '+word);
      const along=(item.start+item.end)/2,down=item.top+item.height/2;
      const rect=StudyBoard.rect(board.file,0),scale=board.file.width/1000;
      return {x:rect.x+(item.x+Math.cos(item.angle)*along-Math.sin(item.angle)*down)*scale-board.viewport.x,
        y:rect.y+(item.y+Math.sin(item.angle)*along+Math.cos(item.angle)*down)*scale-board.viewport.y};
    },word);
  }
  async function clickWord(word){
    await writer.evaluate(()=>EnglishReader.close());
    const point=await wordPoint(word);
    await writer.mouse.click(point.x,point.y);await writer.locator('#word-popup').waitFor({state:'visible'});
    await writer.waitForFunction(word=>document.querySelector('#word-title').textContent.toLowerCase()===word&&document.querySelector('#word-definitions li')!==null,word);
    return point;
  }
  async function selectPhrase(first,last,title){
    const start=await wordPoint(first),end=await wordPoint(last),view=await writer.evaluate(()=>({...board.viewport}));
    await writer.mouse.move(start.x,start.y);await writer.mouse.down();await writer.mouse.move(end.x,end.y,{steps:6});await writer.mouse.up();
    try{await writer.waitForFunction(title=>document.querySelector('#word-title').textContent===title&&document.querySelector('#word-definitions li'),title,{timeout:10000});}
    catch(error){console.log(await writer.evaluate(()=>({title:document.querySelector('#word-title').textContent,status:document.querySelector('#word-status').textContent,hidden:document.querySelector('#word-popup').hidden,selected:textSelection,mode:legacy.readingMode,view:board.viewport})));throw error;}
    assert.deepEqual(await writer.evaluate(()=>board.viewport),view,'selection does not pan');
    assert.equal(await writer.evaluate(()=>board.strokes.length),0,'selection does not save ink');
    assert(await writer.evaluate(()=>textSelection.items.length>1));
  }
  try{
    app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env:{...process.env,STUDY_DATA_DIR:data}});
    await app.firstWindow();page=app.windows().find(window=>window.url().endsWith('/index.html'));
    await page.getByText('我的学习空间',{exact:true}).waitFor();
    await app.evaluate(()=>{globalThis.wordNetworkCalls=0;globalThis.fetch=()=>{globalThis.wordNetworkCalls++;throw new Error('Network disabled during offline dictionary check');};});
    await openFile(pdf);await english();
    const count=await writer.evaluate(()=>board.strokes.length);
    const pdfPoint=await clickWord('reading');assert.equal(await writer.locator('#word-title').textContent(),'Reading');
    assert.equal(await writer.evaluate(()=>board.strokes.length),count,'word clicks do not draw ink');
    const box=await writer.locator('#word-popup').boundingBox();const viewport=await writer.evaluate(()=>({width:innerWidth,height:innerHeight}));
    assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);
    await writer.keyboard.press('Escape');await writer.locator('#word-popup').waitFor({state:'hidden'});
    await selectPhrase('write','your','Write your');await writer.keyboard.press('Escape');
    await writer.locator('#view-settings-toggle').click();await writer.locator('#file-width').fill('900');await writer.locator('#file-left').fill('80');await writer.locator('#view-settings-toggle').click();
    await clickWord('reading');await writer.mouse.wheel(0,80);await writer.locator('#word-popup').waitFor({state:'hidden'});
    await writer.locator('#back-course').click();
    const doc=await openFile(text);await english();await clickWord('hello');
    assert.match(await writer.locator('#word-definitions').textContent(),/喂|你好/);
    await writer.mouse.click(700,250);await writer.locator('#word-popup').waitFor({state:'hidden'});
    await selectPhrase('in','to','In order to');assert.match(await writer.locator('#word-definitions').textContent(),/为了/);
    await writer.keyboard.press('Escape');assert.equal(await writer.evaluate(()=>textSelection),null);
    await selectPhrase('learners','bright','Bright curious learners');assert.match(await writer.locator('#word-status').textContent(),/分段释义/);
    await writer.locator('#word-close').click();await writer.mouse.move(650,250);await writer.mouse.down();await writer.mouse.move(650,180,{steps:5});await writer.mouse.up();
    assert(await writer.locator('#word-popup').isHidden(),'blank-area dragging does not open a definition');
    await writer.locator('#pen').click();await writer.mouse.move(650,250);await writer.mouse.down();await writer.mouse.move(690,280,{steps:4});await writer.mouse.up();
    assert.equal(await writer.evaluate(()=>board.strokes.length),1,'annotations remain available');
    await writer.locator('#back-course').click();
    await page.evaluate(id=>window.study.startSession('document:'+id,'reading'),doc.id);
    writer=app.windows().find(window=>window.url().endsWith('/writer.html'));
    await writer.waitForFunction(()=>ready&&legacy.readingMode==='english');assert.equal(await writer.evaluate(()=>tool),'hand');
    assert.equal(await app.evaluate(()=>globalThis.wordNetworkCalls),0);assert.deepEqual(errors,[]);
    console.log('English reading passed: offline PDF/TXT lookup, phrase selection/fallback, scaled coordinates, dismissal, drag/ink separation and saved mode.');
  }catch(error){if(writer)await writer.screenshot({path:path.join(root,'.tmp','english-reading-check.png')}).catch(()=>{});throw error;}
  finally{if(app)await app.close().catch(()=>{});fs.rmSync(data,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
