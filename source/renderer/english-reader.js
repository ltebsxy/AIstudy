// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
window.EnglishReader=(()=>{
  const popup=document.getElementById('word-popup'),title=document.getElementById('word-title');
  const phonetic=document.getElementById('word-phonetic'),lemma=document.getElementById('word-lemma');
  const status=document.getElementById('word-status'),definitions=document.getElementById('word-definitions');
  const aiResult=document.getElementById('word-ai-result'),aiButton=document.getElementById('word-ai'),noteButton=document.getElementById('word-note');
  let revision=0,point={x:0,y:0},current=null;
  function close(){revision++;popup.hidden=true;current=null;window.dispatchEvent(new Event('english-selection-clear'));}
  function senseRow(sense){
    const row=document.createElement('li');
    if(sense.pos){const pos=document.createElement('span');pos.className='word-pos';pos.textContent=sense.pos;row.append(pos);}
    const meaning=document.createElement('span');meaning.textContent=sense.meaning;row.append(meaning);definitions.append(row);
  }
  function place(){
    const box=popup.getBoundingClientRect(),margin=8;
    const left=Math.max(margin,Math.min(point.x+12,innerWidth-box.width-margin));
    let top=point.y+12;if(top+box.height>innerHeight-margin)top=point.y-box.height-12;
    popup.style.left=left+'px';popup.style.top=Math.max(margin,Math.min(top,innerHeight-box.height-margin))+'px';
  }
  async function open(input){
    const version=++revision;popup.hidden=true;current=null;aiResult.hidden=true;aiResult.textContent='';aiButton.disabled=true;noteButton.disabled=true;
    try{
      const hit=await (input.text?{word:input.text}:input.hit??StudyReader.wordAt(input.page,input.x,input.y));
      if(version!==revision||!hit)return;
      current={sessionId:input.sessionId,text:hit.word};aiButton.disabled=false;
      window.dispatchEvent(new CustomEvent('english-selection',{detail:{sessionId:input.sessionId,page:input.page,items:hit.items||[]}}));
      point={x:input.clientX,y:input.clientY};title.textContent=hit.word;phonetic.textContent='';lemma.textContent='';
      definitions.replaceChildren();status.textContent='正在查询本地词库…';popup.hidden=false;place();
      const result=await window.study.lookupEnglishWord({sessionId:input.sessionId,word:hit.word});
      if(version!==revision)return;
      status.textContent=result.found?'':result.parts?'未收录整个短语，以下为分段释义，非整句翻译。':'本地词库暂未收录这个词。';
      if(result.found){
        phonetic.textContent=result.phonetic?`/${result.phonetic}/`:'';
        lemma.textContent=result.lemma!==result.word?'词库形式：'+result.lemma:'';
        for(const sense of result.senses)senseRow(sense);
      }else if(result.parts){
        for(const part of result.parts){
          const label=document.createElement('li');label.className='word-part';label.textContent=part.word;definitions.append(label);
          for(const sense of part.found?part.senses.slice(0,3):[{meaning:'本地词库暂未收录。'}])senseRow(sense);
        }
      }else if(result.suggestions?.length){
        const row=document.createElement('li');row.className='word-suggestions';row.append('你是否想查：');
        for(const suggestion of result.suggestions){const button=document.createElement('button');button.textContent=suggestion;button.onclick=()=>open({...input,text:suggestion});row.append(button);}definitions.append(row);
      }
      noteButton.disabled=false;place();
    }catch(error){
      if(version!==revision)return;
      if(popup.hidden){point={x:input.clientX,y:input.clientY};title.textContent='单词与短语释义';definitions.replaceChildren();phonetic.textContent='';lemma.textContent='';popup.hidden=false;}
      status.textContent=(error?.message||String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');noteButton.disabled=!current;place();
    }
  }
  aiButton.onclick=async()=>{
    if(!current)return;const version=revision,input={...current};aiButton.disabled=true;status.textContent='AI 翻译中…';place();
    try{const text=await window.study.translateEnglish(input);if(version!==revision)return;aiResult.textContent=text;aiResult.hidden=false;status.textContent='AI 翻译';place();}
    catch(error){if(version===revision){status.textContent=(error.message||String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');place();}}
    finally{if(version===revision)aiButton.disabled=false;}
  };
  noteButton.onclick=async()=>{
    if(!current)return;const version=revision;noteButton.disabled=true;
    const text=[current.text,phonetic.textContent,lemma.textContent,definitions.innerText,...(!aiResult.hidden?['AI 翻译：'+aiResult.textContent]:[])].filter(Boolean).join('\n');
    try{const note=await window.study.addReadingNote({sessionId:current.sessionId,text});if(version!==revision)return;status.textContent='已加入「'+note.name+'」';place();}
    catch(error){if(version===revision){status.textContent=(error.message||String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');place();}}
    finally{if(version===revision)noteButton.disabled=false;}
  };
  document.getElementById('word-close').onclick=close;
  document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target))close();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  window.addEventListener('resize',close);
  return {open,close};
})();
