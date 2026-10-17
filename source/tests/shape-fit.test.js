const test=require('node:test'),assert=require('node:assert/strict'),Shapes=require('../renderer/shape-fit'),Board=require('../renderer/board-model');
const pen=points=>({tool:'pen',color:'#253445',width:3,points:points.map(([x,y])=>({x,y,p:.5}))});
test('recognizes simple noisy lines and closed ellipses, retains uncertain strokes',()=>{
  const line=pen(Array.from({length:60},(_,i)=>[i*3,20+Math.sin(i)*1.2]));assert.equal(Shapes.fit(line).shape,'直线');assert.equal(line.points.length,60);
  for(const ry of [60,90]){const ellipse=pen(Array.from({length:120},(_,i)=>{const t=i*2*Math.PI/119;return [100+(60+Math.sin(i)*.7)*Math.cos(t),100+ry*Math.sin(t)];}));assert.equal(Shapes.fit(ellipse).shape,ry===60?'圆':'椭圆');}
  assert.equal(Shapes.fit(pen(Array.from({length:40},(_,i)=>[i*3,Math.sin(i)*30]))),null);
  assert.equal(Shapes.fit(pen([[0,0],[5,0],[8,1],[10,2],[12,0]])),null);
  assert.equal(Shapes.fit({...line,tool:'eraser'}),null);
});
test('typed canvas text survives normalization and rejects malformed stored data',()=>{
  const text={id:'one',x:200,y:300,width:400,size:26,color:'#253445',text:'中文\nEnglish'};
  assert.deepEqual(Board.normalize({texts:[text]}).texts,[text]);
  assert.deepEqual(Board.normalize({}).texts,[]);
  assert.throws(()=>Board.normalize({texts:[{...text,x:Infinity}]}),/文字/);
});
test('diagnostics explain sparse/distorted input without changing recognition or mutating strokes',()=>{
 const line=pen(Array.from({length:31},(_,i)=>[i*8,600+Math.sin(i)]));
 const sparse=pen([[0,0],[80,0],[160,0],[240,0]]),distorted=structuredClone(line);distorted.points.splice(15,0,{x:-300,y:80,p:.5});
 assert.equal(Shapes.explain(sparse).reason,'too-few-raw-points');assert.equal(Shapes.explain(sparse).rawCount,4);
 assert.equal(Shapes.explain(distorted).shape,null);assert(Shapes.explain(distorted).lengthRatio>1.12);
 for(const stroke of [line,sparse,distorted]){const before=structuredClone(stroke);let detail;const result=Shapes.fit(stroke,value=>detail=value);assert.deepEqual(result,Shapes.fit(stroke));assert.deepEqual(Shapes.explain(stroke),detail);assert.deepEqual(stroke,before);}
});
