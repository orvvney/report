const { filterDeals, decimal, decimalText, add } = require('./filter.cjs');
const months = ['Հունվար','Փետրվար','Մարտ','Ապրիլ','Մայիս','Հունիս','Հուլիս','Օգոստոս','Սեպտեմբեր','Հոկտեմբեր','Նոյեմբեր','Դեկտեմբեր'];
function timeType(period) { return period === 'year' ? 'year' : period === 'quarter' ? 'quarter' : 'month'; }
function interval(value, step) { const d = decimal(value); const index = d.coefficient / (10n ** BigInt(d.scale) * BigInt(step)); return [index * BigInt(step), (index + 1n) * BigInt(step)]; }
const grouped = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
// Category colors use the complete loaded domain, so filtering keeps their identity.
const palette = [210, 25, 140, 280, 55, 180, 335, 90, 250, 5, 165, 310];
const orderRows = (a,b) => a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
function category(deal, type) {
 let key, label, order;
 if (type === 'area' || type === 'amount') { const [a,b] = interval(deal[type], type === 'area' ? 10 : 10000000); key = String(a); label = type === 'area' ? `${grouped(a)}–${grouped(b)} մ²` : `${grouped(a / 1000000n)} մլն–${grouped(b / 1000000n)} մլն ֏`; order = a; }
  else if (type === 'complex') { key = deal.complex; label = key === 'tower' ? 'Թաուեր' : 'Հիլլս'; order = key === 'tower' ? 0 : 1; }
  else if (type === 'rooms') { key = String(deal.rooms); label = `${key} սենյակ`; order = deal.rooms; }
  else { const year = deal.date.slice(0,4), month = Number(deal.date.slice(5,7)), quarter = Math.ceil(month/3); key = type === 'year' ? year : `${year}-${String(type === 'quarter' ? quarter : month).padStart(2,'0')}`; label = type === 'year' ? year : type === 'quarter' ? `${['I','II','III','IV'][quarter-1]} ${year}` : `${months[month-1]} ${year}`; order = key; }
 return { key, label, order };
}
function statistics(deals, filters = {}, type) {
 const {date, dateRanges, ...otherFilters} = filters;
 const selected = filterDeals(deals, type === 'year' ? otherFilters : filters);
 const buckets = new Map(), domain = new Map();
 let amount = decimal('0', true);
 for (const deal of deals) {
  const row = category(deal, type);
  domain.set(row.key, row);
 }
 if (type === 'year' && domain.size) {
  const years = [...domain.keys()].map(Number);
  for (let year = Math.min(...years); year <= Math.max(...years); year++) {
   const key = String(year), row = { key, label:key, order:key };
   domain.set(key, row); buckets.set(key, {...row, count:0});
  }
 }
 const colors = new Map([...domain.values()].sort(orderRows).map((row,index) => [row.key,
  `hsl(${index < palette.length ? palette[index] : (index * 137.508) % 360} 70% 48%)`]));
 for (const deal of selected) {
  amount = add(amount, decimal(deal.amount));
  const row = category(deal, type);
  if (!buckets.has(row.key)) buckets.set(row.key, {...row, count:0});
  buckets.get(row.key).count++;
 }
 const rows = [...buckets.values()].sort(orderRows).map(row => {
  const share = selected.length ? row.count / selected.length : 0;
  return {...row, share, percent:`${(Math.round(share*1000)/10).toString().replace('.',',')}%`, color:colors.get(row.key)};
 });
 return { count:selected.length, amount:decimalText(amount), rows };
}
function groupCategories(rows, type) {
 if (!['area','amount'].includes(type) || rows.length <= 4) return rows;
 const largest = new Set([...rows].sort((a,b) => b.count-a.count || orderRows(a,b)).slice(0,4).map(row=>row.key));
 const children = rows.filter(row=>!largest.has(row.key));
 const count = children.reduce((sum,row)=>sum+row.count,0);
 const total = rows.reduce((sum,row)=>sum+row.count,0), share = count/total;
 const other = {key:'other',label:'Այլ',count,share,percent:`${(Math.round(share*1000)/10).toString().replace('.',',')}%`,color:'hsl(0 0% 48%)',children};
 return [...rows.filter(row=>largest.has(row.key)),other];
}
module.exports = { statistics, timeType, interval, groupCategories };
