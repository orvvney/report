const { loadReport } = require('../src/report/load.cjs');

// Explicit live check: no warm-up, cache, excluded outliers or retries.
// Only durations, request counts and safe local status codes leave this process.
async function checkPerformance({ load = loadReport, fetchImpl = globalThis.fetch,
  now = () => performance.now(), write = console.log } = {}) {
  const samples = [];
  for (let run = 1; run <= 5; run++) {
    let requests = 0;
    const started = now();
    const result = await load({ fetchImpl: (...args) => { requests++; return fetchImpl(...args); } });
    const durationMs = now() - started;
    const sample = { run, requests, status: result.status, durationMs };
    samples.push(sample);
    write(JSON.stringify({ ...sample, durationMs: Math.round(durationMs) }));
    if (result.status !== 200) {
      write('FAIL: полная загрузка CRM не выполнена.');
      return { passed: false, samples, averageMs: null };
    }
  }
  const averageMs = samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length;
  const passed = averageMs <= 4000;
  write(JSON.stringify({ result: passed ? 'PASS' : 'FAIL', runs: samples.length,
    averageMs: Math.round(averageMs), limitMs: 4000,
    minMs: Math.round(Math.min(...samples.map((s) => s.durationMs))),
    maxMs: Math.round(Math.max(...samples.map((s) => s.durationMs))) }));
  return { passed, samples, averageMs };
}

if (require.main === module) {
  checkPerformance().then(({ passed }) => { process.exitCode = passed ? 0 : 1; })
    .catch(() => { console.error('FAIL: проверка производительности не выполнена.'); process.exitCode = 1; });
}

module.exports = { checkPerformance };
