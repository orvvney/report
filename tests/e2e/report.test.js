const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal, sampleItems } = require('../support/crm-fixture.cjs');
let fixture, server, url, release;
const rooms = () => page.getByRole('button', { name: 'Սենյակների քանակ', exact: true });
const months = () => page.getByRole('button', { name: 'Կնքման ամսաթիվ', exact: true });
const problems = () => page.getByRole('button', { name: /^Խնդրահարույց գործարքներ/ });
const refresh = () => page.getByRole('button', { name: /Թարմացնել/ });
const columns = () => page.locator('svg [role="button"]');
const ready = async () => { await page.getByRole('heading', { name: 'Ընդհանուր արժեք (AMD)', exact: true }).waitFor(); };
async function reloadReport() { await refresh().click(); await ready(); }
beforeEach(async () => {
  fixture = createFixture(); server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { release?.(); release = undefined; server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

test('starts with rooms, displays totals and every month, and switches without reading CRM again', async () => {
  await page.goto(url); await ready();
  expect(await rooms().getAttribute('aria-pressed')).toBe('true');
  expect(await columns().count()).toBe(6);
  const second = page.getByRole('button', { name: '2՝ 45 AMD, 3 գործարք', exact: true });
  await second.hover();
  expect(await page.getByRole('tooltip').innerText()).toContain('Ընդհանուր արժեք՝ 45 AMD');
  expect(await page.getByRole('tooltip').innerText()).toContain('Գործարքների քանակ՝ 3');
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await page.getByText('2026', { exact: true }).isVisible()).toBe(true);
  expect(await page.getByRole('button', { name: 'Հունվար՝ 35 AMD, 2 գործարք', exact: true }).count()).toBe(1);
  for (const name of ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր']) expect(await page.locator('svg').getByText(name, { exact: true }).count()).toBe(1);
  await rooms().click(); expect(await second.count()).toBe(1); expect(fixture.state.reads).toBe(1);
});
test('same unique all-time problem list in both modes, safe links, only IDs and reasons', async () => {
  await page.goto(url); await ready();
  expect(await problems().innerText()).toMatch(/5/);
  let first;
  for (const button of [rooms(), months()]) {
    await button.click(); await problems().click();
    const modal = page.getByRole('dialog'); await modal.waitFor();
    const rows = await modal.getByRole('listitem').allTextContents();
    expect(rows).toHaveLength(5);
    if (first) expect(rows).toEqual(first); else first = rows;
    expect(rows[2]).toContain('Սենյակների քանակ՝ Լրացված չէ');
    expect(rows[2]).toContain('Կնքման ամսաթիվ՝ Լրացված չէ');
    expect(rows[3]).toContain('Սենյակների քանակ՝ Անվավեր արժեք');
    expect(rows[3]).toContain('Ընդհանուր արժեք՝ Անվավեր արժեք');
    const links = modal.getByRole('link'); expect(await links.allTextContents()).toEqual(['4', '5', '6', '7', '8']);
    for (let i = 0; i < 5; i++) {
      expect(await links.nth(i).getAttribute('href')).toBe(`https://portal.example/crm/deal/details/${i + 4}/`);
      expect(await links.nth(i).getAttribute('target')).toBe('_blank');
      expect(await links.nth(i).getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(await modal.innerText()).not.toContain('AMD');
    await page.getByRole('button', { name: 'Փակել' }).click(); await modal.waitFor({ state: 'hidden' });
    expect(await problems().evaluate((el) => el === document.activeElement)).toBe(true);
  }
});
test('refresh replaces totals, closes tooltip/list, preserves mode and recalculates year', async () => {
  await page.goto(url); await ready(); await months().click();
  await columns().first().click(); await page.getByRole('tooltip').waitFor();
  fixture.state.items = [deal(1, { opportunity: '77.125', ufCrmDate: '2027-01-01' })];
  fixture.state.time = '2026-12-31T20:00:00Z';
  await reloadReport();
  expect(await months().getAttribute('aria-pressed')).toBe('true');
  expect(await page.getByRole('tooltip').count()).toBe(0); expect(await problems().count()).toBe(0);
  expect(await page.getByText('2027', { exact: true }).isVisible()).toBe(true);
  expect(await page.getByRole('button', { name: 'Հունվար՝ 77.125 AMD, 1 գործարք', exact: true }).count()).toBe(1);
  expect(fixture.state.reads).toBe(2);
});
test('loading hides old data and disables refresh, last-page failure is not partial success, then recovery and empty result', async () => {
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await page.goto(url);
  await page.getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await refresh().isDisabled()).toBe(true); expect(await columns().count()).toBe(0);
  release(); fixture.state.gate = null; await ready();
  fixture.state.items = Array.from({ length: 51 }, (_, i) => deal(i + 1)); fixture.state.failPage = 50;
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await refresh().click(); await page.getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await refresh().isDisabled()).toBe(true); expect(await columns().count()).toBe(0); expect(await problems().count()).toBe(0);
  release(); fixture.state.gate = null;
  await page.getByRole('alert').waitFor();
  expect(await page.getByRole('alert').innerText()).toBe('Չհաջողվեց բեռնել տվյալները։ Փորձեք կրկին։');
  expect(await columns().count()).toBe(0); expect(await refresh().isDisabled()).toBe(false);
  fixture.state.failPage = undefined; await reloadReport();
  expect(await page.getByRole('button', { name: '2՝ 510 AMD, 51 գործարք', exact: true }).count()).toBe(1);
  fixture.state.items = []; await reloadReport();
  expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  expect(await columns().count()).toBe(0); expect(await problems().count()).toBe(0);
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await columns().first().getAttribute('aria-label')).toBe('Հունվար՝ 0 AMD, 0 գործարք');
});
test('all-problem empty case and zero-amount six-room deal keep the correct X ranges', async () => {
  fixture.state.items = [deal(1, { ufCrmRooms: null, ufCrmDate: null, opportunity: 0 })];
  await page.goto(url); await ready();
  expect(await columns().count()).toBe(0); expect(await problems().innerText()).toMatch(/1/);
  expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  await months().click(); expect(await columns().count()).toBe(12);
  fixture.state.items = [deal(1, { ufCrmRooms: 6, opportunity: 0 })]; await reloadReport(); await rooms().click();
  expect(await columns().count()).toBe(6);
  expect(await columns().last().getAttribute('aria-label')).toBe('6՝ 0 AMD, 0 գործարք');
  await problems().click(); expect(await page.getByRole('dialog').innerText()).toContain('Ընդհանուր արժեք՝ Անվավեր արժեք');
});
test('full decimal tooltip opens by hover, click and keyboard while axis uses Armenian abbreviations', async () => {
  fixture.state.items = [deal(1, { opportunity: 0.1 }), deal(2, { opportunity: 0.2 }), deal(3, { ufCrmRooms: 6, opportunity: '1234567890.123456' })];
  await page.goto(url); await ready();
  const small = page.getByRole('button', { name: '2՝ 0.3 AMD, 2 գործարք', exact: true });
  await small.focus(); expect(await page.getByRole('tooltip').innerText()).toContain('0.3 AMD');
  await small.press('Escape'); expect(await page.getByRole('tooltip').count()).toBe(0);
  await small.press('Enter'); await page.getByRole('tooltip').waitFor();
  const large = columns().last(); await large.hover();
  expect(await page.getByRole('tooltip').innerText()).toContain('1 234 567 890.123456 AMD');
  await large.click(); expect(await page.getByRole('tooltip').innerText()).toContain('Գործարքների քանակ՝ 1');
  expect(await page.locator('svg').textContent()).toContain('մլրդ');
});
test('modal traps and restores focus and closes with Escape, close button and backdrop', async () => {
  await page.goto(url); await ready(); await problems().click();
  const modal = page.getByRole('dialog'); await modal.waitFor();
  const close = page.getByRole('button', { name: 'Փակել' });
  await close.focus(); await page.keyboard.press('Shift+Tab');
  expect(await modal.getByRole('link').last().evaluate((el) => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab'); expect(await close.evaluate((el) => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
  expect(await problems().evaluate((el) => el === document.activeElement)).toBe(true);
  await problems().click(); await close.click(); await modal.waitFor({ state: 'hidden' });
  await problems().click(); await page.mouse.click(2, 2); await modal.waitFor({ state: 'hidden' });
  expect(await problems().evaluate((el) => el === document.activeElement)).toBe(true);
});
test('wide and narrow layout keeps controls outside graph scroll and long problem list scrolls internally', async () => {
  fixture.state.items = [...sampleItems(), ...Array.from({ length: 100 }, (_, i) => deal(i + 9, { ufCrmDate: null }))];
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(url); await ready();
  const section = await page.getByRole('region', { name: 'Գործարքների հաշվետվություն' }).boundingBox();
  const group = await page.getByRole('group', { name: 'Խմբավորում' }).boundingBox();
  expect(Math.abs(group.x + group.width / 2 - section.x - section.width / 2)).toBeLessThan(2);
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/report-wide.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const scroll = page.getByLabel('Գծապատկերի տարածք');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const before = await refresh().boundingBox();
  await scroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  expect(await refresh().boundingBox()).toEqual(before);
  const narrowGroup = await page.getByRole('group', { name: 'Խմբավորում' }).boundingBox();
  expect(narrowGroup.y).toBeGreaterThan(before.y + before.height);
  await scroll.evaluate((el) => { el.scrollLeft = 0; });
  await page.screenshot({ path: 'test-results/report-narrow.png', fullPage: true });
  await problems().click();
  const modal = page.getByRole('dialog'); await modal.waitFor();
  expect(await modal.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await modal.getByRole('link').last().focus();
  expect(await modal.evaluate((el) => el.scrollTop > 0)).toBe(true);
  expect(await modal.getByRole('link').last().innerText()).toBe('108');
  await page.screenshot({ path: 'test-results/report-modal.png', fullPage: true });
});
