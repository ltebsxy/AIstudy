// Recover selected text without KaTeX's duplicated HTML/MathML text.
// A partially selected formula is included whole so its meaning survives.
function selectedLessonText(root, range) {
  if (!root || !range || range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return '';
  function read(node) {
    if (!range.intersectsNode(node)) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      return node.textContent.slice(start, end);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.matches('.math-expression')) {
      const source = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (source) return node.classList.contains('math-block') ? `\\[${source}\\]` : `\\(${source}\\)`;
    }
    if (node.tagName === 'BR') return '\n';
    const text = [...node.childNodes].map(read).join('');
    return /^(P|DIV|H[1-6])$/.test(node.tagName) ? `${text}\n` : text;
  }
  return read(root).trim();
}

function setupLessonSelection(root, onAdd, isBusy, onNote) {
  const actions=document.createElement('div');actions.className='lesson-selection-actions';actions.hidden=true;
  const button = document.createElement('button');
  button.id = 'add-to-lesson-chat'; button.className = 'lesson-selection-action';
  button.textContent = '加入侧边聊天'; button.hidden = true;
  const noteButton=document.createElement('button');noteButton.id='add-to-note';noteButton.className='lesson-selection-action';noteButton.textContent='加入笔记';
  if(onAdd)actions.append(button);if(onNote)actions.append(noteButton);document.body.append(actions);
  let selected = '';
  function update() {
    const selection = window.getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    selected = !isBusy() && root.isConnected ? selectedLessonText(root, range) : '';
    button.hidden = !selected;
    actions.hidden=!selected;
    if (!selected) return;
    const rect = range.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) { actions.hidden=true;button.hidden = true; return; }
    actions.style.left = `${Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - actions.offsetWidth - 8))}px`;
    actions.style.top = `${Math.max(8, Math.min(rect.top >= 44 ? rect.top - 40 : rect.bottom + 6, innerHeight - actions.offsetHeight - 8))}px`;
  }
  button.onpointerdown = e => e.preventDefault();
  button.onclick = () => {
    if (!selected || isBusy()) return;
    const text = selected;
    button.hidden = true;
    actions.hidden=true;
    window.getSelection().removeAllRanges();
    onAdd(text);
  };
  noteButton.onpointerdown=e=>e.preventDefault();noteButton.onclick=()=>{if(!selected||isBusy())return;const text=selected;actions.hidden=true;window.getSelection().removeAllRanges();onNote(text);};
  const escape = e => { if (e.key === 'Escape'){button.hidden = true;actions.hidden=true;} };
  document.addEventListener('selectionchange', update);
  document.addEventListener('keydown', escape);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);
  return () => {
    document.removeEventListener('selectionchange', update);
    document.removeEventListener('keydown', escape);
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update, true);
    actions.remove();
  };
}
