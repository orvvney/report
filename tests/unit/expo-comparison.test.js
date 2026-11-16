const { calculateCreatedDealsComparison: calculate } = require('../../src/report/expo-comparison.cjs');
const { DEAL_STAGES } = require('../../src/report/expo-selection.cjs');
const row = (id, date, stageName = 'Նոր գործարք') => ({ id, date, stageName });
test('divides all five months including empty ones and deduplicates IDs', () => {
  const baseline = Array.from({ length: 11 }, (_, i) => row(i, i < 6 ? '2026-06-01' : i < 9 ? '2026-08-01' : '2026-10-31'));
  const expo = Array.from({ length: 7 }, (_, i) => row(i, '2026-11-01'));
  expect(calculate([...baseline, baseline[0]], [...expo, expo[0]])).toEqual({
    baselineCount: 11, baselineMonths: 5, baselineMonthlyAverage: 2.2, expoCount: 7,
  });
});
test('selects allowed current stages with trim and independent date intervals', () => {
  const valid = DEAL_STAGES.map((s, i) => row(i, '2026-06-01', ' ' + s + ' '));
  const invalid = [row(90, '2026-05-31'), row(91, '2026-11-01'), row(92, '2026-08-01', null), row(93, '2026-08-01', 'Lost')];
  expect(calculate([...valid, ...invalid], [row(1, '2026-10-31'), row(2, '2027-01-01')]))
    .toEqual({ baselineCount: 7, baselineMonths: 5, baselineMonthlyAverage: 1.4, expoCount: 1 });
  expect(calculate([], [])).toEqual({ baselineCount: 0, baselineMonths: 5, baselineMonthlyAverage: 0, expoCount: 0 });
});
