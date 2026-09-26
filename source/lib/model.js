const crypto = require('node:crypto');
const math = require('../renderer/math');

function cleanText(value, max = 20000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanImage(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 12_000_000 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new Error('图片格式不支持，或文件太大（上限约 8 MB）。');
  }
  return value;
}

function normalizeWorkTarget(input) {
  const raw = input?.workTarget && typeof input.workTarget === 'object'
    ? input.workTarget
    : { type: 'file', filePath: input?.workFile || '' };
  const type = ['file', 'onenote', 'app'].includes(raw.type) ? raw.type : 'file';
  if (type === 'onenote') {
    const url = cleanText(raw.url, 4000);
    if (url && !/^onenote:https:\/\/[^\s]+$/i.test(url)) {
      throw new Error('请粘贴以 onenote:https:// 开头的 OneNote 页面链接。');
    }
    return { type, url };
  }
  if (type === 'app') {
    const appPath = cleanText(raw.appPath, 2000);
    const filePath = cleanText(raw.filePath, 2000);
    if (appPath && !/\.exe$/i.test(appPath)) throw new Error('请选择 Windows 程序（.exe）。');
    return { type, appPath, filePath };
  }
  return { type: 'file', filePath: cleanText(raw.filePath, 2000) };
}

function normalizeCourse(input, existingId) {
  if (!input || typeof input !== 'object') throw new Error('课程数据无效。');
  const title = cleanText(input.title, 80);
  const knowledge = cleanText(input.knowledge, 50000);
  if (!title) throw new Error('请填写课程名称。');
  if (!knowledge) throw new Error('请填写知识点介绍。');
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  const questions = rawQuestions.map((question) => ({
    id: typeof question?.id === 'string' && question.id ? question.id : crypto.randomUUID(),
    text: cleanText(question?.text, 10000),
    image: cleanImage(question?.image),
    ...(question?.grading ? { grading: normalizeGrading(question.grading) } : {}),
  })).filter((question) => question.text || question.image);
  if (!questions.length) throw new Error('请至少添加一道题目。');
  return {
    id: existingId || crypto.randomUUID(),
    title,
    description: cleanText(input.description, 240),
    knowledge,
    ...(input.knowledgeFormat === 'sections' ? { knowledgeFormat: 'sections' } : {}),
    questions,
    workTarget: normalizeWorkTarget(input),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeGrading(raw) {
  const answer = cleanText(raw.answer, 15000);
  const criteria = Array.isArray(raw.criteria) ? raw.criteria.map((item) => ({
    points: Number(item.points), text: cleanText(item.text, 2000),
  })) : [];
  if (!answer || !criteria.length || criteria.some((item) => !item.text || !Number.isFinite(item.points) || item.points <= 0)) {
    throw new Error('批改参考必须包含解答和有效的评分项。');
  }
  return { answer, criteria };
}

// References stay in the main process until a submission is prepared.
function learnerCourse(course) {
  return { ...course, questions: course.questions.map(({ grading, ...question }) => question) };
}

function preserveGrading(raw, existing) {
  return { ...raw, questions: (raw.questions || []).map((question) => {
    const old = existing?.questions.find((item) => item.id === question.id);
    const { grading, ...clean } = question;
    return old?.grading && old.text === cleanText(question.text, 10000) && (old.image || '') === (question.image || '')
      ? { ...clean, grading: old.grading } : clean;
  }) };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderSubmission(course, submittedAt, answerFileName, answers = []) {
  const questionHtml = course.questions.map((question, index) => {
    const image = question.image ? `<img src="${question.image}" alt="第 ${index + 1} 题图片">` : '';
    const reference = question.grading ? `<details><summary>批改参考与评分依据（${question.grading.criteria.reduce((sum, item) => sum + item.points, 0)} 分）</summary><p>${math.html(question.grading.answer)}</p><ul>${question.grading.criteria.map((item) => `<li>${item.points} 分：${math.html(item.text)}</li>`).join('')}</ul><p>等价解法同样给分；按步骤给分，同一错误不重复扣分。无法辨认的作答标为待确认。</p></details>` : '';
    const captured = answers.find(item => item.number === index + 1 && item.questionId === question.id);
    const answerHtml = captured ? `<h3>第 ${index + 1} 题作答</h3><a href="${encodeURIComponent(captured.fileName)}"><img src="${encodeURIComponent(captured.fileName)}" alt="第 ${index + 1} 题作答截图"></a>` : !answerFileName ? '<p>本题未附截图。</p>' : '';
    return `<section class="question"><h2>第 ${index + 1} 题</h2><p>${math.html(question.text)}</p>${image}${answerHtml}${reference}</section>`;
  }).join('\n');
  const answer = answerFileName
    ? `<p><a href="${encodeURIComponent(answerFileName)}">打开作答文件：${escapeHtml(answerFileName)}</a></p>`
    : answers.length ? `<p>已按题号附上 ${answers.length} 张截图。</p>` : '<p>未附作答文件。</p>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(course.title)} · 批改材料</title><link rel="stylesheet" href="math/katex.min.css"><link rel="stylesheet" href="math/math.css"><style>body{max-width:860px;margin:48px auto;padding:0 28px;font:16px/1.7 system-ui,sans-serif;color:#233047}h1{font-size:30px}small{color:#66758b}.question{border-top:1px solid #dce2e9;padding:16px 0 24px}.question h2{font-size:17px}.question img{max-width:100%;max-height:480px;border-radius:12px}a{color:#2463a8}</style></head><body><h1>${escapeHtml(course.title)}</h1><small>提交时间：${escapeHtml(submittedAt)}　｜　状态：待老师批改　｜　共 ${course.questions.length} 题</small><h2>作答文件</h2>${answer}<h2>题目</h2>${questionHtml}</body></html>`;
}

module.exports = { normalizeCourse, normalizeWorkTarget, renderSubmission, escapeHtml, learnerCourse, preserveGrading };
