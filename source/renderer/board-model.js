(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyBoard=api;})(globalThis,()=>{
  const finite=n=>Number.isFinite(n)&&Math.abs(n)<=1e12;
  function normalize(raw={}) {
    const file={width:720,left:48,gap:24,...raw.file},viewport={x:0,y:-16,...raw.viewport};
    if(!finite(file.width)||file.width<200||file.width>1600||!finite(file.left)||file.left<0||file.left>800||!finite(file.gap)||file.gap<0||file.gap>200)throw new Error('文件显示设置无效。');
    if(!finite(viewport.x)||viewport.x<0||!finite(viewport.y))throw new Error('画布位置无效。');
    if(!Array.isArray(raw.strokes??[])||(raw.strokes?.length||0)>100000)throw new Error('笔迹数量无效。');
    let count=0;
    const strokes=(raw.strokes||[]).map(s=>{
      if(!s||!['pen','eraser','highlighter'].includes(s.tool)||!/^#[0-9a-f]{6}$/i.test(s.color)||!finite(s.width)||s.width<=0||s.width>500||!Array.isArray(s.points)||!s.points.length)throw new Error('笔迹格式无效。');
      if(s.anchor!=null&&(!Number.isInteger(s.anchor)||s.anchor<0||s.anchor>=5000))throw new Error('文件批注位置无效。');
      count+=s.points.length;if(count>3000000)throw new Error('笔迹数据过大，请备份后清理。');
      return {tool:s.tool,color:s.color,width:s.width,...(s.anchor!=null?{anchor:s.anchor}:{}),points:s.points.map(p=>{
        if(!p||!finite(p.x)||!finite(p.y)||(p.p!=null&&(!finite(p.p)||p.p<0||p.p>1)))throw new Error('笔迹坐标无效。');
        return {x:p.x,y:p.y,p:p.p??.5};
      })};
    });
    let extent;
    if(raw.extent){const {top,bottom,right}=raw.extent;if(!finite(top)||!finite(bottom)||!finite(right)||bottom<=top||right<=0)throw new Error('画布范围无效。');extent={top,bottom,right};}
    return {version:2,...(extent?{extent}:{}),file:{width:file.width,left:file.left,gap:file.gap},viewport:{x:viewport.x,y:viewport.y},strokes};
  }
  function rect(file,index){return {x:file.left,y:index*(file.width*1.4+file.gap),width:file.width,height:file.width*1.4};}
  function worldPoint(point,stroke,file){if(stroke.anchor==null)return point;const r=rect(file,stroke.anchor),scale=file.width/1000;return {x:r.x+point.x*scale,y:r.y+point.y*scale,p:point.p};}
  function localPoint(point,anchor,file){if(anchor==null)return point;const r=rect(file,anchor),scale=file.width/1000;return {x:(point.x-r.x)/scale,y:(point.y-r.y)/scale,p:point.p};}
  function migrate(stored,reading,width=720){
    if(reading&&stored.workspace)return normalize(stored.workspace);
    if(!reading&&stored.board)return normalize(stored.board);
    const board=normalize({file:{width}});
    if(reading){
      for(const [i,page] of (stored.pages||[]).entries())for(const s of page?.strokes||[])board.strokes.push({...s,anchor:i});
      let y=0;for(const page of stored.notes||[]){for(const s of page?.strokes||[])board.strokes.push({...s,points:s.points.map(p=>({...p,x:p.x+width+96,y:p.y+y}))});y+=page?.height||1400;}
      board.viewport.y=(stored.positions?.document||0)*(width*1.4+24)-16;
      if(stored.view==='notes'){board.viewport.x=width+48;board.viewport.y=(stored.notes||[]).slice(0,stored.positions?.notes||0).reduce((n,p)=>n+(p?.height||1400),0);}
    }else board.strokes=structuredClone(stored.strokes||[]);
    return normalize(board);
  }
  return {normalize,rect,worldPoint,localPoint,migrate};
});
