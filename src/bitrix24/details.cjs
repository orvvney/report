// Match user-supplied original codes to metadata; never guess the API spelling.
const DETAIL_FIELDS = {
  entrance: 'UF_CRM_1776430614152',
  floor: 'UF_CRM_1686473759',
  number: 'UF_CRM_1776254518',
};
const fieldKey = code => String(code).replace(/_/g, '').toLowerCase();
const text = value => typeof value === 'string' ? value.trim() || null
  : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
const contactId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))
  ? String(value) : null;

async function addDetails(call, deals, items, fields = []) {
  const byId = new Map(items.map(item => [Number(item.id), item]));
  const readers = Object.entries(DETAIL_FIELDS).map(([key, original]) => {
    const field = fields.find(field => fieldKey(field.code) === fieldKey(original));
    const options = new Map((Array.isArray(field?.items) ? field.items : [])
      .filter(item => item && text(item.ID) !== null && text(item.VALUE) !== null)
      .map(item => [text(item.ID), text(item.VALUE)]));
    return [key, raw => {
      const value = text(raw?.[field?.code]);
      return field?.type === 'enumeration' ? options.get(value) || null : value;
    }];
  });
  const ids = [...new Set(deals.map(deal => contactId(byId.get(deal.id)?.contactId)).filter(Boolean))];
  const names = new Map();
  // Each group contains at most one API page. Missing/inaccessible contacts are
  // optional decoration and must never invalidate a complete deals snapshot.
  const groups = [];
  for (let start = 0; start < ids.length; start += 50) groups.push(ids.slice(start, start + 50));
  // Up to 50 one-page contact lookups share one HTTP request.
  for (let start = 0; start < groups.length; start += 50) {
    const packet = groups.slice(start, start + 50);
    const commands = packet.map(group => ({ method: 'crm.item.list', params: {
      entityTypeId: 3, select: ['id', 'name', 'lastName'],
      filter: { '@id': group }, order: { id: 'ASC' }, start: -1,
    } }));
    let results;
    try {
      results = call.batch ? await call.batch(commands, { allowPartial: true })
        : await Promise.all(commands.map(async ({method, params}) => {
          try { return await call(method, params); } catch { return null; }
        }));
    } catch {
      // A failed contact packet must not invalidate the deals snapshot.
      continue;
    }
    for (let index = 0; index < packet.length; index++) {
      const group = packet[index];
      const body = results[index];
      const rows = body?.result?.items;
      if (!Array.isArray(rows) || rows.length > group.length || body.next !== undefined
        || rows.some(row => !row || !group.includes(contactId(row.id)))
        || new Set(rows.map(row => String(row.id))).size !== rows.length) continue;
      for (const row of rows) names.set(String(row.id), [text(row.name), text(row.lastName)].filter(Boolean).join(' ') || null);
    }
  }
  for (const deal of deals) {
    const raw = byId.get(deal.id);
    deal.customerName = names.get(contactId(raw?.contactId)) || null;
    for (const [key, read] of readers) deal[key] = read(raw);
  }
}
module.exports = { DETAIL_FIELDS, fieldKey, addDetails };
