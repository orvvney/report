const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { createClient, isObject } = require('../bitrix24/client.cjs');
const { apartmentItems, PROPERTY_TYPE } = require('./apartments.cjs');

const STAGES = ['Ազատ', 'Վաճառքի ենթակա չէ', 'Ընտրված է գործարքում', 'Տեղեկանք', 'Ամրագրված', 'Վաճառված', 'Կնքված.', 'Կնքված'];
// CRM uses a one dot leader in «Կնքված․»; the UI label uses an ASCII dot.
const stageName = name => typeof name === 'string' ? name.trim().replaceAll('․', '.') : null;
const TTL = 5 * 60 * 1000;
async function list(call, method, params, key) {
  const rows = [];
  let start = 0;
  while (true) {
    const body = await call(method, { ...params, start });
    const page = key ? body.result?.[key] : body.result;
    if (!Array.isArray(page) || page.some(row => !isObject(row))) throw new Error('Invalid metadata');
    rows.push(...page);
    if (body.next === undefined) return rows;
    if (!Number.isSafeInteger(body.next) || body.next <= start || !page.length) throw new Error('Invalid pagination');
    start = body.next;
  }
}
async function readCounts(call) {
  const types = await list(call, 'crm.type.list', {}, 'types');
  const matches = types.filter(type => type.title === 'Անշարժ գույք');
  const entityTypeId = Number(matches[0]?.entityTypeId);
  if (matches.length !== 1 || !Number.isSafeInteger(entityTypeId) || entityTypeId < 128) throw new Error('Invalid property process');
  const raw = await call('crm.item.fields', { entityTypeId, useOriginalUfNames: 'N' });
  if (!isObject(raw.result?.fields)) throw new Error('Invalid fields');
  const fields = Object.entries(raw.result.fields).map(([code, field]) => ({ ...field, code }));
  apartmentItems({ fields, items: [] });
  const property = fields.find(field => field.title === PROPERTY_TYPE);
  const apartmentId = property.items.find(item => item.VALUE === 'Բնակարան').ID;
  const categories = await list(call, 'crm.category.list', { entityTypeId }, 'categories');
  const stages = new Map();
  for (const category of categories) {
    const categoryId = Number(category.id);
    if (!Number.isSafeInteger(categoryId) || categoryId < 0) throw new Error('Invalid category');
    const entity = `DYNAMIC_${entityTypeId}_STAGE_${categoryId}`;
    const rows = await list(call, 'crm.status.list', { filter: { ENTITY_ID: entity } });
    for (const row of rows.filter(row => row.ENTITY_ID === entity && STAGES.includes(stageName(row.NAME)))) {
      if (typeof row.STATUS_ID !== 'string' || !row.STATUS_ID || stages.has(row.STATUS_ID)) throw new Error('Invalid stage');
      stages.set(row.STATUS_ID, { name: stageName(row.NAME), categoryId });
    }
  }
  if (STAGES.some(name => ![...stages.values()].some(stage => stage.name === name))) throw new Error('Missing stage');
  const counts = new Map(STAGES.map(name => [name, 0]));
  let last = 0;
  while (true) {
    const body = await call('crm.item.list', { entityTypeId, useOriginalUfNames: 'N', start: -1,
      select: ['id', 'categoryId', 'stageId', property.code], order: { id: 'ASC' },
      filter: { [property.code]: apartmentId, '>id': last } });
    const items = body.result?.items;
    if (!Array.isArray(items) || items.length > 50) throw new Error('Invalid items');
    for (const item of items) {
      const id = Number(item?.id);
      if (!isObject(item) || !Number.isSafeInteger(id) || id <= last || !/^\d+$/.test(String(item.id))) throw new Error('Invalid item order');
      last = id;
      if (!apartmentItems({ fields, items: [item] }).length) throw new Error('Invalid property filter');
      const stage = stages.get(item.stageId);
      if (stage) {
        if (String(stage.categoryId) !== String(item.categoryId)) throw new Error('Invalid item category');
        counts.set(stage.name, counts.get(stage.name) + 1);
      }
    }
    if (items.length < 50) break;
  }
  return { stages: STAGES.map(name => ({ name, count: counts.get(name) })) };
}
function createPropertyStagesLoader({ env = process.env, envPath = path.resolve(__dirname, '../../.env'),
  fetchImpl = globalThis.fetch, now = () => new Date(), scheduleRequest, waitRetry, timeoutMs } = {}) {
  const sources = new Map();
  return async ({ refresh = false } = {}) => {
    let config;
    try { config = loadConfig({ env, envPath }); }
    catch { return { status: 500, body: { error: 'CONFIGURATION_ERROR' } }; }
    const key = config.webhookUrl;
    if (!sources.has(key)) sources.set(key, {});
    const state = sources.get(key);
    if (state.pending) return structuredClone(await state.pending);
    if (!refresh && state.body && now().getTime() - state.at < TTL) return { status: 200, body: structuredClone(state.body) };
    state.body = null;
    state.pending = (async () => {
      try {
        const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs });
        const body = await readCounts(call);
        body.updatedAt = now().toISOString();
        state.body = body; state.at = now().getTime();
        return { status: 200, body };
      } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
    })();
    try { return structuredClone(await state.pending); }
    finally { state.pending = null; }
  };
}
module.exports = { STAGES, readCounts, createPropertyStagesLoader };
