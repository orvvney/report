const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { addDetails } = require('../bitrix24/details.cjs');
const { createClient } = require('../bitrix24/client.cjs');

const SOURCE_DIRECTORY_ID = '305';
const TTL = 5 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit', day: '2-digit' });
function dateOf(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error('Invalid creation date');
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) throw new Error('Invalid creation date');
  return dateFormat.format(time);
}
function idOf(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid ID');
  return Number(value);
}
async function list(call, method, filter, select) {
  let start = 0;
  const rows = [], seen = new Set();
  while (true) {
    const body = await call(method, { filter, select, order: { ID: 'ASC' }, start });
    if (!Array.isArray(body.result) || body.result.length > 50) throw new Error('Invalid list');
    for (const row of body.result) {
      const id = idOf(row?.ID);
      if (seen.has(id) || (rows.length && id <= Number(rows.at(-1).ID))) throw new Error('Invalid order');
      seen.add(id); rows.push(row);
    }
    if (body.next === undefined) return rows;
    if (!Number.isSafeInteger(body.next) || body.next <= start || !body.result.length) throw new Error('Invalid pagination');
    start = body.next;
  }
}
function createExpoLoader({ env = process.env, envPath = path.resolve(__dirname, '../../.env'), fetchImpl = globalThis.fetch,
  now = () => new Date(), scheduleRequest, waitRetry, timeoutMs } = {}) {
  const sources = new Map();
  return async function load({ refresh = false } = {}) {
    let config;
    try { config = loadConfig({ env, envPath }); }
    catch { return { status: 500, body: { error: 'CONFIGURATION_ERROR' } }; }
    if (!sources.has(config.webhookUrl)) sources.set(config.webhookUrl, {});
    const state = sources.get(config.webhookUrl);
    if (state.pending) return structuredClone(await state.pending);
    if (!refresh && state.body && now().getTime() - state.at < TTL) return { status: 200, body: structuredClone(state.body) };
    state.body = null;
    state.pending = read(config, state);
    try { return structuredClone(await state.pending); }
    finally { state.pending = null; }
  };
  async function read(config, state) {
    try {
      const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs });
      const origin = new URL(config.webhookUrl).origin;
      // Directory ID and the SOURCE_ID value stored on cards are different fields.
      const sources = await call('crm.status.list', { filter: { ENTITY_ID: 'SOURCE' } });
      const matches = sources.result.filter(row => String(row?.ID) === SOURCE_DIRECTORY_ID);
      if (matches.length !== 1 || typeof matches[0].STATUS_ID !== 'string' || !matches[0].STATUS_ID.trim()) {
        throw new Error('Source directory entry is missing or ambiguous');
      }
      const sourceId = matches[0].STATUS_ID;
      const normalize = (row, entity) => {
        const id = idOf(row.ID);
        return { id, title: String(row.TITLE || `#${id}`), date: dateOf(row.DATE_CREATE), url: `${origin}/crm/${entity}/details/${id}/` };
      };
      const select = ['ID', 'TITLE', 'SOURCE_ID', 'DATE_CREATE'];
      const checkSource = row => {
        if (String(row.SOURCE_ID) !== sourceId) throw new Error('Unexpected source');
        return row;
      };
      const fullName = row => [row.NAME, row.LAST_NAME].filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean).join(' ') || null;
      const leads = (await list(call, 'crm.lead.list', { '=SOURCE_ID': sourceId }, [...select, 'NAME', 'LAST_NAME']))
        .map(row => ({ ...normalize(checkSource(row), 'lead'), customerName: fullName(row) }));
      const leadNames = new Map(leads.map(row => [row.id, row.customerName]));
      const leadIdOf = row => [undefined, null, '', 0, '0'].includes(row.LEAD_ID) ? null : idOf(row.LEAD_ID);
      const dealSelect = [...select, 'LEAD_ID', 'CONTACT_ID'];
      const sourceDeals = await list(call, 'crm.deal.list', { '=SOURCE_ID': sourceId }, dealSelect);
      const directDeals = sourceDeals.map(checkSource).filter(row => leadIdOf(row) === null).map(row => normalize(row, 'deal'));
      const contactNames = directDeals.map(row => ({ id: row.id }));
      await addDetails(call, contactNames, sourceDeals.map(row => ({ id: Number(row.ID), contactId: row.CONTACT_ID })));
      directDeals.forEach((row, index) => { row.customerName = contactNames[index].customerName; });
      const deals = [];
      for (let offset = 0; offset < leads.length; offset += 50) {
        const ids = leads.slice(offset, offset + 50).map(row => row.id);
        const allowed = new Set(ids);
        const linked = await list(call, 'crm.deal.list', { '@LEAD_ID': ids }, dealSelect);
        for (const row of linked) {
          const leadId = leadIdOf(row);
          if (!allowed.has(leadId)) throw new Error('Unexpected lead relation');
          deals.push({ ...normalize(row, 'deal'), leadId, customerName: leadNames.get(leadId) });
        }
      }
      const convertedLeadIds = new Set(deals.map(deal => deal.leadId));
      state.body = { sourceId, leads: leads.filter(lead => !convertedLeadIds.has(lead.id)), deals, directDeals, updatedAt: now().toISOString() };
      state.at = now().getTime();
      return { status: 200, body: state.body };
    } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
  }
}
module.exports = { createExpoLoader };
