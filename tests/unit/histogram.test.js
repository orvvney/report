const { monthlyRoomTotals, roomColor, histogramScale, comparisonMonths } = require('../../src/report/histogram.cjs');
const { decimal, compare } = require('../../src/report/filter.cjs');
const deal = (rooms, amount, date = '2026-01-15', overrides = {}) => ({ rooms, amount, date, area: '50', complex: 'tower', ...overrides });

test('month and quarter baselines align with selected months across years', () => {
  const monthRanges = { current: [{ min: '2026-01-01', max: '2026-01-31' }],
    previous: [{ min: '2025-12-01', max: '2025-12-31' }] };
  const result = comparisonMonths([deal(3, '50', '2025-12-31')], monthRanges, 2026, 'month');
  expect(result[0]).toMatchObject({ amount: '50', count: 1,
    ranges: [{ min: '2025-12-01', max: '2025-12-31' }] });
  expect(result.slice(1).every(entry => entry.amount === '0' && !entry.ranges.length)).toBe(true);
  const quarterRanges = { current: [{ min: '2026-04-01', max: '2026-06-30' }],
    previous: [{ min: '2026-01-01', max: '2026-03-31' }] };
  const quarter = comparisonMonths([deal(1, '0.1', '2026-01-01'), deal(3, '0.2', '2026-03-31')], quarterRanges, 2026, 'quarter');
  expect(quarter[3]).toMatchObject({ amount: '0.1', count: 1, ranges: [{ min: '2026-01-01', max: '2026-01-31' }] });
  expect(quarter[5]).toMatchObject({ amount: '0.2', count: 1, ranges: [{ min: '2026-03-01', max: '2026-03-31' }] });
});

test('custom comparison aligns by days and keeps actual baseline dates for month tooltips', () => {
  const ranges = { current: [{ min: '2026-05-15', max: '2026-06-14' }],
    previous: [{ min: '2026-04-14', max: '2026-05-14' }] };
  const result = comparisonMonths([deal(1, '0.1', '2026-04-14'), deal(3, '0.2', '2026-05-14')], ranges, 2026, 'custom');
  expect(result[4]).toMatchObject({ amount: '0.1', count: 1, ranges: [{ min: '2026-04-14', max: '2026-04-30' }] });
  expect(result[5]).toMatchObject({ amount: '0.2', count: 1, ranges: [{ min: '2026-05-01', max: '2026-05-14' }] });
  expect(comparisonMonths([], { current: [], previous: null }, 2026, 'all').every(entry => !entry.count)).toBe(true);
});

test('disjoint KPI ranges and leap years preserve exact totals and month windows', () => {
  const ranges = { current: [{ min: '2025-02-01', max: '2025-02-28' }, { min: '2025-07-01', max: '2025-07-31' }],
    previous: [{ min: '2024-02-01', max: '2024-02-29' }, { min: '2024-07-01', max: '2024-07-31' }] };
  const deals = [deal(1, '0.1', '2024-02-29'), deal(3, '0.2', '2024-07-31')];
  const original = structuredClone(deals);
  const result = comparisonMonths(deals, ranges, 2025, 'month');
  expect(result[1]).toMatchObject({ amount: '0.1', count: 1, ranges: [{ min: '2024-02-01', max: '2024-02-29' }] });
  expect(result[6]).toMatchObject({ amount: '0.2', count: 1 });
  expect(result[2]).toMatchObject({ amount: '0', count: 0, ranges: [] });
  expect(deals).toEqual(original);
});

test.each([
  ['326000000', '400000000', '100000000'],
  ['100000000', '120000000', '20000000'],
  ['200.5', '250', '50'], ['0.3', '0.4', '0.1'],
  ['0', '1', '0.2'], ['0.00000326', '0.000004', '0.000001'],
  ['8000000000000000000.01', '10000000000000000000', '2000000000000000000'],
])('monthly scale for %s has a round step and headroom', (amount, maximum, step) => {
  const scale = histogramScale(['0', amount]);
  expect(scale.maximum).toBe(maximum);
  expect(scale.step).toBe(step);
  expect(scale.ticks[0]).toBe('0');
  expect(scale.ticks.at(-1)).toBe(maximum);
  expect(scale.ticks.length).toBeGreaterThanOrEqual(5);
  expect(scale.ticks.length).toBeLessThanOrEqual(7);
  expect(compare(decimal(maximum), decimal(amount, true))).toBe(1);
});

test('scale uses the tallest complete monthly stack and adapts after filtering', () => {
  const deals = [deal(1, '200000000'), deal(3, '126000000'), deal(1, '50000000', '2026-02-01')];
  const scale = options => histogramScale(monthlyRoomTotals(deals, 2026, options).months.map(month => month.amount));
  expect(scale().maximum).toBe('400000000');
  expect(scale({ rooms: [3] }).maximum).toBe('150000000');
  expect(histogramScale([]).ticks).toEqual(['0', '0.2', '0.4', '0.6', '0.8', '1']);
});

test.each([0, 1, 2, 3, 6, 19, 326, 10000])('count scale for %i has only integer ticks with room above the bars', count => {
  const scale = histogramScale([count], { integer: true });
  expect(scale.ticks.every(tick => /^\d+$/.test(tick))).toBe(true);
  expect(Number(scale.maximum)).toBeGreaterThan(count);
  expect(Number(scale.step)).toBeGreaterThanOrEqual(1);
  expect(scale.ticks.length).toBeGreaterThanOrEqual(5);
  expect(scale.ticks.length).toBeLessThanOrEqual(7);
});

test('stacks exact monthly amounts by ascending room count, retaining all twelve months', () => {
  const result = monthlyRoomTotals([
    deal(3, '0.2'), deal(1, '0.1'), deal(3, '0.3'), deal(1, '9007199254740993.01', '2026-02-10'),
    deal(1, '999', '2025-01-01'),
  ], 2026);
  expect(result.rooms).toEqual([1, 3]);
  expect(result.months).toHaveLength(12);
  expect(result.months[0]).toEqual({ category: 1, amount: '0.6', count: 3, segments: [
    { room: 1, amount: '0.1', count: 1, start: '0', end: '0.1' },
    { room: 3, amount: '0.5', count: 2, start: '0.1', end: '0.6' },
  ] });
  expect(result.months[1].amount).toBe('9007199254740993.01');
  expect(result.months[11]).toEqual({ category: 12, amount: '0', count: 0, segments: [] });
});

test('intersects room, complex, numeric and disjoint date filters and preserves room colors', () => {
  const deals = [deal(1, '100'), deal(3, '200'), deal(3, '300', '2026-02-01'),
    deal(3, '250', '2026-03-01', { complex: 'hills' }), deal(3, '250', '2026-03-01', { area: '90' }),
    deal(3, '500', '2026-03-01'), deal(3, '225', '2026-03-01')];
  const options = { rooms: [3], complexes: ['tower'], amount: { min: '200', max: '300' }, area: { max: '60' },
    dateRanges: [{ min: '2026-01-01', max: '2026-01-31' }, { min: '2026-03-01', max: '2026-03-31' }] };
  const result = monthlyRoomTotals(deals, 2026, options);
  expect(result.rooms).toEqual([3]);
  expect(result.months.map(entry => entry.amount)).toEqual(['200', '0', '225', ...Array(9).fill('0')]);
  expect(result.months.reduce((sum, entry) => sum + entry.count, 0)).toBe(2);
  expect(roomColor(result.rooms[0])).toBe(roomColor(monthlyRoomTotals(deals, 2026).rooms[1]));
  expect(roomColor(12)).toBeTruthy();
  expect(Array.from({ length: 12 }, (_, index) => roomColor(index + 1)).every(color => /^hsl\(170 100%/.test(color))).toBe(true);
  expect(monthlyRoomTotals([], 2026).months.every(entry => entry.amount === '0' && !entry.segments.length)).toBe(true);
});

test('room colors progress from light to dark with distinct shades for common room counts', () => {
  const lightness = Array.from({ length: 12 }, (_, index) => {
    const match = roomColor(index + 1).match(/^hsl\(170 100% ([\d.]+)%\)$/);
    expect(match).not.toBeNull();
    return Number(match[1]);
  });
  for (let index = 1; index < lightness.length; index++) {
    expect(lightness[index]).toBeGreaterThan(0);
    expect(lightness[index]).toBeLessThan(lightness[index - 1]);
    if (index < 5) expect(lightness[index - 1] - lightness[index]).toBeGreaterThanOrEqual(14);
  }
});
