const test = require('node:test');
const assert = require('node:assert/strict');
const { DesktopCodex } = require('../lib/desktop-codex');
const id = '11111111-1111-1111-1111-111111111111';
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
