const { filterDeals, decimal, add, decimalText, compare } = require('./filter.cjs');

function histogramScale(amounts, { integer = false } = {}) {
  let maximum = { coefficient: 0n, scale: 0 };
  for (const amount of amounts) {
    const value = decimal(amount, true);
    if (value && compare(value, maximum) > 0) maximum = value;
  }
  if (!maximum.coefficient) return integer
    ? { maximum: '4', step: '1', ticks: ['0', '1', '2', '3', '4'] }
    : { maximum: '1', step: '0.2', ticks: ['0', '0.2', '0.4', '0.6', '0.8', '1'] };
  const target = { coefficient: maximum.coefficient * 110n, scale: maximum.scale + 2 };
  const magnitude = maximum.coefficient.toString().length - maximum.scale - 1;
  let best;
  for (let exponent = magnitude - 2; exponent <= magnitude + 1; exponent++) {
    for (const factor of [10n, 20n, 25n, 50n, 100n]) {
      const step = { coefficient: factor * (exponent > 0 ? 10n ** BigInt(exponent) : 1n),
        scale: 1 + Math.max(0, -exponent) };
      if (integer && step.coefficient % (10n ** BigInt(step.scale)) !== 0n) continue;
      const commonScale = Math.max(target.scale, step.scale);
      const numerator = target.coefficient * 10n ** BigInt(commonScale - target.scale);
      const denominator = step.coefficient * 10n ** BigInt(commonScale - step.scale);
      const needed = (numerator + denominator - 1n) / denominator;
      const intervals = needed < 4n ? 4n : needed;
      if (intervals > 6n) continue;
      const upper = { coefficient: step.coefficient * intervals, scale: step.scale };
      if (!best || compare(upper, best.upper) < 0
        || (compare(upper, best.upper) === 0 && Math.abs(Number(intervals) - 5) < Math.abs(best.intervals - 5))) {
        best = { upper, step, intervals: Number(intervals) };
      }
    }
  }
  return { maximum: decimalText(best.upper), step: decimalText(best.step),
    ticks: Array.from({ length: best.intervals + 1 }, (_, index) =>
      decimalText({ coefficient: best.step.coefficient * BigInt(index), scale: best.step.scale })) };
}

// Keep totals and cumulative segment boundaries exact until SVG positioning.
function monthlyRoomTotals(deals, year, options = {}) {
  const rooms = [...new Set(deals.map(deal => deal.rooms))]
    .filter(room => !options.rooms || options.rooms.includes(room)).sort((a, b) => a - b);
  const zero = () => ({ coefficient: 0n, scale: 0 });
  const months = Array.from({ length: 12 }, (_, index) => ({ category: index + 1,
    buckets: new Map(rooms.map(room => [room, { room, amount: zero(), count: 0 }])) }));
  for (const deal of filterDeals(deals, options)) {
    if (Number(deal.date.slice(0, 4)) !== year) continue;
    const bucket = months[Number(deal.date.slice(5, 7)) - 1].buckets.get(deal.rooms);
    bucket.amount = add(bucket.amount, decimal(deal.amount));
    bucket.count++;
  }
  return { rooms, months: months.map(({ category, buckets }) => {
    let total = zero(), count = 0;
    const segments = [];
    for (const bucket of buckets.values()) {
      if (!bucket.count) continue;
      const start = decimalText(total);
      total = add(total, bucket.amount); count += bucket.count;
      segments.push({ room: bucket.room, amount: decimalText(bucket.amount), count: bucket.count,
        start, end: decimalText(total) });
    }
    return { category, amount: decimalText(total), count, segments };
  }) };
}

function roomColor(room) {
  // Ascending room counts use progressively darker turquoise, stable under filtering.
  const lightness = [84, 66, 46, 30, 16][room - 1]
    ?? Number((16 / (room - 4)).toFixed(2));
  return `hsl(170 100% ${lightness}%)`;
}

// Align the KPI baseline with the selected months while retaining its real dates.
function comparisonMonths(deals, ranges, year, period) {
  const { dateAt } = require('./period.cjs');
  const monthIndex = text => Number(text.slice(0, 4)) * 12 + Number(text.slice(5, 7)) - 1;
  const shiftDays = (text, days) => new Date(Date.parse(`${text}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const pairs = (ranges?.previous || []).map((previous, index) => {
    const current = ranges.current[index];
    return { previous, current, months: monthIndex(current.min) - monthIndex(previous.min),
      days: (Date.parse(current.min) - Date.parse(previous.min)) / 86400000 };
  });
  const aligned = [];
  for (const deal of deals || []) {
    const pair = pairs.find(pair => deal.date >= pair.previous.min && deal.date <= pair.previous.max);
    if (!pair) continue;
    const index = monthIndex(deal.date) + pair.months;
    const date = period === 'custom' ? shiftDays(deal.date, pair.days)
      : dateAt(Math.floor(index / 12), index % 12, 1);
    aligned.push({ ...deal, date });
  }
  return monthlyRoomTotals(aligned, year).months.map(entry => {
    const intervals = [];
    for (const pair of pairs) {
      const start = dateAt(year, entry.category - 1, 1), end = dateAt(year, entry.category, 0);
      const previousStart = period === 'custom' ? shiftDays(start, -pair.days)
        : dateAt(year, entry.category - 1 - pair.months, 1);
      const previousEnd = period === 'custom' ? shiftDays(end, -pair.days)
        : dateAt(year, entry.category - pair.months, 0);
      const min = [previousStart, pair.previous.min].sort().at(-1);
      const max = [previousEnd, pair.previous.max].sort()[0];
      if (min <= max) intervals.push({ min, max });
    }
    return { ...entry, ranges: intervals };
  });
}
module.exports = { monthlyRoomTotals, roomColor, histogramScale, comparisonMonths };
