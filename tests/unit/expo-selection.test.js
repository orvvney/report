const { selectExpoRows, LEAD_STAGES, DEAL_STAGES } = require('../../src/report/expo-selection.cjs');
test.each([['lead', LEAD_STAGES], ['deal', DEAL_STAGES]])('selects every allowed %s stage starting on November 1 inclusively without an upper date limit', (entity, stages) => {
  const rows = stages.map((stageName, id) => ({ id, stageName, date: '2026-11-01' }));
  rows.push({ id: 100, stageName: stages[0], date: '2027-01-01' });
  expect(selectExpoRows(rows, entity)).toEqual(rows);
  expect(selectExpoRows([
    { date: '2026-10-31', stageName: stages[0] },
    { date: '2026-11-01', stageName: 'Rejected' },
    { date: '2026-11-01', stageName: null },
  ], entity)).toEqual([]);
});
test('does not mix lead and deal stages', () => {
  expect(selectExpoRows([{ date: '2026-11-01', stageName: LEAD_STAGES[0] }], 'deal')).toEqual([]);
  expect(selectExpoRows([{ date: '2026-11-01', stageName: DEAL_STAGES[0] }], 'lead')).toEqual([]);
});
