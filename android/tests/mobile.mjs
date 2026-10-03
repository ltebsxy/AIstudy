import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('../../source/node_modules/playwright-core');
const build=path.resolve('android/build/verification');await mkdir(build,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.STUDY_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(10000);
try{
  await page.goto('http://127.0.0.1:4186');await page.locator('#library').waitFor({state:'visible'});
  // Real pack directory: material/answer files must never become reading entries.
  await page.locator('#import-folder').click();await page.waitForFunction(()=>document.getElementById('preview-import').webkitdirectory);await page.locator('#preview-import').setInputFiles(path.resolve('source/output/courses/ai-3500-reading'));
  await page.getByRole('button',{name:/AI 主题|ai-3500-reading/}).first().waitFor();
  const root=page.locator('.item .open').first();await root.click();await page.locator('.item .open').first().click();await page.locator('.item .open').first().click();
  await page.locator('#reader').waitFor({state:'visible'});await page.locator('#english.active').waitFor();
  const word=page.locator('.word').filter({hasText:/^learning$/i}).first();await word.scrollIntoViewIfNeeded();const r=await word.boundingBox();
  await page.evaluate(()=>{window.tapEvents=[];for(const event of ['pointerdown','pointerup','pointercancel'])document.addEventListener(event,e=>window.tapEvents.push({event,x:e.clientX,y:e.clientY,time:performance.now(),button:e.button,target:e.target.className,text:e.target.textContent.slice(0,25)}),true);});
  await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);assert(await page.locator('#translation').isHidden());await page.waitForTimeout(70);
  await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);await page.locator('#translation').waitFor({state:'visible'});await page.locator('#translation').getByText('ECDICT · MIT · 离线').waitFor();assert.match(await page.locator('#translation').innerText(),/学习|学问|学识/);
  await page.screenshot({path:path.join(build,'english-double-tap.png')});
  await page.locator('button[data-tool=hand]').click();
  const phrase=await page.evaluate(()=>{const words=[...document.querySelectorAll('.word')],index=words.findIndex((w,i)=>i+2<words.length&&w.textContent==='in'&&words[i+1].textContent==='order'&&words[i+2].textContent==='to');const chosen=index>=0?words.slice(index,index+3):words.slice(6,8);const range=document.createRange();range.setStart(chosen[0].firstChild,0);range.setEnd(chosen.at(-1).firstChild,chosen.at(-1).textContent.length);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);chosen[0].scrollIntoView({block:'center'});const r=range.getBoundingClientRect();return {x:r.x+Math.min(r.width/2,50),y:r.y+r.height/2,text:range.toString()};});
  await page.waitForTimeout(120);await page.touchscreen.tap(phrase.x,phrase.y);await page.waitForTimeout(70);await page.touchscreen.tap(phrase.x,phrase.y);await page.locator('#translation').getByText('ECDICT · MIT · 离线').waitFor();assert.match(await page.locator('#translation h3').innerText(),/\s/);
  await page.locator('#scroll').evaluate(el=>el.scrollTop=450);await page.evaluate(()=>window.flushStudy());await page.reload();await page.waitForFunction(()=>document.getElementById('scroll').scrollTop>=440);
  await page.locator('#back').click();page.once('dialog',d=>d.accept('扩展验证'));await page.locator('#new-note').click();await page.locator('#reader').waitFor({state:'visible'});
  const initial=await page.locator('#paper').evaluate(el=>el.offsetHeight),viewport=await page.locator('#viewport').boundingBox();assert(initial<viewport.height+5);
  await page.locator('button[data-tool=pen]').click();
  const y=viewport.y+viewport.height*.88;await page.mouse.move(120,y);await page.mouse.down();await page.mouse.move(230,y+20,{steps:8});await page.mouse.up();
  assert((await page.locator('#paper').evaluate(el=>el.offsetHeight))>initial*1.8);assert((await page.locator('#scroll').evaluate(el=>el.scrollTop))<2);
  await page.evaluate(()=>window.flushStudy());await page.reload();await page.locator('#reader').waitFor({state:'visible'});assert((await page.locator('#paper').evaluate(el=>el.offsetHeight))>initial*1.8);
  const saved=await page.evaluate(async()=>{const {rpc}=await import('./bridge.mjs');const s=await rpc('load');const n=await rpc('note',{id:'doc-'+s.lastOpen.id});return n.canvas.strokes.length;});assert.equal(saved,1);
  await page.screenshot({path:path.join(build,'canvas-restored.png')});
  // One mixed ordinary course verifies answer persistence and reference visibility.
  await page.locator('#back').click();await page.locator('[data-mode=courses]').click();
  const fixture={title:'手机普通课程验证',knowledge:'## 定义\n函数 $f(x)=x^2$。',questions:[{text:'选择正数',type:'choice',options:['-1','2'],grading:{answer:'2',criteria:[{points:2,text:'选正数'}]}},{text:'填写结果 $x+1=3$',type:'blank',blanks:['x']},{text:'写出推导过程'}]};
  await writeFile(path.join(build,'course.json'),JSON.stringify(fixture));await page.locator('#import-file').click();await page.locator('#preview-import').setInputFiles(path.join(build,'course.json'));await page.locator('.item .open').filter({hasText:'手机普通课程验证'}).click();await page.locator('#next').click();await page.locator('input[value="1"]').check();await page.locator('#next').click();await page.locator('[data-blank="0"]').fill('2');await page.evaluate(()=>window.flushStudy());await page.reload();await page.locator('#reader').waitFor({state:'visible'});assert.equal(await page.locator('[data-blank="0"]').inputValue(),'2');await page.locator('#submit').click();await page.locator('#answer-dialog').waitFor({state:'visible'});assert.match(await page.locator('#answer-content').innerText(),/B\. 2/);await page.screenshot({path:path.join(build,'course-submission.png')});
  await page.setViewportSize({width:844,height:390});await page.locator('#answer-dialog [data-close]').click();assert((await page.locator('#viewport').boundingBox()).height>100);assert.deepEqual(errors,[]);
  console.log('PASS: actual 50-article folder pack; single/double word taps; selected phrase double tap; reading restart; writing-only canvas extension and restored strokes; ordinary answers/submission; landscape layout.');
}catch(error){await page.screenshot({path:path.join(build,'failure.png')});console.error('Page state:',(await page.locator('body').innerText()).slice(0,2000),'Errors:',errors,'Taps:',await page.evaluate(()=>window.tapEvents));throw error;}finally{await browser.close();}
