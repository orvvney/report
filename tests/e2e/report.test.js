const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url, release;
const refresh = () => page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true });
const ready = async () => { await page.getByTestId('statistics-count').waitFor(); };
async function reloadReport() { await refresh().click(); await ready(); }
beforeEach(async () => {
  await page.setViewportSize({ width: 1024, height: 1100 });
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  fixture = createFixture(); server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { release?.(); release = undefined; server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

const loadingStatus = () => page.locator('.statistics-status').filter({ hasText: 'Տվյալները բեռնվում են…' });
const failedStatus = () => page.locator('.statistics-status').filter({ hasText: 'Տվյալներն անհասանելի են։' });
const emptyStatus = () => page.locator('.statistics-body').getByRole('status').filter({ hasText: 'Տվյալներ չկան' });
const expectTotals = async (count, amount) => {
  expect(await page.getByTestId('statistics-count').innerText()).toBe(String(count));
  if (amount !== undefined) expect(await page.getByTestId('statistics-amount').innerText()).toBe(`~${amount}`);
};

test('only valid apartments contribute to statistics and KPIs after refresh', async () => {
  fixture.state.items = [deal(1, { opportunity: '100' }), deal(2, { ufCrmProperty: '72', opportunity: '999' }),
    deal(3, { ufCrmDate: null }), deal(4, { ufCrmArea: null })];
  await page.goto(url); await ready(); await expectTotals(1, '100 ֏');
  expect(await page.getByTestId('histogram-kpi-value').innerText()).toBe('1');
  fixture.state.items[0].ufCrmProperty = '72'; await reloadReport(); await expectTotals(0, '0 ֏');
  expect(await emptyStatus().isVisible()).toBe(true);
  fixture.state.items = [deal(1, { ufCrmRooms: 6, opportunity: 0 })];
  await reloadReport(); await expectTotals(0, '0 ֏');
});

test('header refresh hides old data, disables during loading, recovers from last-page failure and handles empty results', async () => {
  const heading = page.getByRole('heading', { name: 'Հաշվետվություն', level: 1, exact: true });
  fixture.state.gate = new Promise(resolve => { release = resolve; });
  await page.goto(url); await loadingStatus().waitFor();
  expect(await heading.isVisible()).toBe(true);
  expect(await refresh().isDisabled()).toBe(true);
  expect(await page.getByTestId('statistics-count').count()).toBe(0);
  release(); fixture.state.gate = null; await ready();
  fixture.state.items = Array.from({ length: 51 }, (_, i) => deal(i + 1)); fixture.state.failPage = 50;
  fixture.state.gate = new Promise(resolve => { release = resolve; });
  await refresh().click(); await loadingStatus().waitFor();
  expect(await refresh().isDisabled()).toBe(true);
  expect(await page.getByTestId('statistics-count').count()).toBe(0);
  release(); fixture.state.gate = null; await failedStatus().waitFor();
  expect(await heading.isVisible()).toBe(true); expect(await refresh().isEnabled()).toBe(true);
  expect(await page.locator('.statistics-panel svg, .kpi-container svg, .deals-histogram svg').count()).toBe(0);
  fixture.state.failPage = undefined; await reloadReport(); await expectTotals(51, '510 ֏');
  fixture.state.items = []; await reloadReport(); await expectTotals(0, '0 ֏');
  expect(await emptyStatus().isVisible()).toBe(true); expect(await heading.isVisible()).toBe(true);
});

const input = (kind, side) => page.getByLabel(`${{ amount: 'Բնակարանի արժեք (֏)', area: 'Մակերես (մ²)', date: 'Կնքման ժամանակահատված' }[kind]}՝ ${side === 'min' ? 'Սկսած' : 'Մինչև'}`, { exact: true });
const room = (n) => page.getByRole('button', { name: `Սենյակների քանակ՝ ${n}`, exact: true });
const period = () => page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });
const allRoomsButton = () => page.locator('.room-filter').getByRole('button', { name: 'Բոլորը', exact: true });
const clearRanges = async () => {
  await period().selectOption('custom');
  for (const kind of ['amount', 'area', 'date']) {
    await input(kind, 'min').fill(''); await input(kind, 'max').fill('');
  }
};
const baseFilters = async () => { fixture.state.items = require('../support/crm-fixture.cjs').filterItems(); await page.goto(url); await ready(); await period().selectOption('custom'); };

const filterPanel = () => page.getByRole('form', { name: 'Զտիչներ', exact: true });
const filterArea = () => page.getByLabel('Զտիչների տարածք', { exact: true });
const filterGeometry = () => filterPanel().locator('fieldset').evaluateAll((elements) => elements.map((element) => {
  const box = element.getBoundingClientRect();
  const text = document.createRange(); text.selectNodeContents(element.querySelector('legend'));
  const title = text.getBoundingClientRect();
  return { x: box.x, y: box.y, height: box.height, width: box.width, right: box.right, titleCenter: title.x + title.width / 2 };
}));
const expectEqualPixels = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1); // Browser subpixel rounding.

test.each([1440, 1920, 1024, 375, 320])('filter layout reflows without scrolling or clipping at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  expect(await filterPanel().locator('legend').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize)))
    .toEqual(Array(5).fill('12px'));
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/filters-layout-${width}.png`, fullPage: true, animations: 'disabled' });

  for (const count of [4, 6, 12]) {
    fixture.state.items = [deal(1, { ufCrmRooms: count })]; await reloadReport();
    // Each geometry case starts from All; refresh itself preserves the previous subset.
    await allRoomsButton().click();
    const boxes = await filterGeometry();
    const panel = await filterPanel().boundingBox();
    const leftInset = boxes[0].x - panel.x;
    const panelBorder = await filterPanel().evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth));
    expectEqualPixels(leftInset - panelBorder, 24);
    expectEqualPixels(panel.x + panel.width - Math.max(...boxes.map(box => box.right)), leftInset);
    boxes.forEach((box) => expectEqualPixels(box.titleCenter, box.x + box.width / 2));
    if (width === 1440 || width === 1920) {
      boxes.slice(1, 3).forEach(box => expectEqualPixels(box.y, boxes[0].y));
      expectEqualPixels(boxes[3].width, boxes[0].width);
      const sectionWidth = await page.getByRole('region', { name: 'Գործարքների հաշվետվություն' }).evaluate(el => el.clientWidth);
      if (await page.locator('.report-top-panels').evaluate(el=>el.classList.contains('panels-stacked'))) expectEqualPixels(panel.width, (await page.locator('.report-top-panels').boundingBox()).width - 2);
      else expect(panel.width).toBeLessThan((sectionWidth - 24) * .7);
      const select = await filterPanel().locator('select').boundingBox();
      expectEqualPixels(select.x - panel.x, leftInset);
      expectEqualPixels(boxes[1].x - boxes[0].right, 16);
      expectEqualPixels(boxes[2].x - boxes[1].right, 16);
      expect(boxes[2].right).toBeLessThanOrEqual(panel.x + panel.width - leftInset + 1);
      const all = await allRoomsButton().boundingBox();
      const firstRoom = await room(1).boundingBox();
      expect(firstRoom.y).toBeGreaterThanOrEqual(all.y + all.height);
      expectEqualPixels(all.x + all.width / 2, boxes[2].x + boxes[2].width / 2);
      expectEqualPixels((await page.locator('.report-top-panels').boundingBox()).x, (await page.locator('.deals-histogram').boundingBox()).x);
    } else boxes.forEach((box) => expectEqualPixels(box.width, boxes[0].width));
    const rows = [...new Set(boxes.map((box) => box.y))];
    if (width < 1440) expect(rows).toHaveLength(width === 1024 ? 3 : 5);
    else expectEqualPixels(boxes[3].y - Math.max(...boxes.slice(0, 3).map(box => box.y + box.height)), 16);
    if (width >= 1440) {
      for (const [a, b] of [[0, 1], [1, 2]]) expectEqualPixels(boxes[b].x - boxes[a].right, 16);
      expectEqualPixels(boxes[4].x - boxes[3].right, 16);
    }
    for (let i = 1; width < 1440 && i < rows.length; i++) {
      const previousBottom = Math.max(...boxes.filter((box) => box.y === rows[i - 1]).map((box) => box.y + box.height));
      expectEqualPixels(rows[i] - previousBottom, 16);
    }
    const buttons = await filterPanel().getByRole('button', { name: /^Սենյակների քանակ՝/ }).evaluateAll((els) => els.map((el) => {
      const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, fits: el.scrollWidth <= el.clientWidth };
    }));
    expect(buttons).toHaveLength(count);
    buttons.forEach((box) => { expect(box.width).toBe(28); expect(box.height).toBe(32); expect(box.fits).toBe(true); });
    if (width >= 1440) {
      const roomWidth=(await filterPanel().locator('.room-values').boundingBox()).width;
      expect(new Set(buttons.map(box => box.y)).size).toBe(Math.ceil(count / Math.floor((roomWidth + 4) / 32)));
    }
    else if (count === 12 && width < 640) expect(new Set(buttons.map(box => box.y)).size).toBeGreaterThan(1);
    const inputBoxes = await filterPanel().locator('input:visible').evaluateAll((els) => els.map((el) => {
      const box = el.getBoundingClientRect(); return { height: box.height, y: box.y };
    }));
    inputBoxes.forEach((box) => expectEqualPixels(box.height, buttons[0].height));

    const controlsFit = await filterPanel().locator('fieldset input:visible, fieldset button, fieldset legend, fieldset select').evaluateAll((elements) => elements.every((el) => {
      const box = el.getBoundingClientRect(), parent = el.closest('fieldset').getBoundingClientRect();
      return box.x >= parent.x - 1 && box.right <= parent.right + 1 && box.top >= parent.top && box.bottom <= parent.bottom + 1;
    }));
    expect(controlsFit).toBe(true);
    await room(count).click(); expect(await room(count).getAttribute('aria-pressed')).toBe('true');
    expectEqualPixels((await filterGeometry())[2].width, boxes[2].width);
    await room(count).press('Space'); expect(await room(count).getAttribute('aria-pressed')).toBe('true');
    expect(await filterArea().evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
    await filterArea().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    expect(await filterArea().evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await filterArea().evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/filters-layout-${width}-${count}.png`, fullPage: true, animations: 'disabled' });
  }
  fixture.state.items = []; await reloadReport();
  expect(await filterPanel().getByRole('button', { name: /^Սենյակների քանակ՝/ }).count()).toBe(0);
  expect(await allRoomsButton().getAttribute('aria-pressed')).toBe('true');
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
    const { root } = await native.send('DOM.getDocument');
    const { nodeId } = await native.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#date-${side}` });
    const { node: control } = await native.send('DOM.describeNode', { nodeId, depth: -1, pierce: true });
    const find = (node, predicate) => {
      if (predicate(node)) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const result = find(child, predicate); if (result) return result;
      }
    };
    const attr = (node, key) => {
      const i = node.attributes?.indexOf(key); return i >= 0 ? node.attributes[i + 1] : undefined;
    };
    const editor = find(control, (node) => attr(node, 'pseudo') === '-webkit-datetime-edit');
    const { nodeIds } = await native.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [editor.backendNodeId] });
    const { computedStyle } = await native.send('CSS.getComputedStyleForNode', { nodeId: nodeIds[0] });
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
    await filterPanel().screenshot({ path: `test-results/filters-hints-${width}-${kind}-empty.png`, animations: 'disabled' });
    await input(kind, 'min').fill(values[0]); await input(kind, 'max').fill(values[1]);
    await filterPanel().screenshot({ path: `test-results/filters-hints-${width}-${kind}-filled.png`, animations: 'disabled' });
  }
  await clearRanges();
  // Typing into a blank native date must reveal the actual edited segments.
  await input('date', 'min').focus(); await input('date', 'min').press('1');
  expect(await input('date', 'min').evaluate((el) => el.validity.badInput)).toBe(true);
  await assertHint('date', 'min', false);
  await input('date', 'min').fill('2026-01-01');
  const applied = await page.locator('.statistics-totals').allTextContents();
  await input('date', 'min').focus(); await input('date', 'min').press('ArrowRight'); await input('date', 'min').press('Backspace');
  expect(await input('date', 'min').evaluate((el) => el.validity.badInput)).toBe(true);
  expect(await input('date', 'min').getAttribute('aria-invalid')).toBe('true');
  await assertHint('date', 'min', false); expect(await page.locator('.statistics-totals').allTextContents()).toEqual(applied);
  await input('date', 'max').focus(); await assertHint('date', 'min', false);
  await filterPanel().screenshot({ path: `test-results/filters-hints-${width}-date-partial.png`, animations: 'disabled' });
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
// Inspect only the date control shadow tree and capture the filter panel itself.
}, 60000);

test('room buttons retain their size and distinguish selected and unselected colors', async () => {
  await baseFilters();
  const appearance = () => room(1).evaluate((el) => {
    const style = getComputedStyle(el), box = el.getBoundingClientRect();
    return { background: style.backgroundColor, border: style.borderTopColor, color: style.color,
      fontSize: style.fontSize, width: box.width, height: box.height };
  });
  expect(await allRoomsButton().getAttribute('aria-pressed')).toBe('true');
  expect(await room(1).getAttribute('aria-pressed')).toBe('false');
  await room(1).click();
  expect(await appearance()).toEqual({ background: 'rgb(0, 127, 105)', border: 'rgb(0, 127, 105)', color: 'rgb(255, 255, 255)', fontSize: '12px', width: 28, height: 32 });
  await allRoomsButton().click();
  expect(await appearance()).toEqual({ background: 'rgb(255, 255, 255)', border: 'rgb(180, 201, 194)', color: 'rgb(29, 40, 62)', fontSize: '12px', width: 28, height: 32 });
  await room(1).press('Space'); expect(await room(1).getAttribute('aria-pressed')).toBe('true');
  await room(2).click(); await room(2).click(); await room(1).click();
  expect(await room(1).getAttribute('aria-pressed')).toBe('true');
});

test.each([1440, 375])('units appear only in range headings at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  expect(await filterPanel().locator('legend').allTextContents()).toEqual([
    'Կնքման ժամանակահատված', 'Համալիր', 'Սենյակների քանակ', 'Մակերես (մ²)', 'Բնակարանի արժեք (֏)',
  ]);
  for (const kind of ['amount', 'area']) {
    for (const side of ['min', 'max']) {
      const control = input(kind, side);
      for (const [value, amountText] of [['', ''], ['200.2', '200.2'], ['12345678901234567890.12', '12 345 678 901 234 567 890.12'], ['abc', 'abc'], ['', '']]) {
        await control.fill(value);
        expect(await control.inputValue()).toBe(kind === 'amount' ? amountText : value);
        expect(await control.locator('..').locator('span').count()).toBe(0);
        expect(await control.evaluate(el => parseFloat(getComputedStyle(el).paddingRight))).toBe(12);
      }
      await control.click(); expect(await control.evaluate(el => el === document.activeElement)).toBe(true);
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
      })).toEqual({ outline: 'none', border: '1px', color: 'rgb(180, 201, 194)', height: 32 });
    }
  }
  await input('amount', 'min').fill('200'); await input('amount', 'max').fill('100');
  expect(await input('amount', 'max').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(154, 63, 53)');
  expect(await input('amount', 'max').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await room(1).focus(); await page.keyboard.press('Tab');
  expect(await room(2).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
});

test('excluding five-room apartments survives batched refreshes while reusing metadata', async () => {
  fixture.state.items = Array.from({ length: 501 }, (_, i) => deal(i + 1, { ufCrmRooms: i % 5 + 1 }));
  const statuses = [], errors = [];
  page.on('response', (response) => { if (new URL(response.url()).pathname === '/api/report') statuses.push(response.status()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url); await ready();
  expect(fixture.state.httpRequests).toHaveLength(4);
  const initial = fixture.state.httpRequests.length;
  await room(1).click();
  for (const n of [2, 3, 4]) await room(n).click();
  expect(await room(5).getAttribute('aria-pressed')).toBe('false');
  await expectTotals(401);
  expect(fixture.state.httpRequests).toHaveLength(initial);
  for (let run = 1; run <= 3; run++) {
    await reloadReport();
    expect(await room(5).getAttribute('aria-pressed')).toBe('false');
    await expectTotals(401);
    expect(fixture.state.httpRequests).toHaveLength(initial + run * 2);
    expect(fixture.state.requests.filter((r) => r.method !== 'crm.item.list')).toHaveLength(3);
  }
  expect(statuses).toEqual([200, 200, 200, 200]);
  expect(errors).toEqual([]);
});

test('all five filters intersect instantly without fetching again', async () => {
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await baseFilters(); await expectTotals(4, '1 հազ. ֏');
  await room(2).click(); await room(2).click();
  expect(await room(2).getAttribute('aria-pressed')).toBe('true');
  for (const [kind, min, max] of [['amount', '150', '350'], ['area', '60', '70'], ['date', '2026-01-01', '2026-12-31']]) {
    await input(kind, 'min').fill(min); await input(kind, 'max').fill(max);
  }
  await expectTotals(1, '200,2 ֏');
  expect(await input('date', 'max').evaluate(el => el === document.activeElement)).toBe(true);
  await input('amount', 'max').fill('190'); await expectTotals(0, '0 ֏');
  expect(await emptyStatus().isVisible()).toBe(true);
  await clearRanges(); await allRoomsButton().click(); await expectTotals(4);
  expect(await input('amount', 'min').inputValue()).toBe('');
  expect(await allRoomsButton().getAttribute('aria-pressed')).toBe('true');
  expect(fixture.state.reads).toBe(1); expect(requests).toBe(1);
});

test.each([['amount', '200,2', '300.3', 2, '500,5 ֏'], ['area', '65,5', '80', 3, '900,9 ֏']])(
  '%s supports fractions, equal and open boundaries, zero and clearing', async (kind, min, max, n, amount) => {
  await baseFilters(); await input(kind, 'min').fill(min); await input(kind, 'max').fill(max); await expectTotals(n, amount);
  await input(kind, 'max').fill(min.replace(',', '.')); await expectTotals(1, '200,2 ֏');
  await input(kind, 'min').fill(''); await expectTotals(2, '300,3 ֏');
  await input(kind, 'min').fill('0'); expect(await input(kind, 'min').getAttribute('aria-invalid')).toBe('false');
  await input(kind, 'max').fill('0'); await expectTotals(0); expect(await emptyStatus().isVisible()).toBe(true);
  await input(kind, 'max').fill(''); await expectTotals(4);
  await input(kind, 'min').fill(kind === 'area' ? '80' : '300.3'); await expectTotals(2, '700,7 ֏');
  expect(fixture.state.reads).toBe(1);
});

test.each([['area', '90'], ['date', '2026-01-15']])('%s includes exact lower and upper boundaries', async (kind, boundary) => {
  fixture.state.items = [
    deal(1, { opportunity: '1', ufCrmArea: '89.9999', ufCrmDate: '2026-01-14T23:59:59+04:00' }),
    deal(2, { opportunity: '2', ufCrmArea: '90', ufCrmDate: '2026-01-15T00:00:00+04:00' }),
    deal(3, { opportunity: '4', ufCrmArea: '90.000', ufCrmDate: '2026-01-15T23:59:59+04:00' }),
    deal(4, { opportunity: '8', ufCrmArea: '90.0001', ufCrmDate: '2026-01-16T00:00:00+04:00' }),
  ];
  await page.goto(url); await ready(); await clearRanges();
  const reads = fixture.state.reads;
  await input(kind, 'min').fill(boundary); await expectTotals(3, '14 ֏');
  await input(kind, 'max').fill(boundary); await expectTotals(2, '6 ֏');
  expect(await page.getByRole('alert').count()).toBe(0);
  await input(kind, 'min').fill(''); await expectTotals(3, '7 ֏');
  await input(kind, 'max').fill(''); await expectTotals(4, '15 ֏');
  expect(fixture.state.reads).toBe(reads);
});

test('date endpoints include whole days and past years, and clearing removes bounds', async () => {
  await baseFilters();
  await input('date', 'min').fill('2026-01-01'); await input('date', 'max').fill('2026-12-31'); await expectTotals(3, '700,7 ֏');
  await input('date', 'min').fill('2025-01-01'); await input('date', 'max').fill('2025-12-31'); await expectTotals(1, '300,3 ֏');
  await input('date', 'max').fill(''); await expectTotals(4);
  await input('date', 'min').fill(''); expect(await input('date', 'min').getAttribute('min')).toBeNull();
  expect(await input('date', 'max').getAttribute('max')).toBeNull();
});

test('invalid drafts retain the last valid pair while other filters and refresh still work', async () => {
  await baseFilters();
  await input('area', 'min').fill('50'); await input('area', 'max').fill('80'); await input('area', 'min').fill('90');
  expect(await input('area', 'min').getAttribute('aria-invalid')).toBe('true');
  expect(await page.getByRole('alert').innerText()).toBe('Սկզբնական արժեքը չպետք է գերազանցի վերջնական արժեքը');
  await expectTotals(4);
  await input('amount', 'max').fill('250'); await expectTotals(2, '300,3 ֏'); await reloadReport();
  expect(await input('area', 'min').inputValue()).toBe('90'); expect(await input('area', 'min').getAttribute('aria-invalid')).toBe('true');
  await expectTotals(2, '300,3 ֏');
  await input('area', 'max').fill('100'); expect(await page.getByRole('alert').count()).toBe(0); await expectTotals(0);
  await clearRanges(); await input('amount', 'max').fill('200.2');
  for (const value of ['-1', 'abc', '65,']) {
    await input('amount', 'max').fill(value); expect(await input('amount', 'max').getAttribute('aria-invalid')).toBe('true');
    await expectTotals(2, '300,3 ֏');
  }
  await input('amount', 'max').fill('400.4'); expect(await page.getByRole('alert').count()).toBe(0);
  await input('date', 'min').fill('2026-01-01'); await input('date', 'max').fill('2025-12-31');
  expect(await input('date', 'max').getAttribute('aria-invalid')).toBe('true'); await expectTotals(3);
  await input('date', 'max').fill(''); await input('date', 'min').focus();
  await input('date', 'min').press('ArrowRight'); await input('date', 'min').press('Backspace');
  expect(await input('date', 'min').evaluate(el => el.validity.badInput)).toBe(true);
  expect(await input('date', 'min').getAttribute('aria-invalid')).toBe('true'); await expectTotals(3);
  await reloadReport(); expect(await input('date', 'min').evaluate(el => el.validity.badInput)).toBe(true); await expectTotals(3);
  await input('date', 'min').fill('2026-01-01'); await clearRanges(); expect(await page.getByRole('alert').count()).toBe(0);
  expect(await input('date', 'min').evaluate(el => el.validity.badInput)).toBe(false);
});

test('room gaps, growth/shrink/empty reconciliation and page reload', async () => {
  await baseFilters(); await room(2).click();
  fixture.state.items = [deal(1, { ufCrmRooms: 5 })]; await reloadReport();
  const selected = () => page.locator('.room-buttons button[aria-label][aria-pressed="true"]').allTextContents();
  expect(await selected()).toEqual(['2', '4', '5']);
  await room(2).click(); await room(4).click();
  fixture.state.items = [deal(1)]; await reloadReport(); expect(await selected()).toEqual([]);
  expect(await allRoomsButton().getAttribute('aria-pressed')).toBe('true');
  fixture.state.items = []; await reloadReport(); expect(await selected()).toEqual([]);
  expect(await input('area', 'min').isEnabled()).toBe(true);
  fixture.state.items = [deal(1, { ufCrmRooms: 1 }), deal(2, { ufCrmRooms: 3 })]; await reloadReport();
  expect(await selected()).toEqual([]); expect(await allRoomsButton().getAttribute('aria-pressed')).toBe('true'); await room(2).click();
  await expectTotals(0); expect(await emptyStatus().isVisible()).toBe(true);
  await input('area', 'min').fill('90'); await page.reload(); await ready();
  expect(await selected()).toEqual([]); expect(await allRoomsButton().getAttribute('aria-pressed')).toBe('true'); expect(await input('area', 'min').inputValue()).toBe('');
});

test.each([1440, 375])('filter panel shows only a centered notice on load/failure and restores saved filters at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 });
  const panel = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const notice = panel.getByRole('status');
  const noticeText = 'Հաշվետվությունների թարմացման պատճառով զտիչների կարգավորումը ժամանակավորապես անհասանելի է։';
  async function onlyNotice() {
    expect(await panel.isVisible()).toBe(true);
    expect((await panel.innerText()).trim()).toBe(noticeText);
    expect(await panel.locator('fieldset:visible, input:visible, button:visible').count()).toBe(0);
    expect(await panel.getByRole('group').count()).toBe(0);
    expect(await panel.getByRole('button').count()).toBe(0);
    expect(await panel.getByRole('alert').count()).toBe(0);
    const panelBox = await panel.boundingBox(), noticeBox = await notice.boundingBox();
    expect(Math.abs(noticeBox.x + noticeBox.width / 2 - panelBox.x - panelBox.width / 2)).toBeLessThan(1);
    expect(Math.abs(noticeBox.y + noticeBox.height / 2 - panelBox.y - panelBox.height / 2)).toBeLessThan(1);
    expect(await notice.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await page.goto(url); await notice.waitFor();
  await onlyNotice();
  release(); fixture.state.gate = null; await ready();
  await baseFilters(); await input('amount', 'min').fill('200.2'); await room(2).click();
  await input('amount', 'max').fill('100');
  expect(await panel.getByRole('alert').isVisible()).toBe(true);
  expect(await notice.count()).toBe(0);
  fixture.state.items = Array.from({ length: 51 }, (_, i) => deal(i + 1, { opportunity: '300' })); fixture.state.failPage = 50;
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  await refresh().click(); await loadingStatus().waitFor();
  await onlyNotice();
  expect(await page.getByTestId('statistics-count').count()).toBe(0);
  await page.screenshot({ path: `test-results/filters-loading-${width}.png`, fullPage: true });
  release(); fixture.state.gate = null; await failedStatus().waitFor();
  await onlyNotice();
  await page.screenshot({ path: `test-results/filters-unavailable-${width}.png`, fullPage: true });
  fixture.state.failPage = undefined; await reloadReport(); expect(await input('amount', 'min').inputValue()).toBe('200.2');
  expect(await input('amount', 'max').inputValue()).toBe('100');
  expect(await input('amount', 'min').isVisible()).toBe(true);
  expect(await panel.getByRole('alert').isVisible()).toBe(true);
  expect(await panel.getByRole('group').count()).toBe(5);
  expect(await notice.count()).toBe(0);
  await expectTotals(51, '15,3 հազ. ֏');
  for (const items of [[], [deal(1, { ufCrmProperty: '72' })], [deal(1, { ufCrmArea: null })]]) {
    fixture.state.items = items; await reloadReport(); expect(await page.locator('.room-buttons button[aria-label]').count()).toBe(0);
    expect(await input('area', 'min').isEnabled()).toBe(true);
    expect(await notice.count()).toBe(0);
    expect(await emptyStatus().isVisible()).toBe(true);
  }
});

test.each([1440, 375])('filters precede charts with reset and without panel scroll and retain keyboard access at %i px', async (width) => {
  await page.setViewportSize({ width, height: 1000 }); await baseFilters();
  const panel = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const panelScroll = page.getByLabel('Զտիչների տարածք', { exact: true });
  const panelBox = await panel.boundingBox();
  const groupBox = await page.locator('.deals-histogram').boundingBox();
  expect(panelBox.y + panelBox.height).toBeLessThan(groupBox.y);
  expect(await page.getByRole('button', { name: 'Վերականգնել', exact: true }).count()).toBe(1);
  const boxes = await panel.locator('fieldset').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
  expect(new Set(boxes.map((b) => b.y)).size).toBe(width === 375 ? 5 : 2); // wide headings share the first row
  for (const row of [...new Set(boxes.map(b => b.y))]) {
    const xs = boxes.filter(b => b.y === row).map(b => b.x); expect(xs).toEqual([...xs].sort((a, b) => a - b));
  }
  expect(await panelScroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  const refreshBox = await refresh().boundingBox();
  await panelScroll.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  const panelPosition = await panelScroll.evaluate((el) => el.scrollLeft);
  expect(panelPosition).toBe(0);
  expect(await panelScroll.evaluate((el) => el.scrollLeft)).toBe(panelPosition);
  expect(await refresh().boundingBox()).toEqual(refreshBox);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await room(1).focus(); await page.keyboard.press('Space'); expect(await room(1).getAttribute('aria-pressed')).toBe('true');
  await page.keyboard.press('Tab'); expect(await room(2).evaluate((el) => el === document.activeElement)).toBe(true);
  await room(3).focus(); await page.keyboard.press('Tab'); expect(await input('area', 'min').evaluate((el) => el === document.activeElement)).toBe(true);
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
  await input('amount', 'max').focus();
  // Statistics follows the filters and precedes the chart modes.
  const statStops = page.locator('.statistics-heading .filter-help, .statistics-trigger, .statistics-body [tabindex="0"]');
  for (let index = 0; index < await statStops.count(); index++) {
    await page.keyboard.press('Tab');
    expect(await statStops.nth(index).evaluate(el => el === document.activeElement)).toBe(true);
  }
  await page.keyboard.press('Tab');
  expect(await page.getByRole('button', { name: 'Ընդհանուր տեղեկության մասին', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.getByRole('button', { name: 'Բն. քանակ', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
  // Header actions precede the filters in keyboard order.
  await refresh().focus(); await page.keyboard.press('Tab');
  expect(await page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.getByRole('button', { name: 'Զտիչների մասին', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.getByRole('button', { name: 'Վերականգնել', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
});

test('reload and a second tab use cached data, while header refresh gets fresh deals', async () => {
  fixture.state.items = [deal(1)]; await page.goto(url); await ready(); await expectTotals(1, '10 ֏');
  const count = fixture.state.httpRequests.length;
  fixture.state.items[0].opportunity = '90';
  await page.reload(); await ready(); expect(fixture.state.httpRequests).toHaveLength(count); await expectTotals(1, '10 ֏');
  const other = await page.context().newPage();
  try {
    await other.goto(url); await other.getByTestId('statistics-count').waitFor();
    expect(await other.getByTestId('statistics-amount').innerText()).toBe('~10 ֏');
    expect(fixture.state.httpRequests).toHaveLength(count);
  } finally { await other.close(); }
  await reloadReport(); await expectTotals(1, '90 ֏');
  expect(fixture.state.requests.filter(r => r.method !== 'crm.item.list')).toHaveLength(3);
});

test('automatic retries keep loading, recover on third retry and show no data after exhaustion', async () => {
  await new Promise((resolve) => server.close(resolve));
  // Use real production retry delays for this browser scenario; virtual-time
  // unit tests check their exact boundaries without slowing the rest of e2e.
  const starts = [];
  server = createServer({ ...fixture, waitRetry: undefined, fetchImpl: async (...args) => {
    if (Object.values(JSON.parse(args[1].body).cmd || {}).some((cmd) => cmd.startsWith('crm.item.list?'))) starts.push(performance.now());
    return fixture.fetchImpl(...args);
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  fixture.state.items = [deal(1)];
  await page.goto(url); await ready();
  fixture.state.commandFailures = 3;
  starts.length = 0;
  await refresh().click();
  await loadingStatus().waitFor();
  expect(await refresh().isDisabled()).toBe(true);
  expect(await page.getByTestId('statistics-count').count()).toBe(0);
  expect(await page.getByRole('alert').count()).toBe(0);
  await ready();
  expect(starts).toHaveLength(4);
  for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1990);
  fixture.state.commandFailures = 4;
  starts.length = 0;
  await refresh().click();
  await failedStatus().waitFor();
  expect(starts).toHaveLength(4);
  expect(await page.locator('.statistics-pie svg').count()).toBe(0);
  expect(await page.getByTestId('statistics-count').count()).toBe(0);
  expect(await refresh().isEnabled()).toBe(true);
  fixture.state.items[0].opportunity = '99';
  await reloadReport();
  await expectTotals(1, '99 ֏');
});
