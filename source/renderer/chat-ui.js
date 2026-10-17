// SPDX-License-Identifier: GPL-3.0-only
window.StudyChat=(()=>{
  function sendIcon(busy){return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${busy?'<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>':'<path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'}</svg>`;}
  function sendState(button,busy){button.innerHTML=sendIcon(busy);button.title=busy?'停止等待':'发送';button.setAttribute('aria-label',button.title);}
  function enterToSend(event,send){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}}
  function transition(panel,visible){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return null;return panel.animate(visible?[{opacity:0,transform:'scale(.985)'},{opacity:1,transform:'none'}]:[{opacity:1,transform:'none'},{opacity:0,transform:'scale(.985)'}],{duration:visible?120:100,easing:'ease-out'});}
  return {sendIcon,sendState,enterToSend,transition};
})();
