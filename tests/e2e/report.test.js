const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal, sampleItems } = require('../support/crm-fixture.cjs');
let fixture, server, url, release;
const rooms = () => page.getByRole('button', { name: 'Սենյակների քանակ', exact: true });
const months = () => page.getByRole('button', { name: 'Կնքման ամսաթիվ', exact: true });
const problems = () => page.getByRole('button', { name: /^Խնդրահարույց գործարքներ/ });
const refresh = () => page.getByRole('button', { name: /Թարմացնել/ });
const columns = () => page.locator('svg [role="img"]');
const ready = async () => { await page.locator('footer time').waitFor(); };
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
  await page.getByRole('img', { name: '2՝ 100 AMD, 1 գործարք', exact: true }).hover();
  expect(await page.getByRole('img', { name: /100 AMD, 1 գործարք/ }).getByTestId('bar-amount').textContent()).toBe('100 ֏');
  expect(await page.getByRole('img', { name: /100 AMD, 1 գործարք/ }).getByTestId('bar-count').textContent()).toBe('1 գործարք');
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
  await page.getByRole('img', { name: 'Հունվար՝ 100 AMD, 1 գործարք', exact: true }).hover();
  expect(await page.getByRole('img', { name: /100 AMD, 1 գործարք/ }).getByTestId('bar-amount').textContent()).toBe('100 ֏');
  expect(fixture.state.reads).toBe(1);
  fixture.state.items[1].ufCrmProperty = '72';
  await reloadReport();
  expect(await months().getAttribute('aria-pressed')).toBe('true');
  expect(await problems().innerText()).toMatch(/1/);
  await rooms().click();
  expect(await page.getByRole('img', { name: '2՝ 100 AMD, 1 գործարք', exact: true }).count()).toBe(1);
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
  const second = page.getByRole('img', { name: '2՝ 35 AMD, 2 գործարք', exact: true });
  expect(await second.getByTestId('bar-amount').textContent()).toBe('35 ֏');
  expect(await second.getByTestId('bar-count').textContent()).toBe('2 գործարք');
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await page.getByText('2026', { exact: true }).count()).toBe(0);
  expect(await page.getByRole('img', { name: 'Հունվար՝ 10 AMD, 1 գործարք', exact: true }).count()).toBe(1);
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
test('refresh replaces totals, closes list, preserves mode and recalculates year', async () => {
  await page.goto(url); await ready(); await months().click();
  await columns().first().focus(); expect(await page.getByRole('tooltip').count()).toBe(0);
  fixture.state.items = [deal(1, { opportunity: '77.125', ufCrmDate: '2027-01-01' })];
  fixture.state.time = '2026-12-31T20:00:00Z';
  await reloadReport();
  expect(await months().getAttribute('aria-pressed')).toBe('true');
  expect(await page.getByRole('tooltip').count()).toBe(0); expect(await problems().count()).toBe(0);
  expect(await page.getByText('2027', { exact: true }).count()).toBe(0);
  expect(await page.getByRole('img', { name: 'Հունվար՝ 77.125 AMD, 1 գործարք', exact: true }).count()).toBe(1);
  expect(fixture.state.reads).toBe(2);
});
test('loading hides old data and disables refresh, last-page failure is not partial success, then recovery and empty result', async () => {
  const heading = page.getByRole('heading', { name: 'Կնքված բնակարանների հաշվետվություն', level: 1, exact: true });
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await page.goto(url);
  await page.getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await heading.isVisible()).toBe(true);
  expect(await refresh().isDisabled()).toBe(true); expect(await columns().count()).toBe(0);
  release(); fixture.state.gate = null; await ready();
  fixture.state.items = Array.from({ length: 51 }, (_, i) => deal(i + 1)); fixture.state.failPage = 50;
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await refresh().click(); await page.getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await heading.isVisible()).toBe(true);
  expect(await refresh().isDisabled()).toBe(true); expect(await columns().count()).toBe(0); expect(await problems().count()).toBe(0);
  release(); fixture.state.gate = null;
  await page.getByRole('alert').waitFor();
  expect(await heading.isVisible()).toBe(true);
  expect(await page.getByRole('alert').innerText()).toBe('Չհաջողվեց բեռնել տվյալները։ Փորձեք կրկին։');
  expect(await columns().count()).toBe(0); expect(await refresh().isDisabled()).toBe(false);
  fixture.state.failPage = undefined; await reloadReport();
  expect(await heading.isVisible()).toBe(true);
  expect(await page.getByRole('img', { name: '2՝ 510 AMD, 51 գործարք', exact: true }).count()).toBe(1);
  fixture.state.items = []; await reloadReport();
  expect(await heading.isVisible()).toBe(true);
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
test('full amounts and counts are always visible in both modes, including zero categories, without tooltip', async () => {
  fixture.state.items = [deal(1, { opportunity: 0.1 }), deal(2, { opportunity: 0.2 }), deal(3, { ufCrmRooms: 6, opportunity: '1234567890.123456', ufCrmDate: '2026-02-01' })];
  await page.goto(url); await ready();
  for (const mode of [rooms(), months()]) {
    await mode.click();
    const small = page.getByRole('img', { name: /0.3 AMD, 2 գործարք/ });
    const large = page.getByRole('img', { name: /1\s234\s567\s890\.123456 AMD, 1 գործարք/ });
    expect(await small.getByTestId('bar-amount').textContent()).toBe('0.3 ֏');
    expect(await small.getByTestId('bar-count').textContent()).toBe('2 գործարք');
    expect(await large.getByTestId('bar-amount').textContent()).toBe('1 234 567 890.123456 ֏');
    expect(await large.getByTestId('bar-count').textContent()).toBe('1 գործարք');
    const zero = page.getByRole('img', { name: /՝ 0 AMD, 0 գործարք/ }).first();
    expect(await zero.getByTestId('bar-amount').textContent()).toBe('0 ֏');
    expect(await zero.getByTestId('bar-count').textContent()).toBe('0 գործարք');
    await small.focus(); await small.press('Enter'); await small.press('Space'); await small.press('Escape');
    await large.hover(); await large.click();
    expect(await page.getByRole('tooltip').count()).toBe(0);
    expect(await small.getByTestId('bar-amount').isVisible()).toBe(true);
    expect(await page.locator('svg').textContent()).toContain('մլրդ');
  }
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
  expect(before.y).toBeGreaterThan(narrowGroup.y + narrowGroup.height);
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

const filterPanel = () => page.getByRole('form', { name: 'Զտիչներ', exact: true });
const filterArea = () => page.getByLabel('Զտիչների տարածք', { exact: true });
const filterGeometry = () => filterPanel().locator('fieldset').evaluateAll((elements) => elements.map((element) => {
  const box = element.getBoundingClientRect();
  const text = document.createRange(); text.selectNodeContents(element.querySelector('legend'));
  const title = text.getBoundingClientRect();
  return { x: box.x, y: box.y, height: box.height, width: box.width, right: box.right, titleCenter: title.x + title.width / 2 };
}));
const expectEqualPixels = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1); // Browser subpixel rounding.

test.each([1440, 1024, 375, 320])('filter layout reflows without scrolling or clipping at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  expect(await filterPanel().locator('legend').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize)))
    .toEqual(['12px', '12px', '12px', '12px']);
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/filters-layout-${width}.png`, fullPage: true, animations: 'disabled' });
  let previousRoomWidth = 0;
  for (const count of [4, 6, 12]) {
    fixture.state.items = [deal(1, { ufCrmRooms: count })]; await reloadReport();
    const boxes = await filterGeometry();
    const panel = await filterPanel().boundingBox();
    const leftInset = boxes[0].x - panel.x;
    const panelBorder = await filterPanel().evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth));
    expectEqualPixels(leftInset - panelBorder, 24);
    expectEqualPixels(panel.x + panel.width - boxes.at(-1).right, leftInset);
    boxes.forEach((box) => expectEqualPixels(box.titleCenter, box.x + box.width / 2));
    boxes.slice(1).forEach((box) => expectEqualPixels(box.width, boxes[1].width));
    const rows = [...new Set(boxes.map((box) => box.y))];
    expect(rows).toHaveLength(width === 1440 ? 1 : width === 1024 ? 2 : 4);
    if (width === 1440) {
      const gaps = boxes.slice(1).map((box, i) => box.x - boxes[i].right);
      gaps.forEach((gap) => expectEqualPixels(gap, 16));
      expect(boxes[0].width).toBeGreaterThan(previousRoomWidth); previousRoomWidth = boxes[0].width;
    }
    for (let i = 1; i < rows.length; i++) {
      const previousBottom = Math.max(...boxes.filter((box) => box.y === rows[i - 1]).map((box) => box.y + box.height));
      expectEqualPixels(rows[i] - previousBottom, 16);
    }
    const buttons = await filterPanel().getByRole('button').evaluateAll((els) => els.map((el) => {
      const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, fits: el.scrollWidth <= el.clientWidth };
    }));
    expect(buttons).toHaveLength(count);
    buttons.forEach((box) => { expect(box.width).toBe(40); expect(box.height).toBe(box.width); expect(box.fits).toBe(true); });
    if (count === 12) expect(new Set(buttons.map((box) => box.y)).size).toBeGreaterThan(1);
    const inputBoxes = await filterPanel().locator('input').evaluateAll((els) => els.map((el) => {
      const box = el.getBoundingClientRect(); return { height: box.height, y: box.y };
    }));
    inputBoxes.forEach((box) => expectEqualPixels(box.height, buttons[0].height));
    if (width === 1440) inputBoxes.forEach((box) => expectEqualPixels(box.y, buttons[0].y));
    const controlsFit = await filterPanel().locator('input, button, legend').evaluateAll((elements) => elements.every((el) => {
      const box = el.getBoundingClientRect(), parent = el.closest('fieldset').getBoundingClientRect();
      return box.x >= parent.x - 1 && box.right <= parent.right + 1 && box.top >= parent.top && box.bottom <= parent.bottom + 1;
    }));
    expect(controlsFit).toBe(true);
    await room(count).click(); expect(await room(count).getAttribute('aria-pressed')).toBe('false');
    expectEqualPixels((await filterGeometry())[0].width, boxes[0].width);
    await room(count).press('Space'); expect(await room(count).getAttribute('aria-pressed')).toBe('true');
    expect(await filterArea().evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
    await filterArea().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    expect(await filterArea().evaluate((el) => el.scrollLeft)).toBe(0);
    const graphScroll = page.getByLabel('Գծապատկերի տարածք', { exact: true });
    await graphScroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    expect(await filterArea().evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/filters-layout-${width}-${count}.png`, fullPage: true, animations: 'disabled' });
  }
  fixture.state.items = []; await reloadReport();
  expect(await filterPanel().getByRole('button').count()).toBe(0);
  expect((await filterGeometry())[0].width).toBeGreaterThan(0);
  expect(await filterPanel().locator('legend').first().isVisible()).toBe(true);
  for (const resizeWidth of [375, 1024, 1440]) {
    await page.setViewportSize({ width: resizeWidth, height: 1000 }); await baseFilters();
    expect(await filterArea().evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test.each([1440, 375])('filter hints stay inside empty controls and preserve partial native dates at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  expect(await filterPanel().locator('label').count()).toBe(0);
  // getComputedStyle(input, '::-webkit-datetime-edit') returns host styles in
  // Chromium. Read the actual native shadow element through DevTools instead.
  const native = await page.context().newCDPSession(page);
  await native.send('DOM.enable'); await native.send('CSS.enable');
  const nativeDateOpacity = async (side) => {
    const { root } = await native.send('DOM.getDocument', { depth: -1, pierce: true });
    const find = (node, predicate) => {
      if (predicate(node)) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const result = find(child, predicate); if (result) return result;
      }
    };
    const attr = (node, key) => {
      const i = node.attributes?.indexOf(key); return i >= 0 ? node.attributes[i + 1] : undefined;
    };
    const control = find(root, (node) => attr(node, 'id') === `date-${side}`);
    const editor = find(control, (node) => attr(node, 'pseudo') === '-webkit-datetime-edit');
    const { computedStyle } = await native.send('CSS.getComputedStyleForNode', { nodeId: editor.nodeId });
    return computedStyle.find(({ name }) => name === 'opacity').value;
  };
  const assertHint = async (kind, side, shown) => {
    const control = input(kind, side);
    if (kind !== 'date') {
      expect(await control.getAttribute('placeholder')).toBe(side === 'min' ? 'Սկսած' : 'Մինչև');
      expect(await control.evaluate((el) => el.matches(':placeholder-shown'))).toBe(shown);
      return;
    }
    const hint = control.locator('..').locator('[aria-hidden="true"]');
    expect(await hint.count()).toBe(shown ? 1 : 0);
    expect(await nativeDateOpacity(side)).toBe(shown ? '0' : '1');
    if (shown) {
      expect(await hint.innerText()).toBe(side === 'min' ? 'Սկսած' : 'Մինչև');
      const outer = await control.boundingBox(), inner = await hint.boundingBox();
      expect(inner.x).toBeGreaterThan(outer.x); expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThan(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
      expect(await hint.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    }
  };
  for (const [kind, values] of [['amount', ['200.2', '400.4']], ['area', ['50', '80']], ['date', ['2026-01-01', '2026-12-31']]]) {
    for (const [i, side] of ['min', 'max'].entries()) {
      await input(kind, side).focus(); await assertHint(kind, side, true);
      await input(kind, side).fill(values[i]); await assertHint(kind, side, false);
      await input(kind, side).fill(''); await assertHint(kind, side, true);
    }
    await input(kind, 'min').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/filters-hints-${width}-${kind}-empty.png`, fullPage: true, animations: 'disabled' });
    await input(kind, 'min').fill(values[0]); await input(kind, 'max').fill(values[1]);
    await page.screenshot({ path: `test-results/filters-hints-${width}-${kind}-filled.png`, fullPage: true, animations: 'disabled' });
  }
  await clearRanges();
  // Typing into a blank native date must reveal the actual edited segments.
  await input('date', 'min').focus(); await input('date', 'min').press('1');
  expect(await input('date', 'min').evaluate((el) => el.validity.badInput)).toBe(true);
  await assertHint('date', 'min', false);
  await input('date', 'min').fill('2026-01-01');
  const applied = await labels();
  await input('date', 'min').focus(); await input('date', 'min').press('ArrowRight'); await input('date', 'min').press('Backspace');
  expect(await input('date', 'min').evaluate((el) => el.validity.badInput)).toBe(true);
  expect(await input('date', 'min').getAttribute('aria-invalid')).toBe('true');
  await assertHint('date', 'min', false); expect(await labels()).toEqual(applied);
  await input('date', 'max').focus(); await assertHint('date', 'min', false);
  await page.screenshot({ path: `test-results/filters-hints-${width}-date-partial.png`, fullPage: true, animations: 'disabled' });
  await input('date', 'min').fill(''); await assertHint('date', 'min', true);
  expect(await page.getByRole('alert').count()).toBe(0);
  const before = (await filterGeometry()).map(({ x, width, titleCenter }) => ({ x, width, titleCenter }));
  await input('amount', 'min').fill('200'); await input('amount', 'max').fill('100');
  // Compare in content coordinates: focus can scroll the panel on narrow screens.
  const after = await filterGeometry();
  for (let i = 0; i < before.length; i++) {
    expectEqualPixels(after[i].width, before[i].width);
    expectEqualPixels(after[i].x - after[0].x, before[i].x - before[0].x);
    expectEqualPixels(after[i].titleCenter - after[i].x, before[i].titleCenter - before[i].x);
  }
  const errorId = await input('amount', 'max').getAttribute('aria-describedby');
  expect(await page.locator(`#${errorId}`).isVisible()).toBe(true);
  await input('amount', 'max').fill('400'); await clearRanges();
  expect(await page.getByRole('alert').count()).toBe(0);
  await native.detach();
});

test('room buttons retain their size and distinguish selected and unselected colors', async () => {
  await baseFilters();
  const appearance = () => room(1).evaluate((el) => {
    const style = getComputedStyle(el), box = el.getBoundingClientRect();
    return { background: style.backgroundColor, border: style.borderTopColor, color: style.color,
      fontSize: style.fontSize, width: box.width, height: box.height };
  });
  expect(await appearance()).toEqual({ background: 'rgb(102, 133, 235)', border: 'rgb(102, 133, 235)', color: 'rgb(255, 255, 255)', fontSize: '13px', width: 40, height: 40 });
  await room(1).click();
  expect(await appearance()).toEqual({ background: 'rgb(255, 255, 255)', border: 'rgb(203, 213, 225)', color: 'rgb(24, 37, 61)', fontSize: '13px', width: 40, height: 40 });
  await room(1).press('Space'); expect(await room(1).getAttribute('aria-pressed')).toBe('true');
  await room(2).click(); await room(3).click(); await room(1).click();
  expect(await room(1).getAttribute('aria-pressed')).toBe('true');
});

test.each([1440, 375])('filter units stay at the right inside empty and filled numeric controls at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  expect(await filterPanel().locator('legend').allTextContents()).toEqual([
    'Սենյակների քանակ', 'Ընդհանուր արժեք', 'Մակերես', 'Կնքման ամսաթիվ',
  ]);
  for (const [kind, unit] of [['amount', '֏'], ['area', '(մ²)']]) {
    for (const side of ['min', 'max']) {
      const control = input(kind, side);
      const suffix = control.locator('..').getByText(unit, { exact: true });
      for (const value of ['', '200.2', '12345678901234567890.12', 'abc', '']) {
        await control.fill(value);
        expect(await control.inputValue()).toBe(value);
        expect(await suffix.isVisible()).toBe(true);
        const box = await control.boundingBox(), suffixBox = await suffix.boundingBox();
        expect(suffixBox.x).toBeGreaterThan(box.x);
        expectEqualPixels(box.x + box.width - suffixBox.x - suffixBox.width, 8);
        expectEqualPixels(suffixBox.y + suffixBox.height / 2, box.y + box.height / 2);
        const padding = await control.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
        expect(box.x + box.width - padding).toBeLessThan(suffixBox.x);
        expect(await suffix.getAttribute('aria-hidden')).toBe('true');
        expect(await suffix.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
      }
      await rooms().focus(); await control.scrollIntoViewIfNeeded();
      const suffixBox = await suffix.boundingBox();
      await page.mouse.click(suffixBox.x + suffixBox.width / 2, suffixBox.y + suffixBox.height / 2);
      expect(await control.evaluate((el) => el === document.activeElement)).toBe(true);
    }
    await controlPairScreenshot(kind, width, 'empty');
    await input(kind, 'min').fill('50'); await input(kind, 'max').fill('200.2');
    await controlPairScreenshot(kind, width, 'filled');
    await input(kind, 'min').fill(''); await input(kind, 'max').fill('');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function controlPairScreenshot(kind, width, state) {
  await filterPanel().locator('fieldset').filter({ has: input(kind, 'min') })
    .evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'center' }));
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/filters-units-${width}-${kind}-${state}.png`, fullPage: true, animations: 'disabled' });
}

test('filter inputs focus without an extra outline and keep their normal or error border', async () => {
  await baseFilters();
  for (const kind of ['amount', 'area', 'date']) {
    for (const side of ['min', 'max']) {
      const control = input(kind, side);
      await control.click();
      expect(await control.evaluate((el) => el === document.activeElement)).toBe(true);
      expect(await control.evaluate((el) => {
        const style = getComputedStyle(el);
        return { outline: style.outlineStyle, border: style.borderTopWidth, color: style.borderTopColor, height: el.getBoundingClientRect().height };
      })).toEqual({ outline: 'none', border: '1px', color: 'rgb(203, 213, 225)', height: 40 });
    }
  }
  await input('amount', 'min').fill('200'); await input('amount', 'max').fill('100');
  expect(await input('amount', 'max').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(185, 28, 28)');
  expect(await input('amount', 'max').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await room(1).focus(); await page.keyboard.press('Tab');
  expect(await room(2).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
});

test('filters intersect instantly, keep global problems, preserve mode and never fetch again', async () => {
  let requests = 0; page.on('request', (request) => { if (request.url().endsWith('/api/report')) requests++; });
  await baseFilters();
  expect(await labels()).toEqual(['1՝ 100.1 AMD, 1 գործարք', '2՝ 600.6 AMD, 2 գործարք', '3՝ 300.3 AMD, 1 գործարք']);
  await columns().first().hover(); expect(await page.getByRole('tooltip').count()).toBe(0);
  await room(1).click(); expect(await page.getByRole('tooltip').count()).toBe(0);
  await room(3).click(); await room(2).click(); expect(await room(2).getAttribute('aria-pressed')).toBe('true');
  for (const [kind, min, max] of [['amount', '150', '350'], ['area', '60', '70'], ['date', '2026-01-01', '2026-12-31']]) {
    await input(kind, 'min').fill(min); await input(kind, 'max').fill(max);
  }
  expect(await labels()).toEqual(['2՝ 200.2 AMD, 1 գործարք']);
  expect(await input('date', 'max').evaluate((el) => el === document.activeElement)).toBe(true);
  await months().click(); expect(await columns().count()).toBe(12);
  expect(await columns().nth(5).getAttribute('aria-label')).toBe('Հունիս՝ 200.2 AMD, 1 գործարք');
  expect(await page.getByText('2026 · Սկսած 2026-01-01 · Մինչև 2026-12-31', { exact: true }).count()).toBe(0);
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
  expect(await page.getByTestId('total-count').innerText()).toBe('Գործարքների քանակ՝ 0');
  expect((await page.getByTestId('y-tick').allTextContents()).map((t) => t.trim())).toEqual(['0', '0,25', '0,5', '0,75', '1']);
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

test.each([1440, 375])('filters precede grouping without a reset button or panel scroll and retain keyboard access at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  const panel = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const panelScroll = page.getByLabel('Զտիչների տարածք', { exact: true });
  const graphScroll = page.getByLabel('Գծապատկերի տարածք', { exact: true });
  const panelBox = await panel.boundingBox();
  const groupBox = await page.getByRole('group', { name: 'Խմբավորում' }).boundingBox();
  expect(panelBox.y + panelBox.height).toBeLessThan(groupBox.y);
  expect(await page.getByRole('button', { name: 'Զտիչները վերակայել', exact: true }).count()).toBe(0);
  const boxes = await panel.locator('fieldset').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
  expect(new Set(boxes.map((b) => b.y)).size).toBe(width === 375 ? 4 : 1);
  expect(boxes.map((b) => b.x)).toEqual(boxes.map((b) => b.x).sort((a, b) => a - b));
  expect(await panelScroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  const refreshBox = await refresh().boundingBox();
  await panelScroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  expect(await graphScroll.evaluate((el) => el.scrollLeft)).toBe(0);
  const panelPosition = await panelScroll.evaluate((el) => el.scrollLeft);
  expect(panelPosition).toBe(0);
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
  expect(await input('amount', 'max').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
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
  for (let i = 0; i < 5 && !(await rooms().evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  expect(await rooms().evaluate((el) => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await months().evaluate((el) => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await refresh().evaluate((el) => el === document.activeElement)).toBe(true);
});

const timestamp = () => page.locator('footer time');
const total = () => page.getByTestId('total-count');
const ticks = () => page.getByTestId('y-tick').allTextContents();
const xTitle = () => page.locator('footer').getByText(/· Գործարքների քանակ · X$/);

test('filtered total and rounded scale follow the active chart without changing the successful update time', async () => {
  await page.clock.setFixedTime(new Date('2026-10-23T10:05:09Z'));
  await baseFilters();
  expect(await total().innerText()).toBe('Գործարքների քանակ՝ 4');
  expect(await timestamp().innerText()).toBe('23.10.2026 14:05:09');
  expect((await ticks()).map((t) => t.trim())).toEqual(['0', '175', '350', '525', '700']);
  await page.clock.setFixedTime(new Date('2026-10-23T11:00:00Z'));
  await months().click();
  expect(await total().innerText()).toBe('Գործարքների քանակ՝ 3');
  await input('amount', 'min').fill('150'); await input('amount', 'max').fill('350');
  expect(await total().innerText()).toBe('Գործարքների քանակ՝ 1');
  expect((await ticks()).at(-1).trim()).toBe('300');
  await rooms().click(); expect(await total().innerText()).toBe('Գործարքների քանակ՝ 2');
  expect((await ticks()).at(-1).trim()).toBe('400');
  expect(await timestamp().innerText()).toBe('23.10.2026 14:05:09');
  expect(fixture.state.reads).toBe(1);
  await clearRanges(); expect(await total().innerText()).toBe('Գործարքների քանակ՝ 4');
  await refresh().focus(); await refresh().press('Enter'); await ready();
  expect(await timestamp().innerText()).toBe('23.10.2026 15:00:00');
  expect(fixture.state.reads).toBe(2);
});

test('loading and failure hide footer, retry and successful empty response set fresh time and zero totals', async () => {
  await page.clock.setFixedTime(new Date('2026-10-23T10:05:09Z'));
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await page.goto(url); await page.getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await refresh().isDisabled()).toBe(true); expect(await timestamp().count()).toBe(0);
  release(); fixture.state.gate = null; await ready();
  fixture.state.failPage = 0;
  await refresh().click(); await page.getByRole('alert').waitFor();
  expect(await timestamp().count()).toBe(0); expect(await total().count()).toBe(0);
  expect(await xTitle().count()).toBe(0); expect(await refresh().isEnabled()).toBe(true);
  fixture.state.failPage = undefined; fixture.state.items = [];
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await reloadReport();
  expect(await timestamp().innerText()).toBe('23.10.2026 16:00:00');
  expect(await total().innerText()).toBe('Գործարքների քանակ՝ 0');
  expect(await columns().count()).toBe(0);
  await months().click();
  expect(await columns().count()).toBe(12);
  expect((await ticks()).map((t) => t.trim())).toEqual(['0', '0,25', '0,5', '0,75', '1']);
  expect(await page.getByTestId('bar-amount').allTextContents()).toEqual(Array(12).fill('0 ֏'));
  expect(await page.getByTestId('bar-count').allTextContents()).toEqual(Array(12).fill('0 գործարք'));
});

test.each([1440, 375])('new chart layout and long full labels remain readable at %i px in both modes', async (viewportWidth) => {
  fixture.state.items = [
    deal(1, { ufCrmRooms: 1, opportunity: '1234567890.123456', ufCrmDate: '2026-09-01' }),
    deal(2, { ufCrmRooms: 2, opportunity: '8000000000', ufCrmDate: '2026-10-01' }),
    deal(3, { ufCrmRooms: 3, opportunity: '7654321098.654321', ufCrmDate: '2026-11-01' }),
    deal(4, { ufCrmDate: null }),
  ];
  await page.setViewportSize({ width: viewportWidth, height: 1100 });
  await page.goto(url); await ready();
  for (const [mode, axis] of [[rooms(), 'Սենյակների քանակ'], [months(), 'Կնքման ամսաթիվ']]) {
    await mode.click();
    expect(await mode.getAttribute('aria-pressed')).toBe('true');
    expect(await mode.evaluate((el) => el.classList.contains('bg-white'))).toBe(true);
    expect(await xTitle().innerText()).toBe(`${axis} · Գործարքների քանակ · X`);
    expect(await page.getByText('Արժույթ՝ AMD', { exact: true }).count()).toBe(0);
    expect(await page.getByText('Ամբողջ ժամանակահատվածը', { exact: true }).count()).toBe(0);
    expect(await page.locator('svg').getByText(axis, { exact: true }).count()).toBe(0);
    expect((await ticks()).map((t) => t.trim())).toEqual(['0', '2 մլրդ', '4 մլրդ', '6 մլրդ', '8 մլրդ']);
    const section = await page.getByRole('region', { name: 'Գործարքների հաշվետվություն' }).boundingBox();
    const group = await page.getByRole('group', { name: 'Խմբավորում' }).boundingBox();
    const display = await page.getByText('Ցուցադրություն', { exact: true }).boundingBox();
    const y = await page.getByRole('heading', { name: 'Y · Ընդհանուր արժեք (֏)', exact: true }).boundingBox();
    const button = await refresh().boundingBox();
    expect(Math.abs(button.width - button.height)).toBeLessThan(1);
    expect(await refresh().innerText()).toBe('↻');
    expect(button.x).toBeGreaterThan(y.x + y.width);
    expect(button.y).toBeGreaterThan(group.y + group.height);
    expect(y.y).toBeGreaterThanOrEqual(button.y);
    expect(y.y + y.height).toBeLessThanOrEqual(button.y + button.height);
    expect(display.y + display.height).toBeLessThan(group.y);
    for (const b of [group, display]) expect(Math.abs(b.x + b.width / 2 - section.x - section.width / 2)).toBeLessThan(2);
    const info = await total().boundingBox(); const x = await xTitle().boundingBox(); const problem = await problems().boundingBox();
    const timeBox = await timestamp().boundingBox();
    expect(Math.abs(timeBox.y - info.y)).toBeLessThan(1);
    expect(info.x).toBeGreaterThan(timeBox.x + timeBox.width);
    expect(await timestamp().locator('..').innerText()).toMatch(/Թարմացվել է՝ .+ · Գործարքների քանակ՝ 3/);
    if (viewportWidth === 375) expect(x.y).toBeGreaterThanOrEqual(info.y + info.height);
    else expect(x.x).toBeGreaterThan(info.x + info.width);
    expect(problem.y).toBeGreaterThanOrEqual(x.y + x.height);
    expect(Math.abs(problem.x + problem.width - x.x - x.width)).toBeLessThan(2);
    // Inspect actual rendered text geometry, not estimates used by the implementation.
    const geometry = await page.locator('svg').evaluate((svg) => {
      const boxes = (selector) => [...svg.querySelectorAll(selector)].map((el) => {
        const b = el.getBBox(); return { x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height };
      });
      return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
        amounts: boxes('[data-testid="bar-amount"]'), names: boxes('[role="img"] text:nth-of-type(2)'), counts: boxes('[data-testid="bar-count"]'), bars: boxes('[role="img"] rect') };
    });
    for (const row of [geometry.amounts, geometry.names, geometry.counts]) {
      for (const [i, box] of row.entries()) {
        expect(box.x).toBeGreaterThanOrEqual(100); expect(box.right).toBeLessThanOrEqual(geometry.width);
        expect(box.y).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(geometry.height);
        if (i) expect(box.x).toBeGreaterThan(row[i - 1].right);
      }
    }
    geometry.amounts.forEach((amount, i) => expect(amount.bottom).toBeLessThan(geometry.bars[i].y));
    geometry.names.forEach((name, i) => expect(name.bottom).toBeLessThan(geometry.counts[i].y));
    const barStyles = await columns().locator('rect').evaluateAll((elements) => elements.map((el) => ({
      width: el.getBoundingClientRect().width, color: getComputedStyle(el).fill,
    })));
    for (const bar of barStyles) {
      expect(bar.width).toBeCloseTo(56, 1);
      expect(bar.color).toBe('rgb(102, 133, 235)');
    }
    expect(await page.getByTestId('bar-amount').evaluateAll((elements) => elements.every((el) => getComputedStyle(el).fill === 'rgb(102, 133, 235)'))).toBe(true);
    expect(await page.getByTestId('bar-count').allTextContents()).toEqual(axis === 'Սենյակների քանակ'
      ? Array(3).fill('1 գործարք') : [...Array(8).fill('0 գործարք'), ...Array(3).fill('1 գործարք'), '0 գործարք']);
    const grid = await page.getByTestId('y-tick').locator('line').evaluateAll((elements) => elements.map((el) => ({
      x: el.x1.baseVal.value, endX: el.x2.baseVal.value, y: el.y1.baseVal.value, endY: el.y2.baseVal.value, dash: getComputedStyle(el).strokeDasharray,
    })));
    expect(grid[0].dash).toBe('none');
    expect(grid.slice(1).every((line) => line.dash === '4px, 4px')).toBe(true);
    expect(grid[0].endX).toBe(geometry.width - 20);
    expect(grid.every((line) => line.endX === grid[0].endX && line.y === line.endY)).toBe(true);
    const axisLine = await page.getByTestId('y-axis').evaluate((el) => ({
      x1: el.x1.baseVal.value, x2: el.x2.baseVal.value, y1: el.y1.baseVal.value, y2: el.y2.baseVal.value,
    }));
    expect(axisLine).toEqual({ x1: grid[0].x, x2: grid[4].x, y1: grid[0].y, y2: grid[4].y });
    const scroll = page.getByLabel('Գծապատկերի տարածք');
    const footerBefore = await xTitle().boundingBox();
    await scroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    expect(await refresh().boundingBox()).toEqual(button);
    expect(await xTitle().boundingBox()).toEqual(footerBefore);
    const last = await columns().last().getByTestId('bar-amount').boundingBox(); const scrollBox = await scroll.boundingBox();
    expect(last.x).toBeGreaterThanOrEqual(scrollBox.x); expect(last.x + last.width).toBeLessThanOrEqual(scrollBox.x + scrollBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: `test-results/chart-${axis === 'Սենյակների քանակ' ? 'rooms' : 'months'}-${viewportWidth}-end.png`, fullPage: true, animations: 'disabled' });
    await scroll.evaluate((el) => { el.scrollLeft = 0; });
    await page.screenshot({ path: `test-results/chart-${axis === 'Սենյակների քանակ' ? 'rooms' : 'months'}-${viewportWidth}.png`, fullPage: true, animations: 'disabled' });
  }
  await input('date', 'min').fill('2026-01-01');
  expect(await page.getByText('2026', { exact: true }).count()).toBe(0);
  expect(await page.getByText(/Սկսած 2026-01-01/).count()).toBe(0);
  await problems().click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  fixture.state.items.pop(); await reloadReport();
  expect(await problems().count()).toBe(0); expect(await xTitle().isVisible()).toBe(true);
});
