const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gradePrompt } = require('./prompts');
const { normalizeResponse, responseText } = require('./model');

function prepareGrading({ course, answerInput, screenshot, screenshots = [], typedAnswers = [], root }) {
  const seen = new Set();
  const responses = typedAnswers.map(item => {
    const question = course.questions[item.number - 1];
    if (!Number.isInteger(item.number) || !question || item.questionId !== question.id || seen.has(item.number)) throw new Error('文字作答与题目不匹配。');
    seen.add(item.number);
    const value = normalizeResponse(question,item.value);
    if (!value.some(x=>typeof x==='number'||x.trim())) return null;
    return {number:item.number,questionId:question.id,type:question.type,value,text:responseText(question,value)};
  }).filter(Boolean).sort((a,b)=>a.number-b.number);
  const perQuestion = ['screenshots','responses'].includes(answerInput?.kind) || (!answerInput && responses.length > 0);
  const items = perQuestion ? [...screenshots].sort((a,b)=>a.number-b.number) : [];
  if (perQuestion && !items.length && !responses.length) throw new Error('截图已失效，请重新截图。');
  if (items.some((item, i) => !Number.isInteger(item.number) || course.questions[item.number - 1]?.id !== item.questionId || !Buffer.isBuffer(item.bytes) || !item.bytes.length || item.bytes.length > 20*1024*1024 || (i && items[i-1].number === item.number))) throw new Error('截图与题目不匹配。');
  let answer, extension;
  if (perQuestion) {
    answer = items.length ? Buffer.concat(items.map(item => item.bytes)) : Buffer.from(JSON.stringify(responses)); extension = items.length ? '.screenshots' : '.responses';
  } else if (answerInput?.kind === 'screenshot') {
    if (!screenshot) throw new Error('截图已失效，请重新截图。');
    answer = screenshot;
    extension = '.png';
  } else {
    const file = typeof answerInput === 'string' ? answerInput : answerInput?.path;
    if (!file || !fs.existsSync(file)) throw new Error('请先选择作答 PDF 或图片。');
    extension = path.extname(file).toLowerCase();
    if (!['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('AI 批改支持 PDF、PNG、JPG、WebP。');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('作答文件需小于 20 MB。');
    answer = fs.readFileSync(file);
  }
  if (!answer.length || answer.length > (perQuestion ? 100 : 20) * 1024 * 1024) throw new Error('作答文件为空或超过大小限制。');
  const key = crypto.createHash('sha256').update(JSON.stringify(course)).update(extension).update(JSON.stringify(responses)).update(JSON.stringify(items.map(({number,questionId,bytes})=>({number,questionId,size:bytes.length})))).update(answer).digest('hex').slice(0, 24);
  const folder = path.join(root, key);
  fs.mkdirSync(folder, { recursive: true });
  const answerName = perQuestion ? null : `作答${extension}`;
  const answers = items.map(item => ({ number:item.number, questionId:item.questionId, fileName:`第${String(item.number).padStart(2, '0')}题-作答.png` }));
  if (perQuestion) answers.forEach((item,i)=>fs.writeFileSync(path.join(folder,item.fileName),items[i].bytes));
  else fs.writeFileSync(path.join(folder, answerName), answer);
  const questions = course.questions.map((question, index) => {
    let imageFile = null;
    if (question.image) {
      const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(question.image);
      if (!match) throw new Error('题目图片格式不支持。');
      imageFile = `题目-${index + 1}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
      fs.writeFileSync(path.join(folder, imageFile), Buffer.from(match[2], 'base64'));
    }
    return { number: index + 1, questionId: question.id, type:question.type || 'written', text: question.text, ...(question.type==='choice'?{options:question.options,multiple:question.multiple}:{}), ...(question.type==='blank'?{blanks:question.blanks || ['答案']}:{}), response:responses.find(r=>r.number===index+1) || null, imageFile, answerFile: perQuestion ? answers.find(a=>a.number===index+1)?.fileName || null : answerName, ...(question.grading ? { grading: question.grading } : {}) };
  });
  fs.writeFileSync(path.join(folder, '批改材料.json'), JSON.stringify({ title: course.title, questions, answerFile: answerName, answers, responses }, null, 2));
  const prompt = gradePrompt(path.join(folder, '批改材料.json'));
  return { folder, prompt, key };
}

module.exports = { prepareGrading };
