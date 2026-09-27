const test = require('node:test');
const assert = require('node:assert/strict');
const { DesktopCodex } = require('../lib/desktop-codex');
const id = '11111111-1111-1111-1111-111111111111';
test('a later Codex launch can connect a standalone instance without persisting or replacing a live context',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const keys=['CODEX_APP_TOOLS_PIPE_PATH','CODEX_THREAD_ID','CODEX_HOME','CODEX_MCP_NODE_PATH'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-launch-context-'));
  try{
    for(const key of keys)delete process.env[key];
    const client=new DesktopCodex();assert.equal(client.available,false);
    assert.equal(client.adoptContext({CODEX_THREAD_ID:id}),false);
    const server=path.join(root,'plugins','cache','openai-bundled','codex-app-tools','fixture','server.mjs');
    fs.mkdirSync(path.dirname(server),{recursive:true});fs.writeFileSync(server,'// synthetic fixture; never executed');
    const context={CODEX_APP_TOOLS_PIPE_PATH:'test-launch-pipe',CODEX_THREAD_ID:id,CODEX_HOME:root,STUDY_UNRELATED_LAUNCH_VALUE:'must-not-copy'};
    assert.equal(client.adoptContext(context),true);assert.equal(client.available,true);assert.equal(client.server,server);
    assert.equal(process.env.STUDY_UNRELATED_LAUNCH_VALUE,undefined);
    assert.equal(client.adoptContext({...context,CODEX_THREAD_ID:'33333333-3333-3333-3333-333333333333'}),false);
    assert.equal(client.callerId,id);assert.equal(client.child,null);
  }finally{for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});
function fixture() {
  let journal = {};
  const client = new DesktopCodex({ pollMs: 1, loadJournal: () => structuredClone(journal), saveJournal: (value) => { journal = structuredClone(value); } });
  client.callerId = '22222222-2222-2222-2222-222222222222';
  return { client, journal: () => journal };
}
function snapshot(marker, status = 'completed', text = '答案') {
  return { thread: { status: { type: 'idle' } }, turns: marker ? [{ id: 'turn-a', status, items: [
    { type: 'functionCallOutput', name: 'send_message_to_thread', output: { text: `[${marker}]` } },
    { type: 'agentMessage', phase: 'final_answer', text },
  ] }] : [] };
}

test('desktop ask uses the selected task and never overrides its configuration', async () => {
  const { client, journal } = fixture();
  let sent = null;
  client.call = async (name, args) => { assert.equal(name, 'send_message_to_thread'); sent = args; return { threadId: id }; };
  client.read = async () => snapshot(journal()[id]?.marker);
  assert.equal(await client.ask(id, '题目'), '答案');
  assert.deepEqual(Object.keys(sent).sort(), ['prompt', 'threadId']);
  assert.equal(sent.threadId, id);
  assert.match(sent.prompt, /题目/);
  assert.deepEqual(journal(), {});
});

test('cancel and resume reads the same request without sending twice', async () => {
  const { client, journal } = fixture();
  let sends = 0;
  let cancelled = false;
  client.call = async () => { sends++; return { threadId: id }; };
  client.read = async () => {
    if (sends && !cancelled) { cancelled = true; client.cancel(); return snapshot(journal()[id]?.marker, 'inProgress'); }
    return snapshot(journal()[id]?.marker);
  };
  await assert.rejects(client.ask(id, '题目'), /已停止等待/);
  assert(journal()[id]);
  assert.equal(await client.ask(id, '题目'), '答案');
  assert.equal(sends, 1);
});

test('ambiguous send failure is journaled and a retry only reads', async () => {
  const { client, journal } = fixture();
  let sends = 0;
  client.call = async () => { sends++; throw new Error('lost connection'); };
  client.read = async () => snapshot(journal()[id]?.marker);
  await assert.rejects(client.ask(id, '题目'), /发送结果尚未确认/);
  assert.equal(await client.ask(id, '题目'), '答案');
  assert.equal(sends, 1);
});

test('an active desktop task is not interrupted', async () => {
  const { client, journal } = fixture();
  client.read = async () => ({ thread: { status: { type: 'running' } }, turns: [] });
  client.call = async () => assert.fail('should not send');
  await assert.rejects(client.ask(id, '题目'), /正在执行/);
  assert.deepEqual(journal(), {});
});

test('unrelated replies are ignored', async () => {
  const { client, journal } = fixture();
  let reads = 0;
  client.call = async () => ({});
  client.read = async () => ++reads < 3 ? snapshot('unrelated', 'completed', '无关回复') : snapshot(journal()[id]?.marker);
  assert.equal(await client.ask(id, '题目'), '答案');
});
