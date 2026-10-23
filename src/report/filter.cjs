// Decimal coefficients keep every digit from the API; rounding is only for axis labels.
function decimal(value, allowZero = false) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const text = String(value).trim();
  if (!/^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+\-]?\d+)?$/i.test(text)
    || !Number.isFinite(Number(text)) || (allowZero ? Number(text) < 0 : Number(text) <= 0)) return null;
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

function compare(a, b) {
  const scale = Math.max(a.scale, b.scale);
  const left = a.coefficient * 10n ** BigInt(scale - a.scale);
  const right = b.coefficient * 10n ** BigInt(scale - b.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
function roomOptions(deals) {
  const maximum = deals.reduce((max, deal) => Math.max(max, deal.rooms), 0);
  return Array.from({ length: maximum }, (_, i) => i + 1);
}
function reconcileRooms(previous, selected, available) {
  const kept = available.filter((room) => !previous.includes(room) || selected.includes(room));
  return kept.length ? kept : [...available];
}
function toggleRoom(selected, room) {
  return selected.includes(room)
    ? selected.length > 1 ? selected.filter((value) => value !== room) : selected
    : [...selected, room].sort((a, b) => a - b);
}
// Draft text and native date validity remain separate from the last applied pair.
function validateRange(kind, draft, badInput = {}) {
  const values = {};
  const errors = {};
  for (const side of ['min', 'max']) {
    const raw = draft[side].trim();
    if (badInput[side]) errors[side] = 'invalid';
    else if (!raw) values[side] = null;
    else if (kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !calendarDate(raw)) errors[side] = 'invalid';
      else values[side] = raw;
    } else {
      const normalized = raw.replace(',', '.');
      const value = /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)
        ? decimal(normalized, true) : null;
      if (!value) errors[side] = 'invalid';
      else values[side] = decimalText(value);
    }
  }
  if (!Object.keys(errors).length && values.min !== null && values.max !== null) {
    const reversed = kind === 'date' ? values.min > values.max
      : compare(decimal(values.min, true), decimal(values.max, true)) > 0;
    if (reversed) errors.min = errors.max = 'reversed';
  }
  return { values, errors, valid: !Object.keys(errors).length };
}
function within(value, range, kind) {
  if (!range) return true;
  const comparison = (bound) => kind === 'date' ? (value < bound ? -1 : value > bound ? 1 : 0)
    : compare(decimal(value, true), decimal(bound, true));
  return (range.min == null || comparison(range.min) >= 0)
    && (range.max == null || comparison(range.max) <= 0);
}
function calculate(deals, year, { rooms = roomOptions(deals), amount, area, date } = {}) {
  const bucket = (category) => ({ category, amount: { coefficient: 0n, scale: 0 }, count: 0 });
  const roomBuckets = new Map([...rooms].sort((a, b) => a - b).map((room) => [room, bucket(room)]));
  const months = Array.from({ length: 12 }, (_, i) => bucket(i + 1));
  const include = (entry, value) => { entry.amount = add(entry.amount, value); entry.count++; };
  for (const deal of deals) {
    if (!roomBuckets.has(deal.rooms) || !within(deal.amount, amount) || !within(deal.area, area)
      || !within(deal.date, date, 'date')) continue;
    const value = decimal(deal.amount);
    include(roomBuckets.get(deal.rooms), value);
    if (Number(deal.date.slice(0, 4)) === year) include(months[Number(deal.date.slice(5, 7)) - 1], value);
  }
  const serialize = (entry) => ({ ...entry, amount: decimalText(entry.amount) });
  return { rooms: [...roomBuckets.values()].map(serialize), months: months.map(serialize) };
}
module.exports = { decimal, decimalText, roomsValue, calendarDate, compare, roomOptions,
  reconcileRooms, toggleRoom, validateRange, calculate };
