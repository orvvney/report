const { createPropertyStagesLoader, STAGES, readCounts } = require('../../src/report/property-stages.cjs');
const { createFixture } = require('../support/crm-fixture.cjs');
const item = (id, stage = 0, property = '71') => ({ id, categoryId: 5, stageId: `DT177_5:${stage}`, ufCrmProperty: property });
test('uses totals beyond the first page, preserves zeros and excludes other property types', async () => {
  const fixture = createFixture({ propertyItems: [...Array.from({length: 180}, (_, i) => item(i + 1, i % 3)), item(181, 6), item(182, 7), item(183, 7, '72')] });
  const load = createPropertyStagesLoader(fixture);
  const result = await load();
  expect(result.status).toBe(200);
  expect(result.body.stages).toEqual(STAGES.map((name, i) => ({name, count: [60,60,60,0,0,0,1,1][i]})));
  const batch = fixture.state.httpRequests.filter(request => request.method === 'batch' && Object.values(request.params.cmd)[0].startsWith('crm.item.list?'));
  expect(batch).toHaveLength(1);
  const counts = fixture.state.requests.filter(request => request.method === 'crm.item.list');
  expect(counts).toHaveLength(8);
  expect(counts.every(({params}) => params.start === 0 && JSON.stringify(params.select) === '["id"]')).toBe(true);
  const requests = fixture.state.requests.length;
  expect(await load()).toEqual(result);
  expect(fixture.state.requests).toHaveLength(requests);
  fixture.state.propertyItems = [];
  expect((await load({refresh:true})).body.stages.every(stage => stage.count === 0)).toBe(true);
});
test('failed refresh clears the cache and recovery reads again', async () => {
  const fixture = createFixture({propertyItems: [item(1)]});
  const load = createPropertyStagesLoader(fixture);
  expect((await load()).status).toBe(200);
  fixture.state.failPropertyStages = true;
  expect(await load({refresh:true})).toEqual({status:502,body:{error:'CRM_READ_ERROR'}});
  expect((await load()).status).toBe(502);
  fixture.state.failPropertyStages = false;
  fixture.state.propertyItems = [];
  expect((await load()).body.stages[0].count).toBe(0);
});
test('rejects missing stages, duplicate processes, invalid property metadata and broken pagination', async () => {
  for (const broken of ['stages','types','property','pagination']) {
    const fixture = createFixture();
    if (broken === 'property') fixture.state.fields.ufCrmProperty.isMultiple = true;
    const { createClient } = require('../../src/bitrix24/client.cjs');
    const base = createClient({webhookUrl: require('../support/crm-fixture.cjs').WEBHOOK, ...fixture});
    const call = async (method, params) => {
      const body = await base(method, params);
      if (broken === 'stages' && method === 'crm.status.list') body.result.pop();
      if (broken === 'types' && method === 'crm.type.list') body.result.types.push({...body.result.types[0]});
      if (broken === 'pagination' && method === 'crm.type.list') body.next = 0;
      return body;
    };
    await expect(readCounts(call)).rejects.toThrow();
  }
});

test('CRM one dot leader matches the dotted card and stays distinct from the undotted stage', async () => {
  const fixture = createFixture({propertyStageNames: STAGES.map(name => name === 'Կնքված.' ? 'Կնքված․' : name),
    propertyItems: [item(1,6), item(2,6), item(3,7)]});
  const result = await createPropertyStagesLoader(fixture)();
  expect(result.status).toBe(200);
  expect(result.body.stages.slice(-2)).toEqual([{name:'Կնքված.',count:2},{name:'Կնքված',count:1}]);
});


test.each([undefined, null, -1, 1.5, '3', Number.MAX_SAFE_INTEGER + 1])('rejects an invalid total: %s', async total => {
  const fixture = createFixture();
  const { createClient } = require('../../src/bitrix24/client.cjs');
  const call = createClient({webhookUrl: require('../support/crm-fixture.cjs').WEBHOOK, ...fixture});
  const batch = call.batch;
  call.batch = async commands => commands[0].method === 'crm.item.list' ? STAGES.map(() => ({total})) : batch(commands);
  await expect(readCounts(call)).rejects.toThrow('Invalid total');
});

test('caches metadata for 24 hours, refreshes counts, and expires snapshots at exactly five minutes', async () => {
  const fixture = createFixture({propertyItems:[item(1)]});
  const load = createPropertyStagesLoader(fixture);
  const initial = await load();
  fixture.state.propertyItems.push(item(2));
  fixture.state.time = '2026-06-01T10:04:59.999Z';
  expect(await load()).toEqual(initial);
  fixture.state.httpRequests.length = 0;
  fixture.state.time = '2026-06-01T10:05:00Z';
  expect((await load()).body.stages[0].count).toBe(2);
  expect(fixture.state.httpRequests.map(r=>r.method)).toEqual(['batch']);
  fixture.state.httpRequests.length = 0;
  await load({refresh:true});
  expect(fixture.state.httpRequests.map(r=>r.method)).toEqual(['batch']);
  fixture.state.time = '2026-06-02T10:00:00Z';
  fixture.state.httpRequests.length = 0;
  await load({refresh:true});
  expect(fixture.state.httpRequests.map(r=>r.method)).toEqual([
    'crm.type.list','batch','crm.status.list','batch']);
});

test('sums matching names across categories while keeping category/stage pairs and unknown stages excluded', async () => {
  const fixture = createFixture({propertyItems:[item(1), {...item(2),categoryId:6,stageId:'DT177_6:0'},
    {...item(3),categoryId:6}, {...item(4),stageId:'UNKNOWN'}]});
  fixture.state.propertyCategories = [{id:5},{id:6}];
  fixture.state.propertyStatuses = {DYNAMIC_177_STAGE_6:[{NAME:STAGES[0],STATUS_ID:'DT177_6:0',ENTITY_ID:'DYNAMIC_177_STAGE_6'}]};
  const result = await createPropertyStagesLoader(fixture)();
  expect(result.status).toBe(200);
  expect(result.body.stages.map(stage=>stage.count)).toEqual([2,0,0,0,0,0,0,0]);
});

test('joins simultaneous cold and forced loads and protects cached snapshots from caller mutation', async () => {
  const fixture = createFixture({propertyItems:[item(1)]});
  const load = createPropertyStagesLoader(fixture);
  const [first, second] = await Promise.all([load(),load({refresh:true})]);
  expect(first).toEqual(second);
  expect(fixture.state.httpRequests.filter(r=>r.method==='batch')).toHaveLength(2);
  first.body.stages[0].count = 99;
  expect((await load()).body.stages[0].count).toBe(1);
});

test('does not cache incomplete metadata and recovers after the directory is corrected', async () => {
  const fixture = createFixture({propertyStageNames:STAGES.slice(1)});
  const load = createPropertyStagesLoader(fixture);
  expect((await load()).status).toBe(502);
  fixture.state.propertyStageNames = STAGES;
  expect((await load()).status).toBe(200);
});
