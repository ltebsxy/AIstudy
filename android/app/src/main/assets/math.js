(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('katex'));
  else root.StudyMath = factory(root.katex);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (katex) {
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const options = { trust: false, strict: 'ignore', throwOnError: true, maxExpand: 500, maxSize: 15, output: 'htmlAndMathml' };
  // Parse only explicit delimiters; plain user text is never guessed as mathematics.
  function tokens(value) {
    const text = String(value ?? ''); const result = []; let plain = '', i = 0;
    const flush = () => { if (plain) { result.push({ text: plain }); plain = ''; } };
    while (i < text.length) {
      if (text[i] === '`') {
        const fence = text.startsWith('```', i) ? '```' : '`';
        const end = text.indexOf(fence, i + fence.length);
        if (end >= 0) { plain += text.slice(i, end + fence.length); i = end + fence.length; continue; }
      }
      if (text.startsWith('\\$', i)) { plain += '\\$'; i += 2; continue; }
      const pair = text.startsWith('$$', i) ? ['$$', '$$', true] : text.startsWith('\\[', i) ? ['\\[', '\\]', true] : text.startsWith('\\(', i) ? ['\\(', '\\)', false] : text[i] === '$' ? ['$', '$', false] : null;
      if (!pair) { plain += text[i++]; continue; }
      let end = i + pair[0].length;
      while ((end = text.indexOf(pair[1], end)) >= 0) {
        let slashes = 0; for (let p = end - 1; p >= 0 && text[p] === '\\'; p--) slashes++;
        if (slashes % 2 === 0) break;
        end += pair[1].length;
      }
      if (end < 0) { plain += text[i++]; continue; }
      const source = text.slice(i + pair[0].length, end);
      if (!source.trim() || (!pair[2] && source.includes('\n'))) { plain += text[i++]; continue; }
      flush(); result.push({ math: source, display: pair[2], raw: text.slice(i, end + pair[1].length) }); i = end + pair[1].length;
    }
    flush(); return result;
  }
  function mathHtml(token) {
    try {
      if (token.math.length > 16000) throw new Error('公式过长');
      return `<span class="math-expression${token.display ? ' math-block' : ''}">${katex.renderToString(token.math, { ...options, macros: {}, displayMode: token.display })}</span>`;
    } catch {
      return `<span class="math-error" title="公式暂不能排版，请检查 LaTeX 语法">${escape(token.raw)}</span>`;
    }
  }
  function html(value) { return tokens(value).map((t) => t.math === undefined ? escape(t.text).replace(/\n/g, '<br>') : mathHtml(t)).join(''); }
  function render(element) {
    if (!element) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return node.parentElement.closest('.katex,.math-expression,.math-error,textarea,pre,code,script,style,option') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = tokens(node.textContent); if (!parts.some((t) => t.math !== undefined)) continue;
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (part.math === undefined) fragment.append(document.createTextNode(part.text));
        else { const span = document.createElement('span'); span.innerHTML = mathHtml(part); fragment.append(...span.childNodes); }
      }
      node.replaceWith(fragment);
    }
  }
  function setText(element, value) { element.textContent = String(value ?? ''); render(element); }
  // Keep multi-line equations and | symbols intact while the report's Markdown is parsed.
  function mask(value) {
    const id = `MATH${Math.random().toString(36).slice(2)}TOKEN`;
    const equations = [];
    const text = tokens(value).map((part) => {
      if (part.math === undefined) return part.text;
      equations.push(part.raw); return `${id}${equations.length - 1}END`;
    }).join('');
    return { text, restore: (text) => text.replace(new RegExp(`${id}(\\d+)END`, 'g'), (_, n) => equations[Number(n)]) };
  }
  function editor(textarea) {
    const box = document.createElement('div'); box.className = 'math-editor';
    const help = document.createElement('p'); help.className = 'math-help';
    help.textContent = '公式用 $…$（行内）或 $$…$$（独立一行）包住，也支持 \\(…\\) 与 \\[…\\]。';
    const tools = document.createElement('div'); tools.className = 'math-toolbar';
    const snippets = [ ['分式', String.raw`$\frac{a}{b}$`], ['根号', String.raw`$\sqrt{x+1}$`], ['上下标', String.raw`$x_i^{2}$`], ['分段函数', String.raw`$$f(x)=\begin{cases}x^2,&x<0\\x+1,&x\ge0\end{cases}$$`] ];
    const preview = document.createElement('details'); preview.className = 'math-preview-toggle';
    const label = document.createElement('summary'); label.textContent = '预览公式';
    const body = document.createElement('div'); body.className = 'math-preview';
    preview.append(label, body);
    const update = () => { if (preview.open) setText(body, textarea.value); };
    for (const [name, value] of snippets) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-plain'; button.textContent = name;
      button.onclick = () => { const start = textarea.selectionStart; textarea.setRangeText(value, start, textarea.selectionEnd, 'end'); textarea.focus(); preview.open = true; update(); textarea.dispatchEvent(new Event('input', { bubbles: true })); };
      tools.append(button);
    }
    textarea.addEventListener('input', update); preview.addEventListener('toggle', update);
    box.append(help, tools, preview); textarea.after(box);
  }
  return { tokens, html, render, setText, mask, editor };
});
