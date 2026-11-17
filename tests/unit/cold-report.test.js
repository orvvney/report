const {createReportLoader}=require('../../src/report/load.cjs');
const {createFixture,deal}=require('../support/crm-fixture.cjs');

test('filters apartments in CRM, preserves later valid rows and never requests other contact names',async()=>{
  const fixture=createFixture({items:[...Array.from({length:500},(_,i)=>deal(i+1,{ufCrmProperty:'72',contactId:i+1})),deal(501,{contactId:900})],
    contacts:[{id:900,name:'Only apartment'}]});
  const result=await createReportLoader(fixture)();
  expect(result.status).toBe(200);
  expect(result.body.deals.map(row=>row.id)).toEqual([501]);
  expect(result.body.deals[0].customerName).toBe('Only apartment');
  const reads=fixture.state.requests.filter(r=>r.method==='crm.item.list'&&r.params.entityTypeId===2);
  expect(reads).toHaveLength(2);
  expect(reads.every(r=>r.params.filter.ufCrmProperty==='71')).toBe(true);
});

test.each([0,1,50,51,100,101,150,488,503,2601])('counted paging loads %s sparse apartments with unique IDs and at most fifty commands per packet',async count=>{
  const fixture=createFixture({items:Array.from({length:count},(_,i)=>deal((i+1)*1009))});
  const result=await createReportLoader(fixture)();
  expect(result.status).toBe(200);
  expect(result.body.deals.map(row=>row.id)).toEqual(fixture.state.items.map(row=>row.id));
  expect(fixture.state.httpRequests.every(r=>r.method!=='batch'||Object.keys(r.params.cmd).length<=50)).toBe(true);
});

test.each(['total','duplicate','overlap','filter'])('rejects a changing or malformed counted page: %s',async broken=>{
  const fixture=createFixture({items:Array.from({length:151},(_,i)=>deal(i+1))});
  const result=await createReportLoader({...fixture,fetchImpl:async(url,options)=>{
    const response=await fixture.fetchImpl(url,options),body=await response.json();
    if(Object.values(JSON.parse(options.body).cmd||{}).some(command=>new URLSearchParams(command.split('?')[1]).get('start')==='50')){
      if(broken==='total')body.result.result_total.q0--;
      if(broken==='duplicate')body.result.result.q0.items[1]=body.result.result.q0.items[0];
      if(broken==='overlap')body.result.result.q1.items.at(-1).opportunity='999';
      if(broken==='filter')body.result.result.q0.items[0].ufCrmProperty='72';
    }
    return {...response,json:async()=>body};
  }})();
  expect(result.status).toBe(502);
  expect(result.body).toEqual({error:'CRM_READ_ERROR'});
});
