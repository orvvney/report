const { aggregate, decimal, roomsValue, calendarDate, currentYear } = require('../../src/report/aggregate.cjs');
const { deal, fields } = require('../support/crm-fixture.cjs');
const metadata = Object.entries(fields).map(([code, field]) => ({ code, ...field }));
const report = (items, time = '2026-06-01T00:00:00Z') => aggregate({ items, fields: metadata }, { portalOrigin: 'https://portal.example', now: new Date(time) });

test('sums all-time rooms, fills gaps through maximum even on an excluded deal, and emits every month', () => {
  const result = report([deal(1), deal(2, { opportunity: '25', ufCrmDate: '2025-12-01' }), deal(3, { ufCrmRooms: 6, opportunity: 0 })]);
  expect(result.rooms).toEqual([1, 2, 3, 4, 5, 6].map((category) => ({ category, amount: category === 2 ? '35' : '0', count: category === 2 ? 2 : 0 })));
  expect(result.months).toHaveLength(12);
  expect(result.months[0]).toEqual({ category: 1, amount: '10', count: 1 });
  expect(result.months.slice(1).every((entry) => entry.amount === '0')).toBe(true);
  expect(result.problems[0].reasons).toEqual([{ field: 'amount', code: 'invalid' }]);
});
test('missing grouping fields exclude independently, unique problems include old/future dates and sort by numeric ID', () => {
  const result = report([deal(10, { ufCrmDate: null }), deal(2, { ufCrmRooms: null, opportunity: 25 }),
    deal(3, { ufCrmRooms: '', ufCrmDate: ' ' }), deal(4, { ufCrmRooms: null, ufCrmDate: '2027-01-01' }),
    deal(5, { ufCrmRooms: null, ufCrmDate: '2025-01-01' })]);
  expect(result.rooms[1]).toEqual({ category: 2, amount: '10', count: 1 });
  expect(result.months[0]).toEqual({ category: 1, amount: '25', count: 1 });
  expect(result.problems.map((p) => p.id)).toEqual([2, 3, 4, 5, 10]);
  expect(result.problems[1]).toEqual({ id: 3, url: 'https://portal.example/crm/deal/details/3/',
    reasons: [{ field: 'rooms', code: 'missing' }, { field: 'date', code: 'missing' }] });
});
test.each([undefined, null, '', ' ', false, true, [], {}, 0, -1, 2.5, '2x', '0x10', 'Infinity', Number.MAX_SAFE_INTEGER + 1])('rejects invalid room value %p without excluding its month', (value) => {
  const result = report([deal(1, { ufCrmRooms: value })]);
  expect(result.rooms).toEqual([]);
  expect(result.months[0].amount).toBe('10');
  expect(result.problems[0].reasons[0].field).toBe('rooms');
});
test.each([undefined, null, '', ' ', false, true, [], {}, 0, '0', -1, '12abc', NaN, Infinity, '1,000'])('rejects amount %p from both charts', (value) => {
  const result = report([deal(1, { opportunity: value })]);
  expect(result.rooms[1].amount).toBe('0');
  expect(result.months[0].count).toBe(0);
  expect(result.problems[0].reasons).toEqual([{ field: 'amount', code: [undefined, null, '', ' '].includes(value) ? 'missing' : 'invalid' }]);
});
test.each([['USD', 'unsupported_currency'], [null, 'missing'], ['', 'missing'], [false, 'invalid']])('rejects currency %p from both charts', (value, code) => {
  const result = report([deal(1, { currencyId: value })]);
  expect(result.rooms[1].count).toBe(0);
  expect(result.months[0].count).toBe(0);
  expect(result.problems[0].reasons).toEqual([{ field: 'currency', code }]);
});
test('decimal totals preserve fractional digits and large exact strings', () => {
  const result = report([deal(1, { opportunity: 0.1 }), deal(2, { opportunity: 0.2 })]);
  expect(result.rooms[1].amount).toBe('0.3');
  expect(report([deal(1, { opportunity: '123456789012345678.123456789' }), deal(2, { opportunity: '0.000000001' })]).rooms[1].amount).toBe('123456789012345678.12345679');
  expect(decimal('1e-7')).not.toBeNull();
  expect(roomsValue(' 6.0 ')).toBe(6);
  expect(roomsValue(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
});
test('calendar validation never rolls invalid days and keeps date component without timezone shifts', () => {
  expect(calendarDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  for (const value of ['2026-02-29', '2024-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-01-01T25:00:00Z', false, [], 'not-a-date']) expect(calendarDate(value)).toBeNull();
  const result = report([deal(1, { ufCrmDate: '2026-01-01T00:00:00+04:00' }), deal(2, { ufCrmDate: '2026-12-31T23:59:59-10:00' }),
    deal(3, { ufCrmDate: '2026-02-30' }), deal(4, { ufCrmDate: '2027-01-01' })]);
  expect(result.months[0].count).toBe(1); expect(result.months[11].count).toBe(1);
  expect(result.rooms[1].count).toBe(4);
  expect(result.problems[0].reasons).toEqual([{ field: 'date', code: 'invalid' }]);
  expect(report([deal(1, { ufCrmDate: '2024-02-29' })], '2024-07-01').months[1].count).toBe(1);
});
test('year is determined in Yerevan across UTC year boundary', () => {
  expect(currentYear(new Date('2025-12-31T19:59:59Z'))).toBe(2025);
  expect(currentYear(new Date('2025-12-31T20:00:00Z'))).toBe(2026);
});
test('empty and entirely problematic selections do not invent rooms or amounts', () => {
  for (const items of [[], [deal(1, { ufCrmRooms: null, ufCrmDate: null, opportunity: 0 })]]) {
    const result = report(items);
    expect(result.rooms).toEqual([]);
    expect(result.months).toHaveLength(12);
    expect(result.months.every((m) => m.amount === '0' && m.count === 0)).toBe(true);
    expect(result.problems).toHaveLength(items.length);
  }
  expect(report([deal(1)]).problems).toEqual([]);
});
test.each(['../1', '1?x=secret', -1, 0, 1.5])('does not construct links from invalid ID %p', (id) => {
  expect(() => report([deal(id)])).toThrow('Invalid deal ID');
});
