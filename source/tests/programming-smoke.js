const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { _electron } = require('playwright-core');
const { normalizeCourse } = require('../lib/model');

async function main() {
  const root = path.resolve(__dirname, '..');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'study-programming-external-'));
  const course = normalizeCourse({
    title: '外部编程练习', knowledge: '阅读注释并完成函数。', kind: 'programming', questions: [],
    programming: {
      files: [{ path: 'src/task.py', content: '# 题目：返回 42\n\ndef answer():\n    pass\n' }],
      entryFile: 'src/task.py',
      editorPath: path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'where.exe'),
    },
  });
  fs.writeFileSync(path.join(data, 'courses.json'), JSON.stringify([course]));
  const requests=[];
  let failNext=true;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push(JSON.parse(body));res.setHeader('Content-Type','application/json');
    if(failNext){failNext=false;res.writeHead(500);res.end('{}');return;}
    res.end(JSON.stringify({choices:[{message:{content:'## 批改结果\n函数正确，得分 10/10。\n```python\ndef answer():\n    return 42\n```'}}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    app = await _electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env: { ...process.env, STUDY_DATA_DIR: data } });
    await app.firstWindow();
    if (app.windows().length < 2) await app.waitForEvent('window');
    const page = await Promise.all(app.windows().map(async window => ({ window, title: await window.title() })))
      .then(items => items.find(item => item.title === 'AI-StudyDesk')?.window);
    assert.ok(page, 'main window is available');
    await page.getByText('我的学习空间', { exact: true }).waitFor();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const zipFile=path.join(data,'提交.zip');
    await app.evaluate(({ shell,dialog }, zipFile) => {
      shell.openPath = async folder => { globalThis.testProgrammingFolder = folder; return ''; };
      dialog.showSaveDialog=async()=>({canceled:false,filePath:zipFile});
    },zipFile);
    await page.evaluate(async base=>{
      const config=await window.study.getAISettings();
      await window.study.saveAISettings({...config,mode:'api',api:{...config.api,provider:'custom',baseUrl:base,model:'test-model',apiKey:'test-key'}});
    },base);
    await page.locator('.open').click();
    const popupPromise = app.waitForEvent('window');
    await page.locator('#finish-lesson').click();
    const popup = await popupPromise;
    await popup.locator('#ball').waitFor({ state: 'visible' });
    const ball=await app.evaluate(({BrowserWindow,screen})=>{
      const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('programming-chat.html'));
      const area=screen.getPrimaryDisplay().workArea;
      win.setPosition(area.x+area.width-70,area.y+area.height-70);
      return {bounds:win.getBounds(),area};
    });
    assert.equal(await page.locator('#programming-content').count(), 0, 'no in-app code editor');
    const folder = path.join(data, 'programming-workspaces', course.id);
    assert.equal(await app.evaluate(() => globalThis.testProgrammingFolder), folder);
    const file = path.join(folder, 'src', 'task.py');
    fs.writeFileSync(file, '# 题目：返回 42\n\ndef answer():\n    return 42\n');
    await popup.locator('#ball').click();
    await popup.locator('#submit').waitFor({state:'visible'});
    const expanded=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('programming-chat.html')).getBounds());
    assert(expanded.x>=ball.area.x&&expanded.y>=ball.area.y);
    assert(expanded.x+expanded.width<=ball.area.x+ball.area.width&&expanded.y+expanded.height<=ball.area.y+ball.area.height);
    await popup.locator('#collapse').click();
    await popup.locator('#ball').waitFor({state:'visible'});
    await popup.waitForFunction(()=>!document.body.classList.contains('expanded'));
    await page.waitForTimeout(160);
    const collapsed=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().includes('programming-chat.html')).getBounds());
    assert.deepEqual(collapsed,ball.bounds,'collapsing restores the original ball position');
    await popup.locator('#ball').click();
    await popup.locator('#submit').click();
    await page.getByText(`确认提交 · ${course.title}`).waitFor();
    assert.match(await page.locator('.programming-submission pre').textContent(), /return 42/);
    await page.locator('#programming-confirm').click();
    await page.getByText('已保存提交快照').waitFor();
    const submissions = fs.readdirSync(path.join(data, 'programming-submissions'));
    assert.equal(submissions.length, 1);
    const snapshotFolder=path.join(data,'programming-submissions',submissions[0]);
    assert.match(fs.readFileSync(path.join(snapshotFolder, 'files', 'src', 'task.py'), 'utf8'), /return 42/);
    fs.writeFileSync(file,'def answer():\n    return 999\n');
    await page.locator('#programming-grade').click();
    await page.locator('#programming-grade-status').filter({hasText:'HTTP 500'}).waitFor();
    await page.locator('#programming-grade:not(:disabled)').waitFor();
    await page.locator('#programming-grade').click();
    await page.locator('#programming-grade-status').filter({hasText:'批改结果已保存'}).waitFor();
    const material=requests.at(-1).messages.at(-1).content;
    assert.match(material,/题目：返回 42/);assert.match(material,/return 42/);assert.doesNotMatch(material,/return 999/);
    assert.equal(requests.at(-1).messages.length,2,'grading uses a separate request without chat history');
    assert.match(fs.readFileSync(path.join(snapshotFolder,'AI批改结果.md'),'utf8'),/10\/10/);
    assert.match(await page.locator('#programming-grade-report pre').textContent(),/return 42/);
    await page.locator('#programming-package').click();
    await page.locator('#programming-package-status').filter({hasText:'已打包'}).waitFor();
    // Read the ZIP through Windows' independent ZIP implementation, including Unicode names.
    const checked=spawnSync('pwsh',['-NoProfile','-Command',
      '$zip=[System.IO.Compression.ZipFile]::OpenRead($env:STUDY_TEST_ZIP); try { foreach($entry in $zip.Entries){$reader=[System.IO.StreamReader]::new($entry.Open());try { [pscustomobject]@{name=$entry.FullName;content=$reader.ReadToEnd()} | ConvertTo-Json -Compress } finally {$reader.Dispose()}} } finally {$zip.Dispose()}'],
      {env:{...process.env,STUDY_TEST_ZIP:zipFile},encoding:'utf8'});
    assert.equal(checked.status,0,checked.stderr);
    const entries=checked.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
    assert.match(entries.find(entry=>entry.name==='作答文件/src/task.py').content,/return 42/);
    assert.doesNotMatch(entries.find(entry=>entry.name==='作答文件/src/task.py').content,/return 999/);
    assert.match(entries.find(entry=>entry.name==='课程原题/src/task.py').content,/pass/);
    assert.match(entries.find(entry=>entry.name==='AI批改结果.md').content,/10\/10/);
    assert(!checked.stdout.includes('test-key'));
    await page.locator('#programming-done').click();
    await popup.locator('#ball').waitFor({ state: 'visible' });
    await popup.locator('#ball').click();
    await popup.locator('#submit:not(:disabled)').waitFor();
    assert.deepEqual(errors,[]);
    console.log('Programming submission passed: snapshot-based AI grading, failure/retry, valid Unicode ZIP with report, on-screen expansion and original ball position.');
  } finally {
    if (app) await app.close().catch(() => {});
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(data, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
