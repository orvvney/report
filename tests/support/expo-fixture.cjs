const env = { BITRIX24_WEBHOOK_URL: 'https://portal.example/rest/1/expo-test-secret/' };
function fixture(count = 51) {
  const leads = Array.from({ length: count }, (_, i) => ({ ID: String(i + 1), TITLE: `Lead ${i + 1}`, STATUS_ID: 'NEW', NAME: 'Արամ', LAST_NAME: `Ազգանուն ${i + 1}`, SOURCE_ID: 'UC_TOON_EXPO', STAGE_ID: 'NEW', DATE_CREATE: '2026-10-31T23:00:00+00:00' }));
  const deals = [{ ID: '71', LEAD_ID: '0', CONTACT_ID: '8', SOURCE_ID: 'UC_TOON_EXPO', STAGE_ID: 'NEW', DATE_CREATE: '2026-10-31T22:00:00Z', TITLE: 'Deal A' }, { ID: '72', LEAD_ID: '999', SOURCE_ID: 'UC_TOON_EXPO', STAGE_ID: 'NEW', DATE_CREATE: '2026-11-02T10:00:00Z', TITLE: 'Deal B' }, { ID: '73', LEAD_ID: '51', SOURCE_ID: 'UC_TOON_EXPO', STAGE_ID: 'NEW', DATE_CREATE: '2026-11-02T10:00:00Z', TITLE: 'Deal C' }];
  deals.push({ ID: '74', LEAD_ID: '1', SOURCE_ID: 'OTHER', STAGE_ID: 'NEW', DATE_CREATE: '2026-11-01T10:00:00Z', TITLE: 'Converted with another source' });
  const stages = { SOURCE:[{ ID: '305', STATUS_ID: 'UC_TOON_EXPO', NAME: 'Toon Expo' }], STATUS: [{ STATUS_ID: 'NEW', NAME: 'Նոր լիդ' }], DEAL_STAGE: [{ STATUS_ID: 'NEW', NAME: 'Նոր գործարք' }], DEAL_STAGE_3: [{ STATUS_ID: 'C3:WON', NAME: 'Կնքված' }] };
  const categories = [{ id: 0, name: 'Վաճառք' }];
  const fields = { UF_CRM_PROPERTY: { title: 'Անշարժ գույքի տեսակ', type: 'enumeration', isMultiple: false, items: [{ ID: '71', VALUE: 'Բնակարան' }, { ID: '72', VALUE: 'Ավտոկայանատեղի' }] } };
  const requests = [], httpRequests = [];
  const options = { env, batchReads:false, scheduleRequest:task=>task(), waitRetry:async()=>{}, fetchImpl:async(url,init)=>{
    const method = new URL(url).pathname.split('/').at(-1).replace('.json','');
    const params = JSON.parse(init.body); httpRequests.push({method,params});
    return execute(method,params);
  }};
  async function execute(method,params) {
    if(method === 'batch') {
      const result = {result:{},result_error:{},result_total:{},result_next:{}};
      for(const [key,command] of Object.entries(params.cmd)) {
        const [method,values] = require('./crm-fixture.cjs').decodeCommand(command);
        const body = await (await execute(method,values)).json();
        if(body.error){result.result_error[key]=body;if(params.halt)break;}
        else {result.result[key]=body.result;if(body.total!==undefined)result.result_total[key]=body.total;if(body.next!==undefined)result.result_next[key]=body.next;}
      }
      return {ok:true,json:async()=>({result})};
    }
    requests.push({method,params});
    if (method === 'crm.category.list') return { ok: true, json: async () => ({ result: { categories } }) };
    if (method === 'crm.item.fields') return { ok: true, json: async () => ({ result: { fields } }) };
    if (method === 'crm.status.list') return { ok: true, json: async () => ({ result: (stages[params.filter.ENTITY_ID] || []) }) };
    if (method === 'crm.item.list') return { ok: true, json: async () => ({ result: { items: [{ id: 8, name: 'Անի', lastName: 'Պետրոսյան' }] } }) };
    let rows;
    if (method === 'crm.lead.list') {
      expect(params.filter).toEqual({ '=SOURCE_ID': 'UC_TOON_EXPO' }); rows = leads;
    } else {
      expect(method).toBe('crm.deal.list');
      rows = params.filter['>=DATE_CREATE'] ? deals.filter(row => new Date(row.DATE_CREATE) >= new Date(params.filter['>=DATE_CREATE']) && new Date(row.DATE_CREATE) < new Date(params.filter['<DATE_CREATE'])) : params.filter['@LEAD_ID'] ? deals.filter(row => params.filter['@LEAD_ID'].map(String).includes(String(row.LEAD_ID))) : deals.filter(row => row.SOURCE_ID !== 'OTHER' && row.SOURCE_ID !== '');
      expect(params.filter).not.toHaveProperty('STAGE_ID');
    }
    const page = rows.slice(params.start, params.start + 50);
    return { ok: true, json: async () => ({ result: page, total:rows.length, ...(params.start + 50 < rows.length ? { next: params.start + 50 } : {}) }) };
  }
  return { options, leads, deals, stages, categories, fields, requests, httpRequests };
}
module.exports = { fixture };
