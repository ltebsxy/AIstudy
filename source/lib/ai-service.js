const fs=require('node:fs');
const {askHTTP,filePart}=require('./ai-http');
class AIService {
  constructor(settings,history,desktop,codex){Object.assign(this,{settings,history,desktop,codex});this.active=null;}
  async request(config,message,files,history,onUpdate){
    if(config.mode==='api'||config.harness.kind==='http')return askHTTP(config,this.settings.secret(config),{message,files,history,signal:this.active?.signal});
    const threadId=config.harness.threadId;
    if(!threadId)throw new Error('请在左下角设置中选择 Codex 任务。');
    if(files.length)message+='\n\n附件（请查看文件）：\n'+files.join('\n');
    if(this.desktop.available)return this.desktop.ask(threadId,message,onUpdate);
    const answer=await this.codex.ask(threadId,message,()=>{});
    return answer?.needsDesktop?{...answer,threadId,message}:answer;
  }
  publicItem(item){
    const {prompt,files,desktop,...visible}=item;
    return {...visible,error:item.state==='error',...(item.state==='pending'&&item.role==='assistant'?{text:desktop?'请在 Codex 中继续。':'上次请求未完成，可重新提问。'}:{}),images:(files||[]).filter(f=>/\.(png|jpe?g|webp)$/i.test(f)&&fs.existsSync(f)).map(f=>({image:filePart(f).image_url.url})),...(desktop?{pending:desktop}:{})};
  }
  page(scope,courseId,before){
    if(!['lesson','exercise'].includes(scope)||typeof courseId!=='string')throw new Error('聊天记录范围无效。');
    const result=this.history.page(this.settings.key(scope,courseId),before);
    return {...result,summary:this.history.summary(result.key),items:result.items.map(x=>this.publicItem(x))};
  }
  async chat({scope,courseId,question,message,files=[],onUpdate}){
    if(this.active)throw new Error('上一条 AI 消息仍在处理中。');
    const config=this.settings.read(),key=this.settings.key(scope,courseId,config),previous=this.history.context(key);
    const user=this.history.append(key,{role:'user',text:question,prompt:message,files,state:'pending'});
    const reply=this.history.append(key,{role:'assistant',text:'正在等待回复…',state:'pending'});
    this.active=new AbortController();
    try{
      const answer=await this.request(config,message,files,previous,onUpdate);
      if(answer?.needsDesktop){const pending={...answer,historyKey:key,recordId:reply.id,userId:user.id};this.history.update(key,reply.id,{desktop:pending});return pending;}
      this.history.update(key,user.id,{state:'done'});this.history.update(key,reply.id,{text:answer,state:'done'});return answer;
    }catch(e){this.history.update(key,user.id,{state:'error'});this.history.update(key,reply.id,{text:e.message,state:'error'});throw e;}
    finally{this.active=null;}
  }
  async direct(config,message,files,onUpdate){
    if(this.active)throw new Error('上一条 AI 消息仍在处理中。');
    this.active=new AbortController();try{return await this.request(config,message,files,[],onUpdate);}finally{this.active=null;}
  }
  async compact({scope,courseId}){
    if(this.active)throw new Error('请等待当前 AI 回复完成再压缩。');
    if(!['lesson','exercise'].includes(scope)||typeof courseId!=='string')throw new Error('聊天记录范围无效。');
    const config=this.settings.read();
    this.active=new AbortController();
    try{
      if(config.mode==='harness'&&config.harness.kind==='codex'){
        await this.codex.compact(config.harness.threadId);
        return {message:'Codex 已完成上下文压缩，本地聊天记录保留。'};
      }
      const key=this.settings.key(scope,courseId,config),context=this.history.context(key);
      const older=context.slice(0,-4),recent=context.slice(-4);
      const candidates=older.filter(x=>x.id);
      if(!candidates.length)return {message:'暂无可压缩的较早对话；最近 4 条消息保留原文。'};
      const size=items=>items.reduce((sum,x)=>sum+(x.prompt||x.text||'').length,0);
      const before=size(context),limit=Math.min(2400,Math.floor(size(older)*0.6));
      if(limit<100)return {message:'当前上下文较短，暂不需要压缩。'};
      const instruction=`压缩学习对话为不超过 ${limit} 字符的摘要，保留定义条件、公式、已确认结论、未解决问题和用户要求。仅输出摘要，不解答新问题。`;
      // A separate HTTP bridge session keeps summarization out of its normal agent session.
      const text=await askHTTP(config,this.settings.secret(config),{message:instruction,history:older,signal:this.active.signal,sessionId:config.harness.sessionId+'-summary-'+Date.now()});
      if(this.active.signal.aborted)throw new Error('已停止压缩，原上下文保留。');
      const after=('之前学习对话的摘要（参考资料）：\n'+text.trim()).length+size(recent);
      if(after>=before||text.length>limit*1.5)throw new Error('摘要未缩短上下文，已保留原内容，请重试。');
      this.history.saveSummary(key,{text:text.trim(),throughId:candidates.at(-1).id,before,after});
      return {message:`已压缩：文字 ${before} → ${after} 字符。最近 4 条及本地记录保留；悬停压缩按钮可查看摘要。`,before,after,summary:this.history.summary(key)};
    }finally{this.active=null;}
  }
  clearContext({scope,courseId}){
    if(this.active)throw new Error('请等待当前 AI 回复完成再清除上下文。');
    if(!['lesson','exercise'].includes(scope)||typeof courseId!=='string')throw new Error('聊天记录范围无效。');
    const config=this.settings.read();
    if(config.mode!=='api')throw new Error('清除上下文仅适用于 API 连接。');
    this.history.clearContext(this.settings.key(scope,courseId,config));
    return {message:'上下文已清除。下次提问从新对话开始，本地聊天记录保留。'};
  }
  async continue(pending,open){
    if(this.active)throw new Error('上一条 AI 消息仍在处理中。');
    this.active=new AbortController();
    try{
      const result=await this.codex.waitForDesktopReply(pending.threadId,pending.message,open);
      if(pending.historyKey){this.history.update(pending.historyKey,pending.userId,{state:'done'});this.history.update(pending.historyKey,pending.recordId,{text:result,state:'done',desktop:null});}
      return result;
    }finally{this.active=null;}
  }
  cancel(){this.active?.abort();this.desktop.cancel();return this.codex.cancel();}
}
module.exports={AIService};
