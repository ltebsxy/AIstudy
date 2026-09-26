const test = require('node:test');
const assert = require('node:assert/strict');
const math = require('../renderer/math');
const { normalizeCourse, renderSubmission } = require('../lib/model');

test('explicit math is rendered with accessible MathML, safely preserves invalid math and user text', () => {
  const text = String.raw`<img src=x onerror=bad()> $\frac{1}{\sqrt{x}}$ and \[x_i^2\]`;
  const result = math.html(text);
  assert.match(result, /katex-mathml/); assert.match(result, /mfrac/); assert.match(result, /msqrt/);
  assert.match(result, /&lt;img/); assert.doesNotMatch(result, /<img/);
  assert.match(math.html(String.raw`$\unknown{x}$`), /math-error/);
  assert.doesNotMatch(math.html(String.raw`$\href{javascript:bad()}{x}$`), /href=/);
  assert.equal(math.tokens('普通文字 x/y 和 $ 未完成').filter(t => t.math).length, 0);
  assert.equal(math.tokens(String.raw`代码: \$5 或 ` + '`$x$`').filter(t=>t.math).length, 0);
  const masked = math.mask('表格 $|x|$\n\\[\n\\frac{1}{2}\n\\]');
  assert(!masked.text.includes('|')); assert.equal(masked.restore(masked.text), '表格 $|x|$\n\\[\n\\frac{1}{2}\n\\]');
});

test('teacher export renders synthetic math and escapes unsafe content', () => {
  const fixture=normalizeCourse({title:'渲染测试',knowledge:'公式',questions:[{text:String.raw`$\frac{1}{\sqrt{x}}$ <script>bad()</script>`,grading:{answer:'$x=1$',criteria:[{points:1,text:'$1$'}]}}]});
  const html=renderSubmission(fixture,'today','answer.pdf');
  assert.match(html,/math\/katex.min.css/);assert.match(html,/katex-mathml/);assert.match(html,/msqrt/);assert.doesNotMatch(html,/<script/);
});
