const { createServer } = require('../server.js');
const { chromium } = require('playwright');

const LIMIT_MS = 2500;
function summarize(samples) {
  return { passed: samples.length === 5 && samples.every(s => s.durationMs <= LIMIT_MS),
    averageMs: samples.reduce((sum, s) => sum + s.durationMs, 0) / samples.length,
    maxMs: Math.max(...samples.map(s => s.durationMs)), limitMs: LIMIT_MS };
}

// Explicit live benchmark. Every run owns a fresh server/cache and browser
// context. Authentication is disabled only for this loopback-only test server.
async function checkColdPerformance({ write = console.log, section = 'apartments' } = {}) {
  if (!['apartments', 'parking', 'expo'].includes(section)) throw new Error('Unknown section');
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (let run = 1; run <= 5; run++) {
      let requests = 0, commands = 0;
      const server = createServer({ auth: null, fetchImpl: (...args) => {
        requests++;
        const params = JSON.parse(args[1].body);
        commands += params.cmd ? Object.keys(params.cmd).length : 1;
        return fetch(...args);
      } });
      const context = await browser.newContext();
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/${section === 'expo' ? '#toon-expo' : section === 'parking' ? '#parking' : ''}`);
        let topReadyMs;
        if (section === 'expo') {
          await page.getByTestId('expo-leads').waitFor({state:'visible'});
          topReadyMs = await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return performance.now(); });
          await page.getByTestId('expo-comparison-value').first().waitFor();
        } else {
          await page.getByTestId('statistics-count').waitFor();
          topReadyMs = await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return performance.now(); });
          await page.locator('.property-stages article').first().waitFor();
          await page.getByTestId('histogram-kpi-value').waitFor();
        }
        await page.waitForFunction(selector => [...document.querySelectorAll(selector)]
          .every(el => el.getAttribute('aria-busy') === 'false'),
        section === 'expo' ? '.expo-section [aria-busy]' : '[aria-busy]');
        const durationMs = await page.evaluate(async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return performance.now();
        });
        const sample = { run, topReadyMs, durationMs, requests, commands };
        samples.push(sample);
        write(JSON.stringify({ ...sample, topReadyMs: Math.round(topReadyMs), durationMs: Math.round(durationMs) }));
      } finally {
        await context.close();
        server.closeAllConnections();
        if (server.listening) await new Promise(resolve => server.close(resolve));
      }
    }
  } finally {
    await browser.close();
  }
  const result = summarize(samples);
  write(JSON.stringify({ ...result, averageMs: Math.round(result.averageMs), maxMs: Math.round(result.maxMs) }));
  return { ...result, samples };
}

if (require.main === module) checkColdPerformance({section:process.argv.includes('--expo') ? 'expo' : process.argv.includes('--parking') ? 'parking' : 'apartments'}).then(({passed}) => { process.exitCode = passed ? 0 : 1; })
  .catch(() => { console.error('FAIL: холодная загрузка раздела не выполнена.'); process.exitCode = 1; });
module.exports = { checkColdPerformance, summarize };
