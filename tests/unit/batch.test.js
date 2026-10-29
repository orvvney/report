const { createClient } = require('../../src/bitrix24/client.cjs');
const { loadReport } = require('../../src/report/load.cjs');
const { createFixture, deal, WEBHOOK } = require('../support/crm-fixture.cjs');

test.each([0, 50, 51, 503, 2553])('batch preserves the complete %i-deal report and caps packets at 50 commands', async (count) => {
  const items = Array.from({ length: count }, (_, i) => deal(i + 1));
  const fast = createFixture({ items });
  const sequential = createFixture({ items });
  const expected = await loadReport({ ...sequential, fetchImpl: async (...args) => {
    const response = await sequential.fetchImpl(...args);
    const body = await response.json();
    delete body.total; // A legacy response without total must still follow next.
    return { ...response, json: async () => body };
  } });
  const actual = await loadReport(fast);
  expect(actual.status).toBe(200);
  expect(actual).toEqual(expected);
  expect(actual.body.deals).toHaveLength(count);
  const pages = Math.max(1, Math.ceil(count / 50));
  expect(fast.state.httpRequests).toHaveLength(4 + Math.ceil((pages - 1) / 50));
  const starts = fast.state.requests.filter((r) => r.method === 'crm.item.list').map((r) => r.params.start);
  expect(starts).toEqual(Array.from({ length: pages }, (_, i) => i * 50));
  for (const packet of fast.state.httpRequests.filter((r) => r.method === 'batch')) {
    expect(Object.keys(packet.params.cmd).length).toBeLessThanOrEqual(50);
    expect(packet.params.halt).toBe(1);
  }
});

test.each([
  ['subrequest error', (body) => { body.result.result_error.q1 = { error: 'ACCESS_DENIED', error_description: WEBHOOK }; }],
  ['missing result', (body) => { delete body.result.result.q1; }],
  ['missing totals', (body) => { delete body.result.result_total; }],
  ['missing error map', (body) => { delete body.result.result_error; }],
  ['changed total', (body) => { body.result.result_total.q1++; }],
  ['truncated page', (body) => { body.result.result.q0.items.pop(); }],
  ['empty page', (body) => { body.result.result.q0.items = []; }],
  ['invalid row', (body) => { body.result.result.q0.items[0] = null; }],
  ['missing next', (body) => { delete body.result.result_next.q0; }],
  ['unexpected last next', (body) => { body.result.result_next.q1 = 150; }],
  ['duplicate ID', (body) => { body.result.result.q1.items[0].id = 100; }],
  ['wrong filter', (body) => { body.result.result.q1.items[0].stageId = 'OTHER'; }],
])('rejects %s inside HTTP 200 batch without exposing partial results or secrets', async (_name, corrupt) => {
  const fixture = createFixture({ items: Array.from({ length: 101 }, (_, i) => deal(i + 1)) });
  const actual = await loadReport({ ...fixture, fetchImpl: async (...args) => {
    const response = await fixture.fetchImpl(...args);
    const body = await response.json();
    if (args[0].endsWith('/batch.json')) corrupt(body);
    return { ...response, json: async () => body };
  } });
  expect(actual).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
});

test.each([-1, 1.5, '51', 50, 100])('rejects invalid or inconsistent first-page total %s', async (total) => {
  const fixture = createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1)) });
  const actual = await loadReport({ ...fixture, fetchImpl: async (...args) => {
    const response = await fixture.fetchImpl(...args);
    const body = await response.json();
    if (args[0].endsWith('/crm.item.list.json')) body.total = total;
    return { ...response, json: async () => body };
  } });
  expect(actual.status).toBe(502);
});

test('batch refuses writes, nested batches, raw commands and oversized packets before network access', async () => {
  const fetchImpl = jest.fn();
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: (task) => task() });
  for (const commands of [[], ['crm.item.delete?id=1'], [{ method: 'batch', params: {} }],
    [{ method: 'crm.item.delete', params: { id: 1 } }], Array.from({ length: 51 }, () => ({ method: 'crm.item.list', params: {} }))]) {
    await expect(call.batch(commands)).rejects.toThrow();
  }
  await expect(call('batch', { cmd: {} })).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('batch encodes nested parameters and returns results in command order, including empty array maps', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ result: {
    result: { q1: { items: [] }, q0: { items: [{ id: 1 }] } }, result_error: [],
    result_total: { q0: 1, q1: 0 }, result_next: [],
  } }) }));
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: (task) => task() });
  const params = { entityTypeId: 2, select: ['id', 'ufCrmRooms'], filter: { stageId: 'C3:WON & test=1' }, order: { id: 'ASC' }, start: 50 };
  expect(await call.batch([{ method: 'crm.item.list', params }, { method: 'crm.item.list', params }]))
    .toEqual([{ result: { items: [{ id: 1 }] }, total: 1 }, { result: { items: [] }, total: 0 }]);
  const query = new URLSearchParams(JSON.parse(fetchImpl.mock.calls[0][1].body).cmd.q0.split('?')[1]);
  expect(Object.fromEntries(query)).toEqual({ entityTypeId: '2', 'select[0]': 'id', 'select[1]': 'ufCrmRooms',
    'filter[stageId]': 'C3:WON & test=1', 'order[id]': 'ASC', start: '50' });
});
