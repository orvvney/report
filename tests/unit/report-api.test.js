const { createServer } = require('../../server.js');
const { createFixture, deal, WEBHOOK } = require('../support/crm-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
let server, base;
async function start(options) {
  server = createServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });
test('HTTP contract includes every CRM page, exact totals, safe links, no cache, and a fresh snapshot per request', async () => {
  const fixture = createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1, { opportunity: i === 50 ? '25' : '10', ufCrmDate: null })) });
  await start(fixture);
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text(); expect(text).not.toContain('synthetic-test-secret'); expect(text).not.toContain('/rest/');
  const report = JSON.parse(text);
  expect(Object.keys(report)).toEqual(['year', 'rooms', 'months', 'problems']);
  expect(report.rooms[1]).toEqual({ category: 2, amount: '525', count: 51 });
  expect(report.problems.at(-1)).toEqual({ id: 51, url: 'https://portal.example/crm/deal/details/51/', reasons: [{ field: 'date', code: 'missing' }] });
  expect(fixture.state.requests.filter((r) => r.method === 'crm.item.list').map((r) => r.params.start)).toEqual([0, 50]);
  fixture.state.items = []; fixture.state.time = '2026-12-31T20:00:00Z';
  const fresh = await (await fetch(`${base}/api/report`)).json();
  expect(fresh.year).toBe(2027); expect(fresh.rooms).toEqual([]); expect(fresh.months).toHaveLength(12); expect(fresh.problems).toEqual([]);
  expect(fixture.state.reads).toBe(2);
});
test('failure on last CRM page returns only a safe 502 error, never a partial report', async () => {
  await start(createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1)), failPage: 50 }));
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(502); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'CRM_READ_ERROR' });
});
test('configuration failure returns safe 500 before calling CRM', async () => {
  const fetchImpl = jest.fn();
  await start({ env: { BITRIX24_WEBHOOK_URL: `${WEBHOOK}?bad=1` }, fetchImpl });
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'CONFIGURATION_ERROR' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('missing build explains how to build and static whitelist blocks project paths, traversal and symlinks', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-public-test-'));
  try {
    await start({ ...createFixture(), distPath: dir });
    const response = await fetch(base);
    expect(response.status).toBe(503); expect(await response.text()).toContain('npm run build');
    await fs.mkdir(path.join(dir, 'assets'));
    await fs.symlink(path.resolve(__dirname, '../../package.json'), path.join(dir, 'assets', 'escape.js'));
    for (const target of ['/assets/escape.js', '/assets/../.env', '/assets/%2e%2e/%2eenv', '/%2eenv', '/.git/config', '/src/ui/main.js', '/api/report/']) {
      expect((await fetch(base + target)).status).toBe(404);
    }
    expect((await fetch(`${base}/api/report`, { method: 'POST' })).status).toBe(404);
  } finally { await fs.rm(dir, { force: true, recursive: true }); }
});
