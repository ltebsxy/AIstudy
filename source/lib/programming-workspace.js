// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILES = 200;
const MAX_BYTES = 10 * 1024 * 1024;
const SKIP = new Set(['.git', 'node_modules', '.venv', 'dist', 'build']);

function relativeFile(value, maxLength = 300) {
  if (typeof value !== 'string' || !value || value.length > maxLength || value.includes('\\') || value.includes('\0')) throw new Error('文件路径无效。');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) throw new Error('文件路径无效。');
  return parts.join('/');
}
function resolveFile(root, relative) {
  const parts=relativeFile(relative).split('/');
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('文件超出练习工作区。');
  let current=root;
  for(const part of parts){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('工作区不能包含符号链接。');}
  return file;
}
function hash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function validateFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw new Error('编程课程需提供 1–200 个文本文件。');
  let bytes = 0;
  const seen = new Set();
  return files.map(item => {
    const file = relativeFile(item?.path);
    if (seen.has(file.toLowerCase())) throw new Error('课程文件路径重复。');
    seen.add(file.toLowerCase());
    if (typeof item.content !== 'string' || item.content.includes('\0')) throw new Error('仅支持 UTF-8 文本课程文件。');
    bytes += Buffer.byteLength(item.content);
    if (bytes > MAX_BYTES) throw new Error('课程文件总大小不能超过 10 MB。');
    return { path: file, content: item.content };
  });
}
function importFolder(folder) {
  const output = [];
  let bytes = 0;
  function walk(directory, prefix = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (SKIP.has(item.name) || item.name.startsWith('.')) continue;
      if (item.isSymbolicLink()) throw new Error('课程文件夹不能包含符号链接。');
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      relativeFile(relative);
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) { walk(absolute, relative); continue; }
      if (!item.isFile()) continue;
      bytes += fs.statSync(absolute).size;
      if (bytes > MAX_BYTES || output.length >= MAX_FILES) throw new Error('课程文件夹超过 10 MB 或 200 个文件。');
      const buffer = fs.readFileSync(absolute);
      if (buffer.includes(0)) throw new Error(`仅支持 UTF-8 文本文件：${relative}`);
      try{new TextDecoder('utf-8', { fatal: true }).decode(buffer);}catch{throw new Error(`仅支持 UTF-8 文本文件：${relative}`);}
      output.push({ path: relative, content: buffer.toString('utf8') });
    }
  }
  walk(folder);
  return validateFiles(output);
}
class ProgrammingWorkspaces {
  constructor(root) { this.root = path.join(root, 'programming-workspaces'); }
  dir(courseId) {
    if (!/^[0-9a-f-]{36}$/i.test(courseId)) throw new Error('课程 ID 无效。');
    return path.join(this.root, courseId);
  }
  ensure(course) {
    const dir = this.dir(course.id);
    if (!fs.existsSync(dir)) {
      const files=validateFiles(course.programming.files);
      fs.mkdirSync(dir, { recursive: true });
      for (const item of files) {
        const target = resolveFile(dir, item.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, item.content, 'utf8');
      }
    }
    return dir;
  }
  list(courseId) {
    const dir = this.dir(courseId);
    if (!fs.existsSync(dir)) return [];
    const files = [];
    const walk = (folder, prefix = '') => {
      for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
        if (SKIP.has(item.name) || item.name.startsWith('.')) continue;
        if (item.isSymbolicLink()) throw new Error('工作区包含符号链接，请先移除。');
        const relative = prefix ? `${prefix}/${item.name}` : item.name;
        relativeFile(relative);
        if (item.isDirectory()) walk(path.join(folder, item.name), relative);
        else if (item.isFile()) files.push(relative);
        if (files.length > MAX_FILES) throw new Error('工作区超过 200 个文件。');
      }
    };
    walk(dir);
    return files.sort((a, b) => a.localeCompare(b));
  }
  read(courseId, relative) {
    const file = resolveFile(this.dir(courseId), relative);
    if (!fs.statSync(file).isFile()) throw new Error('文件不存在。');
    const buffer = fs.readFileSync(file);
    if (buffer.length > MAX_BYTES || buffer.includes(0)) throw new Error('仅支持读取 10 MB 内的文本文件。');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { path: relative, content, hash: hash(content) };
  }
  write(courseId, relative, content, expectedHash) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_BYTES || content.includes('\0')) throw new Error('文件内容无效。');
    const dir = this.dir(courseId), file = resolveFile(dir, relative);
    if (!fs.existsSync(dir)) throw new Error('练习工作区不存在。');
    if (fs.existsSync(file) && (expectedHash == null || this.read(courseId, relative).hash !== expectedHash)) throw new Error(`文件已被其他程序修改：${relative}。请重新加载。`);
    if (!fs.existsSync(file) && expectedHash != null) throw new Error('文件已被删除，请重新加载。');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', content, 'utf8');
    fs.renameSync(file + '.tmp', file);
    return this.read(courseId, relative);
  }
  context(courseId) {
    let total = 0;
    const files = this.list(courseId).map(relative => {
      const file = this.read(courseId, relative);
      total += file.content.length;
      if (total > 120000) throw new Error('工作区文字超过 12 万字符，无法完整发送给 AI。请清理工作区后重试。');
      return file;
    });
    return files.map(file => `--- ${file.path} ---\n${file.content}`).join('\n\n');
  }
  remove(courseId) {
    const dir = this.dir(courseId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  entries() {
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root, { withFileTypes: true }).filter(x => x.isDirectory() && /^[0-9a-f-]{36}$/i.test(x.name)).map(x => {
      let fileCount;try{fileCount=this.list(x.name).length;}catch{fileCount=null;}
      return {courseId:x.name,fileCount};
    });
  }
}
module.exports = { ProgrammingWorkspaces, validateFiles, importFolder, relativeFile, resolveFile };
