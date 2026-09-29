const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  let app;
  try {
    app = await _electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env: { ...process.env, STUDY_DATA_DIR: data } });
    await app.firstWindow();
    if (app.windows().length < 2) await app.waitForEvent('window');
    const page = await Promise.all(app.windows().map(async window => ({ window, title: await window.title() })))
      .then(items => items.find(item => item.title === 'AI-StudyDesk')?.window);
    assert.ok(page, 'main window is available');
    await page.getByText('我的学习空间', { exact: true }).waitFor();
    await app.evaluate(({ shell }) => { shell.openPath = async folder => { globalThis.testProgrammingFolder = folder; return ''; }; });
    await page.locator('.open').click();
    const popupPromise = app.waitForEvent('window');
    await page.locator('#finish-lesson').click();
    const popup = await popupPromise;
    await popup.locator('#ball').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#programming-content').count(), 0, 'no in-app code editor');
    const folder = path.join(data, 'programming-workspaces', course.id);
    assert.equal(await app.evaluate(() => globalThis.testProgrammingFolder), folder);
    const file = path.join(folder, 'src', 'task.py');
    fs.writeFileSync(file, '# 题目：返回 42\n\ndef answer():\n    return 42\n');
    await popup.locator('#ball').click();
    await popup.locator('#submit').click();
    await page.getByText(`确认提交 · ${course.title}`).waitFor();
    assert.match(await page.locator('.programming-submission pre').textContent(), /return 42/);
    await page.locator('#programming-confirm').click();
    await page.getByText('已保存提交快照').waitFor();
    const submissions = fs.readdirSync(path.join(data, 'programming-submissions'));
    assert.equal(submissions.length, 1);
    assert.match(fs.readFileSync(path.join(data, 'programming-submissions', submissions[0], 'src', 'task.py'), 'utf8'), /return 42/);
    await page.locator('#programming-done').click();
    await popup.locator('#ball').waitFor({ state: 'visible' });
    console.log('External programming flow passed: opens workspace folder, hides in-app editor, previews edited files and saves submission.');
  } finally {
    if (app) await app.close().catch(() => {});
    fs.rmSync(data, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
