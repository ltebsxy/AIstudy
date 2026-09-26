window.WriterQuestion=(()=>{
  const $=id=>document.getElementById(id);
  let course=null,index=0,values={},saveChain=Promise.resolve(),saveError=null,awaitingProgress=false;
  function load(next){course=next;index=0;values={};saveChain=Promise.resolve();saveError=null;awaitingProgress=true;render();}
  function render(){
    const root=$('canvas-question'),q=course?.questions[index];root.hidden=!q||course.sessionMode==='reading';if(root.hidden)return;
    $('question-number').textContent=`题目 ${index+1} / ${course.questions.length}`;
    const select=$('question-select');select.replaceChildren(...course.questions.map((q,i)=>new Option('第 '+(i+1)+' 题',i)));select.value=index;
    select.onchange=()=>window.dispatchEvent(new CustomEvent('writer-question-navigate',{detail:Number(select.value)}));
    StudyMath.setText($('question-text'),q.text||'');keepScoresTogether($('question-text')); $('question-image').hidden=!q.image;if(q.image)$('question-image').src=q.image;else $('question-image').removeAttribute('src');
    const response=$('question-response');response.replaceChildren();const value=values[index]||[];
    if(q.type==='choice')q.options.forEach((option,i)=>{
      const row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type=q.multiple?'checkbox':'radio';input.name='answer-option';input.value=i;input.checked=value.includes(i);text.textContent=String.fromCharCode(65+i)+'. '+option;StudyMath.render(text);row.append(input,text);response.append(row);
      input.onchange=()=>queue([...response.querySelectorAll('input:checked')].map(el=>Number(el.value)));
    });
    if(q.type==='blank')(q.blanks||['答案']).forEach((label,i)=>{
      const row=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input');text.textContent=label;input.type='text';input.className='blank-answer';input.setAttribute('aria-label',label);input.maxLength=5000;input.value=value[i]||'';row.append(text,input);response.append(row);input.oninput=()=>queue([...response.querySelectorAll('input')].map(el=>el.value));
    });
    $('response-status').textContent='';
  }
  // Keep small point labels together without changing the source or touching math markup.
  function keepScoresTogether(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('.math-expression,.math-error')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const matches=[...node.textContent.matchAll(/(?:（[ \t]*\d+(?:\.\d+)?[ \t]*分[ \t]*）|\([ \t]*\d+(?:\.\d+)?[ \t]*分[ \t]*\))/g)];if(!matches.length)continue;
      const fragment=document.createDocumentFragment();let offset=0;
      for(const match of matches){fragment.append(node.textContent.slice(offset,match.index));const span=document.createElement('span');span.className='question-score';span.textContent=match[0];fragment.append(span);offset=match.index+match[0].length;}
      fragment.append(node.textContent.slice(offset));node.replaceWith(fragment);
    }
  }
  function queue(value){
    const savedIndex=index,sessionId=course.sessionId;values[index]=value;
    saveChain=saveChain.then(()=>window.study.saveResponse({index:savedIndex,value,sessionId})).then(()=>{saveError=null;if(index===savedIndex)$('response-status').textContent='';},e=>{saveError=e;if(index===savedIndex)$('response-status').textContent=e.message;});
  }
  function progress(p){values={...(p.responses||{}),...values};if(index!==p.index||awaitingProgress){index=p.index;awaitingProgress=false;render();}}
  async function flush(){await saveChain;if(saveError)throw saveError;}
  function position(viewport){$('canvas-question').style.transform=`translate(${-viewport.x}px,${-viewport.y}px)`;}
  return {load,progress,flush,position};
})();
