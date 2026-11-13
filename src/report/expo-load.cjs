const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { createClient } = require('../bitrix24/client.cjs');

const SOURCE_ID = '305';
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
      const normalize = (row, entity) => {
        if (String(row.SOURCE_ID) !== SOURCE_ID) throw new Error('Unexpected source');
        const id = idOf(row.ID);
        return { id, title: String(row.TITLE || `#${id}`), date: dateOf(row.DATE_CREATE), url: `${origin}/crm/${entity}/details/${id}/` };
      };
      const select = ['ID', 'TITLE', 'SOURCE_ID', 'DATE_CREATE'];
      const leads = (await list(call, 'crm.lead.list', { '=SOURCE_ID': SOURCE_ID }, select)).map(row => normalize(row, 'lead'));
      // Deals are an independent source selection, including those without a linked lead.
      const deals = (await list(call, 'crm.deal.list', { '=SOURCE_ID': SOURCE_ID }, select)).map(row => normalize(row, 'deal'));
      state.body = { sourceId: SOURCE_ID, leads, deals, updatedAt: now().toISOString() };
      state.at = now().getTime();
      return { status: 200, body: state.body };
    } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
  }
}
module.exports = { createExpoLoader };
