const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');

// Uses the installed, unmodified app-tools MCP server and the executor context
// inherited when Codex launches this app. Never persist or invent host context.
function findDesktopServer(env = process.env) {
  if (!env.CODEX_APP_TOOLS_PIPE_PATH || !env.CODEX_THREAD_ID) return null;
  const root = path.join(env.CODEX_HOME || path.join(env.USERPROFILE || '', '.codex'), 'plugins', 'cache', 'openai-bundled', 'codex-app-tools');
  if (!fs.existsSync(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())
    .map((x) => path.join(root, x.name, 'server.mjs')).filter((x) => fs.existsSync(x));
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function matchingTurn(snapshot, marker) {
  return snapshot.turns?.find((turn) => turn.items?.some((item) => {
    if (item.type !== 'functionCallOutput' || item.name !== 'send_message_to_thread') return false;
    const text = typeof item.output === 'string' ? item.output : item.output?.text;
    return typeof text === 'string' && text.includes(marker);
  }));
}

function answerText(turn) {
  const messages = turn.items?.filter((x) => x.type === 'agentMessage') || [];
  const final = messages.filter((x) => x.phase === 'final_answer');
  return (final.length ? final : messages).map((x) => x.text || '').join('\n\n');
}

class DesktopCodex {
  constructor(options = {}) {
    this.server = options.server || findDesktopServer();
    this.callerId = process.env.CODEX_THREAD_ID;
    this.child = null;
    this.starting = null;
    this.pending = new Map();
    this.nextId = 0;
    this.active = null;
    this.pollMs = options.pollMs || 1500;
    this.loadJournal = options.loadJournal || (() => ({}));
    this.saveJournal = options.saveJournal || (() => {});
  }

  get available() { return Boolean(this.server && this.callerId && process.env.CODEX_APP_TOOLS_PIPE_PATH); }

  // A standalone launch can receive a later Codex launch's runtime context.
  // Keep an existing connection intact and never persist the launch environment.
  adoptContext(context) {
    if(this.available||this.child||this.starting||this.active||!context)return false;
    const keys=['CODEX_APP_TOOLS_PIPE_PATH','CODEX_THREAD_ID','CODEX_HOME','CODEX_MCP_NODE_PATH'];
    const values=Object.fromEntries(keys.filter(key=>typeof context[key]==='string'&&context[key].length>0&&context[key].length<32768).map(key=>[key,context[key]]));
    if(!values.CODEX_APP_TOOLS_PIPE_PATH||!values.CODEX_THREAD_ID)return false;
    const server=findDesktopServer({...process.env,...values});if(!server)return false;
    Object.assign(process.env,values);this.server=server;this.callerId=values.CODEX_THREAD_ID;return true;
  }

  request(method, params, timeoutMs = 30000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`桌面连接超时：${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  async start() {
    if (this.starting) return this.starting;
    if (this.child) return;
    if (!this.available) throw new Error('桌面自动连接未就绪。请从 Codex 启动 AI-StudyDesk。');
    this.starting = (async () => {
      const node = process.env.CODEX_MCP_NODE_PATH || process.execPath;
      const child = spawn(node, [this.server], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      this.child = child;
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        let data; try { data = JSON.parse(line); } catch { return; }
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id); clearTimeout(pending.timer);
        data.error ? pending.reject(new Error(data.error.message)) : pending.resolve(data.result);
      });
      child.stderr.resume();
      child.on('error', () => { if (this.child === child) this.disconnect(); });
      child.on('exit', () => { if (this.child === child) this.disconnect(); });
      await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ai-studydesk', version: require('../package.json').version } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const { tools } = await this.request('tools/list', {});
      for (const name of ['read_thread', 'send_message_to_thread']) {
        if (!tools?.some((x) => x.name === name)) throw new Error(`当前桌面插件不提供 ${name}。`);
      }
    })();
    try { await this.starting; }
    catch (error) { this.close(); throw error; }
    finally { this.starting = null; }
  }

  async call(name, args) {
    if (!['read_thread', 'send_message_to_thread'].includes(name)) throw new Error('不支持的桌面操作。');
    await this.start();
    const result = await this.request('tools/call', { name, arguments: args, _meta: { 'openai/threadId': this.callerId } });
    const text = result.content?.filter((x) => x.type === 'text').map((x) => x.text).join('\n') || '';
    if (result.isError) throw new Error(text || '桌面工具调用失败。');
    try { return JSON.parse(text); } catch { throw new Error('桌面工具返回了无法识别的结果。'); }
  }

  read(threadId) {
    return this.call('read_thread', { threadId, turnLimit: 8, includeOutputs: true, maxOutputCharsPerItem: 20000 });
  }

  remember(threadId, value) {
    const journal = this.loadJournal();
    if (value) journal[threadId] = value; else delete journal[threadId];
    this.saveJournal(journal);
  }

  async ask(threadId, message, onUpdate) {
    if (this.active) throw new Error('上一条消息仍在处理中。');
    if (!/^[0-9a-f-]{20,}$/i.test(threadId)) throw new Error('请选择有效的 Codex 任务。');
    if (threadId === this.callerId) throw new Error('请选择学习任务；当前负责连接的工程任务不能向自身转发。');
    const text = String(message || '').trim();
    if (!text || text.length > 12000) throw new Error('请输入 1–12000 字的问题。');
    const state = { cancelled: false };
    this.active = state;
    try {
      let entry = this.loadJournal()[threadId];
      const before = await this.read(threadId);
      if (entry && entry.message !== text) {
        const previous = matchingTurn(before, entry.marker);
        if (previous && ['completed', 'failed', 'interrupted'].includes(previous.status)) { this.remember(threadId, null); entry = null; }
        else throw new Error('上一条请求尚未确认结束。请原样重试上一问题以读取结果；软件不会重复发送。');
      }
      if (state.cancelled) throw new Error('已停止发送。');
      if (!entry) {
        if (before.thread?.status?.type !== 'idle') throw new Error('这个 Codex 任务正在执行或需要处理，请结束后再发送。');
        entry = { marker: `AI-StudyDesk 请求 ${randomUUID()}`, message: text };
        this.remember(threadId, entry); // Journal before send: never retry an ambiguous write.
        try {
          await this.call('send_message_to_thread', { threadId, prompt: `[${entry.marker}]\n${text}` });
        } catch (error) {
          throw new Error(`发送结果尚未确认：${error.message}。原样重试只会读取结果，不会重复发送。`);
        }
      }
      const deadline = Date.now() + 300000;
      let previousText = '';
      while (!state.cancelled && Date.now() < deadline) {
        const snapshot = await this.read(threadId);
        if (state.cancelled) break;
        const turn = matchingTurn(snapshot, entry.marker);
        if (turn) {
          const output = answerText(turn);
          if (output && output !== previousText) { previousText = output; onUpdate?.(output); }
          if (['completed', 'failed', 'interrupted'].includes(turn.status)) {
            this.remember(threadId, null);
            if (turn.status !== 'completed') throw new Error('Codex 任务已停止或失败，请在桌面端查看。');
            return output || 'Codex 没有返回文字内容。';
          }
        }
        await new Promise((resolve) => { state.wake = resolve; state.timer = setTimeout(resolve, this.pollMs); });
      }
      throw new Error(state.cancelled ? '已停止等待，Codex 任务仍按原状态运行。原样重试可继续读取。' : '等待回复超时。原样重试可继续读取，软件不会重复发送。');
    } finally { clearTimeout(state.timer); this.active = null; }
  }

  cancel() {
    if (this.active) { this.active.cancelled = true; clearTimeout(this.active.timer); this.active.wake?.(); }
  }

  disconnect() {
    this.child = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Codex 桌面连接已断开，请从 Codex 重新打开 AI-StudyDesk。')); }
    this.pending.clear();
  }

  close() { this.cancel(); const child = this.child; this.disconnect(); child?.kill(); }
}

module.exports = { DesktopCodex, matchingTurn, answerText };
