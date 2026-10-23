const { createServer } = require('../../server.js');
const { createFixture, deal, WEBHOOK } = require('../support/crm-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadReport } = require('../../src/report/load.cjs');
let server, base;
async function start(options) {
  server = createServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); });

test('resolves dynamic property metadata and includes apartments on later pages only', async () => {
  const fixture = createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1, {
    ufCrmCustomType: i === 50 ? 801 : '802', ufCrmRooms: i === 50 ? 3 : 20,
    opportunity: i === 50 ? '25' : '900', ufCrmDate: i === 50 ? '2026-01-15' : null,
  })) });
  delete fixture.state.fields.ufCrmProperty;
  fixture.state.fields.ufCrmCustomType = { title: 'Անշարժ գույքի տեսակ', type: 'enumeration', isMultiple: false,
    items: [{ ID: '801', VALUE: 'Բնակարան' }, { ID: '802', VALUE: 'Ավտոկայանատեղի' }] };
  await start(fixture);
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.rooms).toHaveLength(3);
  expect(result.rooms[2]).toEqual({ category: 3, amount: '25', count: 1 });
  expect(result.months[0]).toEqual({ category: 1, amount: '25', count: 1 });
  expect(result.problems).toEqual([]);
  expect(fixture.state.requests.filter((r) => r.method === 'crm.item.list').map((r) => r.params.start)).toEqual([0, 50]);
  fixture.state.items[50].ufCrmCustomType = '802';
  const empty = await (await fetch(`${base}/api/report`)).json();
  expect(empty.rooms).toEqual([]); expect(empty.problems).toEqual([]);
  expect(empty.months).toHaveLength(12);
  expect(empty.months.every((m) => m.amount === '0' && m.count === 0)).toBe(true);
  fixture.state.failPage = 50;
  const failure = await fetch(`${base}/api/report`);
  expect(failure.status).toBe(502);
  expect(await failure.json()).toEqual({ error: 'CRM_READ_ERROR' });
});

test.each([
  ['missing field', (fields) => { delete fields.ufCrmProperty; }],
  ['duplicate field', (fields) => { fields.ufCrmDuplicate = structuredClone(fields.ufCrmProperty); }],
  ['wrong type', (fields) => { fields.ufCrmProperty.type = 'string'; }],
  ['multiple values', (fields) => { fields.ufCrmProperty.isMultiple = true; }],
  ['missing multiplicity', (fields) => { delete fields.ufCrmProperty.isMultiple; }],
  ['missing options', (fields) => { delete fields.ufCrmProperty.items; }],
  ['invalid options', (fields) => { fields.ufCrmProperty.items = {}; }],
  ['invalid option', (fields) => { fields.ufCrmProperty.items = [null]; }],
  ['missing apartment', (fields) => { fields.ufCrmProperty.items.shift(); }],
  ['duplicate apartment', (fields) => { fields.ufCrmProperty.items.push({ ID: '99', VALUE: 'Բնակարան' }); }],
  ['invalid ID', (fields) => { fields.ufCrmProperty.items[0].ID = true; }],
  ['duplicate ID', (fields) => { fields.ufCrmProperty.items[1].ID = '71'; }],
])('rejects %s with safe CRM error even for an empty selection', async (_name, change) => {
  const fixture = createFixture({ items: [] });
  change(fixture.state.fields);
  expect(await loadReport(fixture)).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
});
test('HTTP contract includes every CRM page, exact totals, safe links, no cache, and a fresh snapshot per request', async () => {
  const fixture = createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1, { opportunity: i === 50 ? '25' : '10', ufCrmArea: i === 50 ? null : '65.5' })) });
  await start(fixture);
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text(); expect(text).not.toContain('synthetic-test-secret'); expect(text).not.toContain('/rest/');
  const report = JSON.parse(text);
  expect(Object.keys(report)).toEqual(['year', 'rooms', 'months', 'problems', 'deals']);
  expect(report.rooms[1]).toEqual({ category: 2, amount: '500', count: 50 });
  expect(report.problems.at(-1)).toEqual({ id: 51, url: 'https://portal.example/crm/deal/details/51/', reasons: [{ field: 'area', code: 'missing' }] });
  expect(report.deals).toHaveLength(50);
  expect(report.deals[0]).toEqual({ rooms: 2, amount: '10', area: '65.5', date: '2026-01-15' });
  expect(require('../../src/report/filter.cjs').calculate(report.deals, report.year)).toEqual({ rooms: report.rooms, months: report.months });
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

test('area metadata is dynamic and decimal normalization preserves exact duplicate rows', async () => {
  const fixture = createFixture({ items: [deal(1, { ufCrmSurface: '6.550e1', opportunity: '0.1' }), deal(2, { ufCrmSurface: '65.5', opportunity: '0.2' }), deal(3, { ufCrmSurface: '65.5', opportunity: '0.2' })] });
  fixture.state.fields.ufCrmSurface = fixture.state.fields.ufCrmArea; delete fixture.state.fields.ufCrmArea;
  const { status, body } = await loadReport(fixture);
  expect(status).toBe(200); expect(body.rooms[1]).toEqual({ category: 2, amount: '0.5', count: 3 });
  expect(body.deals).toHaveLength(3); expect(body.deals[1]).toEqual(body.deals[2]);
  expect(body.deals[0]).toEqual({ rooms: 2, amount: '0.1', area: '65.5', date: '2026-01-15' });
});
test.each(['missing', 'ambiguous'])('area metadata %s fails safely', async (kind) => {
  const fixture = createFixture();
  if (kind === 'missing') delete fixture.state.fields.ufCrmArea;
  else fixture.state.fields.ufCrmDuplicateArea = fixture.state.fields.ufCrmArea;
  expect(await loadReport(fixture)).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
});
