const test=require('node:test'),assert=require('node:assert/strict');
const {geometry}=require('../renderer/ink');
test('smooth ink rounds sampled corners, preserves endpoints and interpolates sudden pressure changes',()=>{
  const s={tool:'pen',width:4,points:[{x:0,y:0,p:.1},{x:20,y:0,p:1},{x:20,y:20,p:1},{x:40,y:20,p:.1}]};
  const g=geometry(s);
  assert(g.samples.length>s.points.length);assert.deepEqual([g.samples[0].x,g.samples[0].y],[0,0]);assert.deepEqual([g.samples.at(-1).x,g.samples.at(-1).y],[40,20]);
  assert(g.samples.some(p=>p.x>0&&p.x<20&&p.y>0));
  for(const p of [...g.samples,...g.left,...g.right])assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert(g.samples.every(p=>p.r<3));assert.equal(geometry(s),g);
  s.points.push({x:50,y:30,p:.5});assert.notEqual(geometry(s),g);
});
test('dots and repeated stylus samples produce finite smooth geometry',()=>{
  const g=geometry({tool:'pen',width:3,points:[{x:4,y:7,p:0},{x:4,y:7,p:1}]});
  assert.equal(g.samples.length,1);assert(g.samples[0].r>0);assert(Number.isFinite(g.bounds.minX));
});
