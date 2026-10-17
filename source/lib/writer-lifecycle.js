// SPDX-License-Identifier: GPL-3.0-only
const {randomUUID}=require('node:crypto');
// Serialize transitions, not save IPCs: the renderer must remain able to finish its writes.
class WriterLifecycle{
  constructor({ipcMain,current,report,timeout=15000}){this.current=current;this.report=report;this.timeout=timeout;this.queue=Promise.resolve();this.pending=new Map();
    ipcMain.on('writer:flushed',(event,result)=>{const request=this.pending.get(result?.token);if(!request||event.sender!==request.sender||result.sessionId!==request.sessionId)return;result.error?request.reject(new Error(result.error)):request.resolve();});
  }
  run(action){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      const {window,sessionId}=this.current(),sender=window&&!window.isDestroyed()?window.webContents:null;let token;
      try{
        if(sender){token=randomUUID();await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>this.pending.get(token)?.reject(new Error('保存未完成，已保留当前窗口。请重试。')),this.timeout);
          const closed=()=>this.pending.get(token)?.reject(new Error('写字窗口意外关闭，无法确认保存。'));
          const done=fn=>value=>{clearTimeout(timer);sender.removeListener('destroyed',closed);this.pending.delete(token);fn(value);};
          this.pending.set(token,{sender,sessionId,resolve:done(resolve),reject:done(reject)});
          sender.once('destroyed',closed);
          try{sender.send('writer:flush',{token,sessionId});}catch(error){this.pending.get(token)?.reject(error);}
        });}
        return await action();
      }catch(error){this.report(error,window);throw error;}
      finally{if(token&&!sender.isDestroyed())sender.send('writer:flushReleased',token);}
    });
    this.queue=operation;return operation;
  }
}
module.exports={WriterLifecycle};
