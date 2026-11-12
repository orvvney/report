const { sortRows, paginate, cellText, columns } = require('../../src/report/deals-table.cjs');
const { createReportLoader } = require('../../src/report/load.cjs');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
const { addDetails } = require('../../src/bitrix24/details.cjs');

test('real UF metadata names and entrance enumeration labels reach the table snapshot', async () => {
  const fixture = createFixture({ items: [deal(1, {
    ufCrm_1776430614152: '901', ufCrm_1686473759: 0, ufCrm_1776254518: '010A',
  })] });
  Object.assign(fixture.state.fields, {
    ufCrm_1776430614152: { title: 'Մուտք', type: 'enumeration', isMultiple: false, items: [{ ID: '901', VALUE: 'Մուտք 2' }] },
    ufCrm_1686473759: { title: 'Հարկ', type: 'integer', isMultiple: false },
    ufCrm_1776254518: { title: 'Համար checked', type: 'string', isMultiple: false },
  });
  const report = await createReportLoader(fixture)();
  expect(report.status).toBe(200);
  expect(report.body.deals[0]).toMatchObject({ entrance: 'Մուտք 2', floor: '0', number: '010A' });
  const select = fixture.state.requests.find(row => row.params.entityTypeId === 2 && row.method === 'crm.item.list').params.select;
  expect(select).toEqual(expect.arrayContaining(['ufCrm_1776430614152', 'ufCrm_1686473759', 'ufCrm_1776254518']));
  expect(select).not.toEqual(expect.arrayContaining(['ufCrm1776430614152']));
});

test('initial date sorting uses descending ID ties without mutating the snapshot', () => {
  const rows = [{ id: 1, date: '2026-01-01' }, { id: 2, date: '2026-02-01' }, { id: 3, date: '2026-02-01' }];
  expect(sortRows(rows).map(row => row.id)).toEqual([3, 2, 1]);
  expect(rows.map(row => row.id)).toEqual([1, 2, 3]);
});

test.each(columns.map(([key]) => key))('sorts %s both ways with missing values always last', key => {
  const values = key === 'date' ? ['2026-01-01', '2026-02-01']
    : key === 'complex' ? ['tower', 'hills'] : key === 'customerName' ? ['Անի', 'Սոնա'] : ['2', '10'];
  const rows = [{ id: 1, [key]: values[0] }, { id: 2, [key]: values[1] }, { id: 3, [key]: null }, { id: 4, [key]: '' }];
  const asc = sortRows(rows, key, 'asc'), desc = sortRows(rows, key, 'desc');
  expect(asc.slice(0, 2).map(row => row.id)).toEqual(desc.slice(0, 2).map(row => row.id).reverse());
  expect(asc.slice(2).map(row => row.id)).toEqual([4, 3]);
  expect(desc.slice(2).map(row => row.id)).toEqual([4, 3]);
  if (!['complex', 'customerName'].includes(key)) expect(asc[0].id).toBe(1);
});

test('keeps exact decimal and signed numeric ordering and string identifiers', () => {
  const rows = ['9007199254740993.001', '9007199254740993.0001', '-2', '-10', '2', '10'].map((floor, i) => ({ id: i + 1, floor }));
  expect(sortRows(rows, 'floor', 'asc').map(row => row.floor)).toEqual(['-10', '-2', '2', '10', '9007199254740993.0001', '9007199254740993.001']);
  const labels = ['A10', 'A2'].map((number, id) => ({ id, number }));
  expect(sortRows(labels, 'number', 'asc').map(row => cellText(row, 'number'))).toEqual(['A2', 'A10']);
});

test.each([0, 1, 25, 26, 51])('paginates %s records without losses and clamps the requested page', count => {
  const rows = Array.from({ length: count }, (_, id) => ({ id }));
  const pages = Math.max(1, Math.ceil(count / 25));
  expect(paginate(rows, 999).page).toBe(pages);
  expect(paginate(rows, -1).page).toBe(1);
  const combined = Array.from({ length: pages }, (_, index) => paginate(rows, index + 1).rows).flat();
  expect(combined).toEqual(rows);
  expect(paginate(rows).rows.length).toBeLessThanOrEqual(25);
});

test('formats full exact amounts, dates, missing values, complexes and contact fallback', () => {
  expect(cellText({ amount: '1000000.1234' }, 'amount')).toBe('1 000 000,1234');
  expect(cellText({ area: '65.50001' }, 'area')).toBe('65,50001');
  expect(cellText({ date: '2026-11-12' }, 'date')).toBe('12.11.2026');
  expect(cellText({ id: 41 }, 'customerName')).toBe('Գործարք №41');
  expect(cellText({}, 'entrance')).toBe('—');
  expect(cellText({ floor: '0' }, 'floor')).toBe('0');
  expect(cellText({ complex: 'hills' }, 'complex')).toBe('Հիլլս');
});

test('snapshot selects additional fields, resolves primary contacts once, and refreshes cached names', async () => {
  const fixture = createFixture({ items: [
    deal(1, { contactId: 9, contactIds: [9, 10], ufCrm_1776430614152: '1002', ufCrm_1686473759: 0, ufCrm_1776254518: '010' }),
    deal(2, { contactId: 9 }), deal(3, { contactId: 10 }), deal(4, { contactId: 11 }),
    deal(5, { contactId: 12 }), deal(6, { contactId: 13 }),
    deal(7, { contactId: 14, ufCrmProperty: '72' }), deal(8, { contactId: 15, ufCrmArea: null }),
  ], contacts: [{ id: 9, name: ' Անի ', lastName: ' Սարգսյան ', secondName: 'Ignored' },
    { id: 10, name: 'Արամ' }, { id: 11, lastName: 'Պետրոսյան' }, { id: 12, name: ' ', lastName: '' }] });
  fixture.state.fields.ufCrm_1776430614152.items.find(item => item.ID === '1002').VALUE = 'A2';
  const load = createReportLoader(fixture);
  const first = await load();
  expect(first.status).toBe(200);
  expect(first.body.deals).toHaveLength(6);
  expect(first.body.deals[0]).toMatchObject({ customerName: 'Անի Սարգսյան', entrance: 'A2', floor: '0', number: '010', rooms: 2, area: '50', amount: '10' });
  expect(first.body.deals.map(row => row.customerName)).toEqual(['Անի Սարգսյան', 'Անի Սարգսյան', 'Արամ', 'Պետրոսյան', null, null]);
  const calls = () => fixture.state.requests.filter(row => row.params.entityTypeId === 3);
  expect(calls()).toHaveLength(1);
  expect(calls()[0].params).toEqual({ entityTypeId: 3, select: ['id', 'name', 'lastName'], filter: { '@id': ['9', '10', '11', '12', '13'] }, order: { id: 'ASC' }, start: -1 });
  expect(fixture.state.requests.find(row => row.method === 'crm.item.list' && row.params.entityTypeId === 2).params.select)
    .toEqual(expect.arrayContaining(['contactId', 'ufCrm_1776430614152', 'ufCrm_1686473759', 'ufCrm_1776254518', 'ufCrmRooms', 'ufCrmArea']));
  fixture.state.contacts[0].name = 'Նոր';
  expect((await load()).body.deals[0].customerName).toBe('Անի Սարգսյան');
  expect(calls()).toHaveLength(1);
  expect((await load({ refresh: true })).body.deals[0].customerName).toBe('Նոր Սարգսյան');
  expect(calls()).toHaveLength(2);
});

test('reads more than fifty distinct contacts completely with no duplicate IDs requested', async () => {
  const fixture = createFixture({ items: Array.from({ length: 103 }, (_, i) => deal(i + 1, { contactId: i + 1 })),
    contacts: Array.from({ length: 103 }, (_, i) => ({ id: i + 1, name: `Name${i + 1}` })) });
  const report = await createReportLoader(fixture)();
  expect(report.body.deals.at(-1).customerName).toBe('Name103');
  const groups = fixture.state.requests.filter(row => row.params.entityTypeId === 3).map(row => row.params.filter['@id']);
  expect(groups.map(group => group.length)).toEqual([50, 50, 3]);
  expect(new Set(groups.flat()).size).toBe(103);
});

test('unavailable contacts retain the complete successful report; deal failures remain fatal', async () => {
  const fixture = createFixture({ items: [deal(1, { contactId: 9 })], failContacts: true });
  const load = createReportLoader(fixture);
  const result = await load();
  expect(result.status).toBe(200);
  expect(result.body.deals[0].customerName).toBeNull();
  expect(result.body.rooms[1].count).toBe(1);
  fixture.state.failPage = 0;
  expect(await load({ refresh: true })).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
});

test('requested room and area UF codes use existing metadata and decimal normalization', async () => {
  const fixture = createFixture({ items: [deal(1)] });
  for (const [from, to] of [['ufCrmRooms', 'ufCrm1686474373'], ['ufCrmArea', 'ufCrm1686299562903']]) {
    fixture.state.fields[to] = fixture.state.fields[from]; delete fixture.state.fields[from];
    fixture.state.items[0][to] = from === 'ufCrmRooms' ? '3' : '65.50001';
    delete fixture.state.items[0][from];
  }
  const result = await createReportLoader(fixture)();
  expect(result.body.deals[0]).toMatchObject({ rooms: 3, area: '65.50001' });
  expect(fixture.state.requests.find(row => row.method === 'crm.item.list').params.select)
    .toEqual(expect.arrayContaining(['ufCrm1686474373', 'ufCrm1686299562903']));
});

test.each([
  { items: [{ id: 999, name: 'Wrong' }] },
  { items: [{ id: 9, name: 'A' }, { id: 9, name: 'B' }] },
  { items: null },
])('invalid contact responses never assign another contact name: %j', async result => {
  const deals = [{ id: 1 }];
  await addDetails(async () => ({ result }), deals, [{ id: 1, contactId: 9 }]);
  expect(deals[0].customerName).toBeNull();
});
