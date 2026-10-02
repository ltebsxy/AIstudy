// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { validateFiles, resolveFile } = require('./programming-workspace');
const { zipFiles } = require('./zip');

const hash = content => createHash('sha256').update(content).digest('hex');
class ProgrammingSubmissions {
  constructor(root) { this.root = path.join(root, 'programming-submissions'); }
  dir(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('提交记录无效。');
    const folder = path.join(this.root, id);
    if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw new Error('提交目录不能是符号链接。');
    return folder;
  }
  create(course, input) {
    const files = validateFiles(input), taskFiles = validateFiles(course.programming.files);
    const submissionId = randomUUID(), folder = this.dir(submissionId);
    fs.mkdirSync(folder, { recursive: true });
    const answersFolder = resolveFile(folder, 'files');
    fs.mkdirSync(answersFolder);
    for (const file of files) {
      const target = resolveFile(answersFolder, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, 'utf8');
    }
    const manifest = { submissionId, courseId: course.id, title: course.title, submittedAt: new Date().toISOString(),
      taskFiles, files: files.map(file => ({ path: file.path, hash: hash(file.content) })) };
    fs.writeFileSync(path.join(folder, 'submission.json'), JSON.stringify(manifest, null, 2));
    return { submissionId, folder };
  }
  read(id) {
    const folder = this.dir(id);
    const metadata = resolveFile(folder, 'submission.json');
    if (!fs.existsSync(metadata)) throw new Error('提交记录不存在，请重新提交。');
    if (fs.statSync(metadata).size > 25 * 1024 * 1024) throw new Error('提交记录过大。');
    const manifest = JSON.parse(fs.readFileSync(metadata, 'utf8'));
    if (manifest.submissionId !== id || !Array.isArray(manifest.files) || manifest.files.length > 200) throw new Error('提交记录无效。');
    const taskFiles = validateFiles(manifest.taskFiles);
    const answersFolder = resolveFile(folder, 'files');
    const files = validateFiles(manifest.files.map(file => {
      const target = resolveFile(answersFolder, file.path);
      if (fs.statSync(target).size > 10 * 1024 * 1024) throw new Error('提交文件过大。');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(target));
      if (hash(content) !== file.hash) throw new Error(`提交快照已被修改：${file.path}。请重新提交。`);
      return { path: file.path, content };
    }));
    return { ...manifest, taskFiles, files, folder };
  }
  prompt(id) {
    const { title, taskFiles, files } = this.read(id);
    const material = JSON.stringify({ title, taskFiles, files });
    if (material.length > 120000) throw new Error('课程原题与提交文件超过 12 万字符，无法完整交给 AI 批改；可以选择打包。');
    return `题目评分，指出问题，语言精简。\n课程原题（taskFiles，题目在注释中）与提交作答（files）：\n${material}`;
  }
  saveReport(id, report) {
    const snapshot = this.read(id);
    fs.writeFileSync(resolveFile(snapshot.folder, 'AI批改结果.md'), `# ${snapshot.title} · AI 批改\n\n${report}\n\n---\nAI 参考评分，建议复核。\n`, 'utf8');
    return snapshot.folder;
  }
  archive(id) {
    const snapshot = this.read(id);
    const files = [
      ...snapshot.files.map(file => ({ ...file, path: `作答文件/${file.path}` })),
      ...snapshot.taskFiles.map(file => ({ ...file, path: `课程原题/${file.path}` })),
      { path: '提交信息.json', content: JSON.stringify({ title: snapshot.title, submittedAt: snapshot.submittedAt,
        files: snapshot.files.map(file => file.path) }, null, 2) },
    ];
    const report = resolveFile(snapshot.folder, 'AI批改结果.md');
    if (fs.existsSync(report)) files.push({ path: 'AI批改结果.md', content: fs.readFileSync(report, 'utf8') });
    return zipFiles(files);
  }
}
module.exports = { ProgrammingSubmissions };
