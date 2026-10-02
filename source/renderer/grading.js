function renderGradingReport(element, text) {
  element.replaceChildren();
  const protectedMath = StudyMath.mask(text);
  function inline(parent, value) {
    for (const part of value.split(/(\*\*[^*]+\*\*)/g)) {
      if (part.startsWith('**') && part.endsWith('**')) { const strong = document.createElement('strong'); strong.textContent = protectedMath.restore(part.slice(2, -2)); parent.append(strong); }
      else parent.append(document.createTextNode(protectedMath.restore(part)));
    }
  }
  const lines = protectedMath.text.split('\n');
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^```/.test(line)) {
      const code=[];
      while(i+1<lines.length&&!/^```/.test(lines[i+1].trim()))code.push(lines[++i]);
      if(/^```/.test(lines[i+1]?.trim()||''))i++;
      const pre=document.createElement('pre');pre.textContent=protectedMath.restore(code.join('\n'));
      element.append(pre);continue;
    }
    if (line.includes('|') && lines[i + 1] && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const wrapper = document.createElement('div'); wrapper.className = 'grade-table';
      const table = document.createElement('table');
      const head = document.createElement('tr');
      for (const value of cells(line)) { const cell = document.createElement('th'); inline(cell, value); head.append(cell); }
      table.append(head); i++;
      while (lines[i + 1]?.includes('|')) {
        const row = document.createElement('tr');
        for (const value of cells(lines[++i])) { const cell = document.createElement('td'); inline(cell, value); row.append(cell); }
        table.append(row);
      }
      wrapper.append(table); element.append(wrapper); continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const node = document.createElement(heading ? 'h4' : 'p');
    inline(node, heading ? heading[1] : line.replace(/^[-*]\s+/, '• '));
    element.append(node);
  }
  StudyMath.render(element);
}

function setupSubmissionGrading(courseId, getAnswer) {
  const card = document.querySelector('.submission-card');
  const thirdStep = document.getElementById('grading-options-host');
  thirdStep.innerHTML = `<h3>选择批改方式</h3><div class="grading-options"><label><input type="radio" name="grading-mode" value="teacher" checked> 交给老师</label><label><input type="radio" name="grading-mode" value="ai"> AI 批改</label></div><p id="grading-description">生成含题目和作答文件的批改包，交给老师。</p><div id="grading-target" hidden><p id="grading-connection">使用设置中的 AI 连接。</p><p>按题目与作答评分，简要指出问题。</p></div>`;
  const result = document.createElement('section');
  result.id = 'grading-result';
  result.className = 'grading-result';
  result.hidden = true;
  result.innerHTML = '<h3>AI 批改结果</h3><div id="grading-status" role="status"></div><div id="grading-report"></div><button class="link-button" id="open-grade" hidden>打开结果文件夹 →</button>';
  document.getElementById('export-result').before(result);
  const submit = document.getElementById('export');
  const choose = document.getElementById('choose-answer');
  const teacherExport = submit.onclick;
  const originalChoose = choose.onclick;
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-plain'; cancel.textContent = '停止等待'; cancel.hidden = true;
  submit.before(cancel);
  let mode = 'teacher', busy = false, loaded = false;
  let reportFolder = '';
  const status = document.getElementById('grading-status');
  const report = document.getElementById('grading-report');
  const open = document.getElementById('open-grade');
  function setBusy(value) {
    busy = value;
    card.querySelectorAll('input,select,button').forEach((element) => { if (element !== cancel) element.disabled = value; });
    for (const id of ['nav-home', 'nav-settings']) document.getElementById(id).disabled = value;
    cancel.hidden = !value; cancel.disabled = false;
    submit.textContent = value ? 'AI 正在批改…' : mode === 'ai' ? '开始 AI 批改' : '生成批改包';
    if (!value) submit.disabled = !getAnswer();
  }
  async function loadTasks() {
    try {const config=await window.study.getAISettings();const label=document.getElementById('grading-connection');if(label)label.textContent='当前连接：'+aiConnectionLabel(config)+'（可在设置中修改）';loaded=true;}
    catch(error){status.textContent=error.message;result.hidden=false;}
  }
  card.querySelectorAll('[name="grading-mode"]').forEach((radio) => radio.onchange = () => {
    if (busy) return;
    mode = radio.value;
    document.getElementById('grading-target').hidden = mode !== 'ai';
    document.getElementById('grading-description').textContent = mode === 'ai' ? 'AI 查看题目和作答，给出评分与讲解。' : '生成含题目和作答文件的批改包，交给老师。';
    result.hidden = mode !== 'ai' || (!report.textContent && !status.textContent);
    submit.textContent = mode === 'ai' ? '开始 AI 批改' : '生成批改包';
    submit.disabled = !getAnswer();
    if (mode === 'ai' && !loaded) loadTasks();
  });
  choose.onclick = async () => {
    const before = getAnswer();
    await originalChoose();
    if (getAnswer() !== before) { report.textContent = ''; status.textContent = ''; result.hidden = true; open.hidden = true; reportFolder = ''; }
  };
  cancel.onclick = async () => {
    cancel.disabled = true;
    status.textContent = '正在停止等待；Codex 中的批改任务可能继续运行。';
    try { await window.study.cancelCodex(); } catch (error) { status.textContent = error.message; cancel.disabled = false; }
  };
  open.onclick = () => window.study.openFolder(reportFolder);
  submit.onclick = async () => {
    if (busy) return;
    if (mode === 'teacher') return teacherExport();
    result.hidden = false;
    report.textContent = ''; open.hidden = true;
    status.textContent = '正在提交题目和作答，等待 AI 查看并批改…';
    setBusy(true);
    try {
      const output = await window.study.gradeSubmission({ courseId, answerInput: getAnswer() });
      renderGradingReport(report, output.report);
      reportFolder = output.folder;
      status.textContent = '批改结果已返回并保存。AI 评分仅供参考，请核对。';
      open.hidden = false;
    } catch (error) {
      status.textContent = `批改未完成：${error.message || error}`;
    } finally { if (submit.isConnected) setBusy(false); }
  };
}

window.study.onGradeProgress(({ courseId, text }) => {
  if (currentCourseId !== courseId) return;
  const report = document.getElementById('grading-report');
  if (report) renderGradingReport(report, text);
});
