(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyInk=api;})(globalThis,()=>{
  const cache=new WeakMap();
  function geometry(stroke){
    const old=cache.get(stroke);if(old?.length===stroke.points.length)return old;
    const raw=stroke.points,points=[];let pressure=raw[0]?.p??.5;
    for(const p of raw){pressure+=(Math.max(.05,p.p??.5)-pressure)*.28;const last=points.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.15)points.push({x:p.x,y:p.y,r:stroke.width*(.5+pressure)/2});}
    const samples=[];
    // Midpoint quadratics smooth the sampled path; pressure is interpolated along it.
    if(points.length<3)samples.push(...points);
    else{
      samples.push(points[0]);let start=points[0];
      for(let i=1;i<points.length;i++){
        const control=points[i],next=points[i+1],end=next?{x:(control.x+next.x)/2,y:(control.y+next.y)/2,r:(control.r+next.r)/2}:control;
        const steps=Math.max(2,Math.min(64,Math.ceil((Math.hypot(control.x-start.x,control.y-start.y)+Math.hypot(end.x-control.x,end.y-control.y))/2)));
        for(let j=1;j<=steps;j++){const t=j/steps,u=1-t;samples.push({x:u*u*start.x+2*u*t*control.x+t*t*end.x,y:u*u*start.y+2*u*t*control.y+t*t*end.y,r:start.r+(end.r-start.r)*t});}
        start=end;
      }
    }
    const left=[],right=[];let nx=0,ny=1,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let i=0;i<samples.length;i++){
      const p=samples[i],before=samples[Math.max(0,i-1)],after=samples[Math.min(samples.length-1,i+1)],length=Math.hypot(after.x-before.x,after.y-before.y);
      if(length>.0001){nx=-(after.y-before.y)/length;ny=(after.x-before.x)/length;}
      const radius=stroke.tool==='pen'?p.r:stroke.width/2;
      left.push({x:p.x+nx*radius,y:p.y+ny*radius});right.push({x:p.x-nx*radius,y:p.y-ny*radius});
      minX=Math.min(minX,p.x-radius);maxX=Math.max(maxX,p.x+radius);minY=Math.min(minY,p.y-radius);maxY=Math.max(maxY,p.y+radius);
    }
    const result={length:raw.length,samples,left,right,bounds:{minX,maxX,minY,maxY}};cache.set(stroke,result);return result;
  }
  function paint(ctx,stroke,g=geometry(stroke),color=stroke.color){
    if(!g.samples.length)return;
    ctx.fillStyle=ctx.strokeStyle=color;ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
    ctx.globalAlpha=stroke.tool==='highlighter'?.3:1;
    if(stroke.tool!=='pen'){
      ctx.lineCap=ctx.lineJoin='round';ctx.lineWidth=stroke.width;ctx.beginPath();g.samples.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      if(g.samples.length===1)ctx.lineTo(g.samples[0].x+.01,g.samples[0].y);ctx.stroke();return;
    }
    ctx.beginPath();g.left.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));for(let i=g.right.length-1;i>=0;i--)ctx.lineTo(g.right[i].x,g.right[i].y);ctx.closePath();ctx.fill();
    for(const p of [g.samples[0],g.samples.at(-1)]){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
  }
  return {geometry,paint};
});
