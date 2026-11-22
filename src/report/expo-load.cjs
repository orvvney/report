const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { addDetails } = require('../bitrix24/details.cjs');
const { createClient } = require('../bitrix24/client.cjs');

const { calculateCreatedDealsComparison } = require('./expo-comparison.cjs');
const { apartmentItems, readSalesApartmentFields } = require('./apartments.cjs');
const { selectExpoRows, START_DATE } = require('./expo-selection.cjs');

const { idOf, list } = require('./expo-list.cjs');
const { resolveExpoSource } = require('./expo-source.cjs');
const TTL = 5 * 60 * 1000;
const METADATA_TTL = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit', day: '2-digit' });
function dateOf(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error('Invalid creation date');
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) throw new Error('Invalid creation date');
  return dateFormat.format(time);
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
  now = () => new Date(), scheduleRequest, waitRetry, timeoutMs, batcher, metadataCache } = {}) {
  const sources = new Map();
  return async function load({ refresh = false, view = 'full', snapshotId } = {}) {
    let config;
    try { config = loadConfig({ env, envPath }); }
    catch { return { status: 500, body: { error: 'CONFIGURATION_ERROR' } }; }
    if (!sources.has(config.webhookUrl)) sources.set(config.webhookUrl, {});
    const state = sources.get(config.webhookUrl);
    if (['details', 'comparison'].includes(view)) {
      if (!state.body || state.snapshotId !== snapshotId) return { status: 409, body: { error: 'SNAPSHOT_EXPIRED' } };
      return extra(state, view, snapshotId);
    }
    if (state.pending) {
      const result = await state.pending;
      if (result.status !== 200) return result;
      return present(state, view);
    }
    if (!refresh && state.body && now().getTime() - state.at < TTL) return present(state, view);
    state.body = null; state.snapshotId = randomUUID();
    state.pending = read(config, state, view === 'full');
    try { const result = await state.pending; return result.status === 200 ? present(state, view) : result; }
    finally { state.pending = null; }
  };
  async function extra(state, view, snapshotId) {
    const target = state.body;
    const key = view === 'details' ? 'details' : 'comparison';
    if (!state[`${key}Loaded`]) {
      if (!state[`${key}Pending`]) {
        const pending = state.loadExtra(view, target).then(patch => {
          if (state.body !== target || state.snapshotId !== snapshotId) return false;
          Object.assign(target, patch); state[`${key}Loaded`] = true; return true;
        });
        state[`${key}Pending`] = pending;
        pending.finally(() => { if (state[`${key}Pending`] === pending) state[`${key}Pending`] = null; }).catch(() => {});
      }
      try { if (!await state[`${key}Pending`]) return { status: 409, body: { error: 'SNAPSHOT_EXPIRED' } }; }
      catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
    }
    if (state.body !== target || state.snapshotId !== snapshotId) return { status: 409, body: { error: 'SNAPSHOT_EXPIRED' } };
    return { status: 200, body: structuredClone(view === 'comparison'
      ? { snapshotId, createdDealsComparison: target.createdDealsComparison }
      : { snapshotId, leads: target.leads, deals: target.deals, directDeals: target.directDeals }) };
  }
  async function present(state, view) {
    if (view === 'full') {
      for (const kind of ['comparison', 'details']) { const result = await extra(state, kind, state.snapshotId); if (result.status !== 200) return result; }
    }
    const body = structuredClone(state.body);
    if (view === 'summary') {
      delete body.createdDealsComparison;
      body.snapshotId = state.snapshotId;
      body.firstExpoDealDate = state.firstExpoDealDate;
      body.lastExpoDealDate = state.lastExpoDealDate;
    }
    return { status: 200, body };
  }
  async function read(config, state, includeExtras) {
    try {
      const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs, batcher, metadataCache });
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
              resolveExpoSource(page.result);
            } else if (page.result.some(row => !row || typeof row.STATUS_ID !== 'string' || !row.STATUS_ID)
              || new Set(page.result.map(row => row.STATUS_ID)).size !== page.result.length) throw new Error('Invalid stages');
            return page.result;
          });
          group.forEach((id, index) => metadata.set(id, {value:structuredClone(values[index]), at:now().getTime()}));
        }
        return new Map(ids.map(id => [id, metadata.get(id).value]));
      }
      const sourcePromise = directories(['SOURCE']).then(data => resolveExpoSource(data.get('SOURCE')));
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
      // The historical average covers apartments in the sales pipeline, across sources.
      const loadComparisonMetadata = async () => {
        const cacheKey = 'comparisonMetadata';
        let cached = metadata.get(cacheKey);
        if (!cached || now().getTime() - cached.at >= METADATA_TTL) {
          cached = { value: await readSalesApartmentFields(call), at: now().getTime() };
          metadata.set(cacheKey, cached);
        }
        return cached.value;
      };
      const loadBaseline = async () => {
        const { categoryId, fields, propertyCode, apartmentId } = await loadComparisonMetadata();
        const rows = await list(call, 'crm.deal.list', {
          '>=DATE_CREATE': '2026-06-01T00:00:00+04:00',
          '<DATE_CREATE': '2026-11-01T00:00:00+04:00',
          '=CATEGORY_ID': categoryId, ['=' + propertyCode]: apartmentId,
        }, ['ID', 'DATE_CREATE', 'STAGE_ID', 'CATEGORY_ID', propertyCode]);
        return apartmentItems({ fields, items: rows }).filter(row => String(row.CATEGORY_ID) === String(categoryId))
          .map(row => normalize(row, 'deal'));
      };
      const backgroundBaseline = includeExtras ? null : loadBaseline();
      backgroundBaseline?.catch(() => { metadataCache?.invalidate(config.webhookUrl); });
      const baselinePromise = includeExtras ? loadBaseline() : Promise.resolve([]);
      const leadsPromise = sourcePromise.then(sourceId => list(call, 'crm.lead.list', { '=SOURCE_ID': sourceId },
        [...select, 'NAME', 'LAST_NAME', 'STATUS_ID']).then(rows => rows.map(row =>
          Object.assign(normalize(checkSource(row, sourceId), 'lead'), {customerName:fullName(row)}))));
      const sourceDealsPromise = sourcePromise.then(sourceId => list(call, 'crm.deal.list', { '=SOURCE_ID': sourceId }, dealSelect)
        .then(rows => rows.map(row => checkSource(row, sourceId))));
      const directPromise = sourceDealsPromise.then(async sourceDeals => {
        const direct = sourceDeals.filter(row => leadIdOf(row) === null).map(row => normalize(row, 'deal'));
        const names = direct.map(row => ({id:row.id}));
        if (includeExtras) await addDetails(call, names, sourceDeals.map(row => ({id:Number(row.ID), contactId:row.CONTACT_ID})));
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
      state.firstExpoDealDate = null;
      state.lastExpoDealDate = null;
      for (const { date } of comparisonSource) {
        if (date < START_DATE) continue;
        if (!state.firstExpoDealDate || date < state.firstExpoDealDate) state.firstExpoDealDate = date;
        if (!state.lastExpoDealDate || date > state.lastExpoDealDate) state.lastExpoDealDate = date;
      }
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
      state.body = { ...(includeExtras ? {createdDealsComparison: calculateCreatedDealsComparison(baseline, comparisonSource)} : {}), sourceId, leads: selectExpoRows(unconvertedLeads, 'lead'), deals: selectExpoRows(deals, 'deal'), directDeals: selectExpoRows(directDeals, 'deal'), updatedAt: now().toISOString() };
      state.detailsLoaded = includeExtras; state.comparisonLoaded = includeExtras;
      let comparisonAttempted = false;
      state.detailsPending = null; state.comparisonPending = null;
      state.loadExtra = async (view, target) => {
        if (view === 'details') {
          const direct = structuredClone(target.directDeals);
          await addDetails(call, direct, sourceDeals.map(row => ({ id: Number(row.ID), contactId: row.CONTACT_ID })));
          return { directDeals: direct };
        }
        const historical = await (comparisonAttempted ? loadBaseline() : backgroundBaseline || loadBaseline()).finally(() => { comparisonAttempted = true; });
        const directoriesById = await directories(historical.filter(row => row.stageId).map(row => stageDirectories.get(row)));
        for (const row of historical) {
          const stage = directoriesById.get(stageDirectories.get(row))?.find(stage => stage.STATUS_ID === row.stageId);
          row.stageName = typeof stage?.NAME === 'string' ? stage.NAME.trim() : null;
        }
        return { createdDealsComparison: calculateCreatedDealsComparison(historical, comparisonSource) };
      };
      state.at = now().getTime();
      return { status: 200, body: state.body };
    } catch { metadataCache?.invalidate(config.webhookUrl); return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
  }
}
module.exports = { createExpoLoader };
