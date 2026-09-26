if(new URLSearchParams(location.search).has('embedded')){
  document.documentElement.classList.add('embedded-chat');
  if(!window.study)window.study=parent.study;
}
