const path = require('node:path');
const { loadConfig } = require('../bitrix24/config.cjs');
const { createClient } = require('../bitrix24/client.cjs');
const { getDeals } = require('../bitrix24/deals.cjs');
const { aggregate } = require('./aggregate.cjs');
const { PROPERTY_TYPE } = require('./apartments.cjs');

async function loadReport({ env = process.env, envPath = path.resolve(__dirname, '../../.env'),
  fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  let config;
  try { config = loadConfig({ env, envPath }); }
  catch { return { status: 500, body: { error: 'CONFIGURATION_ERROR' } }; }
  try {
    const snapshotTime = now();
    const data = await getDeals(createClient({ ...config, fetchImpl }), { additionalFields: [PROPERTY_TYPE] });
    return { status: 200, body: aggregate(data, { portalOrigin: new URL(config.webhookUrl).origin, now: snapshotTime }) };
  } catch { return { status: 502, body: { error: 'CRM_READ_ERROR' } }; }
}
module.exports = { loadReport };
