class ExerciseSession {
  constructor(course) { this.course = course; this.index = 0; this.completed = new Set(); this.screenshots = new Map(); }
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
  progress() { return { index: this.index, completed: [...this.completed], captured: [...this.screenshots.keys()] }; }
  answers() { return [...this.screenshots.entries()].sort(([a],[b])=>a-b).map(([index, bytes])=>({ questionId: this.course.questions[index].id, number: index+1, fileName: `第${String(index+1).padStart(2,'0')}题-作答.png`, bytes })); }
  previews() { return this.answers().map(({ bytes,...item })=>({ ...item, image: `data:image/png;base64,${bytes.toString('base64')}` })); }
}
module.exports = { ExerciseSession };
