// SPDX-License-Identifier: GPL-3.0-only
(() => {
  const embedded=window.parent!==window&&window.parent.StudyTheme;
  let state=embedded?parent.StudyTheme.state:window.study.themeSnapshot();
  function apply(next) {
    state=next;
    document.documentElement.dataset.theme=state.dark?'dark':'light';
    document.documentElement.dataset.themeMode=state.mode;
    window.dispatchEvent(new CustomEvent('study-theme-changed',{detail:state}));
  }
  window.StudyTheme={get state(){return {...state};},get dark(){return state.dark;}};
  apply(state);
  if(embedded){
    const listener=event=>apply(event.detail);parent.addEventListener('study-theme-changed',listener);
    window.addEventListener('unload',()=>parent.removeEventListener('study-theme-changed',listener),{once:true});
  }else{
    const unsubscribe=window.study.onTheme(apply);
    window.addEventListener('unload',unsubscribe,{once:true});
  }
})();
