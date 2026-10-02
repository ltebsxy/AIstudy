// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReaderWords=api;})(globalThis,()=>{
  function sentence(text,index,length){
    const before=text.slice(0,index),after=text.slice(index+length);
    const left=Math.max(before.lastIndexOf('.'),before.lastIndexOf('!'),before.lastIndexOf('?'),before.lastIndexOf('\n'))+1;
    const stop=after.search(/[.!?\n]/),right=stop<0?text.length:index+length+stop+1;
    return text.slice(Math.max(left,index-240),Math.min(right,index+length+240)).trim();
  }
  function words(run,measure){
    const full=run.context??run.text,offset=run.offset||0;
    const measured=measure(run.text)||1,scale=run.width==null?1:run.width/measured;
    return [...run.text.matchAll(/[A-Za-z]+(?:['’\u2010-\u2013-][A-Za-z]+)*/g)].map(match=>({
      word:match[0].replaceAll('’',"'").replace(/[\u2010-\u2013]/g,'-'),
      context:sentence(full,offset+match.index,match[0].length),
      x:run.x,y:run.y,angle:run.angle||0,top:-(run.ascent||0),height:run.height,
      start:measure(run.text.slice(0,match.index))*scale,
      end:measure(run.text.slice(0,match.index+match[0].length))*scale,
    }));
  }
  function hit(items,x,y){
    for(const item of items){
      const cos=Math.cos(item.angle),sin=Math.sin(item.angle),dx=x-item.x,dy=y-item.y;
      const along=dx*cos+dy*sin,down=-dx*sin+dy*cos;
      if(along>=item.start&&along<=item.end&&down>=item.top&&down<=item.top+item.height)return {word:item.word,context:item.context};
    }
    return null;
  }
  return {words,hit,sentence};
});
