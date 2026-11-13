const { createFixture } = require('./crm-fixture.cjs');

// Both protected reports use real loaders; only external CRM transport is replaced.
function createAuthFixture() {
  const fixture = createFixture();
  const fetchReport = fixture.fetchImpl;
  return { ...fixture, fetchImpl: async (url, init) => {
    const method = new URL(url).pathname.split('/').at(-1).replace('.json', '');
    const params = JSON.parse(init.body);
    if (method === 'crm.status.list' && params.filter?.ENTITY_ID === 'SOURCE') {
      return { ok: true, json: async () => ({ result: [{ ID: '305', STATUS_ID: 'UC_TOON_EXPO' }] }) };
    }
    if (['crm.lead.list', 'crm.deal.list'].includes(method)) {
      return { ok: true, json: async () => ({ result: [] }) };
    }
    return fetchReport(url, init);
  } };
}
module.exports = { createAuthFixture };
