function renderSubmit(id, options = {}) {
  const course = byId(id); if (!course) return renderHome();
  const shots = options.screenshots || [];
  currentCourseId = id; answerFile = shots.length ? { kind: 'screenshots' } : ''; nav('home');
  view.innerHTML = `<div class="content"><div class="eyebrow">提交练习</div><h1 class="page-title">${esc(course.title)}</h1><p class="subtitle">${course.questions.length} 道题 · ${shots.length} 张截图</p><div class="submission-card submission-simple"><div id="answer-summary"></div><div class="answer-grid" id="answer-grid"></div><div class="file-row"><button class="btn btn-plain" id="choose-answer">选择 PDF 或图片</button><button class="link-button" id="use-shots" ${shots.length ? '' : 'hidden'}>使用逐题截图</button><span class="filename" id="answer-name"></span></div><div class="divider"></div><div id="grading-options-host"></div><div id="export-result"></div><div class="submit-actions"><button class="btn btn-plain" id="resume">返回做题</button><button class="btn btn-primary" id="export" ${shots.length ? '' : 'disabled'}>生成批改包</button></div></div></div>`;
  const summary = document.getElementById('answer-summary');
  const grid = document.getElementById('answer-grid');
  function showShots() {
    answerFile = { kind:'screenshots' };
    summary.textContent = '截图已按题号保存。未截图的题目可返回补充，或改用完整 PDF。';
    document.getElementById('answer-name').textContent = `${shots.length} 张逐题截图`;
    grid.replaceChildren();
    course.questions.forEach((question,i) => {
      const shot = shots.find(item => item.number === i+1);
      const item = document.createElement('div'); item.className = 'answer-tile';
      const title = document.createElement('strong'); title.textContent = `第 ${String(i+1).padStart(2,'0')} 题 · ${shot ? '已截图' : '未截图'}`;
      item.append(title);
      if (shot) { const image=document.createElement('img'); image.className='submission-preview'; image.src=shot.image; image.alt=`第 ${i+1} 题作答截图`; item.append(image); }
      const redo=document.createElement('button'); redo.className='link-button'; redo.textContent=shot?'重新截图':'去做题';
      redo.onclick=async()=>{try{await window.study.navigateQuestion(i);await window.study.resumeSession();}catch(e){errorMessage(e);}};
      item.append(redo); grid.append(item);
    });
    document.getElementById('export').disabled = false;
  }
  if (shots.length) showShots(); else summary.textContent = '选择完整作答文件，或返回逐题截图。';
  document.getElementById('use-shots').onclick = () => {
    showShots(); document.getElementById('export-result').replaceChildren();
    const result=document.getElementById('grading-result'); if(result)result.hidden=true;
  };
  document.getElementById('choose-answer').onclick = async () => {
    try { const file=await window.study.chooseAnswerFile(); if(!file)return;
      answerFile=file; grid.replaceChildren(); summary.textContent='将提交所选作答文件。';
      document.getElementById('answer-name').textContent=file.split(/[\\/]/).pop(); document.getElementById('export').disabled=false;
    } catch(e){errorMessage(e);}
  };
  document.getElementById('resume').onclick=()=>window.study.resumeSession().catch(errorMessage);
  document.getElementById('export').onclick=async()=>{
    try {const folder=await window.study.exportSubmission(answerFile);if(!folder)return;
      document.getElementById('export-result').innerHTML=`<div class="success"><strong>✓ 批改包已生成</strong><button class="link-button" id="open-folder">打开文件夹 →</button></div>`;
      document.getElementById('open-folder').onclick=()=>window.study.openFolder(folder);
    }catch(e){errorMessage(e);}
  };
  setupSubmissionGrading(id,()=>answerFile);
}
