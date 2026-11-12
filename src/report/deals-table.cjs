const { decimal, compare } = require('./filter.cjs');
const PAGE_SIZE = 25;
const columns = [
  ['customerName', 'Հաճախորդ'], ['date', 'Կնքման ամսաթիվ'], ['complex', 'Համալիր'],
  ['entrance', 'Մուտք'], ['floor', 'Հարկ'], ['number', 'Համար'],
  ['rooms', 'Սենյակ'], ['area', 'Մակերես (մ²)'], ['amount', 'Արժեք (֏)'],
];
const collator = new Intl.Collator('hy', { numeric: true, sensitivity: 'base' });
const complexText = value => ({ tower: 'Թաուեր', hills: 'Հիլլս' }[value] || null);
const value = (row, key) => key === 'complex' ? complexText(row.complex) : row[key];
const missing = value => value == null || String(value).trim() === '';
function numeric(value) {
  const raw = String(value).trim();
  const negative = raw.startsWith('-');
  const parsed = decimal(negative ? raw.slice(1) : raw, true);
  return parsed ? { ...parsed, coefficient: parsed.coefficient * (negative ? -1n : 1n) } : null;
}
function sortRows(rows, key = 'date', direction = 'desc') {
  if (!columns.some(column => column[0] === key)) key = 'date';
  return [...rows].sort((a, b) => {
    const left = value(a, key), right = value(b, key);
    if (missing(left) || missing(right)) return (Number(missing(left)) - Number(missing(right))) || b.id - a.id;
    const l = numeric(left), r = numeric(right);
    const comparison = key !== 'customerName' && l && r ? compare(l, r)
      : collator.compare(String(left), String(right));
    return comparison * (direction === 'desc' ? -1 : 1) || b.id - a.id;
  });
}
function paginate(rows, page = 1) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.max(1, Math.min(pages, Math.trunc(page) || 1));
  return { page: current, pages, rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) };
}
function numberText(value) {
  const [whole, fraction] = String(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction ? `,${fraction}` : '');
}
function cellText(row, key) {
  const raw = value(row, key);
  if (key === 'customerName') return raw || `Գործարք №${row.id}`;
  if (missing(raw)) return '—';
  if (key === 'date') return raw.split('-').reverse().join('.');
  if (key === 'amount' || key === 'area') return numberText(raw);
  return String(raw);
}
module.exports = { PAGE_SIZE, columns, sortRows, paginate, cellText };
