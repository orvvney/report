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

test('apartments alone determine charts and problem list, refresh removes changed property types', async () => {
  fixture.state.items = [
    deal(1, { opportunity: '100' }), deal(2, { opportunity: '200', ufCrmDate: null }),
    deal(3, { ufCrmRooms: null, opportunity: '50' }),
    deal(4, { ufCrmProperty: '72', ufCrmRooms: 20, opportunity: '900', ufCrmDate: null }),
    ...['73', '74', undefined].map((ufCrmProperty, i) => deal(i + 5, { ufCrmProperty, ufCrmRooms: null, ufCrmDate: null })),
  ];
  await page.goto(url); await ready();
  expect(await columns().count()).toBe(2);
  await page.getByRole('button', { name: '2՝ 100 AMD, 1 գործարք', exact: true }).hover();
  expect(await page.getByRole('tooltip').innerText()).toContain('Ընդհանուր արժեք՝ 100 AMD');
  expect(await page.getByRole('tooltip').innerText()).toContain('Գործարքների քանակ՝ 1');
  for (const mode of [rooms(), months()]) {
    await mode.click();
    expect(await problems().innerText()).toMatch(/2/);
    await problems().click();
    const modal = page.getByRole('dialog'); await modal.waitFor();
    expect(await modal.getByRole('link').allTextContents()).toEqual(['2', '3']);
    expect(await modal.innerText()).toContain('Կնքման ամսաթիվ՝ Լրացված չէ');
    expect(await modal.innerText()).toContain('Սենյակների քանակ՝ Լրացված չէ');
    await page.getByRole('button', { name: 'Փակել' }).click();
  }
  await page.getByRole('button', { name: 'Հունվար՝ 100 AMD, 1 գործարք', exact: true }).hover();
  expect(await page.getByRole('tooltip').innerText()).toContain('Ընդհանուր արժեք՝ 100 AMD');
  expect(fixture.state.reads).toBe(1);
  fixture.state.items[1].ufCrmProperty = '72';
  await reloadReport();
  expect(await months().getAttribute('aria-pressed')).toBe('true');
  expect(await problems().innerText()).toMatch(/1/);
  await rooms().click();
  expect(await page.getByRole('button', { name: '2՝ 100 AMD, 1 գործարք', exact: true }).count()).toBe(1);
  await problems().click();
  expect(await page.getByRole('dialog').getByRole('link').allTextContents()).toEqual(['3']);
  await page.getByRole('button', { name: 'Փակել' }).click();
  fixture.state.items[2].ufCrmProperty = '72';
  await reloadReport(); expect(await problems().count()).toBe(0);
  fixture.state.items[0].ufCrmProperty = '72';
  await reloadReport();
  expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  expect(await columns().count()).toBe(0); expect(await problems().count()).toBe(0);
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await columns().first().getAttribute('aria-label')).toBe('Հունվար՝ 0 AMD, 0 գործարք');
});

test('starts with rooms, displays totals and every month, and switches without reading CRM again', async () => {
  await page.goto(url); await ready();
  expect(await rooms().getAttribute('aria-pressed')).toBe('true');
  expect(await columns().count()).toBe(6);
  const second = page.getByRole('button', { name: '2՝ 35 AMD, 2 գործարք', exact: true });
  await second.hover();
  expect(await page.getByRole('tooltip').innerText()).toContain('Ընդհանուր արժեք՝ 35 AMD');
  expect(await page.getByRole('tooltip').innerText()).toContain('Գործարքների քանակ՝ 2');
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await page.getByText('2026', { exact: true }).isVisible()).toBe(true);
  expect(await page.getByRole('button', { name: 'Հունվար՝ 10 AMD, 1 գործարք', exact: true }).count()).toBe(1);
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
  expect(await columns().count()).toBe(0);
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

const input = (kind, side) => page.getByLabel(`${{ amount: 'Ընդհանուր արժեք', area: 'Մակերես (մ²)', date: 'Կնքման ամսաթիվ' }[kind]}՝ ${side === 'min' ? 'Սկսած' : 'Մինչև'}`, { exact: true });
const room = (n) => page.getByRole('button', { name: `Սենյակների քանակ՝ ${n}`, exact: true });
const clearRanges = async () => {
  for (const kind of ['amount', 'area', 'date']) {
    await input(kind, 'min').fill(''); await input(kind, 'max').fill('');
  }
};
const labels = () => columns().evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
const baseFilters = async () => { fixture.state.items = require('../support/crm-fixture.cjs').filterItems(); await page.goto(url); await ready(); };

test('filters intersect instantly, keep global problems, preserve mode and never fetch again', async () => {
  let requests = 0; page.on('request', (request) => { if (request.url().endsWith('/api/report')) requests++; });
  await baseFilters();
  expect(await labels()).toEqual(['1՝ 100.1 AMD, 1 գործարք', '2՝ 600.6 AMD, 2 գործարք', '3՝ 300.3 AMD, 1 գործարք']);
  await columns().first().hover(); await page.getByRole('tooltip').waitFor();
  await room(1).click(); expect(await page.getByRole('tooltip').count()).toBe(0);
  await room(3).click(); await room(2).click(); expect(await room(2).getAttribute('aria-pressed')).toBe('true');
  for (const [kind, min, max] of [['amount', '150', '350'], ['area', '60', '70'], ['date', '2026-01-01', '2026-12-31']]) {
    await input(kind, 'min').fill(min); await input(kind, 'max').fill(max);
  }
  expect(await labels()).toEqual(['2՝ 200.2 AMD, 1 գործարք']);
  expect(await input('date', 'max').evaluate((el) => el === document.activeElement)).toBe(true);
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await columns().nth(5).getAttribute('aria-label')).toBe('Հունիս՝ 200.2 AMD, 1 գործարք');
  expect(await page.getByText('2026 · Սկսած 2026-01-01 · Մինչև 2026-12-31', { exact: true }).count()).toBe(1);
  await input('amount', 'max').fill('190'); expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  expect(await problems().innerText()).toMatch(/4/); await problems().click();
  const modal = page.getByRole('dialog'); expect(await modal.getByRole('link').allTextContents()).toEqual(['5', '6', '7', '8']);
  expect(await modal.innerText()).toContain('Մակերես (մ²)՝ Լրացված չէ');
  expect(await modal.innerText()).not.toContain('500'); await page.keyboard.press('Escape');
  await clearRanges(); await room(1).click(); await room(3).click(); expect(await months().getAttribute('aria-pressed')).toBe('true');
  expect(await input('amount', 'min').inputValue()).toBe('');
  expect(await room(1).getAttribute('aria-pressed')).toBe('true');
  expect(fixture.state.reads).toBe(1); expect(requests).toBe(1);
});

test.each([
  ['amount', '200,2', '300.3', ['1՝ 0 AMD, 0 գործարք', '2՝ 200.2 AMD, 1 գործարք', '3՝ 300.3 AMD, 1 գործարք']],
  ['area', '65,5', '80', ['1՝ 0 AMD, 0 գործարք', '2՝ 600.6 AMD, 2 գործարք', '3՝ 300.3 AMD, 1 գործարք']],
])('%s supports fractions, equal/open boundaries, zero and clearing', async (kind, min, max, expected) => {
  await baseFilters(); await input(kind, 'min').fill(min); await input(kind, 'max').fill(max);
  expect(await labels()).toEqual(expected);
  await input(kind, 'max').fill(min.replace(',', '.'));
  expect(await labels()).toEqual(['1՝ 0 AMD, 0 գործարք', '2՝ 200.2 AMD, 1 գործարք', '3՝ 0 AMD, 0 գործարք']);
  await input(kind, 'min').fill(''); expect(await columns().first().getAttribute('aria-label')).toBe('1՝ 100.1 AMD, 1 գործարք');
  await input(kind, 'min').fill('0'); expect(await input(kind, 'min').getAttribute('aria-invalid')).toBe('false');
  await input(kind, 'max').fill('0'); expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  await input(kind, 'max').fill(''); expect(await columns().nth(1).getAttribute('aria-label')).toBe('2՝ 600.6 AMD, 2 գործարք');
  await input(kind, 'min').fill(kind === 'area' ? '80' : '300.3');
  expect(await columns().nth(1).getAttribute('aria-label')).toBe('2՝ 400.4 AMD, 1 գործարք');
  expect(fixture.state.reads).toBe(1);
});

test('date endpoints include whole days, past years preserve twelve months and clearing removes bounds', async () => {
  await baseFilters();
  await input('date', 'min').fill('2026-01-01'); await input('date', 'max').fill('2026-12-31');
  expect(await labels()).toEqual(['1՝ 100.1 AMD, 1 գործարք', '2՝ 600.6 AMD, 2 գործարք', '3՝ 0 AMD, 0 գործարք']);
  await input('date', 'min').fill('2025-01-01'); await input('date', 'max').fill('2025-12-31');
  expect(await columns().last().getAttribute('aria-label')).toBe('3՝ 300.3 AMD, 1 գործարք');
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  await input('date', 'max').fill(''); expect(await columns().first().getAttribute('aria-label')).toBe('Հունվար՝ 100.1 AMD, 1 գործարք');
  await input('date', 'min').fill(''); expect(await input('date', 'min').getAttribute('min')).toBeNull();
  expect(await input('date', 'max').getAttribute('max')).toBeNull();
});

test('invalid drafts retain last valid pair while other filters work; correction/clearing and refresh preserve semantics', async () => {
  await baseFilters();
  await input('area', 'min').fill('50'); await input('area', 'max').fill('80');
  await input('area', 'min').fill('90');
  expect(await input('area', 'min').getAttribute('aria-invalid')).toBe('true');
  expect(await page.getByRole('alert').innerText()).toBe('Սկզբնական արժեքը չպետք է գերազանցի վերջնական արժեքը');
  expect(await columns().nth(1).getAttribute('aria-label')).toBe('2՝ 600.6 AMD, 2 գործարք');
  await input('amount', 'max').fill('250'); expect(await columns().nth(1).getAttribute('aria-label')).toBe('2՝ 200.2 AMD, 1 գործարք');
  await months().click(); await reloadReport();
  expect(await input('area', 'min').inputValue()).toBe('90'); expect(await input('area', 'min').getAttribute('aria-invalid')).toBe('true');
  expect(await columns().nth(5).getAttribute('aria-label')).toBe('Հունիս՝ 200.2 AMD, 1 գործարք');
  await input('area', 'max').fill('100'); expect(await page.getByRole('alert').count()).toBe(0);
  expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  await clearRanges(); await rooms().click(); await input('amount', 'max').fill('200.2');
  for (const value of ['-1', 'abc', '65,']) {
    await input('amount', 'max').fill(value);
    expect(await input('amount', 'max').getAttribute('aria-invalid')).toBe('true');
    expect(await columns().nth(1).getAttribute('aria-label')).toBe('2՝ 200.2 AMD, 1 գործարք');
  }
  await input('amount', 'max').fill('400.4'); expect(await page.getByRole('alert').count()).toBe(0);
  await input('date', 'min').fill('2026-01-01'); await input('date', 'max').fill('2025-12-31');
  expect(await input('date', 'max').getAttribute('aria-invalid')).toBe('true');
  expect(await columns().last().getAttribute('aria-label')).toBe('3՝ 0 AMD, 0 գործարք');
  // Incomplete native date editing has an empty value but badInput=true; it must not clear the bound.
  await input('date', 'max').fill(''); await input('date', 'min').focus();
  await input('date', 'min').press('ArrowRight'); await input('date', 'min').press('Backspace');
  expect(await input('date', 'min').evaluate((el) => el.validity.badInput)).toBe(true);
  expect(await input('date', 'min').getAttribute('aria-invalid')).toBe('true');
  expect(await columns().last().getAttribute('aria-label')).toBe('3՝ 0 AMD, 0 գործարք');
  await input('date', 'min').fill('2026-01-01'); await clearRanges(); expect(await page.getByRole('alert').count()).toBe(0);
  expect(await input('date', 'min').evaluate((el) => el.validity.badInput)).toBe(false);
});

test('room gaps, growth/shrink/empty reconciliation and page reload', async () => {
  await baseFilters(); await room(1).click(); await room(3).click();
  fixture.state.items = [deal(1, { ufCrmRooms: 5 })]; await reloadReport();
  const selected = () => page.locator('.room-buttons button[aria-pressed="true"]').allTextContents();
  expect(await selected()).toEqual(['2', '4', '5']);
  await room(2).click(); await room(4).click();
  fixture.state.items = [deal(1)]; await reloadReport(); expect(await selected()).toEqual(['1', '2']);
  fixture.state.items = []; await reloadReport(); expect(await selected()).toEqual([]);
  expect(await input('area', 'min').isEnabled()).toBe(true);
  fixture.state.items = [deal(1, { ufCrmRooms: 1 }), deal(2, { ufCrmRooms: 3 })]; await reloadReport();
  expect(await selected()).toEqual(['1', '2', '3']); await room(1).click(); await room(3).click();
  expect(await labels()).toEqual(['2՝ 0 AMD, 0 գործարք']); expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  await input('area', 'min').fill('90'); await page.reload(); await ready();
  expect(await selected()).toEqual(['1', '2', '3']); expect(await input('area', 'min').inputValue()).toBe('');
});

test('filter panel disables on load/failure and retry restores saved filters', async () => {
  await baseFilters(); await input('amount', 'min').fill('200.2'); await room(3).click();
  fixture.state.items = Array.from({ length: 51 }, (_, i) => deal(i + 1, { opportunity: '300' })); fixture.state.failPage = 50;
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await refresh().click(); await page.getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await page.getByRole('form', { name: 'Զտիչներ', exact: true }).isVisible()).toBe(true);
  expect(await input('amount', 'min').isDisabled()).toBe(true); expect(await room(1).isDisabled()).toBe(true);
  expect(await columns().count()).toBe(0);
  release(); fixture.state.gate = null; await page.getByRole('alert').waitFor();
  expect(await input('area', 'min').isDisabled()).toBe(true); expect(await room(3).getAttribute('aria-pressed')).toBe('false');
  fixture.state.failPage = undefined; await reloadReport(); expect(await input('amount', 'min').inputValue()).toBe('200.2');
  expect(await columns().last().getAttribute('aria-label')).toBe('2՝ 15 300 AMD, 51 գործարք');
  for (const items of [[], [deal(1, { ufCrmProperty: '72' })], [deal(1, { ufCrmArea: null })]]) {
    fixture.state.items = items; await reloadReport(); expect(await page.locator('.room-buttons button').count()).toBe(0);
    expect(await input('area', 'min').isEnabled()).toBe(true);
    expect(await page.getByText('Տվյալներ չկան', { exact: true }).isVisible()).toBe(true);
  }
  expect(await problems().innerText()).toMatch(/1/);
});

test.each([1440, 375])('filters precede grouping without a reset button, with independent scroll and keyboard access at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  const panel = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const panelScroll = page.getByLabel('Զտիչների տարածք', { exact: true });
  const graphScroll = page.getByLabel('Գծապատկերի տարածք', { exact: true });
  const panelBox = await panel.boundingBox();
  const groupBox = await page.getByRole('group', { name: 'Խմբավորում' }).boundingBox();
  expect(panelBox.y + panelBox.height).toBeLessThan(groupBox.y);
  expect(await page.getByRole('button', { name: 'Զտիչները վերակայել', exact: true }).count()).toBe(0);
  const boxes = await panel.locator('fieldset').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
  expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
  expect(boxes.map((b) => b.x)).toEqual(boxes.map((b) => b.x).sort((a, b) => a - b));
  expect(await panelScroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(width === 375);
  const refreshBox = await refresh().boundingBox();
  await panelScroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  expect(await graphScroll.evaluate((el) => el.scrollLeft)).toBe(0);
  const panelPosition = await panelScroll.evaluate((el) => el.scrollLeft);
  await graphScroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  expect(await panelScroll.evaluate((el) => el.scrollLeft)).toBe(panelPosition);
  expect(await refresh().boundingBox()).toEqual(refreshBox);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await room(1).focus(); await page.keyboard.press('Space'); expect(await room(1).getAttribute('aria-pressed')).toBe('false');
  await page.keyboard.press('Tab'); expect(await room(2).evaluate((el) => el === document.activeElement)).toBe(true);
  await room(3).focus(); await page.keyboard.press('Tab'); expect(await input('amount', 'min').evaluate((el) => el === document.activeElement)).toBe(true);
  await input('amount', 'min').fill('200'); await input('amount', 'max').fill('100');
  const errorId = await input('amount', 'max').getAttribute('aria-describedby');
  expect(await page.locator(`#${errorId}`).innerText()).toBe('Սկզբնական արժեքը չպետք է գերազանցի վերջնական արժեքը');
  expect(await input('amount', 'max').evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await panel.locator('fieldset').filter({ has: input('amount', 'min') }).evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await page.screenshot({ path: `test-results/filters-error-${width}.png`, fullPage: true });
  await input('date', 'min').focus();
  await input('date', 'min').evaluate((el) => el.showPicker());
  await page.screenshot({ path: `test-results/filters-date-control-${width}.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await input('date', 'min').fill('2026-06-15');
  await input('date', 'min').evaluate((el) => el.showPicker());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await input('date', 'min').inputValue()).toBe('2026-06-16');
  await input('date', 'max').focus();
  // Date controls use multiple internal segments before the next toolbar button.
  for (let i = 0; i < 5 && !(await refresh().evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  expect(await refresh().evaluate((el) => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await rooms().evaluate((el) => el === document.activeElement)).toBe(true);
});
