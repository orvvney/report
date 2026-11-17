const { createClient, createRequestScheduler } = require('../../src/bitrix24/client.cjs');
const { WEBHOOK } = require('../support/crm-fixture.cjs');
const good = () => ({ ok: true, json: async () => ({ result: { items: [] } }) });
const failures = [
  ['network', async () => { throw new Error(WEBHOOK); }],
  ['HTTP', async () => ({ ok: false, status: 503 })],
  ['REST', async () => ({ ok: true, json: async () => ({ error: 'ACCESS_DENIED', error_description: WEBHOOK }) })],
  ['JSON', async () => ({ ok: true, json: async () => { throw new Error(WEBHOOK); } })],
  ['missing result', async () => ({ ok: true, json: async () => ({}) })],
  ['missing items', async () => ({ ok: true, json: async () => ({ result: {} }) })],
];
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('default five-second timeout aborts a stalled response body and retries after two seconds', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>new Promise(()=>{})})
    .mockImplementation(async()=>good());
  const call = createClient({webhookUrl:WEBHOOK,fetchImpl,scheduleRequest:createRequestScheduler()});
  const pending = call('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(4999);
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  await jest.advanceTimersByTimeAsync(1999);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual({result:{items:[]}});
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test.each(failures)('%s failure retries three times with two seconds after each failure, without leaking secrets', async (_name, fail) => {
  const starts = [];
  const fetchImpl = jest.fn(async () => { starts.push(performance.now()); return fail(); });
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: createRequestScheduler() });
  let error;
  const pending = call('crm.item.list', {}).catch((e) => { error = e; });
  await jest.advanceTimersByTimeAsync(1999);
  expect(starts).toEqual([0]);
  await jest.advanceTimersByTimeAsync(4001);
  await pending;
  expect(starts).toEqual([0, 2000, 4000, 6000]);
  expect(error.message).not.toContain(WEBHOOK);
  await jest.advanceTimersByTimeAsync(10000);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test.each([1, 2, 3])('success on retry %i stops further attempts', async (failCount) => {
  let failuresLeft = failCount;
  const fetchImpl = jest.fn(async () => failuresLeft-- > 0 ? { ok: false, status: 503 } : good());
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: createRequestScheduler() });
  const pending = call('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual({ result: { items: [] } });
  expect(fetchImpl).toHaveBeenCalledTimes(failCount + 1);
});

test('pause starts after a failed response, releases queue, and every retry gets a fresh timeout', async () => {
  const starts = [];
  const fetchImpl = jest.fn(async (_url, options) => {
    starts.push(performance.now());
    if (starts.length === 1) return new Promise(() => {});
    expect(options.signal.aborted).toBe(false);
    return good();
  });
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, timeoutMs: 100, scheduleRequest: createRequestScheduler() });
  const first = call('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(100);
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  const other = call('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(100);
  await other;
  expect(starts).toEqual([0, 200]);
  await jest.advanceTimersByTimeAsync(1899);
  expect(starts).toHaveLength(2);
  await jest.advanceTimersByTimeAsync(1);
  await first;
  expect(starts).toEqual([0, 200, 2100]);
});

test('batch subcommand error retries the entire packet and publishes only the successful attempt', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { result: { q0: { items: [{ id: 1 }] } }, result_error: { q1: { error: 'ACCESS_DENIED' } } } }) })
    .mockResolvedValue({ ok: true, json: async () => ({ result: { result: { q0: { items: [] }, q1: { items: [] } }, result_error: [] } }) });
  const call = createClient({ webhookUrl: WEBHOOK, fetchImpl, scheduleRequest: createRequestScheduler() });
  const commands = Array.from({ length: 2 }, () => ({ method: 'crm.item.list', params: { start: -1 } }));
  const pending = call.batch(commands);
  await jest.advanceTimersByTimeAsync(2000);
  expect(await pending).toEqual([{ result: { items: [] } }, { result: { items: [] } }]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[1][1].body);
});
