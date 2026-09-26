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

function setupLessonSelection(root, onAdd, isBusy) {
  const button = document.createElement('button');
  button.id = 'add-to-lesson-chat'; button.className = 'lesson-selection-action';
  button.textContent = '加入侧边聊天'; button.hidden = true;
  document.body.append(button);
  let selected = '';
  function update() {
    const selection = window.getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    selected = !isBusy() && root.isConnected ? selectedLessonText(root, range) : '';
    button.hidden = !selected;
    if (!selected) return;
    const rect = range.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) { button.hidden = true; return; }
    button.style.left = `${Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - button.offsetWidth - 8))}px`;
    button.style.top = `${Math.max(8, Math.min(rect.top >= 44 ? rect.top - 40 : rect.bottom + 6, innerHeight - button.offsetHeight - 8))}px`;
  }
  button.onpointerdown = e => e.preventDefault();
  button.onclick = () => {
    if (!selected || isBusy()) return;
    const text = selected;
    button.hidden = true;
    window.getSelection().removeAllRanges();
    onAdd(text);
  };
  const escape = e => { if (e.key === 'Escape') button.hidden = true; };
  document.addEventListener('selectionchange', update);
  document.addEventListener('keydown', escape);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);
  return () => {
    document.removeEventListener('selectionchange', update);
    document.removeEventListener('keydown', escape);
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update, true);
    button.remove();
  };
}
