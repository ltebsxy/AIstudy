const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'study-course-'));
  const data = path.join(temp, 'data'); fs.mkdirSync(data);
  const file = path.join(temp, 'course.json');
  const rubric = { answer: 'PRIVATE_ANSWER', criteria: [{ points: 10, text: '正确条件' }] };
  fs.writeFileSync(file, JSON.stringify({ title: '导入验证', knowledgeFormat: 'sections', knowledge: '## 定义\n映射要求每个输入恰有一个输出。\n## 条件\nx ∈ (0, +∞)；<script>bad()</script>', questions: [{ id: 'q', text: '问题', grading: rubric }], workTarget: { type: 'app', appPath: 'C:\\untrusted.exe' } }));
  const app = await _electron.launch({ executablePath: process.env.STUDY_TEST_EXE || require('electron'), args: process.env.STUDY_TEST_EXE ? [] : [root], cwd: root, env: { ...process.env, STUDY_DATA_DIR: data } });
  try {
    await app.firstWindow();
    if (app.windows().length < 2) await app.waitForEvent('window');
    const titles = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
    const page = titles.find((item) => item.title === 'AI-StudyDesk').page;
    const overlay = titles.find((item) => item.title === '题目悬浮窗').page;
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.getByText('我的学习空间').waitFor();
    assert.equal(await page.locator('.course-card').count(),0);
    assert.equal(await page.locator('#import-first-section').count(),0);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await page.getByRole('button', { name: '导入课程文件' }).click();
    await page.locator('.course-card').filter({ hasText: '导入验证' }).waitFor();
    let list = await page.evaluate(() => window.study.listCourses());
    assert.equal(list.length, 1);
    assert(!JSON.stringify(list).includes('PRIVATE_ANSWER'));
    assert.deepEqual(list[0].workTarget, { type: 'default' });
    await page.getByRole('button', { name: '开始学习' }).click();
    await page.getByRole('heading', { name: '定义', exact: true }).waitFor();
    await page.getByRole('button', { name: '下一小节' }).click();
    await page.getByRole('heading', { name: '条件', exact: true }).waitFor();
    assert.equal(await page.locator('.reader-body script').count(), 0);
    await page.getByRole('button', { name: '返回课程列表' }).click();
    await page.getByTitle('编辑', { exact: true }).click();
    await page.locator('#course-description').fill('仅修改简介');
    await page.getByRole('button', { name: '保存课程' }).click();
    await page.getByText('我的学习空间').waitFor();
    let stored = JSON.parse(fs.readFileSync(path.join(data, 'courses.json')));
    assert.deepEqual(stored[0].questions[0].grading, rubric);
    await overlay.evaluate(() => { window.__receivedCourse = null; window.study.onCourse((course) => window.__receivedCourse = course); });
    await page.getByRole('button', { name: '开始学习' }).click();
    await page.getByRole('button', { name: '完成，开始做题' }).click();
    await overlay.getByText('问题', { exact: true }).waitFor();
    assert.equal(await overlay.evaluate(() => window.__receivedCourse.questions[0].grading), undefined);
    await overlay.getByRole('button', { name: '完成', exact: false }).click();
    // Changes to the saved course must not replace the exercise being submitted.
    await page.evaluate(async () => {
      const course = (await window.study.listCourses())[0];
      course.questions[0].text = '已在磁盘改动的题目';
      await window.study.saveCourse(course);
    });
    const answer = path.join(temp, 'answer.png');
    fs.writeFileSync(answer, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64'));
    await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.shift()] }); }, [answer, temp]);
    await page.getByRole('button', { name: '选择 PDF 或图片' }).click();
    await page.getByRole('button', { name: '生成批改包' }).click();
    await page.getByText('批改包已生成').waitFor();
    const output = fs.readdirSync(temp).find((name) => name.includes('-提交-'));
    const html = fs.readFileSync(path.join(temp, output, '批改材料.html'), 'utf8');
    assert(html.includes('PRIVATE_ANSWER'));
    assert(!html.includes('已在磁盘改动的题目'));
    await page.locator('#nav-home').click();
    await page.getByTitle('编辑', { exact: true }).click();
    await page.locator('.question-text').fill('新问题');
    await page.getByRole('button', { name: '保存课程' }).click();
    await page.getByText('我的学习空间').waitFor();
    stored = JSON.parse(fs.readFileSync(path.join(data, 'courses.json')));
    assert.equal(stored[0].questions[0].grading, undefined);
    // A new install contains no bundled course or import shortcut. Existing records stay editable.
    assert.equal(await page.locator('#import-first-section').count(),0);
    assert.equal(await page.evaluate(()=>typeof window.study.importFirstSection),'undefined');
    list=await page.evaluate(()=>window.study.listCourses());
    assert.equal(list.length,1);assert.equal(list[0].questions[0].text,'新问题');
    await page.getByRole('button',{name:'开始学习'}).click();
    await page.locator('#lesson-sections').selectOption('1');
    await page.getByRole('button',{name:'返回课程列表'}).click();
    await page.getByRole('button',{name:'开始学习'}).click();
    assert.equal(await page.locator('#lesson-sections').inputValue(),'1');
    assert.deepEqual(errors, []);
    console.log('Course integration passed: empty install, user import, section progress, isolated grading and preserved personal records.');
  } finally { await app.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
