const { aggregate } = require('../../src/report/aggregate.cjs');
const { calculate, validateRange, roomOptions, reconcileRooms, toggleRoom } = require('../../src/report/filter.cjs');
const { deal, fields, filterItems } = require('../support/crm-fixture.cjs');
const report = (items = filterItems()) => aggregate({ items, fields: Object.entries(fields).map(([code, field]) => ({ code, ...field })) },
  { portalOrigin: 'https://portal.example', now: new Date('2026-06-01') });
const range = (kind, min = '', max = '') => {
  const result = validateRange(kind, { min, max });
  expect(result.valid).toBe(true);
  return result.values;
};
const totals = (result) => result.rooms.map(({ amount, count }) => [amount, count]);
test('strict base snapshot and normalized minimal data', () => {
  const result = report();
  expect(totals(result)).toEqual([['100.1', 1], ['600.6', 2], ['300.3', 1]]);
  expect(result.months.filter((m) => m.count)).toEqual([
    { category: 1, amount: '100.1', count: 1 }, { category: 6, amount: '200.2', count: 1 }, { category: 12, amount: '400.4', count: 1 },
  ]);
  expect(result.problems.map(({ id, reasons }) => [id, reasons])).toEqual([
    [5, [{ field: 'area', code: 'missing' }]], [6, [{ field: 'date', code: 'missing' }]],
    [7, [{ field: 'rooms', code: 'missing' }]], [8, [{ field: 'amount', code: 'missing' }]],
  ]);
  expect(result.deals).toHaveLength(4);
  expect(result.deals[1]).toEqual({ rooms: 2, amount: '200.2', area: '65.5', date: '2026-06-15' });
});
test.each([undefined, null, '', ' ', 0, -1, false, true, [], {}, '65,5', 'Infinity'])('rejects area %p everywhere with reason', (value) => {
  const result = report([deal(1, { ufCrmArea: value })]);
  expect(result.deals).toEqual([]); expect(result.rooms).toEqual([]);
  expect(result.months.every((m) => !m.count)).toBe(true);
  expect(result.problems[0].reasons).toEqual([{ field: 'area', code: value == null || value === '' || value === ' ' ? 'missing' : 'invalid' }]);
});
test.each(['ufCrmDate', 'ufCrmRooms', 'opportunity', 'currencyId'])('missing, empty, invalid %s excludes from all calculations', (field) => {
  for (const value of [undefined, '', {}]) {
    const result = report([deal(1, { [field]: value })]);
    expect(result.deals).toEqual([]); expect(result.rooms).toEqual([]);
    expect(result.months.every((m) => !m.count)).toBe(true);
    expect(result.problems).toHaveLength(1);
  }
});
test('all reasons survive on one problem and future valid rooms define N', () => {
  const result = report([deal(1, { ufCrmRooms: null, ufCrmDate: '2026-02-30', ufCrmArea: false, opportunity: 0, currencyId: 'USD' }),
    deal(2, { ufCrmRooms: 4, ufCrmArea: '6.55e1', ufCrmDate: '2027-01-01' })]);
  expect(result.problems[0].reasons.map((r) => r.field)).toEqual(['rooms', 'date', 'amount', 'area', 'currency']);
  expect(result.deals[0].area).toBe('65.5'); expect(roomOptions(result.deals)).toEqual([1, 2, 3, 4]);
  expect(result.months.every((m) => !m.count)).toBe(true);
});
test.each([
  ['amount', '200,2', '300.3', [['0', 0], ['200.2', 1], ['300.3', 1]]],
  ['amount', '200.2', '200.2', [['0', 0], ['200.2', 1], ['0', 0]]],
  ['amount', '', '200.2', [['100.1', 1], ['200.2', 1], ['0', 0]]],
  ['amount', '300.3', '', [['0', 0], ['400.4', 1], ['300.3', 1]]],
  ['amount', '0', '0', [['0', 0], ['0', 0], ['0', 0]]],
  ['area', '65,5', '80', [['0', 0], ['600.6', 2], ['300.3', 1]]],
  ['area', '65.5', '65,5', [['0', 0], ['200.2', 1], ['0', 0]]],
  ['area', '65', '66', [['0', 0], ['200.2', 1], ['0', 0]]],
  ['area', '', '50', [['100.1', 1], ['0', 0], ['0', 0]]],
  ['area', '80', '', [['0', 0], ['400.4', 1], ['300.3', 1]]],
  ['area', '', '0', [['0', 0], ['0', 0], ['0', 0]]],
  ['date', '2026-01-01', '2026-12-31', [['100.1', 1], ['600.6', 2], ['0', 0]]],
  ['date', '', '2025-12-31', [['0', 0], ['0', 0], ['300.3', 1]]],
  ['date', '2026-12-31', '', [['0', 0], ['400.4', 1], ['0', 0]]],
])('%s inclusive range %s–%s', (kind, min, max, expected) => {
  expect(totals(calculate(report().deals, 2026, { [kind]: range(kind, min, max) }))).toEqual(expected);
});
test('combined AND conditions, room OR, preserved zero categories and year', () => {
  const { deals } = report();
  const combined = calculate(deals, 2026, { rooms: [2], amount: range('amount', '150', '350'), area: range('area', '60', '70'), date: range('date', '2026-01-01', '2026-12-31') });
  expect(totals(combined)).toEqual([['200.2', 1]]); expect(combined.months[5].count).toBe(1);
  const old = calculate(deals, 2026, { date: range('date', '2025-01-01', '2025-12-31') });
  expect(old.months).toHaveLength(12); expect(old.months.every((m) => !m.count)).toBe(true);
  expect(totals(calculate(deals, 2026, { rooms: [1, 3] }))).toEqual([['100.1', 1], ['300.3', 1]]);
  expect(totals(calculate([deals[0], deals[2]], 2026, { rooms: [2] }))).toEqual([['0', 0]]);
});
test.each(['amount', 'area'])('exact %s comparisons beyond Number precision', (kind) => {
  const deals = report([deal(1, { opportunity: '9007199254740992.000000001', ufCrmArea: '9007199254740992.000000001' }),
    deal(2, { opportunity: '9007199254740992.000000003', ufCrmArea: '9007199254740992.000000003' })]).deals;
  const result = calculate(deals, 2026, { [kind]: range(kind, '', '9007199254740992.000000002') });
  expect(result.rooms[1]).toEqual({ category: 2, amount: '9007199254740992.000000001', count: 1 });
});
test.each([['area', '-1', ''], ['amount', 'abc', ''], ['amount', '65,', ''], ['amount', '1.2.3', ''], ['date', '2026-02-30', ''], ['date', '0000-01-01', '']])('invalid %s %s is not an empty/zero bound', (kind, min, max) => {
  expect(validateRange(kind, { min, max }).errors.min).toBe('invalid');
});
test('reversed pairs and partial native dates are invalid; empty pairs remove bounds', () => {
  for (const [kind, min, max] of [['area', '90', '80'], ['date', '2026-12-31', '2026-01-01']]) {
    expect(validateRange(kind, { min, max }).errors).toEqual({ min: 'reversed', max: 'reversed' });
  }
  expect(validateRange('date', { min: '', max: '' }, { min: true }).valid).toBe(false);
  expect(range('area')).toEqual({ min: null, max: null });
});
test('selection reconciliation adds only new buttons, falls back, and prevents last deselection', () => {
  expect(reconcileRooms([1, 2, 3], [2], [1, 2, 3, 4, 5])).toEqual([2, 4, 5]);
  expect(reconcileRooms([1, 2, 3], [3], [1, 2])).toEqual([1, 2]);
  expect(reconcileRooms([1, 2], [2], [])).toEqual([]);
  expect(reconcileRooms([], [], [1, 2])).toEqual([1, 2]);
  expect(toggleRoom([1], 1)).toEqual([1]); expect(toggleRoom([1, 2], 1)).toEqual([2]);
});
