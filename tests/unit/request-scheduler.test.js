const { createClient, createRequestScheduler } = require('../../src/bitrix24/client.cjs');

const reply = { ok: true, status: 200, json: async () => ({ result: [] }) };
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('14 requests and the next refresh share 200 ms spacing across clients for one portal', async () => {
  const starts = [];
  const fetchImpl = jest.fn(async () => { starts.push(performance.now()); return reply; });
  const options = { webhookUrl: 'https://spacing.example/rest/7/test/', fetchImpl };
  const first = createClient(options);
  const requests = Array.from({ length: 14 }, () => first('crm.item.list', {}));
  // A new report constructs another client; even another webhook shares the portal budget.
  const second = createClient({ ...options, webhookUrl: 'https://spacing.example/rest/8/other/' });
  requests.push(second('crm.category.list', {}));
  await jest.advanceTimersByTimeAsync(0);
  expect(starts).toEqual([0]);
  await jest.advanceTimersByTimeAsync(199);
  expect(starts).toEqual([0]);
  await jest.advanceTimersByTimeAsync(2601);
  await Promise.all(requests);
  expect(starts).toEqual(Array.from({ length: 15 }, (_, i) => i * 200));
});

test('failed request releases the queue but preserves the interval before retry', async () => {
  const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('private URL')).mockResolvedValue(reply);
  const call = createClient({ webhookUrl: 'https://failure.example/rest/7/test/', fetchImpl });
  const failed = expect(call('crm.item.list', {})).rejects.toThrow('сетевая ошибка');
  const retry = call('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(199);
  await failed;
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  await expect(retry).resolves.toEqual({ result: [] });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('queue waiting does not consume the request timeout and slow requests never overlap', async () => {
  const starts = [];
  const fetchImpl = jest.fn(async () => {
    starts.push(performance.now());
    if (starts.length === 1) await new Promise((resolve) => setTimeout(resolve, 4000));
    return reply;
  });
  const scheduleRequest = createRequestScheduler();
  const options = { webhookUrl: 'https://slow.example/rest/7/test/', fetchImpl, scheduleRequest };
  const first = createClient(options)('crm.item.list', {});
  const second = createClient({ ...options, timeoutMs: 100 })('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(3999);
  expect(starts).toEqual([0]);
  await jest.advanceTimersByTimeAsync(1);
  await Promise.all([first, second]);
  expect(starts).toEqual([0, 4000]);
});

test('a timed out request releases the queue for the next request', async () => {
  const fetchImpl = jest.fn().mockImplementationOnce(async () => new Promise(() => {})).mockResolvedValue(reply);
  const call = createClient({ webhookUrl: 'https://timeout.example/rest/7/test/', fetchImpl, timeoutMs: 100 });
  const failed = expect(call('crm.item.list', {})).rejects.toThrow('время ожидания');
  const next = call('crm.item.list', {});
  await jest.advanceTimersByTimeAsync(100);
  await failed;
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  await jest.advanceTimersByTimeAsync(100);
  await expect(next).resolves.toEqual({ result: [] });
});

test('a complete 503-deal report stays below 4 seconds with slow CRM responses and batch processing', async () => {
  const { loadReport } = require('../../src/report/load.cjs');
  const { createFixture, deal } = require('../support/crm-fixture.cjs');
  const fixture = createFixture({ items: Array.from({ length: 503 }, (_, i) => deal(i + 1)) });
  let completedAt;
  const result = loadReport({
    ...fixture,
    scheduleRequest: createRequestScheduler(),
    fetchImpl: async (...args) => {
      const commands = JSON.parse(args[1].body).cmd;
      await new Promise((resolve) => setTimeout(resolve, 500 + (commands ? Object.keys(commands).length * 50 : 0)));
      return fixture.fetchImpl(...args);
    },
  }).then((report) => { completedAt = performance.now(); return report; });
  await jest.advanceTimersByTimeAsync(4000);
  const report = await result;
  expect(report.status).toBe(200);
  expect(report.body.deals).toHaveLength(503);
  expect(report.body.rooms[1]).toEqual({ category: 2, amount: '5030', count: 503 });
  expect(fixture.state.requests).toHaveLength(14);
  expect(fixture.state.httpRequests).toHaveLength(5);
  expect(completedAt).toBeLessThanOrEqual(4000);
});
