function explainPrompt(context, question) {
  return `解释知识点，语言精简。\n\n知识点：\n${String(context || '').slice(0, 8500)}\n\n问题：${String(question || '解释当前知识点').slice(0, 2500)}`;
}
function gradePrompt(file) { return `题目评分，指出问题，语言精简。\n材料：${file}（含题目、评分依据及作答文件）。`; }
function lessonPrompt(context, question) {
  const fragment = String(context || '').trim().slice(0, 8500);
  return `解释知识点，语言精简。${fragment ? `\n\n选取片段：\n${fragment}` : ''}\n\n问题：${String(question || '解释选取片段').slice(0, 2500)}`;
}
if (typeof module === 'object' && module.exports) module.exports = { explainPrompt, gradePrompt, lessonPrompt };
else globalThis.StudyPrompts = { explainPrompt, gradePrompt, lessonPrompt };
