const { createFixture } = require('./crm-fixture.cjs');

// Both protected reports use real loaders; only external CRM transport is replaced.
function createAuthFixture() {
  const fixture = createFixture();
  const fetchReport = fixture.fetchImpl;
  const fetchImpl = async (url, init) => {
    const method = new URL(url).pathname.split('/').at(-1).replace('.json', '');
    const params = JSON.parse(init.body);
    if (method === 'batch') {
      const result = {result:{},result_error:{},result_total:{},result_next:{}};
      for (const [key, command] of Object.entries(params.cmd)) {
        const [method, values] = require('./crm-fixture.cjs').decodeCommand(command);
        const body = await (await fetchImpl(new URL(`${method}.json`, url).href,
          {...init,body:JSON.stringify(values)})).json();
        if (body.error) {result.result_error[key]=body;if(params.halt)break;}
        else {
          result.result[key]=body.result;
          if(body.total!==undefined)result.result_total[key]=body.total;
          if(body.next!==undefined)result.result_next[key]=body.next;
        }
      }
      return {ok:true,json:async()=>({result})};
    }
    if (method === 'crm.status.list' && params.filter?.ENTITY_ID === 'SOURCE') {
      return { ok: true, json: async () => ({ result: [{ ID: '305', STATUS_ID: 'UC_TOON_EXPO' }] }) };
    }
    if (['crm.lead.list', 'crm.deal.list'].includes(method)) {
      return { ok: true, json: async () => ({ result: [] }) };
    }
    return fetchReport(url, init);
  };
  return {...fixture,fetchImpl};
}
module.exports = { createAuthFixture };
