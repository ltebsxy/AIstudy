const test = require('node:test');
const assert = require('node:assert/strict');
const { CodexClient } = require('../lib/codex-client');

const threadId = '11111111-1111-1111-1111-111111111111';
const user = (text) => ({ type: 'userMessage', content: [{ type: 'text', text }] });
const answer = (text, phase = 'final_answer') => ({ type: 'agentMessage', text, phase });

test('busy desktop task is reported without starting or duplicating a turn', async () => {
  const client = new CodexClient();
  client.start = async () => {};
  const calls = [];
  client.request = async (method) => { calls.push(method); throw new Error('thread already has an active writer'); };
  assert.deepEqual(await client.ask(threadId, '问题'), { needsDesktop: true });
  assert.deepEqual(calls, ['thread/resume']);
  assert.equal(client.asking, false);
});

test('captures responses that arrive before turn/start returns', async () => {
  const client = new CodexClient();
  client.start = async () => {};
  client.request = async (method) => {
    if (method === 'thread/resume') return {};
    client.receive({ method: 'item/completed', params: { threadId, turnId: 'turn1', item: answer('正确答案') } });
    client.receive({ method: 'turn/completed', params: { threadId, turn: { id: 'turn1', status: 'completed' } } });
    return { turn: { id: 'turn1' } };
  };
  assert.equal(await client.ask(threadId, '问题'), '正确答案');
  assert.equal(client.activeTurn, null);
});

test('desktop reply ignores old and unrelated turns and returns only final output', async () => {
  const client = new CodexClient();
  const old = { id: 'old', status: 'completed', items: [user('问题'), answer('旧回复')] };
  let reads = 0;
  client.readThread = async () => ({ turns: ++reads === 1 ? [old] : [old,
    { id: 'unrelated', status: 'completed', items: [user('其他问题'), answer('无关回复')] },
    { id: 'matched', status: reads < 3 ? 'inProgress' : 'completed', items: [user('问题\n'), answer('思考中', 'commentary'), answer('新回复')] },
  ] });
  let opened = false;
  assert.equal(await client.waitForDesktopReply(threadId, '问题', async () => { opened = true; }), '新回复');
  assert.equal(opened, true);
  assert.equal(client.desktopWait, null);
});

test('desktop waiting can be cancelled without changing the Codex task', async () => {
  const client = new CodexClient();
  client.readThread = async () => ({ turns: [] });
  await assert.rejects(client.waitForDesktopReply(threadId, '问题', () => client.cancel()), /已停止等待/);
  assert.equal(client.desktopWait, null);
});
