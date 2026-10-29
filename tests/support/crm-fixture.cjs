const WEBHOOK = 'https://portal.example/rest/7/synthetic-test-secret/';
const fields = {
  ufCrmRooms: { title: 'Սենյակների քանակ', type: 'integer' },
  ufCrmArea: { title: 'Մակերես (մ²)', type: 'double' },
  ufCrmDate: { title: 'Կնքման ամսաթիվ', type: 'date' },
  ufCrmProperty: { title: 'Անշարժ գույքի տեսակ', type: 'enumeration', isMultiple: false,
    items: [{ ID: '71', VALUE: 'Բնակարան' }, { ID: '72', VALUE: 'Ավտոկայանատեղի' },
      { ID: '73', VALUE: 'Թաունհաուս' }, { ID: '74', VALUE: 'Հասարակական տարածք' }] },
};
const deal = (id, overrides = {}) => ({ id, categoryId: 3, stageId: 'C3:WON',
  ufCrmArea: '50', opportunity: '10', currencyId: 'AMD', ufCrmRooms: 2, ufCrmDate: '2026-01-15', ufCrmProperty: '71', ...overrides });
function sampleItems() {
  return [deal(1), deal(2, { opportunity: '25', ufCrmDate: '2025-12-31' }),
    deal(3, { ufCrmRooms: 6, opportunity: '1000000.1234', ufCrmDate: '2026-12-31' }),
    deal(4, { ufCrmRooms: null, opportunity: '25' }),
    deal(5, { ufCrmDate: null }), deal(6, { ufCrmRooms: '', ufCrmDate: null }),
    deal(7, { ufCrmRooms: 0, opportunity: 0 }),
    deal(8, { ufCrmRooms: null, ufCrmDate: '2025-01-01' })];
}
function createFixture(state = {}) {
  state.items ??= sampleItems(); state.reads ??= 0; state.requests ??= []; state.httpRequests ??= [];
  state.fields ??= structuredClone(fields);
  const fetchImpl = async (url, options) => {
    const method = url.split('/').at(-1).replace(/\.json$/, '');
    const params = JSON.parse(options.body);
    state.httpRequests.push({ method, params });
    return execute(method, params);
  };
  async function execute(method, params) {
    if (method === 'batch') {
      const result = { result: {}, result_error: {}, result_total: {}, result_next: {} };
      for (const [key, command] of Object.entries(params.cmd)) {
        const [name, query] = command.split('?');
        const decoded = {};
        for (const [parameter, value] of new URLSearchParams(query)) {
          const parts = parameter.match(/[^\[\]]+/g);
          let parent = decoded;
          for (let i = 0; i < parts.length - 1; i++) {
            parent = parent[parts[i]] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
          }
          parent[parts.at(-1)] = value;
        }
        if (decoded.start !== undefined) decoded.start = Number(decoded.start);
        if (decoded.filter?.categoryId !== undefined) decoded.filter.categoryId = Number(decoded.filter.categoryId);
        const body = await (await execute(name, decoded)).json();
        if (body.error) {
          result.result_error[key] = body;
          if (params.halt) break;
        } else {
          result.result[key] = body.result;
          if (body.total !== undefined) result.result_total[key] = body.total;
          if (body.next !== undefined) result.result_next[key] = body.next;
        }
      }
      return { ok: true, status: 200, json: async () => ({ result }) };
    }
    state.requests.push({ method, params });
    const reply = (body) => ({ ok: true, status: 200, json: async () => body });
    if (method === 'crm.category.list') {
      state.reads++;
      if (state.gate) await state.gate;
      return reply({ result: { categories: [{ id: 3, name: 'Վաճառք' }] } });
    }
    if (method === 'crm.status.list') return reply({ result: [{ ENTITY_ID: 'DEAL_STAGE_3', STATUS_ID: 'C3:WON', NAME: 'Կնքված' }] });
    if (method === 'crm.item.fields') return reply({ result: { fields: state.fields } });
    if (method === 'crm.item.list') {
      if (state.failPage === params.start) return reply({ error: 'ACCESS_DENIED', error_description: WEBHOOK });
      const matching = state.items.filter((item) => item.categoryId === params.filter.categoryId && item.stageId === params.filter.stageId);
      const rows = matching.slice(params.start, params.start + 50).map((row) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => params.select.includes(key))));
      return reply({ result: { items: rows }, total: matching.length,
        ...(matching.length > params.start + 50 ? { next: params.start + 50 } : {}) });
    }
    throw new Error('Unexpected CRM method');
  }
  return { state, fetchImpl, scheduleRequest: (task) => task(),
    env: { BITRIX24_WEBHOOK_URL: WEBHOOK }, now: () => new Date(state.time || '2026-06-01T10:00:00Z') };
}
module.exports = { createFixture, deal, sampleItems, fields, WEBHOOK };

function filterItems() {
  return [
    deal(1, { ufCrmRooms: 1, opportunity: '100.1', ufCrmArea: '50', ufCrmDate: '2026-01-01' }),
    deal(2, { opportunity: '200.2', ufCrmArea: '65.5', ufCrmDate: '2026-06-15' }),
    deal(3, { ufCrmRooms: 3, opportunity: '300.3', ufCrmArea: '80', ufCrmDate: '2025-12-31' }),
    deal(4, { opportunity: '400.4', ufCrmArea: '80', ufCrmDate: '2026-12-31' }),
    deal(5, { ufCrmRooms: 5, opportunity: '500', ufCrmArea: undefined, ufCrmDate: '2026-01-01' }),
    deal(6, { ufCrmRooms: 4, opportunity: '600', ufCrmArea: '90', ufCrmDate: undefined }),
    deal(7, { ufCrmRooms: undefined, opportunity: '700', ufCrmArea: '100', ufCrmDate: '2026-01-01' }),
    deal(8, { ufCrmRooms: 6, opportunity: undefined, ufCrmArea: '110', ufCrmDate: '2026-01-01' }),
    deal(9, { ufCrmRooms: 20, opportunity: '900', ufCrmArea: '120', ufCrmDate: '2026-01-01', ufCrmProperty: '72' }),
  ];
}
module.exports.filterItems = filterItems;
