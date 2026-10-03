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
      source:full,offset:offset+match.index,length:match[0].length,
      context:sentence(full,offset+match.index,match[0].length),
      x:run.x,y:run.y,angle:run.angle||0,top:-(run.ascent||0),height:run.height,
      start:measure(run.text.slice(0,match.index))*scale,
      end:measure(run.text.slice(0,match.index+match[0].length))*scale,
    }));
  }
  function hitIndex(items,x,y){
    for(const [index,item] of items.entries()){
      const cos=Math.cos(item.angle),sin=Math.sin(item.angle),dx=x-item.x,dy=y-item.y;
      const along=dx*cos+dy*sin,down=-dx*sin+dy*cos;
      if(along>=item.start&&along<=item.end&&down>=item.top&&down<=item.top+item.height)return index;
    }
    return -1;
  }
  function hit(items,x,y){const index=hitIndex(items,x,y);return index<0?null:{word:items[index].word,context:items[index].context};}
  function nearest(items,x,y){
    let best=-1,distance=Infinity;
    for(const [index,item] of items.entries()){
      const cos=Math.cos(item.angle),sin=Math.sin(item.angle),dx=x-item.x,dy=y-item.y,along=dx*cos+dy*sin,down=-dx*sin+dy*cos;
      const d=Math.hypot(Math.max(item.start-along,0,along-item.end),Math.max(item.top-down,0,down-item.top-item.height));
      if(d<distance){distance=d;best=index;}
    }
    return distance<=70?best:-1;
  }
  function range(items,start,end){
    if(start<0||end<0)return null;
    const first=Math.min(start,end),last=Math.max(start,end),selected=items.slice(first,last+1);
    if(!selected.length)return null;
    const a=selected[0],b=selected.at(-1),text=a.source===b.source?a.source.slice(a.offset,b.offset+b.length).replace(/\s+/g,' ').trim():selected.map(item=>item.word).join(' ');
    return {word:text,context:a.context,items:selected};
  }
  return {words,hit,hitIndex,nearest,range,sentence};
});
