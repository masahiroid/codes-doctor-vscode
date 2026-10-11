const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client(folder, replies) {
  const requests = [];
  const sandbox = { Error, exports: {}, require: id => id === 'node:https' ? {} : {}, Buffer };
  const source = fs.readFileSync(require.resolve(`../vendor/${folder}/llm/providers/openai`), 'utf8');
  vm.runInNewContext(source + '\nexports.chat = callChatCompletions; exports.responses = callResponsesApi;', sandbox);
  sandbox.httpPostJson = async (path, body) => {
    requests.push({ path, ...JSON.parse(body) });
    assert.ok(replies.length, 'unexpected extra API request');
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { ...sandbox.exports, requests };
}
const options = { model: 'o3', maxTokens: 3000, temperature: 0.3, apiKey: 'test' };
for (const folder of ['csap', 'csap-en']) {
  test(`${folder}: chat retries empty length output and preserves parameter compatibility`, async () => {
    const c = client(folder, [new Error('unsupported_parameter max_tokens'), new Error('unsupported_value temperature'),
      { choices: [{ finish_reason: 'length', message: { content: null } }] },
      { choices: [{ finish_reason: 'stop', message: { content: ' Review ' } }] }]);
    assert.equal(await c.chat('system', 'user', options), 'Review');
    assert.equal(c.requests[3].max_completion_tokens, 16000);
    assert.equal(c.requests[3].temperature, undefined);
    assert.equal(c.requests[3].max_tokens, undefined);
  });
  test(`${folder}: retries only once, distinguishes refusal and other empty responses`, async () => {
    const empty = { choices: [{ finish_reason: 'length', message: { content: ' ' } }] };
    const c = client(folder, [empty, empty]);
    await assert.rejects(c.chat('s', 'u', options), /exhausted the token budget/);
    assert.equal(c.requests.length, 2);
    for (const [message, reason, error] of [[{ refusal: 'declined' }, 'stop', /declined/], [{ content: '' }, 'content_filter', /content_filter/], [{ content: null }, 'stop', /finish_reason: stop/]]) {
      const c = client(folder, [{ choices: [{ message, finish_reason: reason }] }]);
      await assert.rejects(c.chat('s', 'u', options), error);
      assert.equal(c.requests.length, 1);
    }
  });
  test(`${folder}: Responses collects all text after reasoning and retries output limit`, async () => {
    const reply = { output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'First' }, { type: 'output_text', text: 'Second' }] }] };
    const c = client(folder, [{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning' }] }, reply]);
    assert.equal(await c.responses('s', 'u', options), 'First\nSecond');
    assert.equal(c.requests[1].max_output_tokens, 16000);
    const limit = { incomplete_details: { reason: 'max_output_tokens' }, output: [] };
    await assert.rejects(client(folder, [limit, limit]).responses('s', 'u', options), /exhausted/);
    await assert.rejects(client(folder, [{ output: [{ type: 'message', content: [{ type: 'refusal' }] }] }]).responses('s', 'u', options), /declined/);
  });
}
