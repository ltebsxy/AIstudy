const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {WriterLifecycle}=require('../lib/writer-lifecycle');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(timeout=1000){
 const ipcMain=new EventEmitter(),sender=new EventEmitter(),messages=[],errors=[];
 sender.isDestroyed=()=>false;sender.send=(channel,data)=>messages.push({channel,data});
 const manager=new WriterLifecycle({ipcMain,current:()=>({window:{isDestroyed:()=>false,webContents:sender},sessionId:'one'}),report:error=>errors.push(error),timeout});
 const reply=error=>{const {token,sessionId}=messages.findLast(m=>m.channel==='writer:flush').data;ipcMain.emit('writer:flushed',{sender},{token,sessionId,error});};
 return {ipcMain,sender,messages,errors,manager,reply};
}
test('transitions serialize and wait for the matching sender/session/token',async()=>{
 const f=fixture(),done=[];const first=f.manager.run(()=>done.push(1)),second=f.manager.run(()=>done.push(2));await tick();
 const {data}=f.messages[0];
 f.ipcMain.emit('writer:flushed',{sender:{}},data);f.ipcMain.emit('writer:flushed',{sender:f.sender},{...data,sessionId:'old'});f.ipcMain.emit('writer:flushed',{sender:f.sender},{...data,token:'old'});
 await tick();assert.deepEqual(done,[]);f.reply();await first;await tick();assert.deepEqual(done,[1]);f.reply();await second;
 assert.deepEqual(done,[1,2]);assert.equal(f.manager.pending.size,0);assert.equal(f.sender.listenerCount('destroyed'),0);
});
test('failed save blocks the action and permits a later retry',async()=>{
 const f=fixture();let changed=false;const failed=assert.rejects(f.manager.run(()=>changed=true),/disk failed/);await tick();f.reply('disk failed');await failed;assert.equal(changed,false);
 const retry=f.manager.run(()=>changed=true);await tick();f.reply();await retry;assert.equal(changed,true);assert.equal(f.errors.length,1);
});
test('send failure clears pending requests and listeners',async()=>{
 const f=fixture();f.sender.send=channel=>{if(channel==='writer:flush')throw Error('send failed');};
 await assert.rejects(f.manager.run(()=>assert.fail('must not leave')),/send failed/);assert.equal(f.manager.pending.size,0);assert.equal(f.sender.listenerCount('destroyed'),0);
});
test('timeout and destroyed renderer never authorize leaving',async()=>{
 const f=fixture(20);await assert.rejects(f.manager.run(()=>assert.fail('must not leave')),/保存未完成/);assert.equal(f.manager.pending.size,0);
 const g=fixture();const stopped=assert.rejects(g.manager.run(()=>assert.fail('must not leave')),/意外关闭/);await tick();g.sender.emit('destroyed');await stopped;assert.equal(g.manager.pending.size,0);
});
