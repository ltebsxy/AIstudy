// A focused regression for background saves during a pending SAF-style import.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('../../source/node_modules/playwright-core');
const browser=await chromium.launch({executablePath:process.env.STUDY_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:4186');await page.locator('#library').waitFor();const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import-folder').click()]);
 const locked=await page.locator('#library').evaluate(el=>el.inert);assert(locked);assert(await page.locator('#settings').isDisabled());
 const guarded=await page.evaluate(async()=>{const {rpc}=await import('./bridge.mjs');const state=await rpc('load');state.importCommitSentinel=true;await rpc('save',state);await window.flushStudy();return (await rpc('load')).importCommitSentinel;});assert.equal(guarded,true);void chooser;
 console.log('PASS: pending import locks editing and background flush cannot overwrite an import manifest.');
}finally{await browser.close();}
