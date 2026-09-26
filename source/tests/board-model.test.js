const test=require('node:test'),assert=require('node:assert/strict');
const Board=require('../renderer/board-model');
const {normalizeWriterDocument}=require('../lib/exercise-session');
const {normalizeReadingAnnotations}=require('../lib/reading-document');
const pen={tool:'pen',color:'#253445',width:3,points:[{x:100,y:200,p:.5}]};
test('continuous coordinates survive negative and distant positions without a page height',()=>{
  const board=Board.normalize({strokes:[{...pen,points:[{x:3000,y:-80000,p:.4},{x:200,y:250000,p:.6}]}],viewport:{x:2400,y:-200000}});
  assert.deepEqual(normalizeWriterDocument({pages:[{strokes:[],board}]}).pages[0].board,board);
  assert.deepEqual(normalizeReadingAnnotations({workspace:board}).workspace,board);
  assert.throws(()=>Board.normalize({viewport:{y:NaN}}),/位置/);
});
test('legacy document annotations stay anchored under file size and spacing changes; blank notes remain free',()=>{
  const board=Board.migrate({pages:[null,{strokes:[pen]}],notes:[{strokes:[pen]}]},true,600);
  assert.equal(board.strokes[0].anchor,1);assert.equal(board.strokes[1].anchor,undefined);
  const small=Board.worldPoint(pen.points[0],board.strokes[0],board.file);
  board.file.width=1000;board.file.left=80;board.file.gap=40;
  const large=Board.worldPoint(pen.points[0],board.strokes[0],board.file);
  assert.equal(large.x,180);assert.equal(large.y,1640);assert.notEqual(small.y,large.y);
  assert.deepEqual(Board.localPoint(large,1,board.file),pen.points[0]);
  const free=board.strokes[1].points[0];assert.deepEqual(Board.worldPoint(free,board.strokes[1],board.file),free);
  assert.deepEqual(Board.migrate({workspace:board},true),board);
});
