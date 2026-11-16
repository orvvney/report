const { createPropertyStagesLoader, STAGES, readCounts } = require('../../src/report/property-stages.cjs');
const { createFixture } = require('../support/crm-fixture.cjs');
const item = (id, stage = 0, property = '71') => ({ id, categoryId: 5, stageId: `DT177_5:${stage}`, ufCrmProperty: property });
test('counts apartments across all pages, preserves exact stage names and zeros, excludes other types', async () => {
  const fixture = createFixture({ propertyItems: [...Array.from({length: 105}, (_, i) => item(i + 1, i % 3)), item(106, 6), item(107, 7), item(108, 7, '72')] });
  const load = createPropertyStagesLoader(fixture);
  const result = await load();
  expect(result.status).toBe(200);
  expect(result.body.stages).toEqual(STAGES.map((name, i) => ({name, count: [35,35,35,0,0,0,1,1][i]})));
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
