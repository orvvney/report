const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url, release, errors;
const button = name => page.getByRole('button', { name, exact: true });
const ready = () => page.getByTestId('statistics-count').waitFor();
const value = () => page.getByTestId('histogram-kpi-value');
const change = () => page.getByTestId('histogram-kpi-change');
beforeEach(async () => {
  await page.setViewportSize({ width: 1024, height: 1100 });
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  errors = []; page.on('pageerror', error => errors.push(error.message));
  fixture = createFixture({ time: '2026-11-15T10:00:00Z', items: [
    deal(1, { ufCrmDate: '2025-01-01' }), deal(2, { ufCrmDate: '2026-11-10', opportunity: '100' }),
    deal(3, { ufCrmDate: '2026-11-15', opportunity: '200' }), deal(4, { ufCrmDate: '2026-10-15', opportunity: '150' }),
  ] });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  release?.(); release = undefined;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  expect(errors).toEqual([]);
});

test.each([1440, 375])('only chart KPIs remain and update with periods and filters at %i', async width => {
  await page.setViewportSize({ width, height: 1100 });
  await page.goto(url); await ready();
  const requests = fixture.state.httpRequests.length;
  expect(await page.locator('.kpi-container, .kpi-card, .kpi-dialog').count()).toBe(0);
  expect(await page.locator('.report-top-panels').evaluate(el => el.parentElement.nextElementSibling.classList.contains('deals-histogram'))).toBe(true);
  expect(await value().innerText()).toBe('3');
  await button('Վաճառքի գումար').click();
  expect(await value().innerText()).toBe('450,00 ֏');
  await page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true }).selectOption('month');
  expect(await value().innerText()).toBe('300,00 ֏');
  expect(await change().innerText()).toContain('+150 ֏');
  expect(await change().innerText()).toContain('+100%');
  await button('Բն. քանակ').click();
  expect(await value().innerText()).toBe('2');
  expect(await change().innerText()).toContain('+1');
  await page.getByLabel('Բնակարանի արժեք (֏)՝ Մինչև', { exact: true }).fill('100');
  expect(await value().innerText()).toBe('1');
  await button('Վաճառքի գումար').click();
  expect(await value().innerText()).toBe('100,00 ֏');
  await button('Վերականգնել').click();
  expect(await value().innerText()).toBe('450,00 ֏');
  expect(fixture.state.httpRequests).toHaveLength(requests);
});

test('chart KPIs hide stale totals on loading and failure and recover', async () => {
  await page.goto(url); await ready();
  await button('Վաճառքի գումար').click();
  const pending = new Promise(resolve => { release = resolve; });
  fixture.state.gate = pending;
  await button('Թարմացնել հաշվետվությունը').click();
  expect(await value().count()).toBe(0);
  fixture.state.failPage = 0;
  release(); fixture.state.gate = undefined;
  await page.getByText('Տվյալներն անհասանելի են։', { exact: true }).first().waitFor();
  expect(await value().count()).toBe(0);
  fixture.state.failPage = undefined;
  await button('Թարմացնել հաշվետվությունը').click(); await ready();
  expect(await value().innerText()).toBe('450,00 ֏');
});
