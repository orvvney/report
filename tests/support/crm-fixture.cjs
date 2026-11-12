const WEBHOOK = 'https://portal.example/rest/7/synthetic-test-secret/';
const fields = {
  ufCrm_1776430614152: { title: 'Մուտք', type: 'enumeration', isMultiple: false,
    items: Array.from({ length: 51 }, (_, i) => ({ ID: String(1001 + i), VALUE: String(i + 1) })) },
  ufCrm_1686473759: { title: 'Հարկ', type: 'integer', isMultiple: false },
  ufCrm_1776254518: { title: 'Համար checked', type: 'string', isMultiple: false },
  ufCrmRooms: { title: 'Սենյակների քանակ', type: 'integer' },
  ufCrmArea: { title: 'Մակերես (մ²)', type: 'double' },
  ufCrmDate: { title: 'Կնքման ամսաթիվ', type: 'date' },
  ufCrmComplex: { title: 'Համալիր', type: 'enumeration', isMultiple: false,
    items: [{ ID: '81', VALUE: 'Milon Tower' }, { ID: '82', VALUE: 'Milon Hills' }, { ID: '83', VALUE: 'Milon Plaza' }] },
  ufCrmProperty: { title: 'Անշարժ գույքի տեսակ', type: 'enumeration', isMultiple: false,
    items: [{ ID: '71', VALUE: 'Բնակարան' }, { ID: '72', VALUE: 'Ավտոկայանատեղի' },
      { ID: '73', VALUE: 'Թաունհաուս' }, { ID: '74', VALUE: 'Հասարակական տարածք' }] },
};
const deal = (id, overrides = {}) => ({ id, categoryId: 3, stageId: 'C3:WON',
  ufCrmArea: '50', opportunity: '10', currencyId: 'AMD', ufCrmRooms: 2, ufCrmDate: '2026-01-15', ufCrmProperty: '71', ufCrmComplex: '81', ...overrides });
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
    if (state.failures > 0 && (!state.failMethod || state.failMethod === method)) {
      state.failures--;
      return { ok: false, status: 503 };
    }
    return execute(method, params);
  };
  async function execute(method, params) {
    if (method === 'batch') {
      const result = { result: {}, result_error: {}, result_total: {}, result_next: {} };
      for (const [key, command] of Object.entries(params.cmd)) {
        const [name, decoded] = decodeCommand(command);
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
    if (state.commandFailures > 0 && method === 'crm.item.list') {
      state.commandFailures--;
      return { ok: true, json: async () => ({ error: 'ACCESS_DENIED' }) };
    }
    const reply = (body) => ({ ok: true, status: 200, json: async () => body });
    if (method === 'crm.category.list') {
      return reply({ result: { categories: [{ id: 3, name: 'Վաճառք' }] } });
    }
    if (method === 'crm.status.list') return reply({ result: [{ ENTITY_ID: 'DEAL_STAGE_3', STATUS_ID: 'C3:WON', NAME: 'Կնքված' }] });
    if (method === 'crm.item.fields') return reply({ result: { fields: state.fields } });
    if (method === 'crm.item.list' && params.entityTypeId === 3) {
      if (state.contactGate) await state.contactGate;
      if (state.failContacts) return reply({ error: 'ACCESS_DENIED' });
      const matching = (state.contacts || []).filter(contact => params.filter['@id'].includes(String(contact.id)))
        .sort((a, b) => Number(a.id) - Number(b.id));
      return reply({ result: { items: matching.slice(0, 50).map(contact =>
        Object.fromEntries(Object.entries(contact).filter(([key]) => params.select.includes(key)))) } });
    }
    if (method === 'crm.item.list') {
      if (params.order.id === 'ASC' && params.filter['>id'] === undefined) {
        state.reads++;
        if (state.gate) await state.gate;
      }
      if (state.failPage === 0 || (state.failPage !== undefined && (params.order.id === 'DESC' || params.filter['>id'] !== undefined))) return reply({ error: 'ACCESS_DENIED', error_description: WEBHOOK });
      const matching = selectItems(state.items, params);
      const start = params.start === -1 ? 0 : params.start;
      const rows = matching.slice(start, start + 50).map((row) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => params.select.includes(key))));
      return reply({ result: { items: rows }, ...(params.start === -1 ? {} : { total: matching.length,
        ...(matching.length > start + 50 ? { next: start + 50 } : {}) }) });
    }
    throw new Error('Unexpected CRM method');
  }
  return { state, fetchImpl, scheduleRequest: (task) => task(), waitRetry: async () => { state.retryWaits = (state.retryWaits || 0) + 1; },
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

// Fixture transport implements CRM semantics independently of the loader.
function selectItems(items, params) {
  return items.filter((item) => String(item.categoryId) === String(params.filter.categoryId)
    && item.stageId === params.filter.stageId
    && (params.filter['>id'] === undefined || Number(item.id) > Number(params.filter['>id']))
    && (params.filter['<=id'] === undefined || Number(item.id) <= Number(params.filter['<=id'])))
    .sort((a, b) => (Number(a.id) - Number(b.id)) * (params.order.id === 'DESC' ? -1 : 1));
}
function decodeCommand(command) {
  const [name, query] = command.split('?');
  const params = {};
  for (const [parameter, value] of new URLSearchParams(query)) {
    const parts = parameter.match(/[^\[\]]+/g);
    let parent = params;
    for (let i = 0; i < parts.length - 1; i++) parent = parent[parts[i]] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
    parent[parts.at(-1)] = value;
  }
  if (params.start !== undefined) params.start = Number(params.start);
  if (params.entityTypeId !== undefined) params.entityTypeId = Number(params.entityTypeId);
  if (params.filter?.categoryId !== undefined) params.filter.categoryId = Number(params.filter.categoryId);
  return [name, params];
}
module.exports.selectItems = selectItems;
module.exports.decodeCommand = decodeCommand;
