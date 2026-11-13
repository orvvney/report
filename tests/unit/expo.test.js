const { createExpoLoader } = require('../../src/report/expo-load.cjs');
const { createServer } = require('../../server.js');
const env = { BITRIX24_WEBHOOK_URL: 'https://portal.example/rest/1/expo-test-secret/' };
function fixture(count = 51) {
  const leads = Array.from({ length: count }, (_, i) => ({ ID: String(i + 1), TITLE: `Lead ${i + 1}`, SOURCE_ID: '305', DATE_CREATE: '2026-01-31T23:00:00+00:00' }));
  const deals = [{ ID: '71', LEAD_ID: '0', SOURCE_ID: '305', DATE_CREATE: '2025-12-31T22:00:00Z', TITLE: 'Deal A' }, { ID: '72', LEAD_ID: '999', SOURCE_ID: '305', DATE_CREATE: '2026-03-02T10:00:00Z', TITLE: 'Deal B' }, { ID: '73', LEAD_ID: '51', SOURCE_ID: '305', DATE_CREATE: '2026-04-02T10:00:00Z', TITLE: 'Deal C' }];
  const requests = [];
  const options = { env, scheduleRequest: task => task(), waitRetry: async () => {}, fetchImpl: async (url, init) => {
    const method = new URL(url).pathname.split('/').at(-1).replace('.json', '');
    const params = JSON.parse(init.body); requests.push({ method, params });
    let rows;
    if (method === 'crm.lead.list') {
      expect(params.filter).toEqual({ '=SOURCE_ID': '305' }); rows = leads;
    } else {
      expect(method).toBe('crm.deal.list');
      expect(params.filter).toEqual({ '=SOURCE_ID': '305' }); rows = deals;
      expect(params.filter).not.toHaveProperty('STAGE_ID');
    }
    const page = rows.slice(params.start, params.start + 50);
    return { ok: true, json: async () => ({ result: page, ...(params.start + 50 < rows.length ? { next: params.start + 50 } : {}) }) };
  } };
  return { options, leads, deals, requests };
}
test('loads all source 305 leads and independent deals, with Yerevan creation dates and safe links', async () => {
  const f = fixture(), load = createExpoLoader(f.options);
  const result = await load();
  expect(result.status).toBe(200);
  expect(result.body.leads).toHaveLength(51);
  expect(result.body.leads[0]).toMatchObject({ date: '2026-02-01', url: 'https://portal.example/crm/lead/details/1/' });
  expect(result.body.deals).toHaveLength(3);
  expect(result.body.deals[0]).toMatchObject({ id: 71, date: '2026-01-01', url: 'https://portal.example/crm/deal/details/71/' });
  expect(f.requests.filter(row => row.method === 'crm.lead.list').map(row => row.params.start)).toEqual([0, 50]);
  expect(f.requests.filter(row => row.method === 'crm.deal.list')).toHaveLength(1);
  const calls = f.requests.length;
  result.body.leads.length = 0;
  expect((await load()).body.leads).toHaveLength(51);
  expect(f.requests).toHaveLength(calls);
  await load({ refresh: true }); expect(f.requests).toHaveLength(calls * 2);
});
test('reads every page of source deals even with no leads', async () => {
  const f = fixture(0); f.deals.splice(0, f.deals.length, ...Array.from({ length: 51 }, (_, i) => ({ ID: String(i + 1), LEAD_ID: '0', SOURCE_ID: '305', DATE_CREATE: '2026-01-01T10:00:00Z', TITLE: 'Deal' })));
  const result = await createExpoLoader(f.options)();
  expect(result.body.deals).toHaveLength(51);
  expect(f.requests.filter(row => row.method === 'crm.deal.list').map(row => row.params.start)).toEqual([0, 50]);
});
test('empty leads still read deals; cache expires after five minutes and coalesces simultaneous reads', async () => {
  const f = fixture(0); let time = 0;
  const load = createExpoLoader({ ...f.options, now: () => new Date(time) });
  await Promise.all([load(), load()]); expect(f.requests).toHaveLength(2);
  expect((await load()).body.leads).toEqual([]);
  time = 300000; await load(); expect(f.requests).toHaveLength(4);
});
test.each(['source', 'date', 'deal-source', 'deal-date', 'page'])('fails closed on invalid %s and clears stale data after a failed refresh', async kind => {
  const f = fixture(), load = createExpoLoader(f.options);
  expect((await load()).status).toBe(200);
  if (kind === 'source') f.leads[0].SOURCE_ID = '306';
  if (kind === 'date') f.leads[0].DATE_CREATE = 'bad';
  if (kind === 'deal-source') f.deals[0].SOURCE_ID = '306';
  if (kind === 'deal-date') f.deals[0].DATE_CREATE = 'bad';
  if (kind === 'page') f.leads[50].ID = '1';
  expect(await load({ refresh: true })).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
  expect((await load()).status).toBe(502);
});
test('serves an independent no-store API and redacts CRM failures', async () => {
  const f = fixture(1), server = createServer(f.options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/toon-expo?refresh=1`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text(); expect(text).not.toContain('expo-test-secret'); expect(text).not.toContain('/rest/');
    expect(JSON.parse(text).leads).toHaveLength(1);
  } finally { await new Promise(resolve => server.close(resolve)); }
  expect(await createExpoLoader({ env: { BITRIX24_WEBHOOK_URL: '' } })()).toEqual({ status: 500, body: { error: 'CONFIGURATION_ERROR' } });
});
