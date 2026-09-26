const { app, BrowserWindow, ipcMain, dialog, shell, screen, desktopCapturer, clipboard, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { normalizeCourse, normalizeWorkTarget, renderSubmission, learnerCourse, preserveGrading } = require('./lib/model');
const { CodexClient } = require('./lib/codex-client');
const { DesktopCodex } = require('./lib/desktop-codex');
const { prepareGrading } = require('./lib/grading');
const { copyMathAssets } = require('./lib/math-assets');
const { ExerciseSession } = require('./lib/exercise-session');
const { lessonPrompt, explainPrompt } = require('./lib/prompts');
const { AISettings } = require('./lib/ai-settings');
const { ChatHistory } = require('./lib/chat-history');
const { AIService } = require('./lib/ai-service');

if (process.env.STUDY_DATA_DIR) {
  fs.mkdirSync(process.env.STUDY_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.STUDY_DATA_DIR);
}

let mainWindow;
let overlayWindow;
let selectionWindow;
let activeCourseId = null;
let activeCourse = null;
let exercise = null;
let captureQuestion = null;
let captureImage = null;
let captureBounds = null;
let gradingBusy = false;
const chatImages = new Map();
const codexClient = new CodexClient();
const desktopCodex = new DesktopCodex({
  loadJournal: () => {
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'desktop-pending.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  },
  saveJournal: (journal) => {
    const file = path.join(app.getPath('userData'), 'desktop-pending.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(journal));
    fs.renameSync(`${file}.tmp`, file);
  },
});

const aiSettings = new AISettings(app.getPath('userData'), safeStorage, readPreferences);
const chatHistory = new ChatHistory(path.join(app.getPath('userData'), 'chats'));
const aiService = new AIService(aiSettings, chatHistory, desktopCodex, codexClient);
function dataFile() { return path.join(app.getPath('userData'), 'courses.json'); }
function readPreferences() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'preferences.json'), 'utf8')); }
  catch { return {}; }
}
function selectThread(id) {
  if (id && !/^[0-9a-f-]{20,}$/i.test(id)) throw new Error('无效的 Codex 任务。');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(path.join(app.getPath('userData'), 'preferences.json'), JSON.stringify({ ...readPreferences(), codexThreadId: id }, null, 2));
}
function readCourses() {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    if (!Array.isArray(data)) return [];
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
function writeCourses(courses) {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(courses, null, 2), 'utf8');
  fs.renameSync(temp, file);
}
function trusted(event) {
  return [mainWindow, overlayWindow, selectionWindow].some((win) => win && !win.isDestroyed() && win.webContents === event.sender);
}
function register(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('不允许的请求。');
    return handler(...args);
  });
}
function webPreferences() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true };
}
async function launchWorkTarget(course) {
  const target = normalizeWorkTarget(course);
  if (target.type === 'onenote') {
    if (!target.url) throw new Error('请先在课程中填写 OneNote 页面链接。');
    await shell.openExternal(target.url);
    return '';
  }
  if (target.type === 'app') {
    if (!target.appPath) throw new Error('请先在课程中选择做题程序。');
    if (!fs.existsSync(target.appPath)) throw new Error('指定的做题程序不存在，请重新选择。');
    if (target.filePath && !fs.existsSync(target.filePath)) throw new Error('指定的做题文件不存在，请重新选择。');
    const args = target.filePath ? [target.filePath] : [];
    const child = spawn(target.appPath, args, { detached: true, stdio: 'ignore', windowsHide: false });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
    child.unref();
    return '';
  }
  if (!target.filePath) return '未指定做题文件，可在悬浮窗中查看题目。';
  const error = await shell.openPath(target.filePath);
  if (error) throw new Error(`做题文件未能打开：${error}`);
  return '';
}
function createWindows() {
  mainWindow = new BrowserWindow({ width: 1120, height: 760, minWidth: 850, minHeight: 620, backgroundColor: '#f6f4ee', autoHideMenuBar: true, webPreferences: webPreferences() });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close(); if (selectionWindow && !selectionWindow.isDestroyed()) selectionWindow.close(); });
  const area = screen.getPrimaryDisplay().workArea;
  overlayWindow = new BrowserWindow({
    width: 430, height: 560, minWidth: 360, minHeight: 420,
    x: area.x + area.width - 454, y: area.y + area.height - 584,
    frame: false, show: false, resizable: true, alwaysOnTop: true, skipTaskbar: false,
    backgroundColor: '#ffffff', webPreferences: webPreferences(),
  });
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWindow.setAlwaysOnTop(true, 'pop-up-menu');
  overlayWindow.on('close', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault(); overlayWindow.hide(); mainWindow.show(); mainWindow.webContents.send('session-paused');
    }
  });
  for (const win of [mainWindow, overlayWindow]) {
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
}

async function beginCapture(purpose = 'answer') {
  if (!['answer','chat'].includes(purpose)) throw new Error('截图用途无效。');
  if (selectionWindow && !selectionWindow.isDestroyed()) return;
  if (!exercise) throw new Error('请先开始做题。');
  captureQuestion = { courseId: activeCourseId, index: exercise.index, purpose };
  const bounds = overlayWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x + Math.floor(bounds.width / 2), y: bounds.y + Math.floor(bounds.height / 2) });
  overlayWindow.hide();
  try {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.ceil(display.size.width * display.scaleFactor), height: Math.ceil(display.size.height * display.scaleFactor) },
    });
    const source = sources.find((item) => item.display_id === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error('无法获取屏幕画面。');
    captureImage = source.thumbnail;
    captureBounds = display.bounds;
    selectionWindow = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
      frame: false, show: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      backgroundColor: '#182a2b', webPreferences: webPreferences(),
    });
    selectionWindow.setAlwaysOnTop(true, 'screen-saver');
    selectionWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    selectionWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    selectionWindow.webContents.once('did-finish-load', () => {
      selectionWindow.webContents.send('capture:image', captureImage.toDataURL());
      selectionWindow.webContents.send('capture:question', captureQuestion.index + 1);
      selectionWindow.webContents.send('capture:purpose', captureQuestion.purpose);
      selectionWindow.show();
      selectionWindow.focus();
    });
    selectionWindow.on('closed', () => {
      selectionWindow = null; captureImage = null; captureBounds = null; captureQuestion = null;
      if (activeCourseId && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible() && overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.show();
    });
    selectionWindow.loadFile(path.join(__dirname, 'renderer', 'capture.html'));
  } catch (error) {
    overlayWindow.show();
    throw error;
  }
}

app.whenReady().then(() => {
  createWindows();
  register('ai:settings:get', () => aiSettings.public());
  register('ai:mode', mode => {
    if(aiService.active||gradingBusy)throw new Error('请等待当前 AI 回复完成再切换连接。');
    const result=aiSettings.switchMode(mode);
    for(const win of [mainWindow,overlayWindow])win.webContents.send('ai:settings',result);
    return result;
  });
  register('ai:settings:save', input => {
    if(aiService.active||gradingBusy)throw new Error('请等待当前 AI 回复完成再修改连接。');
    const result=aiSettings.save(input);
    if(result.harness.kind==='codex')selectThread(result.harness.threadId);
    for(const win of [mainWindow,overlayWindow])win.webContents.send('ai:settings',result);
    return result;
  });
  register('chat:history', ({scope='lesson',courseId,before}) => aiService.page(scope,courseId,before));
  register('chat:compact', ({scope,courseId}) => {
    if(gradingBusy)throw new Error('请等待批改完成后再压缩。');
    if(!readCourses().some(c=>c.id===courseId))throw new Error('课程不存在。');
    return aiService.compact({scope,courseId});
  });
  register('chat:clearContext', ({scope,courseId}) => {
    if(gradingBusy)throw new Error('请等待批改完成后再清除上下文。');
    if(!readCourses().some(c=>c.id===courseId))throw new Error('课程不存在。');
    return aiService.clearContext({scope,courseId});
  });
  register('settings:open', () => {overlayWindow.hide();mainWindow.show();mainWindow.focus();mainWindow.webContents.send('settings:open',{exercise:Boolean(activeCourseId)});});
  register('courses:list', () => readCourses().map(learnerCourse));
  register('courses:importFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入课程 JSON', properties: ['openFile'], filters: [{ name: '课程 JSON', extensions: ['json'] }] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 24 * 1024 * 1024) throw new Error('课程文件不能超过 24 MB。');
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('无法读取课程 JSON，请检查文件格式。'); }
    const course = normalizeCourse({ ...raw, workTarget: { type: 'file', filePath: '' } });
    writeCourses([course, ...readCourses()]);
    return learnerCourse(course);
  });
  register('courses:save', (raw) => {
    const courses = readCourses();
    const index = courses.findIndex((course) => course.id === raw?.id);
    const course = normalizeCourse(preserveGrading(raw, courses[index]), index < 0 ? null : courses[index].id);
    if (index < 0) courses.unshift(course); else courses[index] = course;
    writeCourses(courses);
    return learnerCourse(course);
  });
  register('courses:delete', (id) => { writeCourses(readCourses().filter((course) => course.id !== id)); return true; });
  register('dialog:image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择题目图片', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    const bytes = fs.readFileSync(file);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MB。');
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : ext === '.gif' ? 'gif' : 'jpeg';
    return { name: path.basename(file), data: `data:image/${mime};base64,${bytes.toString('base64')}` };
  });
  register('dialog:workFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择做题时打开的文件', properties: ['openFile'] });
    return result.canceled ? null : result.filePaths[0];
  });
  register('dialog:workApp', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择做题程序', properties: ['openFile'], filters: [{ name: 'Windows 程序', extensions: ['exe'] }] });
    return result.canceled ? null : result.filePaths[0];
  });
  register('dialog:answerFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择已完成的作答文件', properties: ['openFile'], filters: [{ name: 'PDF 或图片', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] }] });
    return result.canceled ? null : result.filePaths[0];
  });
  register('session:start', async (id) => {
    if (selectionWindow) throw new Error('请先结束截图。');
    if (gradingBusy) throw new Error('AI 正在批改，请等待完成或先停止等待。');
    const course = readCourses().find((item) => item.id === id);
    if (!course) throw new Error('课程不存在。');
    const warning = await launchWorkTarget(course);
    activeCourseId = id;
    activeCourse = course;
    exercise = new ExerciseSession(course);
    chatImages.clear();
    overlayWindow.webContents.send('session:course', learnerCourse(course));
    overlayWindow.webContents.send('session:progress', exercise.progress());
    overlayWindow.show();
    mainWindow.hide();
    return { warning };
  });
  register('session:resume', () => {
    if (!activeCourseId) throw new Error('没有进行中的练习。');
    overlayWindow.show(); mainWindow.hide(); return true;
  });
  function applyProgress(progress) {
    overlayWindow.webContents.send('session:progress', progress);
    if (progress.submit) {
      overlayWindow.hide(); mainWindow.show(); mainWindow.focus();
      mainWindow.webContents.send('session:submit', activeCourseId, { screenshots: exercise.previews(), captured: progress.captured });
    }
    return progress;
  }
  register('session:navigate', (index) => {
    if (!exercise || selectionWindow || gradingBusy) throw new Error('当前无法切换题目。');
    return applyProgress(exercise.navigate(index));
  });
  register('session:finish', () => {
    if (!exercise || selectionWindow || gradingBusy) throw new Error('当前无法完成题目。');
    return applyProgress(exercise.finish());
  });
  register('session:pause', () => {
    overlayWindow.hide(); mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('session-paused');
    return true;
  });
  register('capture:start', (purpose) => beginCapture(purpose));
  register('capture:cancel', () => { if (selectionWindow && !selectionWindow.isDestroyed()) selectionWindow.close(); return true; });
  register('capture:commit', (rect) => {
    if (!selectionWindow || !captureImage || !captureBounds) throw new Error('没有正在进行的截图。');
    if (captureQuestion?.courseId !== activeCourseId || captureQuestion.index !== exercise?.index) throw new Error('截图对应的题目已改变。');
    const size = captureImage.getSize();
    const scaleX = size.width / captureBounds.width;
    const scaleY = size.height / captureBounds.height;
    const x = Math.max(0, Math.floor(Number(rect?.x) * scaleX));
    const y = Math.max(0, Math.floor(Number(rect?.y) * scaleY));
    const width = Math.min(size.width - x, Math.floor(Number(rect?.width) * scaleX));
    const height = Math.min(size.height - y, Math.floor(Number(rect?.height) * scaleY));
    if (![x, y, width, height].every(Number.isFinite) || width < 20 || height < 20) throw new Error('请框选更大的截图区域。');
    const bytes = captureImage.crop({ x, y, width, height }).toPNG();
    if (captureQuestion.purpose === 'chat') {
      if (bytes.length > 20 * 1024 * 1024) throw new Error('截图超过 20 MB，请缩小区域。');
      const id = randomUUID();
      const folder = path.join(app.getPath('userData'), 'chat-images');
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, `${id}.png`);
      fs.writeFileSync(file, bytes);
      chatImages.set(id, { file, courseId: activeCourseId, index: exercise.index });
      overlayWindow.webContents.send('chat:capture', { id, image: `data:image/png;base64,${bytes.toString('base64')}`, number: exercise.index + 1 });
      selectionWindow.close();
      return { chat: true };
    }
    const progress = exercise.saveScreenshot(captureQuestion.index, bytes);
    applyProgress(progress);
    selectionWindow.close();
    return progress;
  });
  register('codex:list', () => codexClient.listThreads());
  register('codex:preferences', () => readPreferences());
  register('codex:select', (id) => selectThread(id));
  register('codex:connection', async () => {
    if (!desktopCodex.available) return { mode: 'app-server', label: '普通连接 · 桌面占用时需手动发送' };
    try { await desktopCodex.start(); return { mode: 'desktop', label: '桌面自动转发 · 实验连接' }; }
    catch { return { mode: 'unavailable', label: '桌面连接失效 · 请从 Codex 重新打开软件' }; }
  });
  register('codex:cancel', () => aiService.cancel());
  register('codex:desktop', pending => aiService.continue(pending, async () => {
    clipboard.writeText(pending.message);
    await shell.openExternal(`codex://threads/${encodeURIComponent(pending.threadId)}`);
  }));
  register('codex:ask', async ({ question, message, attachmentIds = [] }) => {
    if(!activeCourse||!exercise)throw new Error('请先开始做题。');
    if (!Array.isArray(attachmentIds) || attachmentIds.length > 4) throw new Error('每条消息最多附 4 张截图。');
    const files = attachmentIds.map(id => {
      const image = chatImages.get(id);
      if (!image || image.courseId !== activeCourseId || image.index !== exercise?.index) throw new Error('截图对应的题目已改变，请重新截图。');
      return image.file;
    });
    const text=String(question||message||'').trim().slice(0,2500);
    if(!text)throw new Error('请输入问题。');
    return aiService.chat({scope:'exercise',courseId:activeCourseId,question:text,message:explainPrompt(activeCourse.questions[exercise.index].text,text),files,onUpdate:text=>overlayWindow.webContents.send('codex:answer',text)});
  });
  register('lesson:ask', ({ courseId, context, question }) => {
    if(!readCourses().some(c=>c.id===courseId))throw new Error('课程不存在。');
    return aiService.chat({scope:'lesson',courseId,question:String(question||'解释选取片段').slice(0,2500),message:lessonPrompt(context,question),onUpdate:text=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('lesson:answer',text);}});
  });
  register('submission:grade', async ({ courseId, threadId, answerInput }) => {
    if (gradingBusy) throw new Error('AI 正在批改，请稍候。');
    if (courseId !== activeCourseId) throw new Error('当前练习已变更，请重新进入提交页。');
    const course = activeCourse;
    if (!course) throw new Error('没有可批改的练习。');
    if(aiService.active)throw new Error('上一条 AI 消息仍在处理中。');
    const config=aiSettings.read();
    gradingBusy = true;
    try {
      const bundle = prepareGrading({ course, answerInput, screenshots: exercise.answers(), root: path.join(app.getPath('userData'), 'grading') });
      let message=bundle.prompt,files=[];
      if(config.mode==='api'||config.harness.kind==='http'){
        const manifest=JSON.parse(fs.readFileSync(path.join(bundle.folder,'批改材料.json'),'utf8'));
        message='题目评分，指出问题，语言精简。\n材料：\n'+JSON.stringify(manifest);
        files=[...new Set([manifest.answerFile,...manifest.questions.flatMap(q=>[q.imageFile,q.answerFile])].filter(Boolean))].map(file=>path.join(bundle.folder,file));
      }
      const report = await aiService.direct(config, message, files, (text) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('submission:gradeProgress', { courseId, text });
      });
      if(report?.needsDesktop)throw new Error('该 Codex 任务正由桌面管理，请从 Codex 重新启动软件后批改。');
      fs.writeFileSync(path.join(bundle.folder, 'AI批改结果.md'), `# ${course.title} · AI 批改\n\n${report}\n\n---\nAI 参考评分，建议复核。\n`);
      return { report, folder: bundle.folder };
    } finally { gradingBusy = false; }
  });
  register('submission:export', async (answerInput) => {
    const course = activeCourse;
    if (!course) throw new Error('没有可提交的练习。');
    const screenshot = answerInput?.kind === 'screenshots';
    const answerPath = typeof answerInput === 'string' ? answerInput : answerInput?.path;
    if (screenshot && !exercise?.answers().length) throw new Error('截图已失效，请重新截图。');
    if (!screenshot && (!answerPath || !fs.existsSync(answerPath))) throw new Error('请先选择已完成的作答文件。');
    const output = await dialog.showOpenDialog(mainWindow, { title: '选择批改包保存位置', properties: ['openDirectory', 'createDirectory'] });
    if (output.canceled) return null;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = course.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 40);
    const folder = path.join(output.filePaths[0], `${safeTitle}-提交-${timestamp}`);
    fs.mkdirSync(folder, { recursive: true });
    const answerName = screenshot ? null : `作答文件${path.extname(answerPath).toLowerCase()}`;
    const answers = screenshot ? exercise.answers() : [];
    if (screenshot) for (const item of answers) fs.writeFileSync(path.join(folder, item.fileName), item.bytes);
    else fs.copyFileSync(answerPath, path.join(folder, answerName));
    const manifest = answers.map(({bytes,...item})=>item);
    fs.writeFileSync(path.join(folder, '作答对应.json'), JSON.stringify({ courseId: course.id, answerFile: answerName, answers: manifest }, null, 2));
    const html = renderSubmission(course, new Date().toLocaleString('zh-CN'), answerName, manifest);
    fs.writeFileSync(path.join(folder, '批改材料.html'), html, 'utf8');
    copyMathAssets(folder);
    // Keep this submission available for optional AI grading after export.
    // A new session replaces the retained answer snapshot.
    return folder;
  });
  register('submission:openFolder', (folder) => shell.openPath(folder));
});

app.on('before-quit', () => { aiService.active?.abort(); codexClient.close(); desktopCodex.close(); });
app.on('window-all-closed', () => app.quit());
