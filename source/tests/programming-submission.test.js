const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeCourse } = require('../lib/model');
const { ProgrammingWorkspaces } = require('../lib/programming-workspace');
const { ProgrammingSubmissions } = require('../lib/programming-submission');
const { expandedBounds } = require('../lib/floating-bounds');

test('grading and packaging use the submitted snapshot and retain the original exercise', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'programming-submission-'));
  try {
    const course = normalizeCourse({ title: '中文编程题', knowledge: '函数', kind: 'programming',
      programming: { files: [{ path: 'src/答案.py', content: '# 题目：返回 42\ndef answer(): pass\n' }] } });
    const workspaces = new ProgrammingWorkspaces(root), submissions = new ProgrammingSubmissions(root);
    workspaces.ensure(course);
    const original = workspaces.read(course.id, 'src/答案.py');
    const answer = workspaces.write(course.id, original.path, 'def answer(): return 42\n', original.hash);
    const saved = submissions.create(course, [answer, { path: 'submission.json', content: '{"answer":42}' }]);
    workspaces.write(course.id, answer.path, 'def answer(): return 999\n', answer.hash);
    const prompt = submissions.prompt(saved.submissionId);
    assert.match(prompt, /题目：返回 42/); assert.match(prompt, /return 42/); assert.doesNotMatch(prompt, /return 999/);
    assert.equal(submissions.read(saved.submissionId).files[1].content, '{"answer":42}', 'student metadata filename does not overwrite submission metadata');
    submissions.saveReport(saved.submissionId, '评分：正确');
    const archive = submissions.archive(saved.submissionId);
    for (const name of ['作答文件/src/答案.py', '课程原题/src/答案.py', '提交信息.json', 'AI批改结果.md']) assert(archive.includes(Buffer.from(name)));
    assert(!archive.includes(Buffer.from(root)), 'archive does not include local storage paths');
    fs.writeFileSync(path.join(saved.folder, 'files', 'src', '答案.py'), 'tampered');
    assert.throws(() => submissions.prompt(saved.submissionId), /快照已被修改/);
    assert.throws(() => submissions.archive(saved.submissionId), /快照已被修改/);
    assert.throws(() => submissions.read('../outside'), /提交记录无效/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('oversized grading input remains available for packaging without truncation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'programming-large-submission-'));
  try {
    const course = normalizeCourse({ title: '长文件', knowledge: '函数', kind: 'programming',
      programming: { files: [{ path: 'task.py', content: '# 题目\n' + 'x'.repeat(70000) }] } });
    const submissions = new ProgrammingSubmissions(root), saved = submissions.create(course, course.programming.files);
    assert.throws(() => submissions.prompt(saved.submissionId), /12 万字符/);
    assert(submissions.archive(saved.submissionId).length > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('expanded floating windows fit the selected monitor without changing the ball anchor', () => {
  const anchor = { x: 1880, y: 995 };
  assert.deepEqual(expandedBounds(anchor, { width: 420, height: 560 }, { x: 0, y: 0, width: 1920, height: 1040 }), { x: 1500, y: 480, width: 420, height: 560 });
  assert.deepEqual(anchor, { x: 1880, y: 995 });
  assert.deepEqual(expandedBounds({ x: -1950, y: -100 }, { width: 430, height: 560 }, { x: -1920, y: 0, width: 1920, height: 1040 }), { x: -1920, y: 0, width: 430, height: 560 });
  assert.deepEqual(expandedBounds(anchor, { width: 430, height: 560 }, { x: 0, y: 0, width: 320, height: 480 }), { x: 0, y: 0, width: 320, height: 480 });
});
