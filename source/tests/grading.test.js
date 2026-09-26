const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { prepareGrading } = require('../lib/grading');
const course = { title: '测试', knowledge: '加法', questions: [{ text: '计算', image: 'data:image/png;base64,YWJj' }] };

test('grading package retains the rubric while using the requested concise prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grading-rubric-'));
  const grading = { answer: '解答', criteria: [{ points: 7, text: '第一步' }, { points: 3, text: '结论' }] };
  const prepared = prepareGrading({ root, course: { ...course, questions: [{ text: '题目', grading }] }, answerInput: { kind: 'screenshot' }, screenshot: Buffer.from('answer') });
  const manifest = JSON.parse(fs.readFileSync(path.join(prepared.folder, '批改材料.json')));
  assert.deepEqual(manifest.questions[0].grading, grading);
  assert.match(prepared.prompt, /^题目评分，指出问题，语言精简。/);
  assert(prepared.prompt.length < 300);
});

test('grading snapshots screenshot, question images and full text; retries reuse the same prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grading-unit-'));
  const input = { root, course, answerInput: { kind: 'screenshot' }, screenshot: Buffer.from('screenshot') };
  const first = prepareGrading(input), second = prepareGrading(input);
  assert.equal(first.prompt, second.prompt);
  const manifest = JSON.parse(fs.readFileSync(path.join(first.folder, '批改材料.json')));
  assert.equal(manifest.questions[0].text, '计算');
  assert.equal(fs.readFileSync(path.join(first.folder, manifest.answerFile)).toString(), 'screenshot');
  assert.equal(fs.readFileSync(path.join(first.folder, manifest.questions[0].imageFile)).toString(), 'abc');
  assert.match(first.prompt, /批改材料.json/);
});

test('grading copies PDFs and rejects unsupported or missing answers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grading-pdf-'));
  const file = path.join(root, 'answer.pdf');
  fs.writeFileSync(file, '%PDF-1.4 test');
  const prepared = prepareGrading({ root, course, answerInput: file });
  assert.equal(fs.readFileSync(path.join(prepared.folder, '作答.pdf')).toString(), '%PDF-1.4 test');
  assert.throws(() => prepareGrading({ root, course, answerInput: { kind: 'screenshot' } }), /截图已失效/);
  const bad = path.join(root, 'answer.exe'); fs.writeFileSync(bad, 'bad');
  assert.throws(() => prepareGrading({ root, course, answerInput: bad }), /支持 PDF/);
});
