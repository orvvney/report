const { checkPerformance } = require('../../scripts/report-performance.cjs');

test.each([
  [[6000, 3000, 3000, 3000, 3000], true, 3600],
  [[4000, 4000, 4000, 4000, 4000], true, 4000],
  [[4000.1, 4000.1, 4000.1, 4000.1, 4000.1], false, 4000.1],
  [[4301, 4797, 6938, 6941, 7007], false, 5996.8],
])('live benchmark uses all five complete loads and the unrounded 4-second threshold', async (durations, passed, average) => {
  let time = 0, index = 0;
  const write = jest.fn(), fetchImpl = jest.fn();
  const load = jest.fn(async ({ fetchImpl: fetch }) => {
    await fetch('synthetic');
    time += durations[index++];
    return { status: 200, body: { private: 'never print' } };
  });
  const result = await checkPerformance({ load, fetchImpl, now: () => time, write });
  expect(result.passed).toBe(passed);
  expect(result.averageMs).toBeCloseTo(average, 5);
  expect(result.samples).toHaveLength(5);
  expect(result.samples.map((s) => s.requests)).toEqual([1, 1, 1, 1, 1]);
  expect(load).toHaveBeenCalledTimes(5);
  expect(JSON.stringify(write.mock.calls)).not.toContain('never print');
});

test('a failed load fails the benchmark instead of making the average faster', async () => {
  const load = jest.fn().mockResolvedValueOnce({ status: 200 }).mockResolvedValueOnce({ status: 502 });
  const result = await checkPerformance({ load, now: () => 0, write: () => {} });
  expect(result).toMatchObject({ passed: false, averageMs: null });
  expect(result.samples).toHaveLength(2);
  expect(load).toHaveBeenCalledTimes(2);
});

test('cache benchmark measures a real cold load, cache hit and fresh deals without metadata', async () => {
  const { checkCachePerformance } = require('../../scripts/report-performance.cjs');
  const { createReportLoader } = require('../../src/report/load.cjs');
  const { createFixture } = require('../support/crm-fixture.cjs');
  const fixture = createFixture();
  const write = jest.fn();
  const result = await checkCachePerformance({ fetchImpl: fixture.fetchImpl, write,
    createLoader: (options) => createReportLoader({ ...fixture, ...options }) });
  expect(result.passed).toBe(true);
  expect(result.samples.map(({ scenario, requests, metadataCommands }) => ({ scenario, requests, metadataCommands })))
    .toEqual([{ scenario: 'cold', requests: 2, metadataCommands: 3 },
      { scenario: 'report-cache', requests: 0, metadataCommands: 0 },
      { scenario: 'fresh-deals', requests: 1, metadataCommands: 0 }]);
  expect(JSON.stringify(write.mock.calls)).not.toContain('synthetic-test-secret');
  expect(JSON.stringify(write.mock.calls)).not.toContain('opportunity');
});

test('cache benchmark fails when a loader silently refetches on a supposed cache hit', async () => {
  const { checkCachePerformance } = require('../../scripts/report-performance.cjs');
  const result = await checkCachePerformance({ write: () => {}, fetchImpl: async () => {},
    createLoader: ({ fetchImpl }) => async () => {
      await fetchImpl('https://synthetic/crm.category.list.json', { body: '{}' });
      return { status: 200 };
    } });
  expect(result.passed).toBe(false);
});

test('cold-section benchmark requires all five runs at or below the unrounded maximum', () => {
  const {summarize}=require('../../scripts/cold-performance.cjs');
  expect(summarize([2500,1000,1000,1000,1000].map(durationMs=>({durationMs})))).toMatchObject({passed:true,maxMs:2500});
  expect(summarize([2500.1,1000,1000,1000,1000].map(durationMs=>({durationMs})))).toMatchObject({passed:false,maxMs:2500.1});
  expect(summarize([{durationMs:1000}]).passed).toBe(false);
});
