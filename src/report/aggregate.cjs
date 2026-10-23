const { apartmentItems } = require('./apartments.cjs');
const missing = (value) => value == null || (typeof value === 'string' && !value.trim());

const { decimal, decimalText, roomsValue, calendarDate, calculate } = require('./filter.cjs');
const currentYear = (now) => Number(new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Yerevan', year: 'numeric',
}).format(now));

function aggregate({ items, fields }, { portalOrigin, now = new Date() }) {
  const origin = new URL(portalOrigin);
  if (origin.protocol !== 'https:') throw new Error('Invalid portal origin');
  const roomField = fields.find((f) => f.title === 'Սենյակների քանակ').code;
  const dateField = fields.find((f) => f.title === 'Կնքման ամսաթիվ').code;
  const areaField = fields.find((f) => f.title === 'Մակերես (մ²)').code;
  const year = currentYear(now);
  const problems = new Map();
  const deals = [];
  for (const item of apartmentItems({ items, fields })) {
    if (!/^\d+$/.test(String(item.id)) || !Number.isSafeInteger(Number(item.id)) || Number(item.id) < 1) {
      throw new Error('Invalid deal ID');
    }
    const rooms = roomsValue(item[roomField]);
    const date = calendarDate(item[dateField]);
    const amount = decimal(item.opportunity);
    const area = decimal(item[areaField]);
    const currency = item.currencyId;
    const reasons = [];
    for (const [field, raw, valid] of [
      ['rooms', item[roomField], rooms], ['date', item[dateField], date],
      ['amount', item.opportunity, amount], ['area', item[areaField], area],
    ]) {
      if (!valid) reasons.push({ field, code: missing(raw) ? 'missing' : 'invalid' });
    }
    if (currency !== 'AMD') reasons.push({ field: 'currency', code: missing(currency) ? 'missing'
      : typeof currency === 'string' ? 'unsupported_currency' : 'invalid' });
    if (reasons.length) problems.set(Number(item.id), {
      id: Number(item.id), url: `${origin.origin}/crm/deal/details/${Number(item.id)}/`, reasons,
    });
    if (reasons.length) continue;
    deals.push({ rooms, amount: decimalText(amount), area: decimalText(area), date: item[dateField].trim().slice(0, 10) });
  }
  return { year, ...calculate(deals, year),
    problems: [...problems.values()].sort((a, b) => a.id - b.id), deals };
}
module.exports = { aggregate, decimal, decimalText, roomsValue, calendarDate, currentYear };
