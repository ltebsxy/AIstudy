// SPDX-License-Identifier: GPL-3.0-only
import {expandBounds} from './core.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export class Ink {
  constructor({viewport,scroll,canvas,paper,content,onChange}){
    Object.assign(this,{viewport,scroll,canvas,paper,content,onChange});this.tool='hand';this.color='#263c32';this.width=2.5;this.strokes=[];this.undoStack=[];this.redoStack=[];this.minY=0;this.maxY=0;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(viewport);this.resizeObserver.observe(content);
    scroll.addEventListener('scroll',()=>this.draw(),{passive:true});
    canvas.addEventListener('pointerdown',e=>this.down(e));canvas.addEventListener('pointermove',e=>this.move(e));canvas.addEventListener('pointerup',e=>this.end(e));canvas.addEventListener('pointercancel',e=>this.end(e));canvas.addEventListener('lostpointercapture',e=>this.end(e));
  }
  load(data={}){this.end();this.strokes=data.strokes??[];this.undoStack=[];this.redoStack=[];this.minY=data.minY??0;this.maxY=data.maxY??0;this.scroll.scrollTop=0;this.resize();}
  data(){return {strokes:clone(this.strokes),minY:this.minY,maxY:this.maxY,scroll:this.scroll.scrollTop};}
  resize(){
    const rect=this.viewport.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const ratio=Math.min(devicePixelRatio||1,3);this.canvas.width=Math.ceil(rect.width*ratio);this.canvas.height=Math.ceil(rect.height*ratio);this.canvas.style.width=rect.width+'px';this.canvas.style.height=rect.height+'px';this.ctx=this.canvas.getContext('2d');this.ctx.setTransform(ratio,0,0,ratio,0,0);
    this.maxY=Math.max(this.maxY,rect.height,this.content.offsetHeight);this.layout();this.draw();
  }
  layout(){this.paper.style.paddingTop=-this.minY+'px';this.paper.style.minHeight=Math.max(this.viewport.clientHeight,this.maxY-this.minY)+'px';}
  point(e){const r=this.viewport.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:e.clientY-r.top+this.scroll.scrollTop+this.minY,p:e.pointerType==='pen'?Math.max(.08,e.pressure||.4):.5};}
  down(e){
    if(this.pointer!==undefined||e.isPrimary===false||!['pen','marker','eraser'].includes(this.tool))return;
    e.preventDefault();this.pointer=e.pointerId;this.canvas.setPointerCapture(e.pointerId);this.before=clone(this.strokes);this.redoStack=[];
    if(this.tool==='eraser'){this.erase(this.point(e));return;}
    this.current={tool:this.tool,color:this.color,width:this.tool==='marker'?this.width*5:this.width,points:[this.point(e)]};this.strokes.push(this.current);this.extend(this.current.points[0]);this.draw();this.onChange();
  }
  move(e){
    if(this.pointer!==e.pointerId)return;e.preventDefault();
    if(this.tool==='eraser'){this.erase(this.point(e));return;}
    const events=e.getCoalescedEvents?.()??[e];
    for(const event of events){const point=this.point(event),last=this.current.points.at(-1);if(Math.hypot((point.x-last.x)*this.viewport.clientWidth,point.y-last.y)>.4){this.current.points.push(point);this.extend(point);}}
    this.draw();this.onChange();
  }
  extend(point){const next=expandBounds(this,point.y,this.viewport.clientHeight,this.tool);if(next.minY!==this.minY||next.maxY!==this.maxY){this.minY=next.minY;this.maxY=next.maxY;this.layout();if(next.shift)this.scroll.scrollTop+=next.shift;}}
  erase(point){
    const width=this.viewport.clientWidth,p={x:point.x*width,y:point.y};const before=this.strokes.length;
    this.strokes=this.strokes.filter(stroke=>{const points=stroke.points.map(a=>({x:a.x*width,y:a.y}));return !points.some((a,i)=>i?segmentDistance(p,points[i-1],a)<14:Math.hypot(p.x-a.x,p.y-a.y)<14);});
    if(before!==this.strokes.length){this.draw();this.onChange();}
  }
  end(e){if(this.pointer===undefined||e&&e.pointerId!==this.pointer)return;const pointer=this.pointer;this.pointer=undefined;if(this.canvas.hasPointerCapture(pointer))this.canvas.releasePointerCapture(pointer);if(JSON.stringify(this.before)!==JSON.stringify(this.strokes)){this.undoStack.push(this.before);if(this.undoStack.length>40)this.undoStack.shift();}this.current=null;this.onChange(true);}
  setTool(tool){this.end();this.tool=tool;document.querySelector('#reader').dataset.tool=tool;}
  undo(){this.end();if(this.undoStack.length){this.redoStack.push(clone(this.strokes));this.strokes=this.undoStack.pop();this.draw();this.onChange(true);}}
  redo(){this.end();if(this.redoStack.length){this.undoStack.push(clone(this.strokes));this.strokes=this.redoStack.pop();this.draw();this.onChange(true);}}
  draw(){
    if(!this.ctx)return;const ctx=this.ctx,width=this.viewport.clientWidth,height=this.viewport.clientHeight,offset=this.scroll.scrollTop+this.minY;ctx.clearRect(0,0,width,height);
    for(const s of this.strokes){
      if(!s.points.some(p=>p.y>=offset-100&&p.y<=offset+height+100)&&!s.points.some((p,i)=>i&&Math.min(p.y,s.points[i-1].y)<=offset+height&&Math.max(p.y,s.points[i-1].y)>=offset))continue;
      const dark=document.documentElement.dataset.theme==='dark';const color=dark&&['#263c32','#000000','#1b1b1b'].includes(s.color.toLowerCase())?'#e4ece6':s.color;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=s.tool==='marker'?.28:1;
      const p=s.points.map(p=>({x:p.x*width,y:p.y-offset,p:p.p}));
      if(p.length===1){ctx.beginPath();ctx.arc(p[0].x,p[0].y,s.width*.5,0,Math.PI*2);ctx.fill();continue;}
      if(s.tool==='marker'){ctx.lineWidth=s.width;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++){const next=p[i+1]??p[i];ctx.quadraticCurveTo(p[i].x,p[i].y,(p[i].x+next.x)/2,(p[i].y+next.y)/2);}ctx.stroke();}
      else for(let i=1;i<p.length;i++){
        const previous=p[i-1],current=p[i],next=p[i+1]??current;const start=i===1?previous:{x:(previous.x+p[i-2].x)/2,y:(previous.y+p[i-2].y)/2};
        ctx.lineWidth=s.width*(.4+(previous.p+current.p)*.6);ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(previous.x,previous.y,(previous.x+current.x)/2,(previous.y+current.y)/2);ctx.stroke();
        if(i===p.length-1){ctx.beginPath();ctx.moveTo((previous.x+current.x)/2,(previous.y+current.y)/2);ctx.quadraticCurveTo(current.x,current.y,(current.x+next.x)/2,(current.y+next.y)/2);ctx.stroke();}
      }
    }ctx.globalAlpha=1;
  }
  thumbnail(){
    const saved=this.scroll.scrollTop;this.scroll.scrollTop=0;this.draw();const output=this.canvas.toDataURL('image/png');this.scroll.scrollTop=saved;this.draw();return output;
  }
}
