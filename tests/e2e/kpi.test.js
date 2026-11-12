const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url, release, errors;
const titles = { count: 'Կնքված բնակարանների քանակ', amount: 'Վաճառքի ընդհանուր արժեք' };
const card = metric => page.getByRole('region', { name: titles[metric], exact: true });
const value = metric => card(metric).getByTestId('kpi-value');
const delta = metric => card(metric).getByTestId('kpi-change');
const button = name => page.getByRole('button', { name, exact: true });
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
};
const selectYear = async value => { await year().selectOption(value); };

const input = (kind, side) => page.getByLabel(`${{ amount: 'Բնակարանի արժեք (֏)', area: 'Մակերես (մ²)', date: 'Կնքման ժամանակահատված' }[kind]}՝ ${side === 'min' ? 'Սկսած' : 'Մինչև'}`, { exact: true });
const ready = () => page.getByTestId('statistics-count').waitFor();
const open = async () => { await page.goto(url); await ready(); };
const refresh = async () => { await button('Թարմացնել հաշվետվությունը').click(); await ready(); };
const expectValue = async (metric, expected) => expect(await value(metric).innerText()).toBe(expected);
const rows = metric => card(metric).getByRole('listitem');
const types = (metric, name) => card(metric).getByRole('button', { name, exact: true });
const dates = () => page.getByTestId('kpi-dates').getByText(/^Համեմատություն՝/);
const monthNames = ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'];
async function selectUnits(kind, selectedYear, wanted) {
  await selectPeriod(kind); await selectYear(String(selectedYear)); await openMonths();
  const group = page.getByRole('group', { name: kind === 'month' ? 'Ամիսներ' : 'Եռամսյակներ', exact: true });
  const labels = kind === 'month' ? monthNames : ['I', 'II', 'III', 'IV'];
  for (const n of wanted) {
    const item = group.getByRole('button', { name: labels[n - 1], exact: true });
    if (await item.getAttribute('aria-pressed') !== 'true') await item.click();
  }
  for (let n = 1; n <= labels.length; n++) {
    const item = group.getByRole('button', { name: labels[n - 1], exact: true });
    if (!wanted.includes(n) && await item.getAttribute('aria-pressed') === 'true') await item.click();
  }
}
function history() {
  return [2024, 2025, 2026].flatMap(y => Array.from({ length: 12 }, (_, i) =>
    deal((y - 2024) * 12 + i + 1, { ufCrmDate: `${y}-${String(i + 1).padStart(2, '0')}-10`, opportunity: String((i + 1) * (y === 2024 ? 1 : 10)) })));
}
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

test('both KPIs apply every filter to current, baseline and ranking without new requests', async () => {
  for (const date of ['2026-11-10', '2026-10-10']) for (const extra of [
    { ufCrmComplex: '82' }, { ufCrmRooms: 3 }, { ufCrmArea: '99' }, { opportunity: '1000' },
    { ufCrmArea: null }, { ufCrmProperty: '72' },
  ]) fixture.state.items.push(deal(fixture.state.items.length + 1, { ufCrmDate: date, opportunity: '100', ...extra }));
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await open(); await selectPeriod('month');
  await button('Հիլլս').click(); await button('Սենյակների քանակ՝ 2').click();
  await input('area', 'min').fill('50'); await input('area', 'max').fill('50');
  await input('amount', 'min').fill('100'); await input('amount', 'max').fill('200');
  await expectValue('count', '2'); await expectValue('amount', '300 ֏');
  expect(await delta('count').innerText()).toBe('+1\n+100%'); expect(await delta('amount').innerText()).toBe('+150 ֏\n+100%');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.10.2026 – 15.10.2026');
  await input('amount', 'max').fill('100'); await expectValue('count', '1'); expect(await delta('count').innerText()).toBe('+1\n—');
  await input('amount', 'max').fill('200'); await input('area', 'min').fill('51'); await input('area', 'max').fill('60'); await expectValue('count', '0');
  await input('area', 'min').fill('50'); await input('area', 'max').fill('50');
  await selectPeriod('all'); await expectValue('count', '3'); await expectValue('amount', '450 ֏');
  expect(await rows('count').first().innerText()).toMatch(/Նոյեմբեր 2026[\s\S]*2$/);
  await button('Վերականգնել').click(); expect(await period().inputValue()).toBe('year');
  expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
});

test('consecutive and nonconsecutive month and quarter selections show their distinct baselines', async () => {
  fixture.state.items = history(); await open();
  await selectUnits('month', 2025, [3, 4, 5]); await expectValue('amount', '120 ֏');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.12.2024 – 28.02.2025');
  expect(await delta('amount').innerText()).toBe('+78 ֏\n+185,7%');
  await selectUnits('month', 2025, [3, 5]); await expectValue('amount', '80 ֏');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.03.2024 – 31.03.2024; 01.05.2024 – 31.05.2024');
  expect(await delta('amount').innerText()).toBe('+72 ֏\n+900%');
  await selectUnits('quarter', 2025, [2, 3]); await expectValue('amount', '390 ֏');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.10.2024 – 31.03.2025');
  await selectUnits('quarter', 2025, [1, 3]); await expectValue('amount', '300 ֏');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.01.2024 – 31.03.2024; 01.07.2024 – 30.09.2024');
  await selectPeriod('year'); await selectYear('2025'); await expectValue('amount', '780 ֏');
  expect(await page.getByTestId('statistics-count').innerText()).toBe('12');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.01.2024 – 31.12.2024');
});

test('partial month, quarter, year, consecutive block and separated units show matching portions', async () => {
  fixture.state.items = history(); await open();
  for (const [kind, units, expected] of [
    ['month', [11], '01.10.2026 – 15.10.2026'], ['quarter', [4], '01.07.2026 – 15.08.2026'],
    ['month', [10, 11], '01.08.2026 – 15.09.2026'], ['quarter', [2, 3, 4], '01.07.2025 – 15.02.2026'],
    ['month', [9, 11], '01.09.2025 – 30.09.2025; 01.11.2025 – 15.11.2025'],
  ]) { await selectUnits(kind, 2026, units); expect(await dates().innerText()).toBe(`Համեմատություն՝ ${expected}`); }
  await selectPeriod('year'); expect(await dates().innerText()).toBe('Համեմատություն՝ 01.01.2025 – 15.11.2025');
});

test('custom boundaries retain valid results on errors, support open and future intervals', async () => {
  fixture.state.items = [deal(1, { ufCrmDate: '2025-02-28', opportunity: '50' }),
    deal(2, { ufCrmDate: '2025-03-09', opportunity: '50' }), deal(3, { ufCrmDate: '2025-03-10', opportunity: '100' }),
    deal(4, { ufCrmDate: '2025-03-19', opportunity: '200' }), deal(5, { ufCrmDate: '2025-03-20', opportunity: '1000' }),
    deal(6, { ufCrmDate: '2027-01-01', opportunity: '9007199254740993.01' })];
  await open(); await selectPeriod('custom');
  expect(await card('count').getByText('Համեմատության համար նշեք երկու ամսաթվերը։').isVisible()).toBe(true);
  await input('date', 'min').fill('2025-03-10'); await input('date', 'max').fill('2025-03-19');
  await expectValue('count', '2'); await expectValue('amount', '300 ֏');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 28.02.2025 – 09.03.2025');
  expect(await delta('amount').innerText()).toBe('+200 ֏\n+200%');
  await input('date', 'min').fill('2025-03-20'); await expectValue('amount', '300 ֏');
  expect(await input('date', 'min').getAttribute('aria-invalid')).toBe('true');
  await input('date', 'min').fill(''); await expectValue('count', '4'); expect(await delta('count').count()).toBe(0);
  await input('date', 'max').fill(''); await expectValue('count', '6');
  await input('date', 'min').fill('2027-01-01'); await input('date', 'max').fill('2027-01-01');
  await expectValue('amount', '9 007 199,25 մլրդ ֏'); expect(await delta('count').innerText()).toBe('+1\n—');
});

test('rankings sort each metric independently and retain zero periods, equal ranks and partial markers', async () => {
  await page.clock.setFixedTime(new Date('2026-05-15T10:00:00Z')); fixture.state.time = '2026-05-15T10:00:00Z';
  fixture.state.items = [];
  for (const [date, n, amount] of [['2025-01-10', 10, '10'], ['2025-02-10', 8, '100'], ['2025-03-10', 8, '10'], ['2026-03-10', 2, '1000']]) {
    for (let i = 0; i < n; i++) fixture.state.items.push(deal(fixture.state.items.length + 1, { ufCrmDate: date, opportunity: amount }));
  }
  await open(); await selectPeriod('all'); await expectValue('count', '28'); await expectValue('amount', '2,98 հազ. ֏');
  expect(await rows('count').evaluateAll(els => els.slice(0, 4).map(el => el.value))).toEqual([1, 2, 2, 4]);
  expect(await rows('count').nth(1).innerText()).toContain('Մարտ 2025');
  expect(await rows('count').nth(2).innerText()).toContain('Փետրվար 2025');
  expect(await rows('amount').first().innerText()).toContain('Մարտ 2026');
  expect(await rows('count').nth(4).innerText()).toContain('Ընթացիկ՝ ոչ ամբողջական');
  await types('count', 'Ցույց տալ բոլորը').click(); expect(await rows('count').count()).toBe(17);
  await types('amount', 'Տարիներ').click(); expect(await rows('amount').first().innerText()).toMatch(/2026[\s\S]*2 հազ. ֏$/);
  expect(await types('amount', 'Ցույց տալ բոլորը').count()).toBe(0);
  await types('count', 'Եռամսյակներ').click(); expect(await rows('count').first().innerText()).toMatch(/I եռամսյակ 2025[\s\S]*26$/);
  await button('Թաուեր').click(); await expectValue('count', '0');
  await types('count', 'Ամիսներ').click(); await types('count', 'Ցույց տալ բոլորը').click();
  expect(await rows('count').count()).toBe(17); expect(await rows('count').evaluateAll(els => els.every(el => el.value === 1))).toBe(true);
});

test('independent ranking memory, expansion, reset never request new data', async () => {
  fixture.state.items = history(); let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await open(); await selectPeriod('all');
  expect(await rows('count').count()).toBe(5); expect(await rows('amount').count()).toBe(5);
  await types('count', 'Ցույց տալ բոլորը').click(); expect(await rows('count').count()).toBe(35); expect(await rows('amount').count()).toBe(5);
  expect(await types('count', 'Թաքցնել').getAttribute('aria-expanded')).toBe('true');
  await types('count', 'Եռամսյակներ').click(); expect(await rows('count').count()).toBe(5);
  expect(await types('amount', 'Ամիսներ').getAttribute('aria-pressed')).toBe('true');
  await types('amount', 'Տարիներ').click(); expect(await rows('amount').count()).toBe(3);
  await types('count', 'Ցույց տալ բոլորը').click(); await input('area', 'min').fill('1'); expect(await rows('count').count()).toBe(5);
  await selectPeriod('last-12'); expect(await card('count').getByRole('group', { name: /վարկանիշի ժամանակահատված/ }).count()).toBe(0);
  await types('count', 'Ցույց տալ բոլորը').click(); expect(await rows('count').count()).toBe(12);
  await selectPeriod('all'); expect(await types('count', 'Եռամսյակներ').getAttribute('aria-pressed')).toBe('true');
  expect(await types('amount', 'Տարիներ').getAttribute('aria-pressed')).toBe('true'); expect(await rows('count').count()).toBe(5);
  await button('Վերականգնել').click(); await selectPeriod('all');
  expect(await types('count', 'Ամիսներ').getAttribute('aria-pressed')).toBe('true'); expect(await types('amount', 'Ամիսներ').getAttribute('aria-pressed')).toBe('true');
  expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
  await types('count', 'Տարիներ').click(); await refresh(); expect(await types('count', 'Տարիներ').getAttribute('aria-pressed')).toBe('true');
  await page.reload(); await ready(); await selectPeriod('all');
  expect(await types('count', 'Ամիսներ').getAttribute('aria-pressed')).toBe('true');
});

test('loading, failed refresh and recovery hide stale figures while preserving ranking types', async () => {
  fixture.state.gate = new Promise(resolve => { release = resolve; });
  await page.goto(url); await card('count').getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await card('count').getAttribute('aria-busy')).toBe('true'); expect(await value('count').count()).toBe(0);
  release(); fixture.state.gate = null; await ready();
  await selectPeriod('all'); await types('amount', 'Տարիներ').click();
  fixture.state.gate = new Promise(resolve => { release = resolve; }); fixture.state.failPage = 0;
  await button('Թարմացնել հաշվետվությունը').click(); await card('amount').getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await value('amount').count()).toBe(0); expect(await card('amount').getByRole('button').count()).toBe(0);
  release(); fixture.state.gate = null;
  await card('amount').getByText('Տվյալներն անհասանելի են։').waitFor();
  expect(await value('amount').count()).toBe(0); expect(await rows('amount').count()).toBe(0);
  fixture.state.failPage = undefined; await refresh();
  expect(await types('amount', 'Տարիներ').getAttribute('aria-pressed')).toBe('true'); await expectValue('amount', '460 ֏');
});

test.each(['empty', 'problem', 'future'])('%s history has explicit zero and empty ranking states', async kind => {
  fixture.state.items = kind === 'empty' ? [] : [deal(1, { ufCrmDate: kind === 'future' ? '2027-01-01' : '2025-01-01', ...(kind === 'problem' ? { ufCrmArea: null } : {}) })];
  await open(); await expectValue('count', '0'); expect(await delta('count').innerText()).toBe('0\n0%');
  await selectPeriod('all'); await card('count').getByText('Տվյալներ չկան', { exact: true }).first().waitFor();
  expect(await rows('count').count()).toBe(0); expect(await types('count', 'Տարիներ').isEnabled()).toBe(true);
  await selectPeriod('last-12'); expect(await rows('count').count()).toBe(5);
  await types('count', 'Ցույց տալ բոլորը').click(); expect(await rows('count').count()).toBe(12);
  expect(await rows('count').evaluateAll(els => els.every(el => el.value === 1))).toBe(true);
});

test('zero current value against a nonzero baseline shows a decrease rather than missing data', async () => {
  fixture.state.items = [deal(1, { ufCrmDate: '2026-10-15', opportunity: '1.2' })];
  await open(); await selectPeriod('month'); await expectValue('amount', '0 ֏');
  expect(await delta('amount').innerText()).toBe('-1,2 ֏\n-100%');
  expect(await card('amount').getByTestId('kpi-percentage').evaluate(el => getComputedStyle(el).color)).toBe('rgb(154, 63, 53)');
});

test.each([1440, 768, 375])('cards and long values fit at %i px; rankings work with the keyboard', async width => {
  fixture.state.items = history(); fixture.state.items.push(deal(100, { ufCrmDate: '2026-11-15', opportunity: '9007199254740993.01' }));
  await page.setViewportSize({ width, height: 1100 }); await open();
  const count = await card('count').boundingBox(), amount = await card('amount').boundingBox();
  const filter = await page.getByRole('form', { name: 'Զտիչներ' }).boundingBox();
  expect(count.y).toBeGreaterThanOrEqual(filter.y + filter.height);
  if (width >= 768) { expect(count.y).toBe(amount.y); expect(Math.abs(count.width - amount.width)).toBeLessThan(1); }
  else expect(amount.y).toBeGreaterThanOrEqual(count.y + count.height);
  const container = await page.getByTestId('kpi-container').boundingBox();
  const parent = await page.getByTestId('kpi-container').evaluate(el => el.parentElement.getBoundingClientRect().width - 2);
  expect(container.width).toBeCloseTo(width, 0);
  expect(Math.abs(container.x + container.width / 2 - width / 2)).toBeLessThan(2);
  expect(await page.getByTestId('kpi-axes').count()).toBe(2);
  const chartGeometry = await Promise.all(['count', 'amount'].map(metric => card(metric).evaluate(el => {
    const svg = el.querySelector('.kpi-chart svg');
    const axis = svg.querySelector('[data-testid="kpi-axes"] path');
    const xTicks = [...svg.querySelectorAll('[data-testid="kpi-x-tick"] text')].map(node => {
      const box = node.getBoundingClientRect(); return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, text: node.textContent };
    });
    const yTicks = [...svg.querySelectorAll('[data-testid="kpi-y-tick"] text')].map(node => {
      const box = node.getBoundingClientRect(); return { x: box.x, right: box.right, text: node.textContent };
    });
    const bounds = svg.getBoundingClientRect();
    const viewport = el.querySelector('.kpi-chart-scroll').getBoundingClientRect();
    const path = axis.getAttribute('d').match(/M([\d.]+) ([\d.]+)V([\d.]+)H([\d.]+)/);
    const ratio = bounds.width / svg.viewBox.baseVal.width;
    const left = Number(path[1]) * ratio, right = bounds.width - Number(path[4]) * ratio;
    const number = el.querySelector('[data-testid="kpi-value"]');
    const change = el.querySelector('[data-testid="kpi-change"]');
    const absolute = change?.firstElementChild?.getBoundingClientRect();
    const percentage = change?.lastElementChild?.getBoundingClientRect();
    const group = change?.getBoundingClientRect();
    return { box: { x: bounds.x, y: bounds.y, width: viewport.width }, left, right,
      top: bounds.y + Number(path[2]) * ratio, bottom: bounds.y + Number(path[3]) * ratio,
      xTicks, yTicks, font: parseFloat(getComputedStyle(number).fontSize),
      gap: percentage && absolute && Math.abs((percentage.y + percentage.height / 2) - (absolute.y + absolute.height / 2)) < 5 ? percentage.x - absolute.right : null,
      wrappedLeft: percentage && absolute && percentage.y > absolute.y + absolute.height / 2 ? percentage.x - group.x : null,
      percentageText: change?.lastElementChild?.textContent,
      percentageRight: percentage?.right, contentRight: el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight),
      arrow: !!change?.querySelector('.kpi-percentage svg') };
  })));
  const expectedFont = width >= 1124 ? 22 : Math.max(22, Math.min(width * .03, 28));
  for (const geometry of chartGeometry) {
    expect(geometry.font).toBeCloseTo(expectedFont, 1);
    if (width < 1124) expect(Math.abs(geometry.left - geometry.right)).toBeLessThan(1);
    else expect(geometry.right).toBeCloseTo(geometry.left, 0);
    expect(geometry.xTicks.length).toBe(width >= 1124 ? 12 : width < 1024 ? 3 : 5);
    for (let i = 1; i < geometry.xTicks.length; i++)
      expect(geometry.xTicks[i].x).toBeGreaterThanOrEqual(geometry.xTicks[i - 1].right - 1);
    for (const tick of geometry.yTicks) expect(tick.x).toBeGreaterThanOrEqual(geometry.box.x - 1);
    // A fitted count range 1..2 has exactly two integer ticks.
    expect(geometry.yTicks.length).toBeGreaterThanOrEqual(width >= 1124 ? 2 : 3);
    expect(geometry.gap === null || Math.abs(geometry.gap - 16) < 1).toBe(true);
    if (geometry.wrappedLeft !== null) expect(geometry.wrappedLeft).toBeCloseTo(0, 0);
    expect(geometry.percentageRight).toBeLessThanOrEqual(geometry.contentRight + 1);
    expect(geometry.arrow).toBe(true);
    expect(geometry.percentageText).not.toContain('(');
  }
  if (width >= 768) {
    expect(Math.abs(chartGeometry[0].top - chartGeometry[1].top)).toBeLessThan(1);
    expect(Math.abs(chartGeometry[0].bottom - chartGeometry[1].bottom)).toBeLessThan(1);
    expect(Math.abs(chartGeometry[0].box.width - chartGeometry[1].box.width)).toBeLessThan(1);
  }
  expect(await page.getByTestId('kpi-dates').count()).toBe(width >= 1124 ? 0 : 1);
  expect(await card('count').getByText(/^Ընտրված՝/).count()).toBe(width >= 1124 ? 1 : 0);
  const separator = await card('amount').evaluate(el => {
    const style = getComputedStyle(el, '::before');
    return { top: style.top, bottom: style.bottom, left: style.left, right: style.right, width: style.width, height: style.height };
  });
  if (width >= 768) expect(separator).toMatchObject({ top: width >= 1124 ? '16px' : '24px', bottom: width >= 1124 ? '16px' : '24px', width: '1px' });
  else expect(separator).toMatchObject({ left: '24px', right: '24px', height: '1px' });
  for (const [metric, icon] of [['count', 'building'], ['amount', 'wallet']]) {
    const image = card(metric).locator('img');
    expect(await image.getAttribute('src')).toContain(icon);
    expect(await image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    const box = await image.boundingBox(), region = await card(metric).boundingBox();
    expect(box.x + box.width).toBeCloseTo(region.x + region.width - (width >= 1124 ? 16 : 24), 0);
  }
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const metric of ['count', 'amount']) expect(await value(metric).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  };
  await fits(); fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/kpi-comparison-${width}.png`, fullPage: true, animations: 'disabled' });
  await page.getByTestId('kpi-container').screenshot({ path: `test-results/kpi-container-${width}.png`, animations: 'disabled' });
  if (width < 1124) {
  await openDetails('amount');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await details().screenshot({ path: `test-results/kpi-details-${width}.png`, animations: 'disabled' });
  await closeDetails();
  }
  await selectPeriod('all'); await types('count', 'Եռամսյակներ').focus(); await page.keyboard.press('Enter');
  expect(await types('count', 'Եռամսյակներ').getAttribute('aria-pressed')).toBe('true');
  const expand = types('count', 'Ցույց տալ բոլորը'); await expand.focus(); await page.keyboard.press('Enter');
  const collapse = types('count', 'Թաքցնել'); expect(await collapse.getAttribute('aria-expanded')).toBe('true');
  expect(await collapse.getAttribute('aria-controls')).toBe(await card('count').getByRole('list').getAttribute('id'));
  expect(await collapse.evaluate(el => document.activeElement === el)).toBe(true);
  expect(await rows('count').count()).toBe(12); expect(await rows('amount').count()).toBe(5);
  await fits(); await page.screenshot({ path: `test-results/kpi-ranking-${width}.png`, fullPage: true, animations: 'disabled' });
  await page.getByTestId('kpi-container').screenshot({ path: `test-results/kpi-ranking-container-${width}.png`, animations: 'disabled' });
  await page.keyboard.press('Space'); expect(await rows('count').count()).toBe(5);
});

const details = () => page.getByRole('dialog', { name: /^Կնքված բնակարանների քանակ$|^Վաճառքի ընդհանուր արժեք$/ });
const detailLinks = () => details().getByRole('link', { name: 'Բացել գործարքը', exact: true });
async function openDetails(metric) { await value(metric).click(); await details().waitFor(); }
async function closeDetails() { await details().getByRole('button', { name: 'Փակել', exact: true }).click(); await details().waitFor({ state: 'hidden' }); }

test('both halves open the filtered current and baseline deals without navigation or requests', async () => {
  for (const date of ['2026-11-10', '2026-10-10']) for (const extra of [
    { ufCrmComplex: '82' }, { ufCrmRooms: 3 }, { ufCrmArea: '99' }, { opportunity: '1000' },
    { ufCrmArea: null }, { ufCrmProperty: '72' },
  ]) fixture.state.items.push(deal(fixture.state.items.length + 1, { ufCrmDate: date, opportunity: '100', ...extra }));
  let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/report') requests++; });
  await open(); await selectPeriod('month');
  await button('Հիլլս').click(); await button('Սենյակների քանակ՝ 2').click();
  await input('area', 'min').fill('50'); await input('area', 'max').fill('50');
  await input('amount', 'min').fill('100'); await input('amount', 'max').fill('200');
  await input('amount', 'min').fill('201'); // invalid draft must retain the last applied value
  for (const metric of ['count', 'amount']) {
    await card(metric).getByRole('heading').click(); await details().waitFor();
    expect(await detailLinks().evaluateAll(links => links.map(a => a.getAttribute('href')))).toEqual([
      'https://portal.example/crm/deal/details/3/', 'https://portal.example/crm/deal/details/2/',
    ]);
    expect(await details().innerText()).toContain('Կնքված բնակարաններ՝ 2');
    expect(await details().innerText()).toContain('Վաճառքի ընդհանուր արժեք՝ 300 ֏');
    await details().getByRole('button', { name: 'Համեմատություն', exact: true }).click();
    expect(await detailLinks().count()).toBe(1); expect(await detailLinks().first().getAttribute('href')).toContain('/4/');
    expect(await details().innerText()).toContain('Վաճառքի ընդհանուր արժեք՝ 150 ֏');
    await closeDetails();
  }
  expect(new URL(page.url()).pathname).toBe('/'); expect(await period().inputValue()).toBe('month');
  expect(await input('amount', 'min').inputValue()).toBe('201'); expect(requests).toBe(1); expect(fixture.state.reads).toBe(1);
});

test('detail table paginates, sorts identical dates by hidden ID and resets page on period change and reopen', async () => {
  fixture.state.items = Array.from({ length: 51 }, (_, i) => deal(i + 1, {
    ufCrmDate: i === 50 ? '2026-11-15' : '2026-11-10', opportunity: '100',
  }));
  fixture.state.items.push(deal(52, { ufCrmDate: '2026-10-10', opportunity: '250' }));
  await open(); await selectPeriod('month'); await openDetails('amount');
  expect(await detailLinks().count()).toBe(50);
  expect(await detailLinks().nth(0).getAttribute('href')).toContain('/51/');
  expect(await detailLinks().nth(1).getAttribute('href')).toContain('/1/');
  expect(await details().getByRole('columnheader').allTextContents()).toEqual([
    'Կնքման ամսաթիվ', 'Համալիր', 'Սենյակների քանակ', 'Մակերես (մ²)', 'Ընդհանուր արժեք', 'Գործարք',
  ]);
  expect(await details().innerText()).toContain('Վաճառքի ընդհանուր արժեք՝ 5,1 հազ. ֏');
  expect(await detailLinks().first().getAttribute('target')).toBe('_blank');
  expect(await detailLinks().first().getAttribute('rel')).toBe('noopener noreferrer');
  await details().getByRole('button', { name: 'Հաջորդ', exact: true }).click();
  expect(await detailLinks().count()).toBe(1); expect(await detailLinks().first().getAttribute('href')).toContain('/50/');
  expect(await details().getByRole('button', { name: 'Հաջորդ', exact: true }).isDisabled()).toBe(true);
  expect(await details().innerText()).toContain('Կնքված բնակարաններ՝ 51');
  await details().getByRole('button', { name: 'Համեմատություն', exact: true }).click();
  expect(await detailLinks().count()).toBe(1); expect(await detailLinks().first().getAttribute('href')).toContain('/52/');
  expect(await details().getByRole('navigation').count()).toBe(0);
  await details().getByRole('button', { name: 'Ընտրված', exact: true }).click();
  expect(await detailLinks().count()).toBe(50);
  await details().getByRole('button', { name: 'Հաջորդ', exact: true }).click();
  await closeDetails(); await openDetails('count');
  expect(await detailLinks().count()).toBe(50);
  expect(await details().getByRole('button', { name: 'Ընտրված', exact: true }).getAttribute('aria-pressed')).toBe('true');
});

test('keyboard opening, focus trap, inside clicks and all three closing methods preserve the page', async () => {
  await open();
  for (const [metric, key, closing] of [['count', 'Enter', 'escape'], ['amount', 'Space', 'button'], ['count', 'Enter', 'outside']]) {
    await value(metric).focus(); await page.keyboard.press(key); await details().waitFor();
    const close = details().getByRole('button', { name: 'Փակել', exact: true });
    expect(await close.evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await detailLinks().last().evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press('Tab'); expect(await close.evaluate(el => el === document.activeElement)).toBe(true);
    await details().getByRole('heading').click(); expect(await details().isVisible()).toBe(true);
    if (closing === 'escape') await page.keyboard.press('Escape');
    else if (closing === 'button') await close.click();
    else await page.mouse.click(2, 2);
    await details().waitFor({ state: 'hidden' });
    expect(await value(metric).evaluate(el => el === document.activeElement)).toBe(true);
    expect(await period().inputValue()).toBe('year'); expect(new URL(page.url()).pathname).toBe('/');
  }
});

test('February X labels follow its 28 selected days while the January baseline keeps 31 points', async () => {
  fixture.state.items = [deal(1, { ufCrmDate: '2025-01-31' }), deal(2, { ufCrmDate: '2025-02-28' })];
  await open(); await selectUnits('month', 2025, [2]);
  const chart = card('count');
  expect(await chart.locator('[data-testid="kpi-line-0"] + g circle').count()).toBe(28);
  expect(await chart.locator('[data-testid="kpi-line-1"] + g circle').count()).toBe(31);
  const xLabels = await chart.getByTestId('kpi-x-tick').evaluateAll(nodes => nodes.map(node => node.textContent));
  expect(xLabels.length).toBe(5);
  expect(xLabels[0]).toContain('01.02');
  expect(xLabels.at(-1)).toContain('28.02');
  expect(xLabels.every(label => label.includes('2025') && !label.includes('01.01'))).toBe(true);
  expect(await chart.getByRole('button', { name: 'Համեմատություն՝ 31.01.2025 · 1', exact: false }).count()).toBe(1);
});

test('compact amounts appear in every KPI surface, with local delta colors and keyboard chart tooltips', async () => {
  fixture.state.items = [deal(1, { ufCrmDate: '2026-11-15', opportunity: '6158173250.9' })];
  await open(); await selectPeriod('month'); await expectValue('amount', '6,16 մլրդ ֏');
  expect(await delta('amount').innerText()).toBe('+6,16 մլրդ ֏\n—');
  expect(await delta('amount').evaluate(el => getComputedStyle(el).color)).toBe('rgb(29, 40, 62)');
  expect(await card('amount').getByTestId('kpi-percentage').evaluate(el => getComputedStyle(el).color)).toBe('rgb(0, 127, 105)');
  await value('amount').hover();
  expect(await card('amount').getByRole('tooltip').count()).toBe(0);
  const point = card('amount').getByRole('button', { name: 'Ընտրված՝ 15.11.2026 · 6,16 մլրդ ֏', exact: true });
  await point.focus(); expect(await card('amount').getByRole('status').innerText()).toBe('Ընտրված՝ 15.11.2026 · 6,16 մլրդ ֏');
  await page.keyboard.press('ArrowLeft'); expect(await card('amount').getByRole('status').innerText()).toBe('Ընտրված՝ 14.11.2026 · 0 ֏');
  await point.click(); expect(await details().count()).toBe(0);
  await openDetails('amount'); expect(await details().innerText()).toContain('6,16 մլրդ ֏');
  expect(await details().getByRole('cell', { name: '6,16 մլրդ ֏', exact: true }).count()).toBe(1);
  await closeDetails(); await selectPeriod('all');
  expect(await rows('amount').first().innerText()).toContain('6,16 մլրդ ֏');
  expect(await card('amount').innerText()).not.toContain('173');
  await types('amount', 'Տարիներ').click(); expect(await details().count()).toBe(0);
});

test('last twelve months show two lines and matching detail baseline; all-time and open dates show one', async () => {
  fixture.state.items = [deal(1, { ufCrmDate: '2024-12-01', opportunity: '100' }), deal(2, { ufCrmDate: '2025-11-15', opportunity: '100' }),
    deal(3, { ufCrmDate: '2025-11-16', opportunity: '1000' }), deal(4, { ufCrmDate: '2025-12-01', opportunity: '200' }),
    deal(5, { ufCrmDate: '2026-11-15', opportunity: '200' }), deal(6, { ufCrmDate: '2026-11-16', opportunity: '1000' })];
  await open(); await selectPeriod('last-12');
  expect(await dates().innerText()).toBe('Համեմատություն՝ 01.12.2024 – 15.11.2025');
  await expectValue('amount', '400 ֏'); expect(await delta('amount').innerText()).toBe('+200 ֏\n+100%');
  expect(await card('amount').getByTestId('kpi-line-0').count()).toBe(1);
  expect(await card('amount').getByTestId('kpi-line-1').count()).toBe(1);
  expect(await rows('amount').count()).toBe(5);
  expect(await card('amount').getByRole('button', { name: 'Համեմատություն՝ 01.11.2025 – 15.11.2025 · 100 ֏', exact: true }).count()).toBe(1);
  await openDetails('amount'); await details().getByRole('button', { name: 'Համեմատություն', exact: true }).click();
  expect(await detailLinks().evaluateAll(links => links.map(a => a.getAttribute('href')))).toEqual([
    'https://portal.example/crm/deal/details/2/', 'https://portal.example/crm/deal/details/1/',
  ]); await closeDetails();
  for (const mode of ['all', 'custom']) {
    await selectPeriod(mode);
    expect(await card('amount').getByTestId('kpi-line-0').count()).toBe(1);
    expect(await card('amount').getByTestId('kpi-line-1').count()).toBe(0);
    expect(await dates().count()).toBe(0);
    await openDetails('count'); expect(await details().getByRole('button', { name: 'Համեմատություն', exact: true }).count()).toBe(0); await closeDetails();
  }
});

test('empty result opens an empty detail table and loading/error block stale details', async () => {
  fixture.state.items = []; await open(); await openDetails('count');
  expect(await details().getByRole('status').innerText()).toBe('Տվյալներ չկան');
  expect(await details().innerText()).toContain('Վաճառքի ընդհանուր արժեք՝ 0 ֏'); await closeDetails();
  fixture.state.gate = new Promise(resolve => { release = resolve; }); fixture.state.failPage = 0;
  await button('Թարմացնել հաշվետվությունը').click(); await card('count').getByText('Տվյալները բեռնվում են…').waitFor();
  await card('count').getByRole('heading').click(); expect(await details().count()).toBe(0);
  expect(await card('count').getByTestId('kpi-line-0').count()).toBe(0);
  release(); fixture.state.gate = null; await card('count').getByText('Տվյալներն անհասանելի են։').waitFor();
  await card('count').getByRole('heading').click(); expect(await details().count()).toBe(0);
  fixture.state.failPage = undefined; fixture.state.items = [deal(77, { ufCrmDate: '2026-11-15' })]; await refresh();
  await openDetails('count'); expect(await detailLinks().first().getAttribute('href')).toContain('/77/');
});

test.each([1440, 1920])('desktop frame, legends, full amount and scrolling stay stable at %i', async width => {
  await page.setViewportSize({ width, height: 1100 });
  fixture.state.items = history();
  fixture.state.items.push(deal(100, { ufCrmDate: '2026-11-15', opportunity: '6158173250.9' }));
  await open();
  const frame = page.getByTestId('kpi-container');
  const baseline = await frame.boundingBox();
  const filter = await page.getByRole('form', { name: 'Զտիչներ' }).boundingBox();
  expect(baseline.height).toBe(filter.height * 2 + 100);
  const topPanels = await page.locator('.report-top-panels').boundingBox();
  const section = await page.getByRole('region', { name: 'Գործարքների հաշվետվություն', exact: true }).boundingBox();
  const inset = topPanels.x - section.x;
  expect(baseline.x - section.x).toBeCloseTo(inset, 0);
  expect(section.x + section.width - baseline.x - baseline.width).toBeCloseTo(inset, 0);
  const shadow = await frame.evaluate(el => getComputedStyle(el).boxShadow);
  expect(shadow).toBe(await page.locator('.report-top-panels').evaluate(el => getComputedStyle(el).boxShadow));
  expect(await page.getByTestId('kpi-dates').count()).toBe(0);
  for (const metric of ['count', 'amount']) {
    await value(metric).click();
    await card(metric).getByRole('heading').click();
    expect(await details().count()).toBe(0);
    expect(await value(metric).evaluate(el => getComputedStyle(el).fontSize)).toBe('22px');
    expect(await delta(metric).evaluate(el => getComputedStyle(el).fontSize)).toBe('22px');
    const legend = card(metric).locator('.kpi-period-legend');
    expect(await legend.innerText()).toContain('Ընտրված՝ 01.01.2026 – 15.11.2026');
    expect(await legend.innerText()).toContain('Համեմատություն՝ 01.01.2025 – 15.11.2025');
    expect(await legend.evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
    const labels = await legend.locator('span').all();
    const first = await labels[0].boundingBox(), second = await labels[1].boundingBox();
    const heading = await card(metric).getByRole('heading').boundingBox();
    expect(baseline.y + baseline.height - second.y - second.height).toBeCloseTo(heading.y - baseline.y, 0);
    const arrow = await card(metric).getByTestId('kpi-percentage').locator('svg').boundingBox();
    expect(arrow.width).toBeCloseTo(20.5, 1);
    expect(arrow.height).toBeCloseTo(20.5, 1);
    const valueBox = await value(metric).boundingBox(), deltaBox = await delta(metric).boundingBox();
    expect(deltaBox.y - valueBox.y - valueBox.height).toBeCloseTo(second.y - first.y - first.height, 0);
    if (metric === 'amount') {
      const ticks = await card(metric).getByTestId('kpi-y-tick').allTextContents();
      expect(ticks.every(text => !text.includes('֏'))).toBe(true);
      expect(ticks.some(text => text.includes('մլրդ'))).toBe(true);
    }
    const svg = await card(metric).locator('.kpi-chart svg').boundingBox();
    const region = await card(metric).boundingBox();
    const icon = await card(metric).locator('img').boundingBox();
    const iconInset = region.x + region.width - icon.x - icon.width;
    const marks = await card(metric).locator('.kpi-chart circle').all();
    const boxes = await Promise.all(marks.map(mark => mark.boundingBox()));
    const visibleTop = Math.min(...boxes.map(box => box.y));
    const visibleBottom = Math.max(...boxes.map(box => box.y + box.height));
    const referenceGap = heading.y - region.y;
    expect(visibleTop - deltaBox.y - deltaBox.height).toBeCloseTo(referenceGap, 0);
    expect(first.y - visibleBottom).toBeCloseTo(referenceGap + 40, 0);
    const yLabels = await card(metric).getByTestId('kpi-y-tick').locator('text').all();
    const labelBoxes = await Promise.all(yLabels.map(label => label.boundingBox()));
    expect(Math.min(...labelBoxes.map(box => box.x)) - region.x).toBeCloseTo(iconInset, 0);
    const viewportBox = await card(metric).locator('.kpi-chart-scroll').boundingBox();
    expect(region.x + region.width - viewportBox.x - viewportBox.width).toBeCloseTo(iconInset, 0);
    expect(await card(metric).getByTestId('kpi-x-tick').locator('line').count()).toBe(0);
    const scroller = card(metric).locator('.kpi-month-scroll');
    const scrollGeometry = await scroller.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
    expect(scrollGeometry.content).toBeGreaterThan(scrollGeometry.width * 2);
    const monthTicks = card(metric).getByTestId('kpi-x-tick');
    expect(await monthTicks.allTextContents()).toEqual(Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}.26`));
    const tickX = await monthTicks.locator('text').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().x));
    const monthGeometry = await scroller.evaluate(el => {
      const svg = el.querySelector('svg'), axis = svg.querySelector('[data-testid="kpi-axes"] path');
      const axisX = Number(axis.getAttribute('d').match(/^M([\d.]+)/)[1]);
      const labels = [...svg.querySelectorAll('[data-testid="kpi-x-tick"] text')];
      const x = labels.map(label => Number(label.getAttribute('x')));
      const box = el.getBoundingClientRect();
      return { firstGap: x[0] - axisX, step: x[1] - x[0],
        expectedStep: (el.clientWidth - axisX * 2) * 3 * .7 / 10,
        labelsBottom: Math.max(...labels.map(label => label.getBoundingClientRect().bottom)),
        scrollbarTop: box.y + el.clientHeight, bottom: box.bottom };
    });
    expect(monthGeometry.firstGap).toBeCloseTo(monthGeometry.step / 2, 1);
    expect(monthGeometry.step).toBeCloseTo(monthGeometry.expectedStep, 1);
    expect(monthGeometry.labelsBottom + 10).toBeLessThanOrEqual(monthGeometry.scrollbarTop);
    expect(monthGeometry.labelsBottom + 22).toBeLessThanOrEqual(monthGeometry.bottom);
    for (let i = 2; i < tickX.length; i++) expect(tickX[i] - tickX[i - 1]).toBeCloseTo(tickX[1] - tickX[0], 0);
    const current = card(metric).getByTestId('kpi-line-0'), previous = card(metric).getByTestId('kpi-line-1');
    expect(Number(await current.getAttribute('stroke-width'))).toBeGreaterThan(Number(await previous.getAttribute('stroke-width')));
    expect(await current.getAttribute('stroke')).toBe('#00a387');
    expect(await previous.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(await current.getAttribute('stroke-dasharray')).toBeNull();
    await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const last = await monthTicks.last().boundingBox(), viewport = await scroller.boundingBox();
    expect(last.x + last.width).toBeLessThanOrEqual(viewport.x + viewport.width);
    await scroller.evaluate(el => { el.scrollLeft = 0; });
    const scrollBounds = await card(metric).getByTestId('kpi-scroll').boundingBox();
    for (const label of await card(metric).getByTestId('kpi-x-tick').locator('text').all()) {
      const bounds = await label.boundingBox();
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(scrollBounds.y + scrollBounds.height);
    }
    const axisGeometry = await card(metric).locator('.kpi-chart svg').evaluate(el => {
      const box = el.getBoundingClientRect();
      const path = el.querySelector('[data-testid="kpi-axes"] path').getAttribute('d').match(/M([\d.]+) ([\d.]+)V([\d.]+)/);
      const yLabels = [...el.querySelectorAll('[data-testid="kpi-y-tick"] text')].map(text => text.getBoundingClientRect());
      const xLabels = [...el.querySelectorAll('[data-testid="kpi-x-tick"] text')].map(text => ({ top: text.getBoundingClientRect().top, text: text.textContent }));
      return { yGaps: yLabels.map(label => box.x + Number(path[1]) - label.right), yGap: box.x + Number(path[1]) - Math.max(...yLabels.map(label => label.right)),
        xGaps: xLabels.map(label => label.top - box.y - Number(path[3])), labels: xLabels.map(label => label.text) };
    });
    expect(axisGeometry.labels.every(label => /^\d{2}\.\d{2}$/.test(label))).toBe(true);
    for (const gap of axisGeometry.yGaps) expect(gap).toBeCloseTo(7, 0);
    for (const gap of axisGeometry.xGaps) expect(gap).toBeCloseTo(axisGeometry.yGap, 0);

    expect((await legend.boundingBox()).y).toBeGreaterThanOrEqual(svg.y + svg.height);
  }
  expect(await value('amount').innerText()).toBe('6 158 173 910,90 ֏');
  await value('amount').hover();
  expect(await card('amount').getByRole('tooltip').count()).toBe(0);
  expect(await value('amount').getAttribute('aria-describedby')).toBeNull();
  await value('amount').click(); expect(await details().count()).toBe(0);
  await card('amount').getByRole('heading').click();
  await frame.screenshot({ path: `test-results/kpi-desktop-${width}.png` });
  await selectPeriod('all');
  expect(await card('count').locator('.kpi-period-legend span').count()).toBe(1);
  await types('count', 'Ցույց տալ բոլորը').click();
  await rows('count').last().scrollIntoViewIfNeeded();
  expect(await card('count').getByTestId('kpi-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const pinned = await card('count').locator('.kpi-period-legend').boundingBox();
  expect(baseline.y + baseline.height - pinned.y - pinned.height).toBeCloseTo(1, 0);
  expect(await frame.boundingBox()).toEqual(expect.objectContaining({ width: baseline.width, height: baseline.height }));
  await frame.screenshot({ path: `test-results/kpi-desktop-ranking-${width}.png` });
  await selectPeriod('custom');
  expect(await frame.boundingBox()).toEqual(expect.objectContaining({ width: baseline.width, height: baseline.height }));
});

test('desktop frame survives loading, failure, recovery and empty selection', async () => {
  await page.setViewportSize({ width: 1440, height: 1100 }); await open();
  const frame = page.getByTestId('kpi-container'); const base = await frame.boundingBox();
  fixture.state.gate = new Promise(resolve => { release = resolve; }); fixture.state.failPage = 0;
  await button('Թարմացնել հաշվետվությունը').click();
  await card('count').getByText('Տվյալները բեռնվում են…').waitFor();
  expect(await frame.boundingBox()).toEqual(expect.objectContaining({ width: base.width, height: base.height }));
  expect(await page.locator('.kpi-period-legend').count()).toBe(0);
  release(); fixture.state.gate = null;
  await card('count').getByText('Տվյալներն անհասանելի են։').waitFor();
  expect(await frame.boundingBox()).toEqual(expect.objectContaining({ width: base.width, height: base.height }));
  fixture.state.failPage = undefined; fixture.state.items = []; await refresh();
  await expectValue('count', '0');
  expect(await frame.boundingBox()).toEqual(expect.objectContaining({ width: base.width, height: base.height }));
  expect(await page.locator('.kpi-period-legend').count()).toBe(2);
});

 test('desktop data bounds preserve title-sized gaps when every daily amount is nonzero', async () => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  fixture.state.items = [100, 200, 300, 125, 175, 250].map((amount, i) => deal(i + 1, {
    ufCrmDate: `2026-11-${[13, 14, 15, 10, 11, 12][i]}`, opportunity: String(amount),
  }));
  await open(); await selectPeriod('custom');
  await input('date', 'min').fill('2026-11-13'); await input('date', 'max').fill('2026-11-15');
  await expectValue('amount', '600,00 ֏');
  const region = await card('amount').boundingBox(), heading = await card('amount').getByRole('heading').boundingBox();
  const change = await delta('amount').boundingBox();
  const selected = await card('amount').locator('.kpi-period-legend span').first().boundingBox();
  const boxes = await card('amount').locator('.kpi-chart circle').evaluateAll(nodes => nodes.map(el => {
    const box = el.getBoundingClientRect(), stroke = parseFloat(getComputedStyle(el).strokeWidth) / 2;
    return { top: box.top - stroke, bottom: box.bottom + stroke };
  }));
  const gap = heading.y - region.y;
  expect(Math.min(...boxes.map(box => box.top)) - change.y - change.height).toBeCloseTo(gap, 0);
  expect(selected.y - Math.max(...boxes.map(box => box.bottom))).toBeCloseTo(gap, 0);
 });
