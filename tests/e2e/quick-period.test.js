const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url;
const period = () => page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });
const quick = () => page.getByRole('combobox', { name: 'Արագ ընտրություն', exact: true });
const year = () => page.getByRole('combobox', { name: 'Տարի', exact: true });
const button = name => page.getByRole('button', { name, exact: true });
const ready = () => page.getByTestId('statistics-count').waitFor();
const count = async n => {
  expect(await page.getByTestId('statistics-count').innerText()).toBe(String(n));
  expect(await page.getByTestId('histogram-kpi-value').innerText()).toBe(String(n));
};
beforeEach(async () => {
  await page.setViewportSize({ width: 1024, height: 1100 });
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  const dates = ['2023-07-10', '2024-12-31', '2025-01-01', '2025-11-30', '2025-12-01', '2025-12-31',
    '2026-01-01', '2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01', '2026-11-15', '2026-11-16'];
  fixture = createFixture({ time: '2026-11-15T10:00:00Z', items: dates.map((date, i) => deal(i + 1, { ufCrmDate: date, opportunity: '10' })) });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test.each([375, 1440])('all quick choices apply inclusive dates, filters and chart KPIs without requests at %i', async width => {
  await page.setViewportSize({ width, height: 1200 });
  fixture.state.items.push(deal(20, { ufCrmDate: '2026-11-10', opportunity: '1000', ufCrmArea: '90', ufCrmRooms: 3, ufCrmComplex: '82' }));
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await page.goto(url); await ready();
  expect(await period().locator('option').allTextContents()).toEqual(['Արագ ընտրություն', 'Ամիս', 'Եռամսյակ', 'Տարի', 'Կամայական միջակայք']);
  await period().selectOption('quick'); expect(await quick().inputValue()).toBe('current-month'); await count(3);
  expect(await quick().locator('option').allTextContents()).toEqual(['Ընթացիկ ամիս', 'Ընթացիկ տարի', 'Անցյալ ամիս', 'Անցյալ տարի', 'Վերջին 12 ամիս', 'Ամբողջ ժամանակահատված']);
  await button('Հիլլս').click(); await button('Սենյակների քանակ՝ 2').click();
  await page.getByLabel('Մակերես (մ²)՝ Մինչև', { exact: true }).fill('50');
  await page.getByLabel('Բնակարանի արժեք (֏)՝ Մինչև', { exact: true }).fill('100');
  for (const [value, n, label] of [
    ['current-month', 2, '01.11.2026 – 15.11.2026'], ['current-year', 6, '01.01.2026 – 15.11.2026'],
    ['previous-month', 2, '01.10.2026 – 31.10.2026'], ['previous-year', 4, '01.01.2025 – 31.12.2025'],
    ['last-12', 8, '01.12.2025 – 15.11.2026'], ['all', 12, '10.07.2023 – 15.11.2026'],
  ]) {
    await quick().selectOption(value); await count(n);
    expect(await page.locator('.histogram-year-legend').getByText(`Ընտրված՝ ${label}`, { exact: true }).isVisible()).toBe(true);
    await button('Վաճառքի գումար').click();
    expect(await page.getByTestId('histogram-kpi-value').innerText()).toBe(`${n * 10},00 ֏`);
    await button('Բն. քանակ').click();
  }
  expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
});

test('quick memory is independent of manual choices, updates its relative date and resets on reset/reload', async () => {
  await page.goto(url); await ready();
  await year().selectOption('2025');
  await period().selectOption('month'); await year().selectOption('2025');
  await button('Ամիսներ').click(); await button('Մարտ').click(); await page.keyboard.press('Escape');
  await period().selectOption('quick'); await quick().selectOption('previous-month'); await count(2);
  await period().selectOption('year'); expect(await year().inputValue()).toBe('2025');
  await period().selectOption('month'); expect(await year().inputValue()).toBe('2025');
  await button('Ամիսներ').click(); expect(await button('Մարտ').getAttribute('aria-pressed')).toBe('true'); await page.keyboard.press('Escape');
  await period().selectOption('quick'); expect(await quick().inputValue()).toBe('previous-month');
  fixture.state.time = '2027-01-15T10:00:00Z'; await page.clock.setFixedTime(new Date(fixture.state.time));
  await button('Թարմացնել ամբողջ հաշվետվությունը').click(); await ready();
  expect(await quick().inputValue()).toBe('previous-month');
  expect(await page.locator('.histogram-year-legend').getByText('Ընտրված՝ 01.12.2026 – 31.12.2026', { exact: true }).isVisible()).toBe(true); await count(0);
  await button('Վերականգնել').click(); expect(await period().inputValue()).toBe('year'); expect(await year().inputValue()).toBe('2027');
  await period().selectOption('quick'); expect(await quick().inputValue()).toBe('current-month');
  await quick().selectOption('all'); await page.reload(); await ready(); expect(await period().inputValue()).toBe('year');
  await period().selectOption('quick'); expect(await quick().inputValue()).toBe('current-month');
});
