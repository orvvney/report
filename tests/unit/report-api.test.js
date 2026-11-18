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

test.each([false, true])('HTTPS asset upgrades follow the configured HTTPS mode (%s)', async (secureCookies) => {
  const fixture = createFixture();
  await start({ ...fixture, auth: secureCookies ? {
    publicOrigin: 'https://report.example', secureCookies: true,
    googleClientId: 'test-client', allowedEmails: new Set(['test@example.com']),
    encryptionSecret: 'test-secret-at-least-32-characters-long',
  } : null });
  const response = await fetch(base);
  expect(response.headers.get('content-security-policy').includes('upgrade-insecure-requests')).toBe(secureCookies);
});

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
  expect(fixture.state.requests.filter((r) => r.method === 'crm.item.list').map((r) => r.params.start)).toEqual([0, 0]);
  fixture.state.items[50].ufCrmCustomType = '802';
  const empty = await (await fetch(`${base}/api/report?refresh=1`)).json();
  expect(empty.rooms).toEqual([]); expect(empty.problems).toEqual([]);
  expect(empty.months).toHaveLength(12);
  expect(empty.months.every((m) => m.amount === '0' && m.count === 0)).toBe(true);
  fixture.state.failPage = 50;
  const failure = await fetch(`${base}/api/report?refresh=1`);
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
test('HTTP contract includes every CRM page, exact totals, safe links, no browser cache, and a fresh snapshot on refresh', async () => {
  const fixture = createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1, { opportunity: i === 50 ? '25' : '10', ufCrmArea: i === 50 ? null : '65.5' })) });
  await start(fixture);
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text(); expect(text).not.toContain('synthetic-test-secret'); expect(text).not.toContain('/rest/');
  const report = JSON.parse(text);
  expect(Object.keys(report)).toEqual(['year', 'rooms', 'months', 'problems', 'deals', 'updatedAt']);
  expect(report.rooms[1]).toEqual({ category: 2, amount: '500', count: 50 });
  expect(report.problems.at(-1)).toEqual({ id: 51, url: 'https://portal.example/crm/deal/details/51/', reasons: [{ field: 'area', code: 'missing' }] });
  expect(report.deals).toHaveLength(50);
  expect(report.deals[0]).toEqual({ id: 1, url: 'https://portal.example/crm/deal/details/1/', rooms: 2, amount: '10', area: '65.5', date: '2026-01-15', complex: 'tower', customerName: null, entrance: null, floor: null, number: null });
  expect(require('../../src/report/filter.cjs').calculate(report.deals, report.year)).toEqual({ rooms: report.rooms, months: report.months });
  expect(fixture.state.requests.filter((r) => r.method === 'crm.item.list').map((r) => r.params.start)).toEqual([0, 0]);
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
    await fs.symlink(path.resolve(__dirname, '../../package.json'), path.join(dir, 'assets', 'escape.png'));
    for (const target of ['/assets/escape.js', '/assets/escape.png', '/images/filter.png', '/assets/../.env', '/assets/%2e%2e/%2eenv', '/%2eenv', '/.git/config', '/src/ui/main.js', '/api/report/']) {
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
  expect(body.deals).toHaveLength(3); expect(body.deals[1]).toEqual({ ...body.deals[2], id: 2, url: 'https://portal.example/crm/deal/details/2/' });
  expect(body.deals[2].id).toBe(3); expect(body.deals[2].url).toBe('https://portal.example/crm/deal/details/3/');
  expect(body.deals[0]).toEqual({ id: 1, url: 'https://portal.example/crm/deal/details/1/', rooms: 2, amount: '0.1', area: '65.5', date: '2026-01-15', complex: 'tower', customerName: null, entrance: null, floor: null, number: null });
});
test.each(['missing', 'ambiguous'])('area metadata %s fails safely', async (kind) => {
  const fixture = createFixture();
  if (kind === 'missing') delete fixture.state.fields.ufCrmArea;
  else fixture.state.fields.ufCrmDuplicateArea = fixture.state.fields.ufCrmArea;
  expect(await loadReport(fixture)).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
});

test('complex metadata resolves dynamic IDs, preserves base aggregates and returns only normalized values', async () => {
  const values = ['901', 902, '903', null, undefined, '999', true, ['901'], { id: '901' }, 'Milon Tower'];
  const fixture = createFixture({ items: values.map((value, i) => deal(i + 1, { ufCrmBuilding: value })) });
  fixture.state.fields.ufCrmPreference = { ...structuredClone(fixture.state.fields.ufCrmComplex), title: 'Նախընտրելի թաղամաս' };
  delete fixture.state.fields.ufCrmComplex;
  fixture.state.fields.ufCrmBuilding = { title: 'Համալիր', type: 'enumeration', isMultiple: false,
    items: [{ ID: 901, VALUE: 'Milon Tower' }, { ID: '902', VALUE: 'Milon Hills' }, { ID: '903', VALUE: 'Milon Plaza' }] };
  await start(fixture);
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.deals.map((row) => row.complex)).toEqual(['tower', 'hills', ...Array(8).fill(null)]);
  expect(body.problems).toEqual([]);
  expect(body.rooms[1].count).toBe(values.length);
  expect(body.deals.every((row) => !('ufCrmBuilding' in row))).toBe(true);
  expect(fixture.state.requests.filter((r) => r.method === 'crm.item.list').every((r) => r.params.select.includes('ufCrmBuilding'))).toBe(true);
});

test.each([
  ['missing field', (f) => { delete f.ufCrmComplex; }],
  ['duplicate field', (f) => { f.ufCrmOther = structuredClone(f.ufCrmComplex); }],
  ['wrong type', (f) => { f.ufCrmComplex.type = 'string'; }],
  ['multiple', (f) => { f.ufCrmComplex.isMultiple = true; }],
  ['missing multiplicity', (f) => { delete f.ufCrmComplex.isMultiple; }],
  ['missing options', (f) => { delete f.ufCrmComplex.items; }],
  ['invalid options', (f) => { f.ufCrmComplex.items = {}; }],
  ['invalid item', (f) => { f.ufCrmComplex.items = [null]; }],
  ['missing Tower', (f) => { f.ufCrmComplex.items.shift(); }],
  ['missing Hills', (f) => { f.ufCrmComplex.items.splice(1, 1); }],
  ['duplicate Tower', (f) => { f.ufCrmComplex.items.push({ ID: '89', VALUE: 'Milon Tower' }); }],
  ['duplicate Hills', (f) => { f.ufCrmComplex.items.push({ ID: '89', VALUE: 'Milon Hills' }); }],
  ['invalid ID', (f) => { f.ufCrmComplex.items[0].ID = true; }],
  ['duplicate ID', (f) => { f.ufCrmComplex.items[1].ID = '81'; }],
])('complex %s fails safely even with an empty report', async (_name, change) => {
  const fixture = createFixture({ items: [] }); change(fixture.state.fields);
  await start(fixture);
  const response = await fetch(`${base}/api/report`);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'CRM_READ_ERROR' });
  expect(fixture.state.requests.filter((r) => r.method === 'crm.item.list')).toHaveLength(0);
});

test('parking API isolates property types and validates date, amount and currency without rooms or area', async () => {
  const fixture = createFixture({ items: [deal(1),
    deal(2, { ufCrmProperty: '72', ufCrmRooms: null, ufCrmArea: null, opportunity: '25.5' }),
    deal(3, { ufCrmProperty: '72', ufCrmRooms: 0, ufCrmArea: '', ufCrmDate: null }),
    deal(4, { ufCrmProperty: '72', currencyId: 'USD' }),
    deal(5, { ufCrmProperty: '72', opportunity: 'bad' }),
  ] });
  delete fixture.state.fields.ufCrmRooms;
  delete fixture.state.fields.ufCrmArea;
  await start(fixture);
  const response = await fetch(`${base}/api/parking-report`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.deals.map(d => d.id)).toEqual([2]);
  expect(body.deals[0]).toMatchObject({ amount: '25.5', rooms: null, area: null });
  expect(body.problems.map(d => d.id)).toEqual([3, 4, 5]);
  expect(body.months[0]).toEqual({ category: 1, amount: '25.5', count: 1 });
  const reads = fixture.state.reads;
  expect((await fetch(`${base}/api/parking-report`)).status).toBe(200);
  expect(fixture.state.reads).toBe(reads);
  fixture.state.items.push(deal(6, { ufCrmProperty: '72' }));
  const refreshed = await (await fetch(`${base}/api/parking-report?refresh=1`)).json();
  expect(refreshed.deals.map(d => d.id)).toEqual([2, 6]);
});

test('progressive reports skip contacts until details are requested and reject superseded snapshots', async () => {
 const fixture=createFixture({items:[deal(1,{contactId:8}),deal(2,{ufCrmProperty:'72',contactId:8})],contacts:[{id:8,name:'Անի',lastName:'Պետրոսյան'}]});
 await start(fixture);
 const first=await (await fetch(`${base}/api/parking-report?view=summary`)).json();
 expect(first.snapshotId).toEqual(expect.any(String));expect(first.deals[0].customerName).toBeUndefined();
 expect(fixture.state.requests.filter(r=>r.params.entityTypeId===3)).toHaveLength(0);
 const details=await (await fetch(`${base}/api/parking-report?view=details&snapshot=${first.snapshotId}`)).json();
 expect(details.details[0]).toMatchObject({id:2,customerName:'Անի Պետրոսյան'});
 const count=fixture.state.requests.length;
 await fetch(`${base}/api/parking-report?view=details&snapshot=${first.snapshotId}`);expect(fixture.state.requests).toHaveLength(count);
 const next=await (await fetch(`${base}/api/parking-report?view=summary&refresh=1`)).json();expect(next.snapshotId).not.toBe(first.snapshotId);
 expect((await fetch(`${base}/api/parking-report?view=details&snapshot=${first.snapshotId}`)).status).toBe(409);
});
test('apartment and parking reports share metadata while preserving distinct record snapshots', async () => {
 const fixture=createFixture({items:[deal(1),deal(2,{ufCrmProperty:'72'})]});await start(fixture);
 expect((await fetch(`${base}/api/report?view=summary`)).status).toBe(200);
 const meta=()=>fixture.state.requests.filter(r=>r.method!=='crm.item.list').length;
 const before=meta();const parking=await (await fetch(`${base}/api/parking-report?view=summary`)).json();
 expect(parking.deals.map(row=>row.id)).toEqual([2]);expect(meta()).toBe(before);
});

test('stage metadata are shared across property types and stale in-flight details cannot replace a refreshed snapshot', async () => {
 let release;
 const fixture=createFixture({items:[deal(1,{contactId:8})],contacts:[{id:8,name:'Old'}]});await start(fixture);
 await fetch(`${base}/api/property-stages`);
 const meta=()=>fixture.state.requests.filter(r=>r.method!=='crm.item.list').length;
 const before=meta();await fetch(`${base}/api/parking-stages`);expect(meta()).toBe(before);
 const first=await (await fetch(`${base}/api/report?view=summary`)).json();
 fixture.state.contactGate=new Promise(resolve=>{release=resolve;});
 const old=fetch(`${base}/api/report?view=details&snapshot=${first.snapshotId}`);
 // Wait for the artificial CRM boundary without timers or relying on request ordering.
 while(!fixture.state.requests.some(r=>r.params.entityTypeId===3)) await new Promise(resolve=>setImmediate(resolve));
 fixture.state.items=[deal(2)];const next=await (await fetch(`${base}/api/report?view=summary&refresh=1`)).json();
 release();expect((await old).status).toBe(409);
 const latest=await (await fetch(`${base}/api/report?view=summary`)).json();
 expect(latest.snapshotId).toBe(next.snapshotId);expect(latest.deals.map(row=>row.id)).toEqual([2]);
});

test('invalid stage directories do not poison the shared metadata cache after CRM is corrected', async () => {
 const {STAGES}=require('../../src/report/property-stages.cjs');
 const fixture=createFixture({propertyStageNames:STAGES.slice(0,-1)});await start(fixture);
 expect((await fetch(`${base}/api/property-stages`)).status).toBe(502);
 fixture.state.propertyStageNames=[...STAGES];
 expect((await fetch(`${base}/api/property-stages`)).status).toBe(200);
});
