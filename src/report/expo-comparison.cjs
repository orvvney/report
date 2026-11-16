const { DEAL_STAGES } = require('./expo-selection.cjs');
function calculateCreatedDealsComparison(baseline, sourceDeals) {
  const count = (rows, from, to) => new Set(rows.filter(row =>
    row.date >= from && (!to || row.date < to) && DEAL_STAGES.includes(row.stageName?.trim())
  ).map(row => row.id)).size;
  const baselineCount = count(baseline, '2026-06-01', '2026-11-01');
  return { baselineCount, baselineMonths: 5, baselineMonthlyAverage: baselineCount / 5,
    expoCount: count(sourceDeals, '2026-11-01') };
}
module.exports = { calculateCreatedDealsComparison };
