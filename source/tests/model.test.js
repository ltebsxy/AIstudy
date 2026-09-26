const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCourse, normalizeWorkTarget, renderSubmission } = require('../lib/model');
const { learnerCourse, preserveGrading } = require('../lib/model');

test('learning data excludes references; edits keep only unchanged question references', () => {
  const original = normalizeCourse({ title: '函数', knowledge: '## 定义\n内容', knowledgeFormat: 'sections', questions: [{ id: 'q1', text: '求定义域', grading: { answer: 'x > 0', criteria: [{ points: 5, text: '条件正确' }] } }] });
  const publicCourse = learnerCourse(original);
  assert.equal(publicCourse.knowledgeFormat, 'sections');
  assert.equal(publicCourse.questions[0].grading, undefined);
  assert.equal(original.questions[0].grading.answer, 'x > 0');
  assert.deepEqual(preserveGrading(publicCourse, original).questions[0].grading, original.questions[0].grading);
  publicCourse.questions[0].text = '求值域';
  publicCourse.questions[0].grading = { answer: 'injected' };
  assert.equal(preserveGrading(publicCourse, original).questions[0].grading, undefined);
  assert.equal(preserveGrading(publicCourse).questions[0].grading, undefined);
  assert.match(renderSubmission(original, '今天', 'answer.pdf'), /批改参考与评分依据（5 分）/);
  assert.throws(() => normalizeCourse({ ...original, questions: [{ text: 'test', grading: { answer: 'a', criteria: [{ points: -1, text: 'bad' }] } }] }), /评分项/);
});

test('requires title, knowledge and at least one question', () => {
  assert.throws(() => normalizeCourse({ title: '', knowledge: '内容', questions: [{ text: '题目' }] }), /名称/);
  assert.throws(() => normalizeCourse({ title: '课程', knowledge: '', questions: [{ text: '题目' }] }), /知识点/);
  assert.throws(() => normalizeCourse({ title: '课程', knowledge: '内容', questions: [] }), /题目/);
});

test('submission escapes user text and contains answer reference', () => {
  const course = normalizeCourse({ title: '<课程>', knowledge: '知识', questions: [{ text: '<script>alert(1)</script>' }] });
  const html = renderSubmission(course, '2026-09-26', '作答文件.pdf');
  assert.match(html, /&lt;课程&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /作答文件\.pdf/);
});

test('rejects non-image data URLs', () => {
  assert.throws(() => normalizeCourse({ title: '课程', knowledge: '知识', questions: [{ image: 'data:text/html;base64,QQ==' }] }), /图片格式/);
});

test('keeps existing file settings and accepts OneNote client links', () => {
  assert.deepEqual(normalizeWorkTarget({ workFile: 'C:\\work.pdf' }), { type: 'file', filePath: 'C:\\work.pdf' });
  assert.deepEqual(normalizeWorkTarget({ workTarget: { type: 'onenote', url: 'onenote:https://example.com/page' } }), { type: 'onenote', url: 'onenote:https://example.com/page' });
  assert.throws(() => normalizeWorkTarget({ workTarget: { type: 'onenote', url: 'javascript:alert(1)' } }), /OneNote 页面链接/);
});
