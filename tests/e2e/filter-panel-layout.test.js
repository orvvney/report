const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url, release;
const period = () => page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });
const panel = () => page.getByRole('form', { name: 'Զտիչներ', exact: true });
const ready = () => page.getByTestId('statistics-count').waitFor();
const near = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1);
beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  fixture = createFixture({ items: Array.from({ length: 5 }, (_, i) => deal(i + 1, { ufCrmRooms: i + 1, ufCrmDate: '2026-11-01' })) });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { release?.(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test.each([320, 1440])('filter help explains the section with mouse and keyboard at %i', async width => {
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready();
  const help = panel().getByRole('button', { name: 'Զտիչների մասին', exact: true });
  const tooltip = page.locator('#filter-help-text');
  expect(await tooltip.isVisible()).toBe(false);
  const title = await panel().getByRole('heading', { name: 'Զտիչներ', exact: true }).boundingBox();
  expect((await help.boundingBox()).x).toBeGreaterThanOrEqual(title.x + title.width);
  await help.hover(); await tooltip.waitFor();
  expect(await tooltip.innerText()).toBe('Այս բաժինը նախատեսված է վաճառված բնակարանները զտելու համար։');
  const box = await tooltip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  await page.mouse.move(0, 0); await tooltip.waitFor({ state: 'hidden' });
  await help.focus(); await tooltip.waitFor();
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  await page.keyboard.press('Enter'); await tooltip.waitFor();
  await page.keyboard.press('Tab'); await tooltip.waitFor({ state: 'hidden' });
  expect(await button('Վերականգնել').evaluate(el => el === document.activeElement)).toBe(true);
  await help.click(); await tooltip.waitFor();
  await page.screenshot({ path: `test-results/filter-help-${width}.png` });
});

test.each([320, 1440])('statistics help explains quick statistics at %i', async width => {
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready();
  const help = page.getByRole('button', { name: 'Վիճակագրության մասին', exact: true });
  const tooltip = page.locator('#statistics-help-text');
  expect(await tooltip.isVisible()).toBe(false);
  const title = await page.getByRole('heading', { name: 'Վիճակագրություն', exact: true }).boundingBox();
  expect((await help.boundingBox()).x).toBeGreaterThanOrEqual(title.x + title.width);
  await help.hover(); await tooltip.waitFor();
  expect(await tooltip.innerText()).toBe('Այս բաժինը նախատեսված է վիճակագրությունն արագ դիտելու համար։');
  expect(await tooltip.evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  const box = await tooltip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  await page.mouse.move(0, 0); await tooltip.waitFor({ state: 'hidden' });
  await help.focus(); await tooltip.waitFor();
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  await page.keyboard.press('Enter'); await tooltip.waitFor();
  await page.keyboard.press('Tab'); await tooltip.waitFor({ state: 'hidden' });
  await page.screenshot({ path: `test-results/statistics-help-${width}.png` });
});

test.each([1440, 1920])('wide panel preserves the year dimensions through period changes at %i', async width => {
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready();
  const reference = await panel().boundingBox();
  const stacked = await page.locator('.report-top-panels').evaluate(el=>el.classList.contains('panels-stacked'));
  near(reference.width, ((await page.locator('.report-top-panels').boundingBox()).width - 2) / (stacked ? 1 : 2)); near(reference.height, 258);
  await page.screenshot({ path: `test-results/filter-panel-current-${width}.png`, fullPage: true });
  for (const value of ['month', 'quarter', 'year', 'custom']) {
    await period().selectOption(value);
    const box = await panel().boundingBox(); near(box.width, reference.width); near(box.height, reference.height);
  }
});

const button = name => page.getByRole('button', { name, exact: true });
const input = (kind, side) => page.getByLabel(`${{ area: 'Մակերես (մ²)', amount: 'Բնակարանի արժեք (֏)', date: 'Կնքման ժամանակահատված' }[kind]}՝ ${side}`, { exact: true });
const quick = () => page.getByRole('combobox', { name: 'Արագ ընտրություն', exact: true });
const year = () => page.getByRole('combobox', { name: 'Տարի', exact: true });
const size = (a, b) => { near(a.width, b.width); near(a.height, b.height); };
async function choose(value) {
  await page.keyboard.press('Escape');
  await period().selectOption(value);
}

test.each([1440, 1920])('wide geometry, headings and year styling stay equal for every period at %i', async width => {
  fixture.state.items = Array.from({ length: 12 }, (_, i) => deal(i + 1, { ufCrmRooms: i + 1, ufCrmDate: '2026-11-01' }));
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready();
  const reference = await panel().boundingBox();
  const tower = await button('Թաուեր').boundingBox();
  const rooms = await page.locator('.room-filter').boundingBox();
  for (const value of ['quick', 'month', 'quarter', 'year', 'custom']) {
    await choose(value);
    size(await panel().boundingBox(), reference);
    const titles = await panel().locator('legend').evaluateAll(els => els.slice(0, 3).map(el => el.getBoundingClientRect().y));
    near(titles[0], titles[1]); near(titles[0], titles[2]);
    size(await button('Թաուեր').boundingBox(), tower); size(await button('Հիլլս').boundingBox(), tower);
    size(await page.locator('.room-filter').boundingBox(), rooms);
    expect(await page.locator('.room-values button').count()).toBe(12);
    const left = await input('area', 'Սկսած').boundingBox(), right = await input('area', 'Մինչև').boundingBox();
    size(left, right);
    const list = await period().boundingBox(); near(right.x + right.width, list.x + list.width);
    if (value === 'month' || value === 'quarter') {
      const y = await year().boundingBox(); size(y, left); near(y.x, left.x);
      const r = await (value === 'month' ? button('Ամիսներ') : page.getByRole('group', { name: 'Եռամսյակներ', exact: true })).boundingBox();
      size(r, right); near(r.x, right.x); near(r.y, y.y);
      if (value === 'quarter') {
        const boxes = await page.locator('.quarter-buttons button').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { width: b.width, y: b.y }; }));
        boxes.forEach(b => { near(b.width, boxes[0].width); near(b.y, y.y); });
      }
    }
    if (value === 'custom') {
      size(await input('date', 'Սկսած').boundingBox(), left); size(await input('date', 'Մինչև').boundingBox(), right);
    }
    const centered = await button('Հիլլս').evaluate(el => {
      const r = el.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect();
      return [t.x + t.width / 2 - r.x - r.width / 2, t.y + t.height / 2 - r.y - r.height / 2];
    });
    centered.forEach(offset => near(offset, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/stable-panel-${width}-${value}.png`, fullPage: true });
  }
});

test.each([1440, 1920])('errors, initial loading, refresh failure and recovery preserve panel dimensions at %i', async width => {
  await page.setViewportSize({ width, height: 1200 });
  fixture.state.gate = new Promise(resolve => { release = resolve; });
  await page.goto(url); await page.locator('.filter-notice').waitFor();
  const initial = await panel().boundingBox();
  release(); fixture.state.gate = null; await ready();
  const reference = await panel().boundingBox(); size(initial, reference);
  await choose('custom');
  for (const [kind, start, end] of [['area', '100', '50'], ['amount', '1000', '500'], ['date', '2026-11-10', '2026-10-01']]) {
    await input(kind, 'Սկսած').fill(start); await input(kind, 'Մինչև').fill(end);
  }
  expect(await panel().getByRole('alert').count()).toBe(3); size(await panel().boundingBox(), reference);
  for (const error of await panel().getByRole('alert').all()) {
    const b = await error.boundingBox(); expect(b.y + b.height).toBeLessThanOrEqual(reference.y + reference.height);
    expect(await error.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  }
  await page.screenshot({ path: `test-results/stable-panel-${width}-errors.png`, fullPage: true });
  fixture.state.gate = new Promise(resolve => { release = resolve; }); fixture.state.failPage = 0;
  await button('Թարմացնել հաշվետվությունը').click(); await page.locator('.filter-notice').waitFor();
  size(await panel().boundingBox(), reference); expect(await period().isVisible()).toBe(false);
  release(); fixture.state.gate = null;
  await page.locator('.statistics-status').filter({ hasText: 'Տվյալներն անհասանելի են։' }).waitFor();
  size(await panel().boundingBox(), reference);
  await page.screenshot({ path: `test-results/stable-panel-${width}-unavailable.png`, fullPage: true });
  fixture.state.failPage = undefined; await button('Թարմացնել հաշվետվությունը').click(); await ready();
  size(await panel().boundingBox(), reference); expect(await panel().getByRole('alert').count()).toBe(3);
});

test.each([375, 768, 1024, 1440])('month popup supports hover, keyboard and multiple selection without overflow at %i', async width => {
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready(); await choose('month');
  const trigger = button('Ամիսներ'), popup = page.getByRole('dialog', { name: 'Ամիսների ընտրություն' });
  const reference = await panel().boundingBox();
  await trigger.hover(); await popup.waitFor();
  await button('Հունվար').hover(); expect(await popup.isVisible()).toBe(true);
  await button('Հունվար').click(); expect(await popup.isVisible()).toBe(true);
  const grid = page.getByRole('group', { name: 'Ամիսներ', exact: true });
  const boxes = await grid.getByRole('button').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, fits: el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight }; }));
  expect(new Set(boxes.map(b => b.x)).size).toBe(4); expect(new Set(boxes.map(b => b.y)).size).toBe(3);
  boxes.forEach(b => { size(b, boxes[0]); expect(b.fits).toBe(true); });
  const pop = await popup.boundingBox(); expect(pop.width).toBeGreaterThan((await trigger.boundingBox()).width);
  const triggerBox = await trigger.boundingBox();
  const centeredLeft = triggerBox.x + (triggerBox.width - pop.width) / 2;
  near(pop.x, Math.max(12, Math.min(centeredLeft, width - pop.width - 12)));
  near(pop.y, triggerBox.y + triggerBox.height);
  expect(pop.x).toBeGreaterThanOrEqual(0); expect(pop.x + pop.width).toBeLessThanOrEqual(width);
  size(await panel().boundingBox(), reference);
  expect(await button('Դեկտեմբեր').isDisabled()).toBe(true);
  await popup.getByRole('button', { name: 'Բոլորը', exact: true }).click();
  expect(await grid.locator('[aria-pressed="true"]').count()).toBe(11);
  await popup.getByRole('button', { name: 'Մաքրել', exact: true }).click();
  expect(await grid.locator('[aria-pressed="true"]').allTextContents()).toEqual(['Նոյեմբեր']);
  expect(await popup.isVisible()).toBe(true);
  await page.screenshot({ path: `test-results/stable-panel-${width}-months.png` });
  await page.keyboard.press('Escape'); expect(await popup.isVisible()).toBe(false);
  expect(await trigger.evaluate(el => document.activeElement === el)).toBe(true);
  await page.keyboard.press('Enter'); await popup.waitFor(); await page.keyboard.press('Tab');
  expect(await button('Հունվար').evaluate(el => document.activeElement === el)).toBe(true);
  await page.keyboard.press('Escape'); await page.keyboard.press('Space'); await popup.waitFor();
  await page.getByRole('heading', { level: 1 }).click(); expect(await popup.isVisible()).toBe(false);
  await trigger.hover(); await popup.waitFor(); await page.mouse.move(0, 0); expect(await popup.isVisible()).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.each([375, 768, 1024, 1189, 1190, 1440])('resizing retains the existing adaptive breakpoints at viewport %i', async width => {
  await page.setViewportSize({ width: 1440, height: 1200 }); await page.goto(url); await ready();
  await page.setViewportSize({ width, height: 1200 });
  // ResizeObserver and Vue update the joined layout after the viewport changes.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const outer = await page.locator('.filter-container').boundingBox();
  const boxes = await panel().locator('fieldset').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y }; }));
  if (outer.width >= 1100) {
    if (!(await page.locator('.report-top-panels').evaluate(el=>el.classList.contains('panels-stacked')))) expect((await panel().boundingBox()).height).toBeGreaterThanOrEqual(258);
    else expect(await panel().evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
    near(boxes[0].y, boxes[1].y); near(boxes[0].y, boxes[2].y);
  } else if ((await panel().boundingBox()).width - 2 >= 640) {
    near(boxes[0].y, boxes[1].y); near(boxes[2].y, boxes[3].y); expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  } else {
    boxes.forEach(box => near(box.x, boxes[0].x));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
  }
  await choose('quarter');
  if (outer.width < 1100) {
    const tower = await button('Թաուեր').boundingBox(); near(tower.height, 32);
    const row = await page.locator('.quarter-room-row').first().getByRole('button').count(); expect(row).toBe(3);
  }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('touch opens the month popup and keeps the mobile grid usable', async () => {
  const context = await page.context().browser().newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  try {
    const touch = await context.newPage(); await touch.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
    await touch.goto(url); await touch.getByTestId('statistics-count').waitFor();
    await touch.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true }).selectOption('month');
    await touch.getByRole('button', { name: 'Ամիսներ', exact: true }).tap();
    const popup = touch.getByRole('dialog', { name: 'Ամիսների ընտրություն' }); await popup.waitFor();
    await popup.getByRole('button', { name: 'Հունվար', exact: true }).tap();
    expect(await popup.isVisible()).toBe(true);
    expect(await popup.getByRole('button', { name: 'Հունվար', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await touch.getByRole('heading', { level: 1 }).tap(); expect(await popup.isVisible()).toBe(false);
    expect(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test.each([375, 768, 1024, 1440])('relative quick options preserve mobile button placement and wide year layout at %i', async width => {
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready(); await choose('quick');
  for (const value of ['last-12', 'all']) {
    await quick().selectOption(value);
    const tower = await button('Թաուեր').boundingBox(), hills = await button('Հիլլս').boundingBox();
    const all = await page.locator('.room-filter').getByRole('button', { name: 'Բոլորը', exact: true }).boundingBox();
    const first = await button('Սենյակների քանակ՝ 1').boundingBox();
    if (width < 1440) { near(tower.y, hills.y); near(all.y, first.y); }
    else { expect(hills.y).toBeGreaterThan(tower.y); expect(first.y).toBeGreaterThan(all.y); }
  }
});
test.each([1440,1920])('complex and room buttons align to period and amount controls at %i',async width=>{
 await page.setViewportSize({width,height:1200});await page.goto(url);await ready();
 for(const value of ['year','month','quarter','custom','quick']){
  await choose(value);
  const periodBox=await period().boundingBox(),hills=await button('Հիլլս').boundingBox();
  const first=await page.locator('.room-values button').first().boundingBox(),last=await page.locator('.room-values button').last().boundingBox();
  const amountMax=await input('amount','Մինչև').boundingBox();
  near(hills.height,periodBox.height);near(first.height,periodBox.height);
  near(last.x+last.width,amountMax.x+amountMax.width);
  near(first.x-hills.x-hills.width,hills.x-periodBox.x-periodBox.width);
 }
 await page.screenshot({path:`test-results/filter-button-alignment-${width}.png`,fullPage:true});
});
