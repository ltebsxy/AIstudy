// SPDX-License-Identifier: GPL-3.0-only
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyShapes=api;})(globalThis,()=>{
  // Resample by distance so a slow corner or a held pen does not bias the fit.
  function sample(raw){const p=[raw[0]];for(let i=1;i<raw.length;i++){const a=p.at(-1),b=raw[i],d=Math.hypot(b.x-a.x,b.y-a.y);if(d>=2){const n=Math.min(20,Math.ceil(d/3));for(let j=1;j<=n;j++)p.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});}}return p;}
  function fit(stroke,report){
    const metrics={rawCount:stroke.points.length};
    const finish=(result,reason)=>{if(report)report({reason,shape:result?.shape||null,...metrics});return result;};
    if(stroke.tool!=='pen')return finish(null,'not-pen');
    if(stroke.points.length<5)return finish(null,'too-few-raw-points');
    const step=Math.max(1,Math.ceil(stroke.points.length/4000)),raw=stroke.points.filter((_,i)=>i%step===0);if(raw.at(-1)!==stroke.points.at(-1))raw.push(stroke.points.at(-1));const p=sample(raw);metrics.sampleCount=p.length;metrics.step=step;if(p.length<8)return finish(null,'too-few-spaced-points');
    const a=p[0],b=p.at(-1),length=p.slice(1).reduce((s,q,i)=>s+Math.hypot(q.x-p[i].x,q.y-p[i].y),0),chord=Math.hypot(b.x-a.x,b.y-a.y);
    const pressure=.5,point=(x,y)=>({x,y,p:pressure});
    Object.assign(metrics,{length,chord,lengthRatio:length/chord,lineEligible:chord>=50&&length/chord<1.12});
    if(chord>=50&&length/chord<1.12){
      const error=Math.sqrt(p.reduce((s,q)=>s+((q.x-a.x)*(b.y-a.y)-(q.y-a.y)*(b.x-a.x))**2,0)/p.length)/chord;
      Object.assign(metrics,{lineError:error,lineLimit:Math.max(2,chord*.018)});
      if(error<Math.max(2,chord*.018))return finish({...stroke,points:[point(a.x,a.y),point(b.x,b.y)],shape:'直线'},'accepted-line');
    }
    const xs=p.map(q=>q.x),ys=p.map(q=>q.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),rx=(right-left)/2,ry=(bottom-top)/2;
    Object.assign(metrics,{rx,ry});
    if(Math.min(rx,ry)<22)return finish(null,'ellipse-too-small');
    if(chord>Math.max(rx,ry)*.3)return finish(null,'ellipse-not-closed');
    const cx=(left+right)/2,cy=(top+bottom)/2,radial=p.map(q=>Math.hypot((q.x-cx)/rx,(q.y-cy)/ry));
    const error=Math.sqrt(radial.reduce((s,r)=>s+(r-1)**2,0)/radial.length);
    let winding=0,travel=0;
    for(let i=1;i<p.length;i++){let d=Math.atan2((p[i].y-cy)/ry,(p[i].x-cx)/rx)-Math.atan2((p[i-1].y-cy)/ry,(p[i-1].x-cx)/rx);d=Math.atan2(Math.sin(d),Math.cos(d));winding+=d;travel+=Math.abs(d);}
    Object.assign(metrics,{radialError:error,winding,travel});
    if(error>.075)return finish(null,'ellipse-radial-error');
    if(Math.abs(winding)<5.5||Math.abs(winding)>7)return finish(null,'ellipse-winding');
    if(travel>7.8)return finish(null,'ellipse-backtracking');
    const circle=Math.abs(rx-ry)/Math.max(rx,ry)<.14,r=circle?(rx+ry)/2:rx,s=circle?r:ry,start=Math.atan2((a.y-cy)/ry,(a.x-cx)/rx),direction=Math.sign(winding);
    return finish({...stroke,shape:circle?'圆':'椭圆',points:Array.from({length:129},(_,i)=>{const t=start+direction*2*Math.PI*i/128;return point(cx+r*Math.cos(t),cy+s*Math.sin(t));})},'accepted-ellipse');
  }
  function explain(stroke){let explanation;fit(stroke,result=>explanation=result);return explanation;}
  return {fit,explain};
});
