function setupLessonReader(course) {
  if (course.knowledgeFormat !== 'sections') { StudyMath.render(document.querySelector('.lesson-content')); document.dispatchEvent(new CustomEvent('lesson:context',{detail:{courseId:course.id,title:course.title,text:course.knowledge}})); return; }
  const sections = [];
  for (const line of course.knowledge.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) sections.push({ title: heading[1], lines: [] });
    else {
      if (!sections.length && !line.trim()) continue;
      if (!sections.length) sections.push({ title: '课程说明', lines: [] });
      sections[sections.length - 1].lines.push(line);
    }
  }
  if (!sections.length) return;
  const card = document.querySelector('.lesson-card');
  const content = card.querySelector('.lesson-content');
  const storageKey = `lesson-position:${course.id}`;
  let index = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.version === course.updatedAt && Number.isInteger(saved.index)) index = Math.max(0, Math.min(sections.length - 1, saved.index));
  } catch { /* Reading remains available when local storage is unavailable. */ }
  card.classList.add('section-reader');
  document.querySelector('.lesson-layout').classList.add('with-sections');
  const controls = document.createElement('div'); controls.className = 'reader-controls';
  const label = document.createElement('label'); label.htmlFor = 'lesson-sections'; label.textContent = '本节目录';
  const select = document.createElement('select'); select.id = 'lesson-sections';
  sections.forEach((section, i) => {
    const option = document.createElement('option'); option.value = String(i); option.textContent = /^\d+[ .、]/.test(section.title) ? section.title : `${i + 1}. ${section.title}`; select.append(option);
  });
  const progress = document.createElement('span'); progress.className = 'reader-progress'; progress.setAttribute('aria-live', 'polite');
  controls.append(label, select, progress); content.before(controls);
  const paging = document.createElement('div'); paging.className = 'reader-paging';
  const prev = document.createElement('button'); prev.className = 'btn btn-plain'; prev.textContent = '← 上一小节';
  const next = document.createElement('button'); next.className = 'btn btn-soft'; next.textContent = '下一小节 →';
  paging.append(prev, next); content.after(paging);
  const heading = document.createElement('h2'); heading.className = 'reader-heading'; heading.tabIndex = -1;
  const body = document.createElement('div'); body.className = 'reader-body'; content.replaceChildren(heading, body);
  function show(focus = false) {
    heading.textContent = sections[index].title;
    StudyMath.setText(body, sections[index].lines.join('\n').trim());
    document.dispatchEvent(new CustomEvent('lesson:context',{detail:{courseId:course.id,title:sections[index].title,text:sections[index].lines.join('\n').trim()}}));
    select.value = String(index); progress.textContent = `${index + 1} / ${sections.length}`;
    prev.disabled = index === 0; next.disabled = index === sections.length - 1;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: course.updatedAt, index })); } catch {}
    if (focus) { controls.scrollIntoView({ block: 'start' }); heading.focus({ preventScroll: true }); }
  }
  select.onchange = () => { index = Number(select.value); show(true); };
  prev.onclick = () => { if (index > 0) { index--; show(true); } };
  next.onclick = () => { if (index < sections.length - 1) { index++; show(true); } };
  show();
}
