const { decimal, decimalText, compare } = require('./filter.cjs');

// Round decimal coefficients before converting geometry to Number. In particular,
// an exact boundary (0.3 or a large integer) must never round up due to floats.
function chartScale(amounts) {
  let maximum = { coefficient: 0n, scale: 0 };
  for (const amount of amounts) {
    const value = decimal(amount, true);
    if (value && compare(value, maximum) > 0) maximum = value;
  }
  let upper = { coefficient: 1n, scale: 0 };
  if (maximum.coefficient > 0n) {
    const place = 10n ** BigInt(maximum.coefficient.toString().length - 1);
    upper = { coefficient: ((maximum.coefficient + place - 1n) / place) * place, scale: maximum.scale };
  }
  const ticks = Array.from({ length: 5 }, (_, i) => decimalText({
    coefficient: upper.coefficient * BigInt(i) * 25n, scale: upper.scale + 2,
  }));
  return { maximum: decimalText(upper), step: ticks[1], ticks };
}

function fullAmount(amount) {
  const [whole, fraction] = amount.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction ? `.${fraction}` : '');
}
function shortAmount(amount) {
  const value = Number(amount);
  const [divisor, suffix] = value >= 1e9 ? [1e9, 'մլրդ'] : value >= 1e6 ? [1e6, 'մլն'] : value >= 1e3 ? [1e3, 'հազ.'] : [1, ''];
  // Some Chromium builds omit Armenian locale data. Keep its separators even
  // when Intl falls back to the browser's default locale.
  const number = new Intl.NumberFormat('hy-AM', { maximumSignificantDigits: 3 })
    .formatToParts(value / divisor).map(({ type, value: part }) =>
      type === 'decimal' ? ',' : type === 'group' ? ' ' : part).join('');
  return `${number} ${suffix}`.trim();
}
function updatedTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Yerevan', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}
module.exports = { chartScale, fullAmount, shortAmount, updatedTime };
