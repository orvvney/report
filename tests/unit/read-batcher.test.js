const {createReadBatcher}=require('../../src/bitrix24/read-batcher.cjs');
const {createClient}=require('../../src/bitrix24/client.cjs');
const {createFixture,WEBHOOK}=require('../support/crm-fixture.cjs');
const metadata={method:'crm.item.fields',params:{entityTypeId:2,useOriginalUfNames:'N'}};
function client(fixture,batcher,webhookUrl=WEBHOOK){return createClient({...fixture,batcher,webhookUrl});}

test('joins normal and batch reads from different clients in one packet and preserves result order',async()=>{
  const fixture=createFixture(),batcher=createReadBatcher();
  const [types,fields]=await Promise.all([client(fixture,batcher)('crm.type.list',{}),client(fixture,batcher).batch([metadata])]);
  expect(types.result.types[0].entityTypeId).toBe(177);
  expect(fields[0].result.fields.ufCrmProperty).toBeDefined();
  expect(fixture.state.httpRequests).toHaveLength(1);
  expect(Object.keys(fixture.state.httpRequests[0].params.cmd)).toHaveLength(2);
});

test('keeps sources isolated and splits independent reads at the fifty-command limit',async()=>{
  const fixture=createFixture(),batcher=createReadBatcher();
  const call=client(fixture,batcher);
  await Promise.all([call.batch(Array.from({length:50},()=>metadata)),call.batch([metadata]),
    client(fixture,batcher,'https://other.example/rest/1/other/')('crm.type.list',{})]);
  expect(fixture.state.httpRequests).toHaveLength(3);
  expect(fixture.state.httpRequests.map(r=>Object.keys(r.params.cmd).length).sort((a,b)=>a-b)).toEqual([1,1,50]);
});

test('one required failure retries independently without discarding successful siblings',async()=>{
  const fixture=createFixture({failContacts:true}),batcher=createReadBatcher();
  const call=client(fixture,batcher);
  const denied=call('crm.item.list',{entityTypeId:3,filter:{'@id':['1']},select:['id']});
  const assertion=expect(denied).rejects.toThrow();
  expect((await call('crm.type.list',{})).result.types).toHaveLength(1);
  await assertion;
  expect(fixture.state.requests.filter(r=>r.method==='crm.type.list')).toHaveLength(1);
});

test('write methods and oversized batches are refused before reaching the coordinator transport',async()=>{
  const fixture=createFixture(),call=client(fixture,createReadBatcher());
  await expect(call('crm.item.delete',{id:1})).rejects.toThrow();
  await expect(call.batch(Array.from({length:51},()=>metadata))).rejects.toThrow();
  expect(fixture.state.httpRequests).toHaveLength(0);
});
