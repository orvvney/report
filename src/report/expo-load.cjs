const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { addDetails } = require('../bitrix24/details.cjs');
const { createClient } = require('../bitrix24/client.cjs');

const { calculateCreatedDealsComparison } = require('./expo-comparison.cjs');
const { selectExpoRows } = require('./expo-selection.cjs');

const SOURCE_DIRECTORY_ID = '305';
const TTL = 5 * 60 * 1000;
const METADATA_TTL = 24 * 60 * 60 * 1000;
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
async function list(call, method, filter, select, first) {
  const params = { filter, select, order: { ID: 'ASC' } };
  const initial = first || await call(method, { ...params, start: 0 });
  const rows = [], seen = new Set();
  function append(body, start, total) {
    if (!Array.isArray(body.result) || body.result.length > 50) throw new Error('Invalid list');
    if (total !== undefined && (body.total !== total || body.result.length !== Math.min(50, total - start))) throw new Error('Changing list');
    if (body.next !== undefined && (!Number.isSafeInteger(body.next) || body.next !== start + 50 || body.result.length !== 50)) throw new Error('Invalid pagination');
    for (const row of body.result) {
      const id = idOf(row?.ID);
      if (seen.has(id) || (rows.length && id <= Number(rows.at(-1).ID))) throw new Error('Invalid order');
      seen.add(id); rows.push(row);
    }
  }
  const total = initial.total;
  if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) throw new Error('Invalid total');
  append(initial, 0, total);
  if (total !== undefined && call.batch) {
    for (let start = 50; start < total; start += 2500) {
      const commands = [];
      for (let offset = start; offset < Math.min(total, start + 2500); offset += 50)
        commands.push({ method, params: { ...params, start: offset } });
      const pages = await call.batch(commands);
      if (pages.length !== commands.length) throw new Error('Missing page');
      pages.forEach((page, index) => append(page, commands[index].params.start, total));
    }
  } else {
    let body = initial;
    while (body.next !== undefined) {
      const start = body.next;
      body = await call(method, { ...params, start });
      append(body, start, total);
    }
  }
  if (total !== undefined && rows.length !== total) throw new Error('Incomplete list');
  return rows;
}
async function listMany(call, specs) {
  const result = [];
  for (let index = 0; index < specs.length; index += 50) {
    const group = specs.slice(index, index + 50);
    const first = await call.batch(group.map(({method, filter, select}) => ({method,
      params: {filter, select, order:{ID:'ASC'}, start:0}})));
    if (first.length !== group.length) throw new Error('Missing list');
    result.push(...await Promise.all(group.map((spec, i) => list(call, spec.method, spec.filter, spec.select, first[i]))));
  }
  return result;
}

function createExpoLoader({ env = process.env, envPath = path.resolve(__dirname, '../../.env'), fetchImpl = globalThis.fetch,
  now = () => new Date(), scheduleRequest, waitRetry, timeoutMs, batcher } = {}) {
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
      const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs, batcher });
      const origin = new URL(config.webhookUrl).origin;
      const metadata = state.metadata ||= new Map();
      async function directories(entityIds) {
        const ids = [...new Set(entityIds)];
        const missing = ids.filter(id => !metadata.has(id) || now().getTime() - metadata.get(id).at >= METADATA_TTL);
        for (let offset = 0; offset < missing.length; offset += 50) {
          const group = missing.slice(offset, offset + 50);
          const pages = await call.batch(group.map(ENTITY_ID => ({method:'crm.status.list', params:{filter:{ENTITY_ID}}})));
          if (pages.length !== group.length) throw new Error('Missing directory');
          const values = pages.map((page, index) => {
            if (!Array.isArray(page.result)) throw new Error('Invalid directory');
            if (group[index] === 'SOURCE') {
              const matches = page.result.filter(row => String(row?.ID) === SOURCE_DIRECTORY_ID);
              if (matches.length !== 1 || typeof matches[0].STATUS_ID !== 'string' || !matches[0].STATUS_ID.trim()) throw new Error('Invalid source');
            } else if (page.result.some(row => !row || typeof row.STATUS_ID !== 'string' || !row.STATUS_ID)
              || new Set(page.result.map(row => row.STATUS_ID)).size !== page.result.length) throw new Error('Invalid stages');
            return page.result;
          });
          group.forEach((id, index) => metadata.set(id, {value:structuredClone(values[index]), at:now().getTime()}));
        }
        return new Map(ids.map(id => [id, metadata.get(id).value]));
      }
      const sourcePromise = directories(['SOURCE']).then(data => data.get('SOURCE').find(row => String(row.ID) === SOURCE_DIRECTORY_ID).STATUS_ID);
      const stageDirectories = new Map();
      const normalize = (row, entity) => {
        const id = idOf(row.ID);
        const stageId = entity === 'lead' ? row.STATUS_ID : row.STAGE_ID;
        const categoryId = Number(row.CATEGORY_ID ?? 0);
        if (entity === 'deal' && (!Number.isSafeInteger(categoryId) || categoryId < 0)) throw new Error('Invalid category');
        const result = { id, title: String(row.TITLE || `#${id}`), date: dateOf(row.DATE_CREATE), url: `${origin}/crm/${entity}/details/${id}/`,
          stageId: typeof stageId === 'string' && stageId.trim() ? stageId : null, stageName: null };
        stageDirectories.set(result, entity === 'lead' ? 'STATUS' : categoryId === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${categoryId}`);
        return result;
      };
      const select = ['ID', 'TITLE', 'SOURCE_ID', 'DATE_CREATE'];
      const checkSource = (row, sourceId) => {
        if (String(row.SOURCE_ID) !== sourceId) throw new Error('Unexpected source');
        return row;
      };
      const fullName = row => [row.NAME, row.LAST_NAME].filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean).join(' ') || null;
      const leadIdOf = row => [undefined, null, '', 0, '0'].includes(row.LEAD_ID) ? null : idOf(row.LEAD_ID);
      const dealSelect = [...select, 'LEAD_ID', 'CONTACT_ID', 'STAGE_ID', 'CATEGORY_ID'];
      // History is independent of SOURCE. Other initial pages start as soon as
      // the directory resolves; the server coordinator combines ready reads.
      const baselinePromise = list(call, 'crm.deal.list', {
        '>=DATE_CREATE': '2026-06-01T00:00:00+04:00',
        '<DATE_CREATE': '2026-11-01T00:00:00+04:00',
      }, ['ID', 'DATE_CREATE', 'STAGE_ID', 'CATEGORY_ID']).then(rows => rows.map(row => normalize(row, 'deal')));
      const leadsPromise = sourcePromise.then(sourceId => list(call, 'crm.lead.list', { '=SOURCE_ID': sourceId },
        [...select, 'NAME', 'LAST_NAME', 'STATUS_ID']).then(rows => rows.map(row =>
          Object.assign(normalize(checkSource(row, sourceId), 'lead'), {customerName:fullName(row)}))));
      const sourceDealsPromise = sourcePromise.then(sourceId => list(call, 'crm.deal.list', { '=SOURCE_ID': sourceId }, dealSelect)
        .then(rows => rows.map(row => checkSource(row, sourceId))));
      const directPromise = sourceDealsPromise.then(async sourceDeals => {
        const direct = sourceDeals.filter(row => leadIdOf(row) === null).map(row => normalize(row, 'deal'));
        const names = direct.map(row => ({id:row.id}));
        await addDetails(call, names, sourceDeals.map(row => ({id:Number(row.ID), contactId:row.CONTACT_ID})));
        direct.forEach((row, index) => {row.customerName = names[index].customerName;});
        return direct;
      });
      const linkedPromise = leadsPromise.then(async leads => {
        const leadNames = new Map(leads.map(row => [row.id, row.customerName]));
        const specs = [];
        for (let offset = 0; offset < leads.length; offset += 50) specs.push({method:'crm.deal.list',
          filter:{'@LEAD_ID':leads.slice(offset, offset + 50).map(row => row.id)}, select:dealSelect});
        const groups = await listMany(call, specs);
        return groups.flatMap((rows, index) => {
          const allowed = new Set(specs[index].filter['@LEAD_ID']);
          return rows.map(row => {
            const leadId = leadIdOf(row);
            if (!allowed.has(leadId)) throw new Error('Unexpected lead relation');
            return Object.assign(normalize(row, 'deal'), {leadId, customerName:leadNames.get(leadId)});
          });
        });
      });
      // Resolve known stage directories while linked deals are being fetched.
      const prefetch = Promise.all([leadsPromise, sourceDealsPromise, baselinePromise]).then(([leads, raw, baseline]) => {
        const source = raw.map(row => normalize(row, 'deal'));
        return directories([...leads, ...source, ...baseline].filter(row => row.stageId).map(row => stageDirectories.get(row)));
      });
      const [sourceId, leads, sourceDeals, baseline, directDeals, deals] = await Promise.all([
        sourcePromise, leadsPromise, sourceDealsPromise, baselinePromise, directPromise, linkedPromise, prefetch]);
      const comparisonSource = sourceDeals.map(row => normalize(row, 'deal'));
      const convertedLeadIds = new Set(deals.map(deal => deal.leadId));
      const unconvertedLeads = leads.filter(lead => !convertedLeadIds.has(lead.id));
      const allRows = [...unconvertedLeads, ...directDeals, ...deals, ...baseline, ...comparisonSource];
      const stageNames = await directories(allRows.filter(row => row.stageId).map(row => stageDirectories.get(row)));
      for (const row of allRows) {
        if (!row.stageId) continue;
        const directory = stageNames.get(stageDirectories.get(row));
        const stage = directory.find(stage => stage.STATUS_ID === row.stageId);
        row.stageName = typeof stage?.NAME === 'string' ? stage.NAME.trim() : null;
      }
      state.body = { createdDealsComparison: calculateCreatedDealsComparison(baseline, comparisonSource), sourceId, leads: selectExpoRows(unconvertedLeads, 'lead'), deals: selectExpoRows(deals, 'deal'), directDeals: selectExpoRows(directDeals, 'deal'), updatedAt: now().toISOString() };
      state.at = now().getTime();
      return { status: 200, body: state.body };
    } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
  }
}
module.exports = { createExpoLoader };
