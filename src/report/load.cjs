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
  fetchImpl = globalThis.fetch, now = () => new Date(), scheduleRequest, waitRetry, timeoutMs } = {}) {
  const sources = new Map();
  return async function load({ refresh = false } = {}) {
    let config;
    try { config = loadConfig({ env, envPath }); }
    catch { return { status: 500, body: { error: 'CONFIGURATION_ERROR' } }; }
    const key = config.webhookUrl;
    if (!sources.has(key)) sources.set(key, {});
    const state = sources.get(key);
    if (state.pending) return present(await state.pending);
    if (!refresh && state.report && now().getTime() - state.reportAt < REPORT_TTL) {
      return present({ status: 200, body: state.report });
    }
    // A failed forced refresh must not expose the superseded snapshot later.
    state.report = null;
    state.pending = read(state, config);
    try { return present(await state.pending); }
    finally { state.pending = null; }
  };

  function present(result) {
    if (result.status !== 200) return result;
    const body = structuredClone(result.body);
    const year = currentYear(now());
    if (body.year !== year) Object.assign(body, { year }, calculate(body.deals, year));
    return { status: 200, body };
  }

  async function read(state, config) {
    try {
      const call = createClient({ ...config, fetchImpl, scheduleRequest, waitRetry, timeoutMs });
      if (!state.metadata || now().getTime() - state.metadataAt >= METADATA_TTL) {
        state.metadata = null;
        const metadata = await getMetadata(call, { additionalFields: [PROPERTY_TYPE, COMPLEX], optionalFields: Object.values(DETAIL_FIELDS) });
        // Validate enumeration before publishing metadata, even with no deals.
        apartmentItems({ ...metadata, items: [] });
        complexField(metadata.fields);
        state.metadata = metadata;
        state.metadataAt = now().getTime();
      }
      const data = await getDeals(call, { metadata: state.metadata, extraSelect: ['contactId'] });
      const snapshotTime = now();
      const body = { ...aggregate(data, { portalOrigin: new URL(config.webhookUrl).origin, now: snapshotTime }),
        updatedAt: snapshotTime.toISOString() };
      await addDetails(call, body.deals, data.items, data.fields);
      const completed = now();
      const year = currentYear(completed);
      if (body.year !== year) Object.assign(body, { year }, calculate(body.deals, year));
      body.updatedAt = completed.toISOString();
      state.report = body;
      state.reportAt = completed.getTime();
      return { status: 200, body };
    } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
  }
}

async function loadReport(options) {
  return createReportLoader(options)();
}
module.exports = { loadReport, createReportLoader };
