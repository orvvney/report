const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { createClient } = require('../bitrix24/client.cjs');
const { getDeals, getMetadata } = require('../bitrix24/deals.cjs');
const { aggregate, currentYear } = require('./aggregate.cjs');
const { calculate } = require('./filter.cjs');
const { PROPERTY_TYPE, apartmentItems } = require('./apartments.cjs');
const { COMPLEX, complexField } = require('./complex.cjs');
const { DETAIL_FIELDS, addDetails } = require('../bitrix24/details.cjs');

const REPORT_TTL = 5 * 60 * 1000;
const METADATA_TTL = 24 * 60 * 60 * 1000;

// Each HTTP server owns its cache. A separate loader is also useful for CLI
// benchmarks, which deliberately perform entirely cold loads.
function createReportLoader({ env = process.env, envPath = path.resolve(__dirname, '../../.env'),
  fetchImpl = globalThis.fetch, now = () => new Date(), scheduleRequest, waitRetry, timeoutMs, batcher, metadataCache, propertyType = 'Բնակարան' } = {}) {
  const sources = new Map();
  return async function load({ refresh = false, view = 'full', snapshotId } = {}) {
    let config;
    try { config = loadConfig({ env, envPath }); }
    catch { return { status: 500, body: { error: 'CONFIGURATION_ERROR' } }; }
    const key = config.webhookUrl;
    if (!sources.has(key)) sources.set(key, {});
    const state = sources.get(key);
    if (view === 'details') {
      if (!state.report || snapshotId !== state.snapshotId) return { status: 409, body: { error: 'SNAPSHOT_EXPIRED' } };
      return details(state, config, snapshotId);
    }
    if (state.pending) {
      const result = await state.pending;
      if (result.status !== 200) return result;
      if (view === 'full') { const enriched = await details(state, config, state.snapshotId); if (enriched.status !== 200) return enriched; }
      return present(result, state, view);
    }

    if (!refresh && state.report && now().getTime() - state.reportAt < REPORT_TTL) {
      if (view === 'full') { const result = await details(state, config, state.snapshotId); if (result.status !== 200) return result; }
      return present({ status: 200, body: state.report }, state, view);
    }
    // A failed forced refresh must not expose the superseded snapshot later.
    state.report = null; state.snapshotId = randomUUID();
    state.pending = read(state, config, view === 'full');
    try { return present(await state.pending, state, view); }
    finally { state.pending = null; }
  };

  function present(result, state, view) {
    if (result.status !== 200) return result;
    const body = structuredClone(result.body);
    if (view === 'summary') body.snapshotId = state.snapshotId;
    const year = currentYear(now());
    if (body.year !== year) Object.assign(body, { year }, calculate(body.deals, year));
    return { status: 200, body };
  }

  async function details(state, config, snapshotId) {
    const target = state.report;
    if (!state.detailsLoaded) {
      if (!state.detailsPending) {
        const pending = (async () => {
          const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs, batcher, metadataCache });
          const deals = structuredClone(target.deals);
          await addDetails(call, deals, state.raw.items, state.raw.fields);
          if (state.report !== target || state.snapshotId !== snapshotId) return false;
          target.deals = deals; state.detailsLoaded = true;
          return true;
        })();
        state.detailsPending = pending;
        pending.finally(() => { if (state.detailsPending === pending) state.detailsPending = null; }).catch(() => {});
      }
      try {
        if (!await state.detailsPending) return { status: 409, body: { error: 'SNAPSHOT_EXPIRED' } };
      } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
    }
    if (state.report !== target || state.snapshotId !== snapshotId) return { status: 409, body: { error: 'SNAPSHOT_EXPIRED' } };
    return { status: 200, body: { snapshotId, details: target.deals.map(({ id, customerName, entrance, floor, number }) => ({ id, customerName, entrance, floor, number })) } };
  }

  async function read(state, config, includeDetails) {
    try {
      const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs, batcher, metadataCache });
      if (!state.metadata || now().getTime() - state.metadataAt >= METADATA_TTL) {
        state.metadata = null;
        const metadata = await getMetadata(call, { additionalFields: [PROPERTY_TYPE, COMPLEX], optionalFields: Object.values(DETAIL_FIELDS), ...(propertyType === 'Ավտոկայանատեղի' ? { requiredFields: ['Կնքման ամսաթիվ'] } : {}) });
        // Validate enumeration before publishing metadata, even with no deals.
        apartmentItems({ ...metadata, items: [] }, propertyType);
        complexField(metadata.fields);
        state.metadata = metadata;
        state.metadataAt = now().getTime();
      }
      const property = state.metadata.fields.find(field => field.title === PROPERTY_TYPE);
      const apartmentId = property.items.find(item => item.VALUE === propertyType).ID;
      const data = await getDeals(call, { metadata: state.metadata, extraSelect: ['contactId'],
        filter: { [property.code]: apartmentId }, counted: true });
      if (apartmentItems(data, propertyType).length !== data.items.length) throw new Error('Invalid apartment filter');
      const snapshotTime = now();
      const body = { ...aggregate(data, { portalOrigin: new URL(config.webhookUrl).origin, now: snapshotTime, propertyType }),
        updatedAt: snapshotTime.toISOString() };
      if (includeDetails) await addDetails(call, body.deals, data.items, data.fields);
      const completed = now();
      const year = currentYear(completed);
      if (body.year !== year) Object.assign(body, { year }, calculate(body.deals, year));
      body.updatedAt = completed.toISOString();
      state.raw = data; state.detailsLoaded = includeDetails; state.detailsPending = null;
      state.report = body;
      state.reportAt = completed.getTime();
      return { status: 200, body };
    } catch { metadataCache?.invalidate(config.webhookUrl); return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
  }
}

async function loadReport(options) {
  return createReportLoader(options)();
}
module.exports = { loadReport, createReportLoader };
