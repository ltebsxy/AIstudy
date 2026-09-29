const image = document.getElementById('screen-image');
const selection = document.getElementById('selection');
const confirmButton = document.getElementById('confirm');
let start = null;
let rect = null;

function draw() {
  if (!rect) { selection.style.display = 'none'; confirmButton.disabled = true; return; }
  selection.style.display = 'block';
  selection.style.left = `${rect.x}px`;
  selection.style.top = `${rect.y}px`;
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;
  confirmButton.disabled = rect.width < 20 || rect.height < 20;
}

window.study.onCaptureImage((data) => { image.src = data; });
window.study.onCaptureQuestion((number) => { confirmButton.textContent = `保存第 ${number} 题并继续`; });
window.study.onCapturePurpose((purpose) => {
  if (purpose === 'chat' || purpose === 'programming-chat') {
    confirmButton.textContent = '加入 AI 输入';
    document.querySelector('.capture-toolbar strong').textContent = '框选要向 AI 提问的内容';
  }
});
document.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || event.target.closest('.capture-toolbar')) return;
  start = { x: event.clientX, y: event.clientY };
  rect = { x: start.x, y: start.y, width: 0, height: 0 };
  draw();
});
document.addEventListener('mousemove', (event) => {
  if (!start) return;
  const x = Math.min(start.x, event.clientX);
  const y = Math.min(start.y, event.clientY);
  rect = { x, y, width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) };
  draw();
});
document.addEventListener('mouseup', () => { start = null; });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.study.cancelCapture(); });
document.getElementById('cancel').onclick = () => window.study.cancelCapture();
confirmButton.onclick = async () => {
  if (!rect || confirmButton.disabled) return;
  confirmButton.disabled = true;
  try { await window.study.commitCapture(rect); }
  catch (error) { alert(error.message || String(error)); draw(); }
};
