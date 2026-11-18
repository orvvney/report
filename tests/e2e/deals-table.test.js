const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url;
const block = () => page.getByRole('region', { name: /Գործարքների ցանկ/ });
const toggle = () => block().getByRole('button', { name: /Գործարքների ցանկ/ });
async function toggleList() {
  await toggle().click();
  if (await toggle().getAttribute('aria-expanded') === 'true') {
    await page.waitForFunction(() => {
      const content = document.querySelector('#deals-list-content');
      return content?.querySelector('tbody tr') || [...(content?.querySelectorAll('[role=status]') || [])].some(el => ['Տվյալներ չկան', 'Տվյալներն անհասանելի են։'].includes(el.textContent.trim()));
    });
  }
}
const rows = () => block().getByRole('table').locator('tbody tr');
const next = () => block().getByRole('button', { name: 'Հաջորդ', exact: true });
const previous = () => block().getByRole('button', { name: 'Նախորդ', exact: true });
const ids = async () => (await rows().getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))))
  .map(href => Number(href.match(/details\/(\d+)/)[1]));
const count = () => page.getByTestId('deals-list-count');
const ready = async () => { await page.getByTestId('statistics-count').waitFor(); await page.waitForFunction(() => document.querySelector('.report-header .refresh-button')?.disabled === false); };
beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  fixture = createFixture({ items: Array.from({ length: 51 }, (_, i) => deal(i + 1, {
    ufCrmDate: '2026-11-10', contactId: i + 1, ufCrm_1776430614152: String(1001 + i),
    ufCrm_1686473759: String(i + 1), ufCrm_1776254518: `A${i + 1}`,
    opportunity: i === 50 ? '1000000.1234' : String(i + 1), ufCrmArea: i === 50 ? '65.50001' : '50',
  })), contacts: Array.from({ length: 51 }, (_, i) => ({ id: i + 1, name: `Անի${i + 1}`, lastName: 'Սարգսյան', secondName: 'Hidden' })) });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test.each([320, 1440])('deal list help explains filtered deals without expanding the list at %i', async width => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto(url); await ready();
  const help = block().getByRole('button', { name: 'Գործարքների մասին', exact: true });
  const tooltip = block().getByRole('tooltip');
  await help.hover(); await tooltip.waitFor();
  expect(await tooltip.innerText()).toBe('Այս բաժինը նախատեսված է ընտրված զտիչներին համապատասխանող բոլոր գործարքները դիտելու համար։');
  expect(await tooltip.evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  await help.click(); expect(await toggle().getAttribute('aria-expanded')).toBe('false');
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' });
  await page.keyboard.press('Enter'); await tooltip.waitFor();
  const title = block().getByRole('heading', { name: 'Գործարքների ցանկ', exact: true });
  const collapsedTip = await tooltip.boundingBox(), collapsedTitle = await title.boundingBox();
  expect(collapsedTip.y + collapsedTip.height).toBeLessThanOrEqual(collapsedTitle.y + 1);
  await toggleList();
  expect(await toggle().getAttribute('aria-expanded')).toBe('true');
  await help.hover(); await tooltip.waitFor();
  const expandedTip = await tooltip.boundingBox(), expandedTitle = await title.boundingBox();
  expect(expandedTip.y).toBeGreaterThanOrEqual(expandedTitle.y + expandedTitle.height - 1);
  await help.focus();
  await page.keyboard.press('Tab'); await tooltip.waitFor({ state: 'hidden' });
});

test('collapsed block follows charts; exact columns and deal links; 25-row pages keep their state', async () => {
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/report' && new URL(request.url()).searchParams.get('view') === 'summary') requests++; });
  await page.goto(url); await ready();
  expect(await toggle().getAttribute('aria-expanded')).toBe('false');
  expect(await count().innerText()).toBe('51');
  expect(await block().getByRole('table').count()).toBe(0);
  const histogram = await page.locator('.deals-histogram').boundingBox();
  const bounds = await block().boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(histogram.y + histogram.height);
  await toggle().focus(); await page.keyboard.press('Enter'); await rows().first().waitFor();
  expect(await rows().count()).toBe(25);
  expect(await ids()).toEqual(Array.from({ length: 25 }, (_, i) => 51 - i));
  expect(await block().getByRole('columnheader').allInnerTexts()).toEqual([
    'Հաճախորդ ↕', 'Կնքման ամսաթիվ ↓', 'Համալիր ↕', 'Մուտք ↕', 'Հարկ ↕',
    'Համար ↕', 'Սենյակ ↕', 'Մակերես (մ²) ↕', 'Արժեք (֏) ↕',
  ]);
  expect(await rows().first().getByRole('cell').allTextContents()).toEqual([
    'Անի51 Սարգսյան', '10.11.2026', 'Թաուեր', '51', '51', 'A51', '2', '65,50001', '1 000 000,1234',
  ]);
  const link = rows().first().getByRole('link');
  expect(await link.getAttribute('href')).toBe('https://portal.example/crm/deal/details/51/');
  expect(await link.getAttribute('target')).toBe('_blank');
  expect(await link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(await previous().isDisabled()).toBe(true);
  const first = await ids(); await next().click(); const second = await ids();
  expect(await second.length).toBe(25);
  await toggleList(); await toggleList();
  expect(await ids()).toEqual(second);
  await next().click(); const last = await ids();
  expect(last).toEqual([1]); expect(await next().isDisabled()).toBe(true);
  expect(new Set([...first, ...second, ...last]).size).toBe(51);
  expect(fixture.state.requests.filter(row => row.params.entityTypeId === 3)).toHaveLength(2);
  const crmRequests = fixture.state.requests.length;
  await block().getByRole('button', { name: /^Մուտք/ }).click();
  expect((await ids())[0]).toBe(1);
  expect(await previous().isDisabled()).toBe(true);
  await next().click(); await toggleList(); await toggleList();
  expect(await block().getByRole('columnheader', { name: /^Մուտք/ }).getAttribute('aria-sort')).toBe('ascending');
  expect(fixture.state.requests).toHaveLength(crmRequests);
  expect(requests).toBe(1);
  await page.reload(); await ready();
  expect(await toggle().getAttribute('aria-expanded')).toBe('false');
});

test('all headers sort in both directions with keyboard, before pagination, without network reads', async () => {
  await page.goto(url); await ready(); await toggleList();
  const requests = fixture.state.requests.length;
  const labels = ['Հաճախորդ', 'Կնքման ամսաթիվ', 'Համալիր', 'Մուտք', 'Հարկ', 'Համար', 'Սենյակ', 'Մակերես (մ²)', 'Արժեք (֏)'];
  for (const label of labels) {
    const header = block().getByRole('columnheader', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    const button = header.getByRole('button');
    await button.focus(); await page.keyboard.press('Enter');
    expect(await header.getAttribute('aria-sort')).toBe('ascending');
    expect(await previous().isDisabled()).toBe(true);
    await next().click();
    await button.focus(); await page.keyboard.press('Space');
    expect(await header.getAttribute('aria-sort')).toBe('descending');
    expect(await previous().isDisabled()).toBe(true);
    if (['Մուտք', 'Հարկ', 'Համար', 'Մակերես (մ²)', 'Արժեք (֏)'].includes(label)) expect((await ids())[0]).toBe(51);
  }
  expect(fixture.state.requests).toHaveLength(requests);
});

test('filter changes preserve expansion and sort, reset page, and update the collapsed count', async () => {
  fixture.state.items[0].ufCrmRooms = 3;
  fixture.state.items[1].ufCrmProperty = '72';
  fixture.state.items[2].ufCrmArea = null;
  await page.goto(url); await ready(); await toggleList();
  expect(await count().innerText()).toBe('49');
  await block().getByRole('button', { name: /^Մուտք/ }).click(); await next().click();
  await page.getByRole('button', { name: 'Սենյակների քանակ՝ 3', exact: true }).click();
  expect(await toggle().getAttribute('aria-expanded')).toBe('true');
  expect(await ids()).toEqual([1]);
  expect(await count().innerText()).toBe('1');
  expect(await block().getByRole('columnheader', { name: /^Մուտք/ }).getAttribute('aria-sort')).toBe('ascending');
  expect(await next().count()).toBe(0);
  await toggleList();
  await page.getByRole('button', { name: 'Վերականգնել', exact: true }).click();
  expect(await toggle().getAttribute('aria-expanded')).toBe('false');
  expect(await count().innerText()).toBe('49');
});

test('statistics groupings and histogram comparison or display modes do not change the deal list', async () => {
  await page.goto(url); await ready(); await toggleList();
  const original = await ids(), requests = fixture.state.requests.length;
  const panel = page.getByRole('region', { name: 'Վիճակագրություն', exact: true });
  await panel.getByRole('button', { name: 'Ըստ սենյակի', exact: true }).click();
  await page.getByRole('dialog', { name: 'Վիճակագրության խմբավորում' }).getByRole('button', { name: 'Համալիր', exact: true }).click();
  expect(await ids()).toEqual(original);
  const histogram = page.getByRole('region', { name: 'Գործարքների հիստոգրամ', exact: true });
  for (const label of ['Սենյակներ', 'Վաճառքի գումար', 'Բն. քանակ']) {
    await histogram.getByRole('button', { name: label, exact: true }).click();
    expect(await ids()).toEqual(original);
  }
  const compare = histogram.getByRole('checkbox', { name: 'Ցուցադրել համեմատական հիստոգրամը', exact: true });
  await compare.check(); expect(await ids()).toEqual(original);
  await compare.uncheck(); expect(await ids()).toEqual(original);
  expect(await count().innerText()).toBe('51');
  expect(fixture.state.requests).toHaveLength(requests);
});

test('empty selection, optional field fallback, failed refresh and recovery never expose stale rows', async () => {
  fixture.state.items = [deal(1, { contactId: 1, ufCrmDate: '2026-11-01' })];
  fixture.state.failContacts = true;
  await page.goto(url); await ready(); await toggleList();
  expect(await rows().first().getByRole('cell').allTextContents()).toEqual([
    'Գործարք №1', '01.11.2026', 'Թաուեր', '—', '—', '—', '2', '50', '10',
  ]);
  let release;
  fixture.state.gate = new Promise(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click();
  await block().getByRole('status').waitFor();
  expect(await count().innerText()).toBe('—');
  expect(await rows().count()).toBe(0);
  fixture.state.failPage = 0; release();
  await block().getByText('Տվյալներն անհասանելի են։', { exact: true }).waitFor();
  expect(await count().innerText()).toBe('—');
  expect(await rows().count()).toBe(0);
  fixture.state.failPage = undefined; fixture.state.items = [];
  await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click();
  await block().getByText('Տվյալներ չկան', { exact: true }).waitFor();
  expect(await count().innerText()).toBe('0');
  expect(await next().count()).toBe(0);
});

test('refresh clamps the last page to the new snapshot and updates contact names', async () => {
  await page.goto(url); await ready(); await toggleList();
  await next().click(); await next().click();
  fixture.state.items = [fixture.state.items[0]];
  fixture.state.contacts[0].name = 'Նոր';
  await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click();
  await rows().first().getByRole('link', { name: 'Նոր Սարգսյան' }).waitFor();
  expect(await count().innerText()).toBe('1'); expect(await ids()).toEqual([1]);
  expect(await next().count()).toBe(0);
});

test('wide and narrow layouts keep all columns inside a keyboard-scrollable region', async () => {
  await page.goto(url); await ready(); await toggleList();
  fs.mkdirSync('test-results', { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scroll = block().getByRole('region', { name: 'Գործարքների աղյուսակ', exact: true });
    await scroll.focus();
    expect(await scroll.evaluate(el => document.activeElement === el)).toBe(true);
    expect(await block().getByRole('columnheader').count()).toBe(9);
    expect(await page.evaluate(() => ({ width: window.innerWidth, actual: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('main > *, main section')].filter(el => el.getBoundingClientRect().right > window.innerWidth).map(el => el.className) })))
      .toEqual({ width, actual: width, overflowing: [] });
    const customer = rows().first().locator('td').first().getByRole('link');
    expect(await customer.innerText()).toBe(width === 375 ? 'Անի51\nՍարգսյան' : 'Անի51 Սարգսյան');
    const lines = await customer.locator('.customer-name > span').evaluateAll(els => els.map(el => el.getBoundingClientRect().y));
    if (width === 375) expect(lines[1]).toBeGreaterThan(lines[0]);
    else expect(lines[1]).toBe(lines[0]);
    expect(await rows().first().locator('td').nth(1).innerText()).toBe(width === 375 ? '10.11.26' : '10.11.2026');
    if (width === 375) {
      expect(await block().getByRole('columnheader', { name: /^Կնքված՝/ }).isVisible()).toBe(true);
      expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await page.keyboard.press('End');
      await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      expect(await scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    await block().screenshot({ path: `test-results/deals-table-${width}.png` });
  }
});


test.each([320, 375, 1440, 1920])('pagination buttons have equal dimensions and form a centered group at %i', async width => {
  fixture.state.items = Array.from({ length: 201 }, (_, i) => deal(i + 1, { ufCrmDate: '2026-11-10' }));
  await page.setViewportSize({ width, height: 1000 }); await page.goto(url); await ready(); await toggleList();
  const nav = block().locator('.deals-list-pagination'), previousBox = await previous().boundingBox(), nextBox = await next().boundingBox(), frame = await nav.boundingBox();
  expect(previousBox.width).toBe(nextBox.width); expect(previousBox.height).toBe(nextBox.height);
  expect(previousBox.y).toBe(nextBox.y);
  const center = (previousBox.x + nextBox.x + nextBox.width) / 2;
  expect(center).toBeCloseTo(frame.x + frame.width / 2, 0);
  expect(await nav.locator('span').innerText()).toBe('1 / 9');
  if (width >= 1100) {
    const panels = await page.locator('.report-top-panels').boundingBox();
    expect(center).toBeCloseTo(panels.x + panels.width / 2, 0);
  }
});

test('parking list follows its chart, omits entrance, rooms and area and retains paging and filters', async () => {
 fixture.state.items.forEach(item => { item.ufCrmProperty = '72'; item.ufCrmRooms = null; item.ufCrmArea = null; });
 await page.goto(`${url}/#parking`); await ready();
 expect(await toggle().getAttribute('aria-expanded')).toBe('false');
 expect(await count().innerText()).toBe('51');
 const [chartBox, listBox] = await Promise.all([page.locator('.deals-histogram').boundingBox(), block().boundingBox()]);
 expect(listBox.y).toBeGreaterThan(chartBox.y+chartBox.height);
 await toggleList();
 expect(await block().getByRole('columnheader').allInnerTexts()).toEqual([
  'Հաճախորդ ↕','Կնքման ամսաթիվ ↓','Համալիր ↕','Հարկ ↕','Համար ↕','Արժեք (֏) ↕',
 ]);
 expect(await rows().count()).toBe(25);
 expect(await rows().first().getByRole('cell').allTextContents()).toEqual([
  'Անի51 Սարգսյան','10.11.2026','Թաուեր','51','A51','1 000 000,1234',
 ]);
 const reads = fixture.state.requests.length;
 await next().click(); expect(await rows().count()).toBe(25);
 await block().getByRole('button',{name:/^Արժեք/}).click();
 expect((await ids())[0]).toBe(1);
 await toggleList();
 await page.getByLabel('Կայանատեղիի արժեք (֏)՝ Սկսած',{exact:true}).fill('50');
 expect(await count().innerText()).toBe('2');
 await toggleList(); expect(await ids()).toEqual([50,51]);
 expect(fixture.state.requests).toHaveLength(reads);
 await page.setViewportSize({width:320,height:1100});
 await page.waitForTimeout(100);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await block().screenshot({path:'test-results/parking-deals-list-320.png'});
});
