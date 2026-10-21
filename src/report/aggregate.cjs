const missing = (value) => value == null || (typeof value === 'string' && !value.trim());

// Decimal coefficients keep every digit from the API; rounding is only for axis labels.
function decimal(value) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const text = String(value).trim();
  if (!/^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?$/i.test(text)
    || !Number.isFinite(Number(text)) || Number(text) <= 0) return null;
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.replace(/^\+/, '').split('.');
  let coefficient = BigInt(`${whole || '0'}${fraction}`);
  let scale = fraction.length - Number(exponent);
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return { coefficient, scale };
}
function add(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { coefficient: a.coefficient * 10n ** BigInt(scale - a.scale)
    + b.coefficient * 10n ** BigInt(scale - b.scale), scale };
}
function decimalText({ coefficient, scale }) {
  const digits = coefficient.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') : digits;
}
function roomsValue(value) {
  const number = decimal(value);
  if (!number || number.coefficient % (10n ** BigInt(number.scale))) return null;
  const integer = Number(value);
  return Number.isSafeInteger(integer) ? integer : null;
}
function calendarDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+\-](?:0\d|1[0-4]):[0-5]\d))?$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    ? { year, month, day } : null;
}
const currentYear = (now) => Number(new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Yerevan', year: 'numeric',
}).format(now));

function aggregate({ items, fields }, { portalOrigin, now = new Date() }) {
  const origin = new URL(portalOrigin);
  if (origin.protocol !== 'https:') throw new Error('Invalid portal origin');
  const roomField = fields.find((f) => f.title === 'Սենյակների քանակ').code;
  const dateField = fields.find((f) => f.title === 'Կնքման ամսաթիվ').code;
  const year = currentYear(now);
  const roomBuckets = new Map();
  const bucket = (category) => ({ category, amount: { coefficient: 0n, scale: 0 }, count: 0 });
  const months = Array.from({ length: 12 }, (_, i) => bucket(i + 1));
  const problems = new Map();
  let maxRooms = 0;
  const include = (entry, amount) => { entry.amount = add(entry.amount, amount); entry.count++; };
  for (const item of items) {
    if (!/^\d+$/.test(String(item.id)) || !Number.isSafeInteger(Number(item.id)) || Number(item.id) < 1) {
      throw new Error('Invalid deal ID');
    }
    const rooms = roomsValue(item[roomField]);
    const date = calendarDate(item[dateField]);
    const amount = decimal(item.opportunity);
    const currency = item.currencyId;
    const reasons = [];
    for (const [field, raw, valid] of [
      ['rooms', item[roomField], rooms], ['date', item[dateField], date],
      ['amount', item.opportunity, amount],
    ]) {
      if (!valid) reasons.push({ field, code: missing(raw) ? 'missing' : 'invalid' });
    }
    if (currency !== 'AMD') reasons.push({ field: 'currency', code: missing(currency) ? 'missing'
      : typeof currency === 'string' ? 'unsupported_currency' : 'invalid' });
    if (reasons.length) problems.set(Number(item.id), {
      id: Number(item.id), url: `${origin.origin}/crm/deal/details/${Number(item.id)}/`, reasons,
    });
    if (rooms) maxRooms = Math.max(maxRooms, rooms);
    if (!amount || currency !== 'AMD') continue;
    if (rooms) {
      if (!roomBuckets.has(rooms)) roomBuckets.set(rooms, bucket(rooms));
      include(roomBuckets.get(rooms), amount);
    }
    if (date?.year === year) include(months[date.month - 1], amount);
  }
  const serialize = (entry) => ({ ...entry, amount: decimalText(entry.amount) });
  return { year,
    rooms: Array.from({ length: maxRooms }, (_, i) => serialize(roomBuckets.get(i + 1) || bucket(i + 1))),
    months: months.map(serialize), problems: [...problems.values()].sort((a, b) => a.id - b.id),
  };
}
module.exports = { aggregate, decimal, decimalText, roomsValue, calendarDate, currentYear };
