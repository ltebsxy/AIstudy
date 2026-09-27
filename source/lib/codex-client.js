const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function findCodexExecutable() {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory.replace(/^"|"$/g, ''), name);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const bin = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    if (fs.existsSync(bin)) {
      const entries = fs.readdirSync(bin, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      for (const entry of entries.reverse()) {
        const candidate = path.join(bin, entry.name, name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error('未找到 Codex。请先安装并登录 Codex 桌面版。');
}

class CodexClient {
  constructor(executable = null) {
    this.executable = executable;
    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.starting = null;
    this.activeTurn = null;
    this.loadedThreadId = null;
    this.asking = false;
    this.pendingThreadId = null;
    this.turnBuffer = [];
    this.desktopWait = null;
    this.cancelRequested = false;
    this.compaction = null;
  }

  send(message) {
    if (!this.process || !this.process.stdin.writable) throw new Error('Codex 连接已断开。');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex 请求超时：${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ method, id, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  receive(message) {
    if (message.id != null && message.method) {
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(message.method)) this.send({ id: message.id, result: { decision: 'decline' } });
      else this.send({ id: message.id, error: { code: -32601, message: '此学习聊天窗口不支持该交互，请在 Codex 中处理。' } });
      return;
    }
    if (message.id != null) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex 请求失败。'));
      else pending.resolve(message.result);
      return;
    }
    if(this.compaction&&message.params?.threadId===this.compaction.threadId){
      const state=this.compaction,params=message.params;
      if(message.method==='turn/started'&&!state.turnId)state.turnId=params.turn?.id;
      if(['item/started','item/completed'].includes(message.method)&&params.item?.type==='contextCompaction'){
        if(!state.turnId)state.turnId=params.turnId;
        if(params.turnId===state.turnId&&message.method==='item/completed')state.completed=true;
      }
      if(message.method==='turn/completed'&&params.turn?.id===state.turnId){
        state.finish(params.turn.status==='completed'&&state.completed?null:new Error(params.turn.error?.message||'Codex 未确认压缩完成，原状态请在 Codex 中查看。'));
      }
      return;
    }
    if (!this.activeTurn) {
      if (this.pendingThreadId && (!message.params?.threadId || message.params.threadId === this.pendingThreadId)) this.turnBuffer.push(message);
      return;
    }
    const { threadId, turnId, onDelta, finish } = this.activeTurn;
    if (message.params?.threadId && message.params.threadId !== threadId) return;
    if (message.method === 'item/agentMessage/delta' && message.params?.turnId === turnId) {
      onDelta?.(String(message.params.delta || ''));
    }
    if (message.method === 'item/completed' && message.params?.turnId === turnId && message.params?.item?.type === 'agentMessage') {
      this.activeTurn.finalText = message.params.item.text || this.activeTurn.finalText;
    }
    if (message.method === 'turn/completed' && message.params?.turn?.id === turnId) {
      const status = message.params.turn.status;
      const result = this.activeTurn.finalText;
      this.activeTurn = null;
      finish(status === 'completed' ? null : new Error(message.params.turn.error?.message || `Codex 已${status || '停止'}。`), result);
    }
  }

  async start() {
    if (this.starting) return this.starting;
    if (this.process) return;
    this.starting = (async () => {
      const executable = this.executable || findCodexExecutable();
      const child = spawn(executable, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.process = child;
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        try { this.receive(message); } catch (error) { this.failAll(error); child.kill(); }
      });
      let errorText = '';
      child.stderr.on('data', (chunk) => { errorText = (errorText + chunk.toString()).slice(-2000); });
      child.on('error', (error) => { if (this.process === child) this.failAll(error); });
      child.on('exit', (code) => { if (this.process === child) this.failAll(new Error(`Codex 连接已退出 (${code})。${errorText ? ` ${errorText}` : ''}`)); });
      await this.request('initialize', { clientInfo: { name: 'ai-studydesk', title: 'AI-StudyDesk', version: require('../package.json').version } });
      this.send({ method: 'initialized', params: {} });
    })();
    try { await this.starting; }
    catch (error) { this.close(); throw error; }
    finally { this.starting = null; }
  }

  failAll(error) {
    this.process = null;
    this.loadedThreadId = null;
    this.compaction?.finish(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    if (this.activeTurn) { this.activeTurn.finish(error); this.activeTurn = null; }
  }

  async listThreads() {
    await this.start();
    const result = await this.request('thread/list', { limit: 40, sortKey: 'recency_at', archived: false });
    return (result.data || []).map((thread) => ({
      id: thread.id,
      title: thread.name || thread.preview || thread.id,
      status: thread.status?.type || 'unknown',
    }));
  }

  async ask(threadId, message, onDelta) {
    if (this.asking || this.activeTurn || this.desktopWait) throw new Error('上一条消息仍在处理中。');
    if (!/^[0-9a-f-]{20,}$/i.test(threadId)) throw new Error('请选择有效的 Codex 聊天。');
    const text = String(message || '').trim();
    if (!text) throw new Error('请输入消息。');
    this.asking = true;
    this.cancelRequested = false;
    try {
      await this.start();
      if (this.cancelRequested) throw new Error('已停止发送。');
      if (this.loadedThreadId !== threadId) {
        try { await this.request('thread/resume', { threadId }, 60000); }
        catch (error) {
          if (/active writer/i.test(error.message)) return { needsDesktop: true };
          throw error;
        }
        this.loadedThreadId = threadId;
      }
      if (this.cancelRequested) throw new Error('已停止发送。');
      this.pendingThreadId = threadId;
      this.turnBuffer = [];
      const result = await this.request('turn/start', {
        threadId,
        input: [{ type: 'text', text }],
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly' },
      }, 60000);
      const turnId = result.turn?.id;
      if (!turnId) throw new Error('Codex 未返回会话结果。');
      const answer = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.request('turn/interrupt', { threadId, turnId }).catch(() => {});
          this.activeTurn = null;
          reject(new Error('等待回复超时，请在 Codex 中查看任务状态。'));
        }, 300000);
        this.activeTurn = { threadId, turnId, finalText: '', onDelta, finish: (error, output) => { clearTimeout(timer); error ? reject(error) : resolve(output || 'Codex 没有返回文字内容。'); } };
        const buffered = this.turnBuffer;
        this.turnBuffer = [];
        this.pendingThreadId = null;
        for (const notification of buffered) this.receive(notification);
        if (this.cancelRequested && this.activeTurn) this.cancel().catch((error) => {
          this.activeTurn?.finish(error);
          this.activeTurn = null;
        });
      });
      return answer;
    } finally {
      this.asking = false;
      this.pendingThreadId = null;
      this.turnBuffer = [];
    }
  }

  async readThread(threadId) {
    await this.start();
    return (await this.request('thread/read', { threadId, includeTurns: true })).thread;
  }

  async compact(threadId){
    if(this.asking||this.activeTurn||this.desktopWait||this.compaction)throw new Error('上一条消息仍在处理中。');
    if(!/^[0-9a-f-]{20,}$/i.test(threadId||''))throw new Error('请先在设置中选择 Codex 任务。');
    this.asking=true;this.cancelRequested=false;
    try{
      const thread=await this.readThread(threadId);
      if(thread.status?.type==='active'||thread.turns?.some(t=>t.status==='inProgress'))throw new Error('Codex 任务正在运行，请完成后再压缩。');
      if(this.loadedThreadId!==threadId){
        try{await this.request('thread/resume',{threadId},60000);}
        catch(e){if(/active writer/i.test(e.message))throw new Error('该任务由 Codex 桌面管理，当前连接无法直接压缩。请在该 Codex 任务中执行 /compact；本地记录保持不变。');throw e;}
        this.loadedThreadId=threadId;
      }
      if(this.cancelRequested)throw new Error('已停止压缩。');
      let finish;
      const completion=new Promise((resolve,reject)=>{finish=error=>error?reject(error):resolve();});
      completion.catch(()=>{});
      const timer=setTimeout(()=>finish(new Error('未在限时内确认 Codex 压缩完成，请在 Codex 中查看。')),300000);
      this.compaction={threadId,turnId:null,completed:false,finish};
      try{await this.request('thread/compact/start',{threadId});await completion;}
      finally{clearTimeout(timer);this.compaction=null;}
    }finally{this.asking=false;}
  }

  async waitForDesktopReply(threadId, message, openDesktop) {
    if (this.asking || this.activeTurn || this.desktopWait) throw new Error('上一条消息仍在处理中。');
    if (!/^[0-9a-f-]{20,}$/i.test(threadId) || !String(message).trim()) throw new Error('请选择任务并输入问题。');
    const wait = { cancelled: false };
    this.desktopWait = wait;
    try {
      const before = await this.readThread(threadId);
      const oldTurns = new Set((before.turns || []).map((turn) => turn.id));
      await openDesktop();
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline && !wait.cancelled) {
        await new Promise((resolve) => { wait.timer = setTimeout(resolve, 2000); wait.wake = resolve; });
        if (wait.cancelled) break;
        const thread = await this.readThread(threadId);
        const turn = (thread.turns || []).find((candidate) => !oldTurns.has(candidate.id) && candidate.items?.some((item) =>
          item.type === 'userMessage' && item.content?.some((part) => part.type === 'text' && part.text.trim() === message.trim())));
        if (!turn) continue;
        if (['failed', 'interrupted'].includes(turn.status)) throw new Error('Codex 任务已停止，请在 Codex 中查看。');
        if (turn.status === 'completed') {
          const answers = turn.items.filter((item) => item.type === 'agentMessage');
          const final = answers.filter((item) => item.phase === 'final_answer');
          return (final.length ? final : answers).map((item) => item.text).join('\n\n') || 'Codex 没有返回文字内容。';
        }
      }
      throw new Error(wait.cancelled ? '已停止等待；Codex 中的任务不受影响。' : '未收到回复。请确认已在所选 Codex 任务中粘贴并发送原问题。');
    } finally {
      clearTimeout(wait.timer);
      this.desktopWait = null;
    }
  }

  async cancel() {
    this.cancelRequested = true;
    if(this.compaction){const state=this.compaction;try{if(state.turnId)await this.request('turn/interrupt',{threadId:state.threadId,turnId:state.turnId});}finally{state.finish(new Error('已停止等待压缩，请在 Codex 中确认任务状态。'));}}
    if (this.desktopWait) { this.desktopWait.cancelled = true; clearTimeout(this.desktopWait.timer); this.desktopWait.wake?.(); }
    if (this.activeTurn) await this.request('turn/interrupt', { threadId: this.activeTurn.threadId, turnId: this.activeTurn.turnId });
  }

  close() {
    if (this.desktopWait) { this.desktopWait.cancelled = true; clearTimeout(this.desktopWait.timer); this.desktopWait.wake?.(); }
    const child = this.process;
    this.failAll(new Error('Codex 连接已关闭。'));
    child?.kill();
  }
}

module.exports = { CodexClient, findCodexExecutable };
