const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let server, url, fixture;
beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  fixture = createFixture({ items: [deal(1),
    deal(2, { ufCrmProperty: '72', ufCrmRooms: null, ufCrmArea: null, opportunity: '2000000' }),
    deal(3, { ufCrmProperty: '72', ufCrmRooms: 0, ufCrmArea: '', opportunity: '4000000', ufCrmComplex: '82' }),
  ] });
  server = createServer(fixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
test('parking has its own header, working filters and restricted statistics, with navigation and local state', async () => {
  const requests = [];
  page.on('request', r => { if (r.url().includes('/api/')) requests.push(r.url()); });
  await page.goto(`${url}/#parking`);
  await page.waitForFunction(() => document.querySelector('[data-testid="statistics-count"]')?.textContent === '2');
  expect(requests.some(r => /\/api\/report(?:\?|$)/.test(r))).toBe(false);
  expect(requests.filter(r => r.includes('property-stages'))).toHaveLength(0);
  expect(await page.locator('.report-header-subtitle').innerText()).toBe('Կնքված կայանատեղիներ');
  const form = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  expect(await form.locator('.room-filter').count()).toBe(0);
  expect(await form.locator('#area-min').count()).toBe(0);
  expect(await form.getByText('Կայանատեղիի արժեք (֏)', { exact: true }).count()).toBe(1);
  expect(await page.locator('.statistics-totals h3').first().innerText()).toBe('կայանատեղի');
  await page.locator('.statistics-trigger').click();
  const popup = page.getByRole('dialog', { name: 'Վիճակագրության խմբավորում' });
  expect(await popup.getByRole('button').allTextContents()).toEqual(['Կնքման տարի', 'Համալիր', 'Կայ. Արժեք']);
  await popup.getByRole('button', { name: 'Կայ. Արժեք', exact: true }).click();
  expect(await page.locator('.statistics-category').allTextContents()).toEqual(['2 000 000 ֏', '4 000 000 ֏']);
  await form.locator('#amount-min').fill('3000000');
  await page.waitForFunction(() => document.querySelector('[data-testid="statistics-count"]').textContent === '1');
  expect(requests.filter(r => r.includes('parking-report'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Կնքված բնակարաններ', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="statistics-count"]')?.textContent === '1');
  expect(await form.locator('.room-filter').isVisible()).toBe(true);
  await page.goBack();
  await form.locator('#amount-min').waitFor();
  expect(await form.locator('#amount-min').inputValue()).toBe('3 000 000');
  await page.getByRole('button', { name: 'Վերականգնել', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="statistics-count"]').textContent === '2');
  for (const width of [1440, 1024, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/parking-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="statistics-count"]')?.textContent === '2');
  expect(requests.filter(r => r.includes('parking-report'))).toHaveLength(2);
});

test('parking filter columns align their headings, controls and equal price bounds', async () => {
  await page.goto(`${url}/#parking`);
  await page.getByTestId('statistics-count').waitFor();
  for (const width of [1920, 1440, 1100, 1024, 640]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForTimeout(100);
    const geometry = await page.locator('.parking-filters .filter-panel').evaluate(form => {
      const rect = selector => {
        const r = form.querySelector(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, width: r.width, height: r.height };
      };
      return {
        dateLegend: rect('.date-filter legend'), complexLegend: rect('.complex-filter legend'),
        period: rect('.date-filter select'), year: rect('.period-details select'),
        tower: rect('.complex-buttons button:first-child'), hills: rect('.complex-buttons button:last-child'),
        min: rect('#amount-min'), max: rect('#amount-max'),
      };
    });
    const equal = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1);
    equal(geometry.dateLegend.y, geometry.complexLegend.y);
    equal(geometry.period.y, geometry.tower.y);
    equal(geometry.year.y, geometry.hills.y);
    for (const [bound, column] of [[geometry.min, geometry.period], [geometry.max, geometry.tower]]) {
      equal(bound.x, column.x);
      equal(bound.right, column.right);
    }
    equal(geometry.min.width, geometry.max.width);
    equal(geometry.min.height, geometry.max.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/parking-aligned-${width}.png`, fullPage: true });
  }
});

test.each([320, 375, 639])('mobile parking stacks full-width period and complex filters at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 });
  const form = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const period = form.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });
  await page.goto(url);
  await page.getByTestId('statistics-count').waitFor();
  const apartmentPeriod = await period.boundingBox();
  await page.goto(`${url}/#parking`);
  await page.getByTestId('statistics-count').waitFor();

  for (const mode of ['year', 'quarter', 'custom']) {
    await period.selectOption(mode);
    const date = await form.locator('.date-filter').boundingBox();
    const parkingPeriod = await period.boundingBox();
    const complex = await form.locator('.complex-filter').boundingBox();
    expect(parkingPeriod.x).toBeCloseTo(apartmentPeriod.x, 0);
    expect(parkingPeriod.width).toBeCloseTo(apartmentPeriod.width, 0);
    expect(complex.x).toBeCloseTo(date.x, 0);
    expect(complex.width).toBeCloseTo(date.width, 0);
    expect(complex.y).toBeGreaterThan(date.y + date.height);
  }
});

test.each([
  ['', 320], ['', 375], ['#parking', 320], ['#parking', 375],
])('mobile statistics match filter height in report "%s" at %i px', async (hash, width) => {
  fixture.state.items = Array.from({ length: 12 }, (_, index) => deal(index + 1, {
    ...(hash ? { ufCrmProperty: '72' } : {}),
    opportunity: String((index + 1) * 20000000),
  }));
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${url}/${hash}`);
  const count = page.getByTestId('statistics-count');
  await count.waitFor();
  expect(await count.innerText()).toBe('12');
  const form = page.getByRole('form', { name: 'Զտիչներ', exact: true });
  const panel = page.getByRole('region', { name: 'Վիճակագրություն', exact: true });
  const height = async locator => (await locator.boundingBox()).height;
  const initialHeight = await height(form);
  expect(await height(panel)).toBeCloseTo(initialHeight, 0);

  const legend = panel.getByRole('table');
  const amountMin = form.locator('#amount-min');
  const amountMax = form.locator('#amount-max');
  const firstCard = panel.locator('.statistics-totals article').first();
  const expectMatchingInset = async () => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const [filterBox, minBox, maxBox, panelBox, legendBox, cardBox] = await Promise.all(
      [form, amountMin, amountMax, panel, legend, firstCard].map(locator => locator.boundingBox()),
    );
    expect(legendBox.x).toBeCloseTo(cardBox.x, 0);
    expect(legendBox.x + legendBox.width).toBeCloseTo(maxBox.x + maxBox.width, 0);
    expect(panelBox.y + panelBox.height - legendBox.y - legendBox.height)
      .toBeCloseTo(filterBox.y + filterBox.height - minBox.y - minBox.height, 0);
  };
  const groups = page.getByRole('dialog', { name: 'Վիճակագրության խմբավորում' });
  const choices = hash
    ? ['Կնքման տարի', 'Համալիր', 'Կայ. Արժեք']
    : ['Կնքման տարի', 'Համալիր', 'Սենյակ', 'Մակերես', 'Բն. Արժեք'];
  for (const choice of choices) {
    await panel.locator('.statistics-trigger').click();
    await groups.getByRole('button', { name: choice, exact: true }).click();
    expect(await height(panel)).toBeCloseTo(initialHeight, 0);
    await expectMatchingInset();
    const group = await legend.evaluate(el => {
      const box = el.getBoundingClientRect();
      const first = el.firstElementChild.getBoundingClientRect();
      const last = el.lastElementChild.getBoundingClientRect();
      return {
        rowsFillWidth: Array.from(el.children).every(row => {
          const bounds = row.getBoundingClientRect();
          return Math.abs(bounds.left - box.left - el.clientLeft) < 1 && Math.abs(bounds.width - el.clientWidth) < 1;
        }),
        top: first.top - box.top,
        bottom: box.bottom - last.bottom,
        scrolls: el.scrollHeight > el.clientHeight,
      };
    });
    expect(group.rowsFillWidth).toBe(true);
    expect(group.top).toBeCloseTo(group.scrolls ? 0 : group.bottom, 0);
  }
  if (hash) {
    expect(await legend.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  }

  await amountMin.fill('1');
  await amountMax.fill('0');
  await amountMin.and(form.locator('[aria-invalid="true"]')).waitFor();
  await expectMatchingInset();
  await amountMax.fill('');

  await amountMin.fill('999999999');
  await page.waitForFunction(() => document.querySelector('[data-testid="statistics-count"]')?.textContent === '0');
  expect(await height(panel)).toBeCloseTo(initialHeight, 0);
  await form.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true }).selectOption('quarter');
  expect(await height(panel)).toBeCloseTo(await height(form), 0);
});

test('parking stages and two histogram modes show parking data and respond to filters and refresh', async () => {
 fixture.state.propertyItems = [
  {id:1,categoryId:5,stageId:'DT177_5:0',ufCrmProperty:'71'},
  {id:2,categoryId:5,stageId:'DT177_5:7',ufCrmProperty:'72'},
 ];
 const requests = [];
 page.on('request', r => { if (r.url().includes('/api/')) requests.push(r.url()); });
 await page.setViewportSize({width:1440,height:1100});
 await page.goto(`${url}/#parking`);
 const stages = page.getByRole('region',{name:'Կայանատեղիներն ըստ փուլերի'});
 const chart = page.locator('.deals-histogram');
 await stages.locator('article').first().waitFor();
 await chart.getByTestId('histogram-kpi-value').waitFor();
 expect(await stages.locator('article p').evaluateAll(values => values.map(value => value.firstChild.textContent.trim()))).toEqual(['0','0','0','1']);
 expect(await chart.locator('.histogram-modes button').allTextContents()).toEqual(['Կայ. քանակ','Վաճառքի գումար']);
 expect(await chart.getByTestId('histogram-kpi-value').innerText()).toBe('2');
 expect(await chart.getByTestId('histogram-kpi-change').count()).toBe(0);
 const modeBoxes = await chart.locator('.histogram-modes button').evaluateAll(elements => elements.map(el => { const r=el.getBoundingClientRect(); return {x:r.x,width:r.width}; }));
 const modeGroup = await chart.locator('.histogram-modes').boundingBox();
 expect(modeBoxes[0].width).toBeCloseTo(modeBoxes[1].width, 0);
 expect(modeBoxes[0].x-modeGroup.x).toBeCloseTo(modeGroup.x+modeGroup.width-modeBoxes[1].x-modeBoxes[1].width, 0);
 expect(await chart.locator('.histogram-kpi h3').innerText()).toBe('կայանատեղի');
 const [top, stageBox, chartBox] = await Promise.all([page.locator('.report-top-panels').boundingBox(),stages.boundingBox(),chart.boundingBox()]);
 expect(top.y).toBeGreaterThan(stageBox.y+stageBox.height);
 expect(chartBox.y).toBeGreaterThan(top.y+top.height);
 await chart.getByRole('button',{name:'Վաճառքի գումար',exact:true}).click();
 expect((await chart.getByTestId('histogram-kpi-value').innerText()).replace(/\s/g,' ')).toBe('6 000 000,00 ֏');
 await page.locator('#amount-min').fill('3000000');
 await page.waitForFunction(() => document.querySelector('.histogram-kpi-value')?.textContent.replace(/\s/g,' ') === '4 000 000,00 ֏');
 expect(await stages.locator('article p').last().evaluate(value => value.firstChild.textContent.trim())).toBe('1');
 expect(requests.filter(r => r.includes('parking-report'))).toHaveLength(1);
 expect(requests.filter(r => r.includes('parking-stages'))).toHaveLength(1);
 await chart.getByRole('button',{name:'Կայ. քանակ',exact:true}).click();
 expect(await chart.getByTestId('histogram-kpi-value').innerText()).toBe('1');
 await chart.getByRole('checkbox',{name:'Ցուցադրել համեմատական հիստոգրամը'}).check();
 expect(await chart.locator('.comparison-column').count()).toBe(12);
 expect(await chart.getByTestId('histogram-kpi-change').isVisible()).toBe(true);
 expect(await chart.getByTestId('histogram-kpi-change').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0.15s');
 expect(await chart.locator('.comparison-column').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0.15s');
 await chart.getByRole('checkbox',{name:'Ցուցադրել համեմատական հիստոգրամը'}).uncheck();
 expect(await chart.getByTestId('histogram-kpi-change').count()).toBe(0);
 for (const width of [1024,375,320]) {
  await page.setViewportSize({width,height:1100});
  await page.waitForTimeout(100);
  const countTitle = width < 640 ? 'Կայ. քանակ' : 'Կայանատեղիների քանակ';
  expect(await chart.locator('.histogram-axis').innerText()).toBe(`Y · ${countTitle} · 2026`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 fixture.state.propertyItems.push({id:3,categoryId:5,stageId:'DT177_5:7',ufCrmProperty:'72'});
 await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('.property-stage-panels-inline .property-stages article:last-child p')?.firstChild.textContent.trim() === '2');
 expect(requests.filter(r => r.includes('parking-stages'))).toHaveLength(2);
 await page.screenshot({path:'test-results/parking-stages-charts-320.png',fullPage:true});
});
