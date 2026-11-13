const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url, release;
const period = () => page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });
const year = () => page.getByRole('combobox', { name: 'Տարի', exact: true });
const openMonths = async () => {
  if (await period().inputValue() === 'month' && await page.getByRole('button', { name: 'Ամիսներ', exact: true }).getAttribute('aria-expanded') !== 'true')
    await page.getByRole('button', { name: 'Ամիսներ', exact: true }).click();
};
const selectPeriod = async value => {
  await page.keyboard.press('Escape');
  if (['last-12', 'all'].includes(value)) {
    await period().selectOption('quick');
    await page.getByRole('combobox', { name: 'Արագ ընտրություն', exact: true }).selectOption(value);
  } else await period().selectOption(value);
  await openMonths();
};
const selectYear = async value => { await year().selectOption(value); await openMonths(); };

const button = name => page.getByRole('button', { name, exact: true });
const ready = () => page.getByTestId('statistics-count').waitFor();
const count = async n => expect(await page.getByTestId('statistics-count').innerText()).toBe(String(n));
const refresh = async () => { await button('Թարմացնել ամբողջ հաշվետվությունը').click(); await ready(); };
const selected = async (name, value = true) => { await openMonths(); expect(await button(name).getAttribute('aria-pressed')).toBe(String(value)); };
beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-05-15T10:00:00Z'));
  fixture = createFixture({ time: '2026-05-15T10:00:00Z', items: [
    deal(1, { ufCrmDate: '2023-07-10' }), deal(2, { ufCrmDate: '2025-01-10', opportunity: '10' }),
    deal(3, { ufCrmDate: '2025-02-10', opportunity: '20' }), deal(4, { ufCrmDate: '2025-03-10', opportunity: '30' }),
    deal(5, { ufCrmDate: '2026-05-15' }), deal(6, { ufCrmDate: '2026-05-16' }),
    deal(7, { ufCrmDate: '2020-01-01', ufCrmArea: null }),
  ] });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { release?.(); release = undefined; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('nonadjacent months, last selection and year boundaries filter immediately without requests', async () => {
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await page.goto(url); await ready(); await count(1);
  expect(await year().locator('option').allTextContents()).toEqual(['2023', '2024', '2025', '2026']);
  await selectPeriod('month'); await selected('Մայիս');
  await selectYear('2025');
  await button('Հունվար').click(); await button('Մարտ').click(); await button('Մայիս').click();
  await count(2); expect(await page.getByTestId('statistics-amount').innerText()).toBe('~40 ֏');
  await button('Հունվար').click(); await count(1); await button('Մարտ').click(); await count(1); await selected('Մարտ');
  await button('Հունվար').click();
  await button('Թաուեր').click(); await count(0);
  expect(await year().locator('option').allTextContents()).toEqual(['2023', '2024', '2025', '2026']);
  await button('Թաուեր').click(); await count(2);
  await page.getByLabel('Մակերես (մ²)՝ Սկսած', { exact: true }).fill('51'); await count(0);
  await page.getByLabel('Մակերես (մ²)՝ Սկսած', { exact: true }).fill(''); await count(2);
  await page.getByLabel('Բնակարանի արժեք (֏)՝ Մինչև', { exact: true }).fill('20'); await count(1);
  await page.getByLabel('Բնակարանի արժեք (֏)՝ Մինչև', { exact: true }).fill('');
  await count(2);
  expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
});

test('nonadjacent quarters include endpoints and exclude intervening quarters and other years', async () => {
  fixture.state.items = ['2025-01-01', '2025-03-31', '2025-04-01', '2025-06-30', '2025-07-01', '2025-09-30', '2025-10-01', '2024-01-01']
    .map((date, i) => deal(i + 1, { ufCrmDate: date }));
  await page.goto(url); await ready(); await selectPeriod('quarter');
  await selected('II'); await selectYear('2025');
  await button('I').click(); await button('III').click(); await button('II').click(); await count(4);
  await button('I').click(); await count(2); await button('III').click(); await selected('III'); await count(2);
});

test('future buttons are disabled, calendar modes end today, and custom dates retain future access', async () => {
  await page.goto(url); await ready();
  for (const value of ['month', 'quarter', 'year', 'last-12', 'all']) {
    await selectPeriod(value); await count(value === 'all' ? 5 : 1);
    if (value === 'month' || value === 'quarter') {
      const names = value === 'month' ? ['Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'] : ['III', 'IV'];
      for (const name of names) {
        const control = button(name); expect(await control.isVisible()).toBe(true); expect(await control.isDisabled()).toBe(true);
        const box = await control.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await selected(name, false);
        await control.evaluate(el => el.focus()); expect(await control.evaluate(el => document.activeElement === el)).toBe(false);
      }
      await button(value === 'month' ? 'Մայիս' : 'II').focus(); await page.keyboard.press('Tab');
      expect(await button(value === 'month' ? 'Մաքրել' : 'Թաուեր').evaluate(el => document.activeElement === el)).toBe(true);
    }
  }
  await selectPeriod('custom');
  await page.getByLabel('Կնքման ժամանակահատված՝ Սկսած', { exact: true }).fill('2026-05-16'); await count(1);
  expect(await year().count()).toBe(0);
});

test('each mode remembers choices, refresh preserves them, reset and reload restore defaults', async () => {
  await page.goto(url); await ready();
  await selectPeriod('month'); await selectYear('2025');
  await button('Հունվար').click(); await button('Մարտ').click(); await button('Մայիս').click();
  await selectPeriod('quarter'); await selectYear('2024');
  await button('I').click(); await button('III').click(); await button('II').click();
  await selectPeriod('year'); await selectYear('2023'); await refresh();
  await selectPeriod('month'); expect(await year().inputValue()).toBe('2025'); await selected('Հունվար'); await selected('Մարտ');
  await selectPeriod('quarter'); expect(await year().inputValue()).toBe('2024'); await selected('I'); await selected('III');
  await selectPeriod('year'); expect(await year().inputValue()).toBe('2023');
  await button('Վերականգնել').click();
  expect(await period().inputValue()).toBe('year'); expect(await year().inputValue()).toBe('2026');
  await selectPeriod('month'); await selected('Մայիս'); await selected('Հունվար', false); expect(await year().inputValue()).toBe('2026');
  await selectPeriod('quarter'); await selected('II'); await selected('I', false);
  await page.reload(); await ready(); expect(await period().inputValue()).toBe('year'); expect(await year().inputValue()).toBe('2026');
});

test('year changes remove future selections and refreshing reconciles inactive memories', async () => {
  await page.goto(url); await ready(); await selectPeriod('month'); await selectYear('2025');
  await button('Հունվար').click(); await button('Դեկտեմբեր').click(); await button('Մայիս').click();
  await selectYear('2026'); await selected('Հունվար'); await selected('Դեկտեմբեր', false);
  await selectYear('2025'); await selected('Դեկտեմբեր', false);
  await button('Դեկտեմբեր').click(); await button('Հունվար').click(); await selectYear('2026'); await selected('Մայիս');
  await selectYear('2024'); await button('Դեկտեմբեր').click(); await button('Մայիս').click();
  await selectPeriod('quarter'); await selectYear('2024');
  await button('I').click(); await button('IV').click(); await button('II').click();
  await selectYear('2026'); await selected('I'); await selected('IV', false);
  await selectYear('2024'); await button('IV').click(); await button('I').click();
  await selectPeriod('year'); await selectYear('2023');
  fixture.state.items = [deal(1, { ufCrmDate: '2025-01-01' }), deal(2, { ufCrmDate: '2026-05-15' })];
  await refresh(); expect(await year().inputValue()).toBe('2026');
  await selectPeriod('month'); expect(await year().inputValue()).toBe('2026'); await selected('Մայիս'); await selected('Դեկտեմբեր', false);
  await selectPeriod('quarter'); expect(await year().inputValue()).toBe('2026'); await selected('II'); await selected('IV', false);
  fixture.state.time = '2027-01-15T10:00:00Z'; await page.clock.setFixedTime(new Date(fixture.state.time));
  await refresh(); expect(await year().inputValue()).toBe('2026'); await selected('II');
  await selectPeriod('year'); expect(await year().inputValue()).toBe('2026');
  await selectPeriod('last-12'); await count(1);
});

test.each(['empty', 'problem', 'future'])('%s data keeps a current year and empty calendar results, then new history expands years', async kind => {
  fixture.state.items = kind === 'empty' ? [] : [deal(1, { ufCrmDate: kind === 'problem' ? '2020-01-01' : '2026-05-16', ...(kind === 'problem' ? { ufCrmArea: null } : {}) })];
  await page.goto(url); await ready();
  for (const value of ['year', 'month', 'quarter', 'last-12', 'all']) {
    await selectPeriod(value); await count(0); expect(await page.locator('.statistics-body').getByRole('status').filter({ hasText: 'Տվյալներ չկան' }).isVisible()).toBe(true);
    if (['year', 'month', 'quarter'].includes(value)) expect(await year().locator('option').allTextContents()).toEqual(['2026']);
  }
  fixture.state.items = [deal(1, { ufCrmDate: '2022-07-10' })]; await refresh(); await count(1);
  await selectPeriod('month'); expect(await year().locator('option').allTextContents()).toEqual(['2022', '2023', '2024', '2025', '2026']);
  await selectYear('2022'); await button('Հունվար').click(); await button('Մայիս').click(); await count(0); await selected('Հունվար');
});

test('loading and failed refresh hide controls, recovery keeps month selection', async () => {
  await page.goto(url); await ready(); await selectPeriod('month'); await selectYear('2025');
  await button('Հունվար').click(); await button('Մայիս').click(); await count(1);
  fixture.state.gate = new Promise(resolve => { release = resolve; }); fixture.state.failPage = 0;
  await button('Թարմացնել ամբողջ հաշվետվությունը').click(); await page.locator('.statistics-status').filter({ hasText: 'Տվյալները բեռնվում են…' }).waitFor();
  expect(await year().count()).toBe(0); expect(await button('Հունվար').count()).toBe(0);
  release(); fixture.state.gate = null;
  await page.locator('.statistics-status').filter({ hasText: 'Տվյալներն անհասանելի են։' }).waitFor();
  expect(await page.locator('.statistics-panel svg, .kpi-container svg, .deals-histogram svg').count()).toBe(0); expect(await year().count()).toBe(0);
  fixture.state.failPage = undefined; await refresh(); await count(1); expect(await year().inputValue()).toBe('2025'); await selected('Հունվար');
});

const monthAction = name => page.locator('.date-filter').getByRole('button', { name, exact: true });
const markedMonths = () => page.getByRole('group', { name: 'Ամիսներ', exact: true }).locator('[aria-pressed="true"]').allTextContents();

test('month All and Clear stay available, preserve the selected year and apply without requests', async () => {
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await page.goto(url); await ready(); await selectPeriod('month');
  await monthAction('Բոլորը').click();
  await openMonths(); expect(await markedMonths()).toEqual(['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս']);
  expect(await monthAction('Մաքրել').isVisible()).toBe(true); await count(1);
  expect(await button('Հունիս').isDisabled()).toBe(true);
  await monthAction('Մաքրել').click(); await openMonths(); expect(await markedMonths()).toEqual(['Մայիս']);
  expect(await monthAction('Բոլորը').isVisible()).toBe(true);
  await selectYear('2025'); await monthAction('Բոլորը').focus(); await page.keyboard.press('Enter');
  expect((await markedMonths()).length).toBe(12); await count(3);
  await selectPeriod('year'); await selectPeriod('month');
  expect(await monthAction('Մաքրել').isVisible()).toBe(true); expect(await year().inputValue()).toBe('2025');
  await monthAction('Մաքրել').click(); await openMonths(); expect(await markedMonths()).toEqual(['Մայիս']); await count(0);
  expect(await year().inputValue()).toBe('2025');
  await monthAction('Բոլորը').click(); await button('Մարտ').click();
  expect(await monthAction('Բոլորը').isVisible()).toBe(true); await count(2);
  await button('Մարտ').click(); expect(await monthAction('Մաքրել').isVisible()).toBe(true); await count(3);
  expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
  await refresh(); await openMonths(); expect(await monthAction('Մաքրել').isVisible()).toBe(true); expect((await markedMonths()).length).toBe(12);
  await button('Վերականգնել').click(); await selectPeriod('month');
  await openMonths(); expect(await markedMonths()).toEqual(['Մայիս']); expect(await monthAction('Բոլորը').isVisible()).toBe(true);
});

test('January All and Clear both remain available when only the current month is available', async () => {
  await page.clock.setFixedTime(new Date('2026-01-15T10:00:00Z'));
  await page.goto(url); await ready(); await selectPeriod('month');
  await monthAction('Բոլորը').click(); await openMonths(); expect(await markedMonths()).toEqual(['Հունվար']);
  await selectPeriod('quarter'); await selectYear('2025'); await button('II').click();
  await selectPeriod('month');
  expect(await monthAction('Մաքրել').isVisible()).toBe(true);
  await monthAction('Մաքրել').click(); await openMonths(); expect(await markedMonths()).toEqual(['Հունվար']);
  expect(await monthAction('Բոլորը').isVisible()).toBe(true); expect(await button('Փետրվար').isDisabled()).toBe(true);
});

test.each([375])('quarter layout aligns headings, equal complexes and room rows 123 / 45 at %i px', async width => {
  fixture.state.items = Array.from({ length: 5 }, (_, i) => deal(i + 1, { ufCrmRooms: i + 1, ufCrmDate: '2026-05-01' }));
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready(); await selectPeriod('quarter');
  const panel = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const rooms = panel.getByRole('group', { name: 'Սենյակների քանակ', exact: true });
  const periodBox = await period().boundingBox(), yearBox = await year().boundingBox();
  const quarterBox = await page.getByRole('group', { name: 'Եռամսյակներ', exact: true }).boundingBox();
  const tower = await button('Թաուեր').boundingBox(), hills = await button('Հիլլս').boundingBox();
  const all = await rooms.getByRole('button', { name: 'Բոլորը', exact: true }).boundingBox();
  const numeric = rooms.getByRole('button', { name: /^Սենյակների քանակ՝/ });
  const boxes = await numeric.evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  const near = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1);
  expect(await numeric.allTextContents()).toEqual(['1', '2', '3', '4', '5']);
  near(tower.width, hills.width); near(tower.height, hills.height); near(tower.x, hills.x);
  near(tower.height, periodBox.height); near(hills.height, periodBox.height);
  near(hills.y - tower.y - tower.height, 8);
  for (const b of boxes.slice(0, 3)) { near(b.y, boxes[0].y); near(b.width, boxes[0].width); }
  near(boxes[3].y, boxes[4].y); near(boxes[3].width, boxes[4].width);
  for (const b of boxes) near(b.height, all.height);
  near(boxes[0].x, all.x);
  near(boxes[2].x + boxes[2].width, all.x + all.width);
  const firstRowWidth = boxes[2].x + boxes[2].width - boxes[0].x;
  expect(firstRowWidth).toBeLessThanOrEqual(all.width + .1);
  expect(all.width).toBeLessThan((await rooms.boundingBox()).width);
  near((boxes[3].x + boxes[4].x + boxes[4].width) / 2, boxes[0].x + firstRowWidth / 2);
  for (const b of boxes) near(b.width, 28);
  await button('Սենյակների քանակ՝ 4').click(); await count(1);
  await rooms.getByRole('button', { name: 'Բոլորը', exact: true }).click(); await count(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/quarter-alignment-${width}.png`, fullPage: true, animations: 'disabled' });
});
