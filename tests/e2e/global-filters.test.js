const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url;
const period = () => page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });

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
const reset = () => page.getByRole('button', { name: 'Վերականգնել', exact: true });
const all = () => page.locator('.room-filter').getByRole('button', { name: 'Բոլորը', exact: true });
const room = n => page.getByRole('button', { name: `Սենյակների քանակ՝ ${n}`, exact: true });
const tower = () => page.getByRole('button', { name: 'Թաուեր', exact: true });
const hills = () => page.getByRole('button', { name: 'Հիլլս', exact: true });
const input = (kind, side) => page.getByLabel(`${{ amount: 'Բնակարանի արժեք (֏)', area: 'Մակերես (մ²)', date: 'Կնքման ժամանակահատված' }[kind]}՝ ${side === 'min' ? 'Սկսած' : 'Մինչև'}`, { exact: true });
const count = async value => expect(await page.getByTestId('statistics-count').innerText()).toBe(String(value));
const ready = async () => page.getByTestId('statistics-count').waitFor();
beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  fixture = createFixture({ items: [
    deal(1, { opportunity: '12000000', ufCrmArea: '60', ufCrmDate: '2026-11-10' }),
    deal(2, { opportunity: '15000000', ufCrmArea: '60', ufCrmDate: '2026-11-11', ufCrmComplex: '82' }),
    deal(3, { opportunity: '20000000', ufCrmArea: '90', ufCrmRooms: 3, ufCrmDate: '2026-10-10' }),
    deal(4, { ufCrmComplex: '83' }), deal(5, { ufCrmComplex: null }),
    deal(6, { ufCrmDate: null, ufCrmComplex: '83' }),
    deal(7, { ufCrmDate: '2025-12-01' }),
  ] });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('global defaults, all five intersecting filters, complex last selection and reset work without requests', async () => {
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await page.goto(url); await ready();
  expect(await period().inputValue()).toBe('year');
  expect(await period().locator('option').allTextContents()).toEqual([
    'Արագ ընտրություն', 'Ամիս', 'Եռամսյակ', 'Տարի', 'Կամայական միջակայք',
  ]);
  for (const button of [tower(), hills(), all()]) expect(await button.getAttribute('aria-pressed')).toBe('true');
  expect(await input('date', 'min').isVisible()).toBe(false);
  await count(3);
  await selectPeriod('month'); await count(2);
  await hills().click(); await count(1);
  await tower().click(); expect(await tower().getAttribute('aria-pressed')).toBe('true'); await count(1);
  await room(3).click(); await count(0);
  expect(await all().getAttribute('aria-pressed')).toBe('false');
  await all().click(); await count(1);
  await input('area', 'min').fill('61'); await count(0);
  await input('area', 'min').fill(''); await count(1);
  await input('amount', 'max').fill('11999999'); await count(0);
  expect(await input('amount', 'max').inputValue()).toBe('11 999 999');
  await input('amount', 'max').fill('12000000'); await count(1);
  await count(1);
  expect(await page.getByTestId('statistics-amount').innerText()).toBe('~12 մլն ֏');
  await selectPeriod('custom');
  await input('date', 'min').fill('2026-11-01'); await input('date', 'max').fill('2026-10-01');
  await input('amount', 'min').fill('13000000');
  expect(await page.getByRole('alert').count()).toBe(2);
  await reset().click(); await count(3);
  expect(await period().inputValue()).toBe('year');
  for (const button of [tower(), hills(), all()]) expect(await button.getAttribute('aria-pressed')).toBe('true');
  for (const kind of ['amount', 'area']) for (const side of ['min', 'max']) expect(await input(kind, side).inputValue()).toBe('');
  expect(await page.getByRole('alert').count()).toBe(0);
  await selectPeriod('custom');
  expect(await input('date', 'min').inputValue()).toBe(''); expect(await input('date', 'max').inputValue()).toBe('');
  await reset().click(); await reset().click(); await count(3);
  expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
});

test('every preset applies, custom values and invalid drafts survive preset switches, and monthly axis stays unchanged', async () => {
  await page.goto(url); await ready();
  for (const [value, expected] of [['month', 2], ['quarter', 3], ['year', 3], ['last-12', 4], ['all', 4]]) {
    await selectPeriod(value); await count(expected);
  }
  await selectPeriod('custom'); await count(4);
  await input('date', 'min').fill('2025-01-01');
  await input('date', 'max').fill('2025-12-31'); await count(1);
  await input('date', 'min').fill('2026-01-01'); // Invalid draft retains the applied 2025 pair.
  await count(1); expect(await page.getByRole('alert').count()).toBe(1);
  await selectPeriod('year'); await count(3);
  expect(await page.getByRole('alert').count()).toBe(0);
  expect(await input('date', 'min').isVisible()).toBe(false);
  await period().focus(); await period().press('Tab');
  expect(await page.getByRole('combobox', { name: 'Տարի', exact: true }).evaluate(el => document.activeElement === el)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await tower().evaluate(el => document.activeElement === el)).toBe(true);
  await selectPeriod('custom');
  expect(await input('date', 'min').inputValue()).toBe('2026-01-01');
  expect(await input('date', 'max').inputValue()).toBe('2025-12-31');
  expect(await page.getByRole('alert').count()).toBe(1); await count(1);
  await count(1);
  await input('date', 'min').fill('2025-01-01');
  await input('date', 'max').fill(''); await count(4);
  await input('date', 'min').fill('2026-11-10'); await input('date', 'max').fill('2026-11-10'); await count(1);
  await page.reload(); await ready(); expect(await period().inputValue()).toBe('year'); await count(3);
});

test('amount formatting supports typed digits, middle editing, deletion and exact decimal paste', async () => {
  await page.goto(url); await ready();
  const control = input('amount', 'min');
  await control.pressSequentially('12500000'); expect(await control.inputValue()).toBe('12 500 000');
  await control.evaluate(el => el.setSelectionRange(2, 2)); await control.pressSequentially('9');
  expect(await control.inputValue()).toBe('129 500 000');
  expect(await control.evaluate(el => el.selectionStart)).toBe(3);
  await control.press('Delete'); expect(await control.inputValue()).toBe('12 900 000');
  await control.evaluate(el => el.setSelectionRange(3, 3)); await control.press('Backspace');
  expect(await control.inputValue()).toBe('1 900 000');
  await control.fill('12 500 000,50'); expect(await control.inputValue()).toBe('12 500 000,50');
  await count(2);
  await control.fill('9007199254740993.01'); expect(await control.inputValue()).toBe('9 007 199 254 740 993.01'); await count(0);
  await control.fill('12,'); expect(await control.inputValue()).toBe('12,');
  expect(await control.getAttribute('aria-invalid')).toBe('true'); await count(0);
  await control.fill(''); expect(await control.inputValue()).toBe(''); await count(3);
  await control.fill('12500000'); await control.evaluate(el => el.setSelectionRange(3, 6)); await control.pressSequentially('600');
  expect(await control.inputValue()).toBe('12 600 000');
});

test.each([1440, 1920])('wide panel has two rows and retains geometry with custom dates at %i', async width => {
  await page.setViewportSize({ width, height: 1200 }); await page.goto(url); await ready();
  const panel = page.getByRole('form', { name: 'Զտիչներ' });
  const box = await panel.boundingBox();
  const sectionWidth = await page.getByRole('region', { name: 'Գործարքների հաշվետվություն' }).evaluate(el => el.clientWidth);
  expect(box.width).toBeLessThan((sectionWidth - 24) * .7);
  expect(Math.abs((await page.locator('.report-top-panels').boundingBox()).x - (await page.getByTestId('kpi-container').boundingBox()).x)).toBeLessThan(1);
  const headings = await panel.locator('legend').allTextContents();
  expect(headings).toEqual(['Կնքման ժամանակահատված', 'Համալիր', 'Սենյակների քանակ', 'Մակերես (մ²)', 'Բնակարանի արժեք (֏)']);
  for (const value of ['year', 'custom']) {
    await selectPeriod(value);
    const boxes = await panel.locator('fieldset').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, bottom: r.bottom }; }));
    for (const b of boxes.slice(1, 3)) expect(Math.abs(b.y - boxes[0].y)).toBeLessThan(1);
    expect(new Set(boxes.slice(3).map(b => b.y)).size).toBe(1);
    expect(boxes[3].y).toBeGreaterThan(Math.max(...boxes.slice(0, 3).map(b => b.bottom)));
    const selectBox = await period().boundingBox();
    const inset = selectBox.x - box.x;
    for (const gap of [boxes[1].x - boxes[0].x - boxes[0].width, boxes[2].x - boxes[1].x - boxes[1].width]) expect(Math.abs(gap - 16)).toBeLessThan(1);
    expect(boxes[2].x + boxes[2].width).toBeLessThanOrEqual(box.x + box.width - inset + 1);
    expect(Math.abs(boxes[3].width - boxes[0].width)).toBeLessThan(1);
    const title = await panel.getByRole('heading', { name: 'Զտիչներ' }).boundingBox();
    const button = await reset().boundingBox();
    expect(title.x).toBeLessThan(button.x); expect(title.y).toBeLessThan(boxes[0].y);
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: `test-results/global-filters-${width}-${value}.png`, fullPage: true, animations: 'disabled' });
  }
});

test('refresh preserves global selections and drafts, recomputes presets, and reset clears a partial native date', async () => {
  await page.goto(url); await ready();
  await selectPeriod('last-12');
  await hills().click(); await room(2).click();
  await input('area', 'min').fill('50'); await input('area', 'max').fill('40');
  fixture.state.time = '2027-01-15T10:00:00Z';
  fixture.state.items = [deal(1, { ufCrmDate: '2027-01-10' }), deal(2, { ufCrmDate: '2026-01-31' })];
  await page.clock.setFixedTime(new Date(fixture.state.time));
  await page.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true }).click(); await ready();
  expect(await period().inputValue()).toBe('quick');
  expect(await page.getByRole('combobox', { name: 'Արագ ընտրություն', exact: true }).inputValue()).toBe('last-12');
  expect(await hills().getAttribute('aria-pressed')).toBe('false');
  expect(await room(2).getAttribute('aria-pressed')).toBe('true');
  expect(await room(1).getAttribute('aria-pressed')).toBe('false');
  expect(await input('area', 'min').inputValue()).toBe('50');
  expect(await input('area', 'max').getAttribute('aria-invalid')).toBe('true');
  await count(1); // February 2026 through January 2027; January 2026 is outside.
  await selectPeriod('custom');
  await input('date', 'min').focus(); await input('date', 'min').press('1');
  expect(await input('date', 'min').evaluate(el => el.validity.badInput)).toBe(true);
  await reset().click();
  await selectPeriod('custom');
  expect(await input('date', 'min').inputValue()).toBe('');
  expect(await input('date', 'min').evaluate(el => el.validity.badInput)).toBe(false);
  expect(await page.getByRole('alert').count()).toBe(0);
  await reset().click(); await count(1);
});

test('filter icons load from bundled PNGs, controls share rounding and insets, and the period has no blue focus frame', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(url); await ready();
  const panel = page.getByRole('form', { name: 'Զտիչներ' });
  const icons = panel.locator('.filter-icon');
  expect(await icons.count()).toBe(2);
  for (const [i, name] of ['filter', 'reset'].entries()) {
    const icon = icons.nth(i);
    const source = await icon.evaluate(async el => {
      const url = getComputedStyle(el).maskImage.slice(5, -2);
      const img = new Image(); img.src = url; await img.decode();
      return { url, width: img.naturalWidth };
    });
    expect(source.url).toMatch(new RegExp(`/assets/${name}-[\\w-]+\\.png$`));
    expect(source.width).toBe(1254);
    const response = await page.request.get(source.url);
    expect(response.status()).toBe(200); expect(response.headers()['content-type']).toBe('image/png');
    const head = await page.request.head(source.url);
    expect(head.headers()['content-length']).toBe(response.headers()['content-length']);
    expect(await head.body()).toHaveLength(0);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
    expect(await icon.boundingBox()).toMatchObject(i === 0 ? { width: 15, height: 15 } : { width: 10, height: 10 });
  }
  expect(await page.request.get(`${url}/images/filter.png`).then(r => r.status())).toBe(404);
  for (const control of await panel.locator('button, select, input:visible').all()) {
    expect(await control.evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe('15px');
    expect((await control.boundingBox()).height).toBe(32);
  }
  await period().click(); await period().press('Escape');
  expect(await period().evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(await period().evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgb(180, 201, 194)');
  const inset = await period().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth));
  const selectBox = await period().boundingBox(), arrowBox = await panel.locator('.select-arrow').first().boundingBox();
  expect(Math.abs(selectBox.x + selectBox.width - arrowBox.x - arrowBox.width - inset)).toBeLessThan(1);
  const complex = panel.getByRole('group', { name: 'Համալիր', exact: true });
  const groupBox = await complex.boundingBox(), first = await tower().boundingBox(), last = await hills().boundingBox();
  for (const control of [first, last]) expect(Math.abs(control.x + control.width / 2 - (groupBox.x + groupBox.width / 2))).toBeLessThan(1);
  expect(last.y).toBeGreaterThan(first.y + first.height);
});

test('All visually clears room buttons without disabling them, including the single-room case', async () => {
  fixture.state.items = [deal(1, { ufCrmRooms: 1 }), deal(2, { ufCrmRooms: 3 })];
  await page.goto(url); await ready();
  expect(await all().getAttribute('aria-pressed')).toBe('true');
  for (const n of [1, 2, 3]) {
    expect(await room(n).getAttribute('aria-pressed')).toBe('false');
    expect(await room(n).isEnabled()).toBe(true);
    expect(await room(n).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  }
  await count(2); await room(3).click(); await count(1);
  expect(await all().getAttribute('aria-pressed')).toBe('false');
  expect(await room(3).getAttribute('aria-pressed')).toBe('true');
  await all().click(); await count(2);
  fixture.state.items = [deal(1, { ufCrmRooms: 1 })];
  await page.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true }).click(); await ready();
  await room(1).click();
  expect(await all().getAttribute('aria-pressed')).toBe('false');
  expect(await room(1).getAttribute('aria-pressed')).toBe('true');
  await room(1).click(); expect(await room(1).getAttribute('aria-pressed')).toBe('true');
  await all().click(); expect(await room(1).getAttribute('aria-pressed')).toBe('false'); await count(1);
});
