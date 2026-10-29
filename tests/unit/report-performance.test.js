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
