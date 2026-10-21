const WEBHOOK = 'https://portal.example/rest/7/synthetic-test-secret/';
const fields = {
  ufCrmRooms: { title: 'Սենյակների քանակ', type: 'integer' },
  ufCrmArea: { title: 'Մակերես (մ²)', type: 'double' },
  ufCrmDate: { title: 'Կնքման ամսաթիվ', type: 'date' },
};
const deal = (id, overrides = {}) => ({ id, categoryId: 3, stageId: 'C3:WON',
  opportunity: '10', currencyId: 'AMD', ufCrmRooms: 2, ufCrmDate: '2026-01-15', ...overrides });
function sampleItems() {
  return [deal(1), deal(2, { opportunity: '25', ufCrmDate: '2025-12-31' }),
    deal(3, { ufCrmRooms: 6, opportunity: '1000000.1234', ufCrmDate: '2026-12-31' }),
    deal(4, { ufCrmRooms: null, opportunity: '25' }),
    deal(5, { ufCrmDate: null }), deal(6, { ufCrmRooms: '', ufCrmDate: null }),
    deal(7, { ufCrmRooms: 0, opportunity: 0 }),
    deal(8, { ufCrmRooms: null, ufCrmDate: '2025-01-01' })];
}
function createFixture(state = {}) {
  state.items ??= sampleItems(); state.reads ??= 0; state.requests ??= [];
  const fetchImpl = async (url, options) => {
    const method = url.split('/').at(-1).replace(/\.json$/, '');
    const params = JSON.parse(options.body);
    state.requests.push({ method, params });
    const reply = (body) => ({ ok: true, status: 200, json: async () => body });
    if (method === 'crm.category.list') {
      state.reads++;
      if (state.gate) await state.gate;
      return reply({ result: { categories: [{ id: 3, name: 'Վաճառք' }] } });
    }
    if (method === 'crm.status.list') return reply({ result: [{ ENTITY_ID: 'DEAL_STAGE_3', STATUS_ID: 'C3:WON', NAME: 'Կնքված' }] });
    if (method === 'crm.item.fields') return reply({ result: { fields } });
    if (method === 'crm.item.list') {
      if (state.failPage === params.start) return reply({ error: 'ACCESS_DENIED', error_description: WEBHOOK });
      const matching = state.items.filter((item) => item.categoryId === params.filter.categoryId && item.stageId === params.filter.stageId);
      const rows = matching.slice(params.start, params.start + 50).map((row) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => params.select.includes(key))));
      return reply({ result: { items: rows }, ...(matching.length > params.start + 50 ? { next: params.start + 50 } : {}) });
    }
    throw new Error('Unexpected CRM method');
  };
  return { state, fetchImpl, env: { BITRIX24_WEBHOOK_URL: WEBHOOK }, now: () => new Date(state.time || '2026-06-01T10:00:00Z') };
}
module.exports = { createFixture, deal, sampleItems, fields, WEBHOOK };
