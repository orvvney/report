const { createClient } = require('../../src/bitrix24/client.cjs');
const { getDeals } = require('../../src/bitrix24/deals.cjs');
const { loadReport } = require('../../src/report/load.cjs');
const { createFixture, deal, WEBHOOK } = require('../support/crm-fixture.cjs');

test.each([0, 1, 49, 50, 51, 100, 503, 2553])('loads every one of %i sparse deals without total or next', async (count) => {
  const items = Array.from({ length: count }, (_, i) => deal((i + 1) * 7));
  const fixture = createFixture({ items });
  const actual = await loadReport(fixture);
  expect(actual.status).toBe(200);
  expect(actual.body.deals).toHaveLength(count);
  if (count) expect(actual.body.rooms[1]).toEqual({ category: 2, amount: String(count * 10), count });
  else expect(actual.body.rooms).toEqual([]);
  fixture.state.requests.length = 0;
  const call = createClient({ webhookUrl: WEBHOOK, ...fixture });
  const data = await getDeals(call);
  expect(data.items.map((item) => item.id)).toEqual(items.map((item) => item.id));
  for (const { method, params } of fixture.state.requests) {
    if (method !== 'crm.item.list') continue;
    expect(params.start).toBe(-1);
    expect(params.filter).toMatchObject({ categoryId: 3, stageId: 'C3:WON' });
    expect(params.select).not.toContain('*');
  }
  const packets = fixture.state.httpRequests.filter((r) => r.method === 'batch');
  expect(packets.length).toBeGreaterThan(0);
  for (const packet of packets) {
    expect(Object.keys(packet.params.cmd).length).toBeLessThanOrEqual(50);
    expect(packet.params.halt).toBe(1);
  }
});

test('skewed ranges continue until short pages, including empty ranges and large safe IDs', async () => {
  const ids = [...Array.from({ length: 550 }, (_, i) => i + 1),
    ...Array.from({ length: 50 }, (_, i) => Number.MAX_SAFE_INTEGER - 49 + i)];
  const fixture = createFixture({ items: ids.map((id) => deal(id)) });
  const data = await getDeals(createClient({ webhookUrl: WEBHOOK, ...fixture }));
  expect(data.items.map((row) => row.id)).toEqual(ids);
  const continuations = fixture.state.requests.filter((r) => r.method === 'crm.item.list' && r.params.filter['>id'] > 0);
  expect(continuations.some((r) => Number(r.params.filter['>id']) === 550)).toBe(true);
});

test.each([
  ['subrequest error', (body) => { body.result.result_error.q1 = { error: 'ACCESS_DENIED', error_description: WEBHOOK }; }],
  ['missing result', (body) => { delete body.result.result.q1; }],
  ['invalid totals map', (body) => { body.result.result_total = 7; }],
  ['missing error map', (body) => { delete body.result.result_error; }],
  ['invalid row', (body) => { body.result.result.q0.items[0] = null; }],
  ['duplicate ID', (body) => { body.result.result.q1.items[1].id = body.result.result.q1.items[0].id; }],
  ['wrong filter', (body) => { body.result.result.q1.items[0].stageId = 'OTHER'; }],
  ['out of range', (body) => { body.result.result.q1.items[0].id = 1; }],
  ['invalid ID', (body) => { body.result.result.q1.items[0].id = 'oops'; }],
])('rejects %s without exposing partial results or secrets', async (_name, corrupt) => {
  const fixture = createFixture({ items: Array.from({ length: 151 }, (_, i) => deal(i + 1)) });
  const actual = await loadReport({ ...fixture, fetchImpl: async (...args) => {
    const response = await fixture.fetchImpl(...args);
    const body = await response.json();
    const cmd = JSON.parse(args[1].body).cmd;
    if (cmd && Object.values(cmd)[0].startsWith('crm.item.list?')) corrupt(body);
    return { ...response, json: async () => body };
  } });
  expect(actual).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
});

test('batch without count maps succeeds and legacy totals do not control cursor paging', async () => {
  const fixture = createFixture({ items: Array.from({ length: 100 }, (_, i) => deal(i + 1)) });
  const actual = await loadReport({ ...fixture, fetchImpl: async (...args) => {
    const response = await fixture.fetchImpl(...args);
    const body = await response.json();
    if (args[0].endsWith('/batch.json')) {
      delete body.result.result_total; delete body.result.result_next;
    } else if (args[0].endsWith('/crm.item.list.json')) { body.total = -1; body.next = 'ignored'; }
    return { ...response, json: async () => body };
  } });
  expect(actual.status).toBe(200);
  expect(actual.body.deals).toHaveLength(100);
});

test('batch refuses writes, nested batches, raw commands and oversized packets before network access', async () => {
  const fetchImpl = jest.fn();
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: (task) => task(), waitRetry: async () => {} });
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
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: (task) => task(), waitRetry: async () => {} });
  const params = { entityTypeId: 2, select: ['id', 'ufCrmRooms'], filter: { stageId: 'C3:WON & test=1' }, order: { id: 'ASC' }, start: 50 };
  expect(await call.batch([{ method: 'crm.item.list', params }, { method: 'crm.item.list', params }]))
    .toEqual([{ result: { items: [{ id: 1 }] }, total: 1 }, { result: { items: [] }, total: 0 }]);
  const query = new URLSearchParams(JSON.parse(fetchImpl.mock.calls[0][1].body).cmd.q0.split('?')[1]);
  expect(Object.fromEntries(query)).toEqual({ entityTypeId: '2', 'select[0]': 'id', 'select[1]': 'ufCrmRooms',
    'filter[stageId]': 'C3:WON & test=1', 'order[id]': 'ASC', start: '50' });
});

test('optional batches keep successful siblings and send halt=0; required batches still reject errors', async () => {
  const fetchImpl = jest.fn(async () => ({ok:true,json:async()=>({result:{
    result:{q0:{items:[{id:1}]},q2:{items:null}},
    result_error:{q1:{error:'ACCESS_DENIED',error_description:WEBHOOK}},
  }})}));
  const call = createClient({webhookUrl:WEBHOOK,fetchImpl,scheduleRequest:task=>task(),waitRetry:async()=>{}});
  const commands = Array.from({length:4},()=>({method:'crm.item.list',params:{entityTypeId:3}}));
  expect(await call.batch(commands,{allowPartial:true})).toEqual([{result:{items:[{id:1}]}},null,null,null]);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).halt).toBe(0);
  await expect(call.batch(commands)).rejects.toThrow('batch: ошибка');
});

test('optional batch accepts all commands denied but rejects a malformed envelope', async () => {
  let result = {result:[],result_error:{q0:{error:'ACCESS_DENIED'}}};
  const call = createClient({webhookUrl:WEBHOOK,fetchImpl:async()=>({ok:true,json:async()=>({result})}),
    scheduleRequest:task=>task(),waitRetry:async()=>{}});
  const commands = [{method:'crm.item.list',params:{entityTypeId:3}}];
  expect(await call.batch(commands,{allowPartial:true})).toEqual([null]);
  result = {result:[],result_error:3};
  await expect(call.batch(commands,{allowPartial:true})).rejects.toThrow('batch: ошибка');
});
