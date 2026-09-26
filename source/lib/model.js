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
    : input?.workFile ? { type: 'file', filePath: input.workFile } : { type: 'default' };
  const type = ['default', 'builtin', 'file', 'onenote', 'app'].includes(raw.type) ? raw.type : 'default';
  if (type === 'builtin' || type === 'default') return { type };
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
  const questions = rawQuestions.map(normalizeQuestion).filter((question) => question.text || question.image);
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

function normalizeQuestion(raw) {
  const type = raw?.type ?? 'written';
  if (!['written', 'choice', 'blank'].includes(type)) throw new Error('题目类型无效。');
  const question = { id: typeof raw?.id === 'string' && raw.id ? raw.id : crypto.randomUUID(), type, text: cleanText(raw?.text, 10000), image: cleanImage(raw?.image) };
  if (type === 'choice') {
    if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 26 || raw.options.some(x => typeof x !== 'string' || !x.trim())) throw new Error('选择题需要 2–26 个非空选项。');
    question.options = raw.options.map(x => cleanText(x, 2000));
    if (raw.multiple != null && typeof raw.multiple !== 'boolean') throw new Error('多选标记必须为布尔值。');
    question.multiple = raw.multiple === true;
  }
  if (type === 'blank') {
    const labels = raw.blanks == null || (Array.isArray(raw.blanks) && !raw.blanks.length) ? ['答案'] : raw.blanks;
    if (!Array.isArray(labels) || labels.length > 20 || labels.some(x => typeof x !== 'string' || !x.trim())) throw new Error('填空题需要 1–20 个空格标签。');
    question.blanks = labels.map(x => cleanText(x, 160));
  }
  if (raw?.grading) question.grading = normalizeGrading(raw.grading);
  return question;
}

function normalizeResponse(question, value) {
  if (!Array.isArray(value)) throw new Error('作答格式无效。');
  if (question.type === 'choice') {
    if (value.length > question.options.length || value.some(i => !Number.isInteger(i) || i < 0 || i >= question.options.length) || new Set(value).size !== value.length || (!question.multiple && value.length > 1)) throw new Error('选择的选项无效。');
    return [...value].sort((a,b) => a-b);
  }
  if (question.type === 'blank') {
    if (value.length !== (question.blanks || ['答案']).length || value.some(x => typeof x !== 'string' || x.length > 5000)) throw new Error('填空作答与空格数量不匹配，或内容过长。');
    return value.map(x => x.trim());
  }
  throw new Error('此题请使用写字工具或截图作答。');
}
function responseText(question, value) {
  const answers = normalizeResponse(question, value);
  return question.type === 'choice' ? answers.map(i => String.fromCharCode(65+i) + '. ' + question.options[i]).join('；') : answers.map((text,i) => (question.blanks || ['答案'])[i] + '：' + (text || '未填写')).join('\n');
}
function questionText(question) {
  if (question.type === 'choice') return question.text + '\n' + question.options.map((text,i) => String.fromCharCode(65+i) + '. ' + text).join('\n');
  if (question.type === 'blank') return question.text + '\n填空：' + (question.blanks || ['答案']).join('、');
  return question.text;
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
  return { ...course, workTarget: normalizeWorkTarget(course), questions: course.questions.map(raw => { const { grading, ...question } = normalizeQuestion(raw); return question; }) };
}

function preserveGrading(raw, existing) {
  return { ...raw, questions: (raw.questions || []).map((question) => {
    const old = existing?.questions.find((item) => item.id === question.id);
    const { grading, ...clean } = question;
    const sameType = (old?.type || 'written') === (question.type || 'written');
    const sameOptions = JSON.stringify(old?.options || []) === JSON.stringify(question.options || []) && Boolean(old?.multiple) === Boolean(question.multiple);
    const sameBlanks = JSON.stringify(old?.blanks || ['答案']) === JSON.stringify(question.blanks || ['答案']);
    return old?.grading && sameType && sameOptions && sameBlanks && old.text === cleanText(question.text, 10000) && (old.image || '') === (question.image || '')
      ? { ...clean, grading: old.grading } : clean;
  }) };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderSubmission(course, submittedAt, answerFileName, answers = [], typedAnswers = []) {
  const questionHtml = course.questions.map((question, index) => {
    const image = question.image ? `<img src="${question.image}" alt="第 ${index + 1} 题图片">` : '';
    const reference = question.grading ? `<details><summary>批改参考与评分依据（${question.grading.criteria.reduce((sum, item) => sum + item.points, 0)} 分）</summary><p>${math.html(question.grading.answer)}</p><ul>${question.grading.criteria.map((item) => `<li>${item.points} 分：${math.html(item.text)}</li>`).join('')}</ul><p>等价解法同样给分；按步骤给分，同一错误不重复扣分。无法辨认的作答标为待确认。</p></details>` : '';
    const captured = answers.find(item => item.number === index + 1 && item.questionId === question.id);
    const typed = typedAnswers.find(item => item.number === index + 1 && item.questionId === question.id);
    const typedHtml = typed ? '<h3>第 ' + (index+1) + ' 题窗口作答</h3><p>' + math.html(responseText(question, typed.value)) + '</p>' : '';
    const answerHtml = captured ? `<h3>第 ${index + 1} 题作答</h3><a href="${encodeURIComponent(captured.fileName)}"><img src="${encodeURIComponent(captured.fileName)}" alt="第 ${index + 1} 题作答截图"></a>` : !answerFileName && !typed ? '<p>本题未附作答。</p>' : '';
    return `<section class="question"><h2>第 ${index + 1} 题</h2><p>${math.html(questionText(question))}</p>${image}${typedHtml}${answerHtml}${reference}</section>`;
  }).join('\n');
  const answer = answerFileName
    ? `<p><a href="${encodeURIComponent(answerFileName)}">打开作答文件：${escapeHtml(answerFileName)}</a></p>`
    : answers.length || typedAnswers.length ? `<p>已按题号附上 ${answers.length} 张截图及 ${typedAnswers.length} 道窗口作答。</p>` : '<p>未附作答文件。</p>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(course.title)} · 批改材料</title><link rel="stylesheet" href="math/katex.min.css"><link rel="stylesheet" href="math/math.css"><style>body{max-width:860px;margin:48px auto;padding:0 28px;font:16px/1.7 system-ui,sans-serif;color:#233047}h1{font-size:30px}small{color:#66758b}.question{border-top:1px solid #dce2e9;padding:16px 0 24px}.question h2{font-size:17px}.question img{max-width:100%;max-height:480px;border-radius:12px}a{color:#2463a8}</style></head><body><h1>${escapeHtml(course.title)}</h1><small>提交时间：${escapeHtml(submittedAt)}　｜　状态：待老师批改　｜　共 ${course.questions.length} 题</small><h2>作答文件</h2>${answer}<h2>题目</h2>${questionHtml}</body></html>`;
}

module.exports = { normalizeCourse, normalizeWorkTarget, renderSubmission, escapeHtml, learnerCourse, preserveGrading, normalizeQuestion, normalizeResponse, responseText, questionText };
