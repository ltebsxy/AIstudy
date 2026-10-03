import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('../../source/node_modules/playwright-core');
function pdf(){
 const stream='BT /F1 24 Tf 40 740 Td (Learning with artificial intelligence) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let output='%PDF-1.4\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(output.length);output+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=output.length;output+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return output;
}
const browser=await chromium.launch({executablePath:process.env.STUDY_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);const output=path.resolve('android/build/verification');await mkdir(output,{recursive:true});
try{
 await page.goto('http://127.0.0.1:4186');await page.locator('#library').waitFor();
 await page.evaluate(()=>{window.toastHistory=[];new MutationObserver(()=>window.toastHistory.push(document.getElementById('toast').textContent)).observe(document.getElementById('toast'),{childList:true});});
 await writeFile(path.join(output,'text-layer.pdf'),pdf());const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import-file').click()]);await chooser.setFiles(path.join(output,'text-layer.pdf'));await page.locator('.item .open').filter({hasText:'text-layer.pdf'}).click();await page.locator('.textLayer span').filter({hasText:'Learning'}).waitFor();
 await page.locator('#english').click();await page.locator('#settings').click();await page.locator('#theme').selectOption('dark');await page.locator('#settings-dialog button[value=close]').click();
 const span=page.locator('.textLayer span').filter({hasText:'Learning'}),r=await span.boundingBox();assert(r.width>100&&r.height>10);
 const point=await span.evaluate(el=>{const range=document.createRange();range.setStart(el.firstChild,0);range.setEnd(el.firstChild,8);const r=range.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await page.touchscreen.tap(point.x,point.y);await page.waitForTimeout(70);await page.touchscreen.tap(point.x,point.y);await page.locator('#translation').getByText('ECDICT · MIT · 离线').waitFor();assert.equal(await page.locator('#translation h3').innerText(),'learning');await page.screenshot({path:path.join(output,'pdf-dark-double-tap.png')});
 await page.locator('#back').click();page.once('dialog',d=>d.accept('向上扩展'));await page.locator('#new-note').click();await page.locator('#reader').waitFor();await page.locator('button[data-tool=pen]').click();const view=await page.locator('#viewport').boundingBox();
 await page.mouse.move(100,view.y+35);await page.mouse.down();await page.mouse.move(200,view.y+55,{steps:8});await page.mouse.up();await page.evaluate(()=>window.flushStudy());
 const saved=await page.evaluate(async()=>{const {rpc}=await import('./bridge.mjs');const state=await rpc('load');return rpc('note',{id:'doc-'+state.lastOpen.id});});assert(saved.canvas.minY<0);assert(saved.canvas.scroll>view.height*.9);assert(Math.abs(saved.canvas.strokes[0].points[0].y-35)<3);assert(Math.abs(saved.canvas.strokes[0].points.at(-1).y-55)<3);
 const height=await page.locator('#paper').evaluate(el=>el.offsetHeight);await page.locator('button[data-tool=hand]').click();await page.locator('#scroll').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(100);assert.equal(await page.locator('#paper').evaluate(el=>el.offsetHeight),height);await page.locator('button[data-tool=eraser]').click();await page.mouse.move(100,view.y+20);await page.mouse.down();await page.mouse.up();assert.equal(await page.locator('#paper').evaluate(el=>el.offsetHeight),height);
 assert.deepEqual(errors,[]);console.log('PASS: text-layer PDF double tap in dark theme; upward world-coordinate/viewport compensation; scrolling and erasing do not extend.');
}catch(error){await page.screenshot({path:path.join(output,'reader-failure.png')});console.error((await page.locator('body').innerText()).slice(0,1500),errors,await page.evaluate(()=>window.toastHistory));throw error;}finally{await browser.close();}
