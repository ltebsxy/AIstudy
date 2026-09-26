const {normalize:normalizeBoard}=require('../renderer/board-model');
const { normalizeResponse, responseText } = require('./model');
class ExerciseSession {
  constructor(course) { this.course = course; this.index = 0; this.completed = new Set(); this.screenshots = new Map(); this.responses = new Map(); }
  check(index) { if (!Number.isInteger(index) || index < 0 || index >= this.course.questions.length) throw new Error('题号无效。'); }
  navigate(index) { this.check(index); this.index = index; return this.progress(); }
  finish(index = this.index) {
    this.check(index);
    if (index !== this.index) throw new Error('当前题目已改变，请重试。');
    this.completed.add(index);
    const submit = index === this.course.questions.length - 1;
    if (!submit) this.index++;
    return { ...this.progress(), submit };
  }
  saveScreenshot(index, bytes) {
    this.check(index);
    if (index !== this.index) throw new Error('当前题目已改变，请重新截图。');
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('截图无效或超过 20 MB。');
    const total = [...this.screenshots.entries()].reduce((n,[i,b])=>n+(i===index?0:b.length),0)+bytes.length;
    if (total > 100 * 1024 * 1024) throw new Error('本次截图超过 100 MB，请改用 PDF。');
    this.screenshots.set(index, bytes);
    return this.finish(index);
  }
  saveResponse(index, value) {
    this.check(index);
    if (index !== this.index) throw new Error('当前题目已改变，请重试。');
    const clean = normalizeResponse(this.course.questions[index], value);
    this.responses.set(index, clean);
    return this.progress();
  }
  typedAnswers() { return [...this.responses.entries()].sort(([a],[b])=>a-b).filter(([,value])=>value.some(x=>typeof x === 'number' || x.trim())).map(([index,value])=>({ questionId:this.course.questions[index].id, number:index+1, type:this.course.questions[index].type, value:[...value], text:responseText(this.course.questions[index],value) })); }
  progress() { return { index: this.index, completed: [...this.completed], captured: [...this.screenshots.keys()], responses: Object.fromEntries([...this.responses].map(([index,value])=>[index,[...value]])) }; }
  answers() { return [...this.screenshots.entries()].sort(([a],[b])=>a-b).map(([index, bytes])=>({ questionId: this.course.questions[index].id, number: index+1, fileName: `第${String(index+1).padStart(2,'0')}题-作答.png`, bytes })); }
  previews() { return this.answers().map(({ bytes,...item })=>({ ...item, image: `data:image/png;base64,${bytes.toString('base64')}` })); }
}
function normalizeWriterDocument(raw, maxPages = 1000) {
  if (!raw || !Array.isArray(raw.pages) || raw.pages.length > maxPages) throw new Error('笔迹页数无效。');
  let total = 0;
  const pages = raw.pages.map(page => {
    if (page == null) return { strokes: [] };
    if(page.board)return {strokes:[],board:normalizeBoard(page.board)};
    if (!Array.isArray(page.strokes) || page.strokes.length > 10000) throw new Error('笔迹数量无效。');
    const height=page.height??1400;
    if(!Number.isInteger(height)||height<1400||height>14000)throw new Error('画布高度无效。');
    return { ...(height!==1400?{height}:{}),strokes: page.strokes.map(stroke => {
      if (!stroke || !['pen','eraser'].includes(stroke.tool) || !/^#[0-9a-f]{6}$/i.test(stroke.color) || !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 100 || !Array.isArray(stroke.points) || !stroke.points.length) throw new Error('笔迹格式无效。');
      total += stroke.points.length;
      if (total > 300000) throw new Error('笔迹过多，请分次提交或清理空白页。');
      return { tool:stroke.tool, color:stroke.color, width:stroke.width, points:stroke.points.map(point => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x<0 || point.x>1000 || point.y<0 || point.y>height || (point.p!=null && (!Number.isFinite(point.p)||point.p<0||point.p>1))) throw new Error('笔迹坐标无效。');
        return {x:point.x,y:point.y,p:point.p??0.5};
      }) };
    }) };
  });
  return { pages };
}
module.exports = { ExerciseSession, normalizeWriterDocument };
