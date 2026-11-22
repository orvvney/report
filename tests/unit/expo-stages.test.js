const { createPropertyStagesLoader } = require('../../src/report/property-stages.cjs');
const { fixture } = require('../support/expo-fixture.cjs');

test('compares property stages at the start of the first and last Expo days across pages', async () => {
  const crm = fixture(0);
  const earlier = '2026-10-01T00:00:00Z';
  const firstDay = '2026-11-09T20:00:00Z', lastDay = '2026-11-15T20:00:00Z';
  crm.properties.push(
    ...Array.from({ length: 51 }, (_, index) => ({ id: index + 1, createdTime: earlier, UF_CRM_PROPERTY: '71' })),
    { id: 52, createdTime: firstDay, UF_CRM_PROPERTY: '71' },
    { id: 53, createdTime: lastDay, UF_CRM_PROPERTY: '71' },
    { id: 54, createdTime: earlier, UF_CRM_PROPERTY: '72' },
  );
  const initialStages = ['1', '2', '3', '4', '5', '6', '7'];
  crm.propertyHistory.push(
    ...initialStages.map((stage, index) => ({ owner: index + 1, stage, date: earlier })),
    ...Array.from({ length: 44 }, (_, index) => ({ owner: index + 8, stage: '0', date: earlier })),
    { owner: 1, stage: '6', date: firstDay },
    { owner: 2, stage: '1', date: lastDay },
    { owner: 52, stage: '1', date: firstDay },
    { owner: 53, stage: '7', date: lastDay },
    { owner: 54, stage: '7', date: earlier },
  );
  crm.propertyHistory.splice(0, crm.propertyHistory.length, ...crm.propertyHistory.map(({owner, stage, date}, index) =>
    ({ ID: index + 1, OWNER_ID: owner, STAGE_ID: stage, CREATED_TIME: date })));

  const load = createPropertyStagesLoader({ ...crm.options, expo: true });
  const expoSummary = { snapshotId: 'a', firstExpoDealDate: '2026-11-10', lastExpoDealDate: '2026-11-16',
    directDeals: [{ id: 71 }, { id: 72 }] };
  const { status, body } = await load({ expoSummary });
  expect(status).toBe(200);
  expect(body.stages.map(stage => stage.name)).toEqual(['Ազատ', 'Ռեզերվ', 'Վաճառքի ընթացքում', 'Վաճառված']);
  expect(body.stages.map(stage => stage.count)).toEqual([44, 1, 4, 2]);
  expect(body.after.map(stage => stage.count)).toEqual([42, 1, 4, 3]);

  const next = await load({ expoSummary: { ...expoSummary, snapshotId: 'b', lastExpoDealDate: '2026-11-10', directDeals: [] } });
  expect(next.body.after).toEqual(body.stages);
});

test('shows unavailable counts when there are no Expo deals to define the dates', async () => {
  const crm = fixture();
  const { status, body } = await createPropertyStagesLoader({ ...crm.options, expo: true })();
  expect(status).toBe(200);
  expect(body.stages.map(stage => stage.count)).toEqual([null, null, null, null]);
  expect(body.after).toEqual(body.stages);
  expect(crm.requests.some(({ method }) => method === 'crm.stagehistory.list')).toBe(false);
});
