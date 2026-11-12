const fs = require('node:fs');
const { createServer } = require('../../server.js');
const { createFixture, deal } = require('../support/crm-fixture.cjs');
let fixture, server, url, release;
const histogram = () => page.getByRole('region', { name: 'Գործարքների հիստոգրամ', exact: true });
const months = () => histogram().getByRole('button', { name: 'Վաճառքի գումար', exact: true });
const rooms = () => histogram().getByRole('button', { name: 'Սենյակներ', exact: true });
const counts = () => histogram().getByRole('button', { name: 'Բն. քանակ', exact: true });
const ready = () => page.getByTestId('statistics-count').waitFor();
const refresh = () => page.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true }).click();

beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  fixture = createFixture({ items: [
    deal(1, { opportunity: '100.25', ufCrmRooms: 1 }),
    deal(2, { opportunity: '200.5', ufCrmRooms: 3, ufCrmDate: '2026-02-10' }),
    deal(3, { opportunity: '50', ufCrmRooms: 3, ufCrmDate: '2025-03-01' }),
    deal(4, { opportunity: '999', ufCrmRooms: null }),
    deal(5, { opportunity: '25.75', ufCrmRooms: 3 }),
  ] });
  server = createServer(fixture);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  release?.(); release = undefined;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
});

test.each([1920, 1440, 1024, 375, 320])('histogram matches filter width, follows filters, switches modes and filters locally at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(url); await ready();
  const box = await histogram().boundingBox(), kpi = await page.locator('.report-top-panels').boundingBox();
  expect(Math.abs(box.x - kpi.x)).toBeLessThan(1);
  expect(Math.abs(box.width - kpi.width)).toBeLessThan(1);
  expect(box.y).toBeGreaterThanOrEqual(kpi.y + kpi.height);
  expect(await histogram().evaluate(el => el.nextElementSibling?.classList.contains('deals-list')
    && el.nextElementSibling === el.parentElement.lastElementChild)).toBe(true);
  expect(await counts().getAttribute('aria-pressed')).toBe('true');
  await rooms().click();
  const heading = histogram().getByRole('heading', { name: 'Ցուցադրություն', exact: true });
  const modes = histogram().getByRole('group', { name: 'Խմբավորում', exact: true });
  expect(await modes.getByRole('button').allTextContents()).toEqual(['Բն. քանակ', 'Վաճառքի գումար', 'Սենյակներ']);
  const icons = await modes.locator('button').evaluateAll(buttons => buttons.map(button => {
    const icon = button.querySelector('img');
    const label = button.querySelector('span');
    return { src: icon.getAttribute('src'), loaded: icon.complete && icon.naturalWidth > 0,
      decorative: icon.alt === '', right: icon.getBoundingClientRect().x >= label.getBoundingClientRect().right };
  }));
  expect(icons.map(icon => icon.src)).toEqual([
    expect.stringMatching(/\/assets\/building-.*\.png$/),
    expect.stringMatching(/\/assets\/wallet-.*\.png$/),
    expect.stringMatching(/\/assets\/rooms-.*\.png$/),
  ]);
  expect(icons.every(icon => icon.loaded && icon.decorative && icon.right)).toBe(true);
  const fontSizes = await histogram().locator('.histogram-axis, .histogram-comparison-toggle, .histogram-summary p')
    .evaluateAll(els => els.map(el => getComputedStyle(el).fontSize));
  expect(fontSizes).toEqual(Array(4).fill('14px'));
  expect(await histogram().locator('.histogram-summary').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  const headingBox = await heading.boundingBox(), modesBox = await modes.boundingBox();
  expect(headingBox.y + headingBox.height).toBeLessThan(modesBox.y);
  expect(Math.abs(headingBox.x + headingBox.width / 2 - box.x - box.width / 2)).toBeLessThan(1);
  const modeBoxes = await Promise.all((await modes.getByRole('button').all()).map(button => button.boundingBox()));
  for (const buttonBox of modeBoxes) expect(Math.abs(buttonBox.width - modeBoxes[0].width)).toBeLessThan(1);
  expect(await histogram().locator('.histogram-controls').getByRole('checkbox').count()).toBe(0);
  const toggle = histogram().getByRole('checkbox', { name: 'Ցուցադրել համեմատական հիստոգրամը', exact: true });
  const toggleBox = await toggle.locator('..').boundingBox();
  const toolbarBox = await histogram().locator('.histogram-graph-toolbar').boundingBox();
  expect(toggleBox.y).toBeGreaterThan(modesBox.y + modesBox.height);
  expect(Math.abs(toggleBox.x + toggleBox.width - toolbarBox.x - toolbarBox.width + 20)).toBeLessThan(1);
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(['126 ֏', width >= 1024 ? '201 ֏' : '200.5 ֏', ...Array(10).fill('0 ֏')]);
  expect(await histogram().getByTestId('total-count').innerText()).toBe('Գործարքների քանակ՝ 3');
  expect(await histogram().getByRole('list', { name: 'Սենյակների քանակ', exact: true }).innerText()).toBe('1 սենյակ\n3 սենյակ');
  const segment = histogram().getByRole('button', { name: 'Հունվար · 1 սենյակ · 100.25 ֏ · 1 բնակարան', exact: true });
  await segment.focus();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Հունվար · 1 սենյակ · 100.25 ֏ · 1 բնակարան');
  await page.keyboard.press('Escape');
  expect(await histogram().getByRole('tooltip').count()).toBe(0);
  await segment.hover();
  expect(await histogram().getByRole('tooltip').innerText()).toContain('100.25 ֏');
  await histogram().getByRole('button', { name: 'Հունվար · 3 սենյակ · 25.75 ֏ · 1 բնակարան', exact: true }).click();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Հունվար · 3 սենյակ · 25.75 ֏ · 1 բնակարան');
  expect(await histogram().locator('rect:focus').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  const rectangles = await histogram().locator('.chart-column').first().locator('rect').evaluateAll(els => els.map(el => ({
    y: Number(el.getAttribute('y')), height: Number(el.getAttribute('height')), color: el.getAttribute('fill'),
  })));
  expect(rectangles).toHaveLength(2);
  expect(rectangles[1].y + rectangles[1].height).toBeCloseTo(rectangles[0].y, 6);
  expect(rectangles[0].color).not.toBe(rectangles[1].color);
  expect(rectangles.every(rect => /^hsl\(170 100%/.test(rect.color))).toBe(true);
  const lightness = rectangles.map(rect => Number(rect.color.match(/([\d.]+)%\)$/)[1]));
  expect(lightness[0] - lightness[1]).toBeGreaterThanOrEqual(30);
  const requests = fixture.state.httpRequests.length;
  const stackedTicks = await histogram().getByTestId('y-tick').allTextContents();
  await months().click();
  expect(await histogram().getByTestId('bar-count').allTextContents()).toEqual(['2 գործարք', '1 գործարք', ...Array(10).fill('0 գործարք')]);
  expect(await histogram().getByTestId('y-tick').allTextContents()).toEqual(stackedTicks);
  const columns = histogram().locator('.chart-column');
  expect(await columns.count()).toBe(12);
  expect(await columns.nth(0).getAttribute('aria-label')).toBe('Հունվար՝ 126 AMD, 2 գործարք');
  expect(await columns.nth(1).getAttribute('aria-label')).toBe('Փետրվար՝ 200.5 AMD, 1 գործարք');
  await page.getByRole('combobox', { name: 'Տարի', exact: true }).selectOption('2025');
  expect(await columns.nth(2).getAttribute('aria-label')).toBe('Մարտ՝ 50 AMD, 1 գործարք');
  expect(await histogram().getByTestId('total-count').innerText()).toBe('Գործարքների քանակ՝ 1');
  await page.getByRole('combobox', { name: 'Տարի', exact: true }).selectOption('2026');
  await page.getByRole('button', { name: 'Սենյակների քանակ՝ 3', exact: true }).click();
  expect(await columns.nth(0).getAttribute('aria-label')).toBe('Հունվար՝ 25.75 AMD, 1 գործարք');
  await rooms().click();
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual([...(width >= 1024 ? ['25,8 ֏', '201 ֏'] : ['25.75 ֏', '200.5 ֏']), ...Array(10).fill('0 ֏')]);
  expect(await histogram().getByRole('listitem').allTextContents()).toEqual(['3 սենյակ']);
  expect(await histogram().getByRole('button', { name: 'Հունվար · 3 սենյակ · 25.75 ֏ · 1 բնակարան', exact: true }).getAttribute('fill')).toBe(rectangles[1].color);
  expect(fixture.state.httpRequests).toHaveLength(requests);
  await months().focus(); await page.keyboard.press('Space');
  expect(await months().getAttribute('aria-pressed')).toBe('true');
  const viewport = histogram().getByLabel('Գծապատկերի տարածք', { exact: true });
  const yAxis = histogram().getByTestId('histogram-y-axis');
  const beforeAxis = await yAxis.boundingBox();
  const beforeColumn = await columns.first().boundingBox();
  const ticks = await yAxis.getByTestId('y-tick').allTextContents();
  const canScroll = await viewport.evaluate(el => el.scrollWidth > el.clientWidth);
  await viewport.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  expect(await viewport.evaluate(el => el.scrollLeft > 0)).toBe(canScroll);
  expect(await yAxis.boundingBox()).toEqual(beforeAxis);
  expect(await yAxis.getByTestId('y-tick').allTextContents()).toEqual(ticks);
  if (canScroll) expect((await columns.first().boundingBox()).x).toBeLessThan(beforeColumn.x);
  expect(await histogram().getByText('Կնքման ամիս · Գործարքների քանակ · X', { exact: true }).isVisible()).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  fs.mkdirSync('test-results', { recursive: true });
  await histogram().screenshot({ path: `test-results/histogram-${width}.png`, animations: 'disabled' });
});

test('histogram clears stale bars on refresh, recovers from failure and handles empty results', async () => {
  await page.goto(url); await ready(); await months().click();
  fixture.state.gate = new Promise(resolve => { release = resolve; });
  fixture.state.commandFailures = 4;
  await refresh();
  await histogram().getByRole('status').filter({ hasText: 'Տվյալները բեռնվում են…' }).waitFor();
  expect(await histogram().getByRole('img').count()).toBe(0);
  expect(await months().isDisabled()).toBe(true);
  release(); fixture.state.gate = null;
  await histogram().getByRole('status').filter({ hasText: 'Տվյալներն անհասանելի են։' }).waitFor();
  expect(await histogram().locator('svg').count()).toBe(0);
  fixture.state.items = [];
  await refresh(); await ready();
  expect(await months().getAttribute('aria-pressed')).toBe('true');
  expect(await histogram().getByRole('status').innerText()).toBe('Տվյալներ չկան');
  expect(await histogram().getByTestId('total-count').innerText()).toBe('Գործարքների քանակ՝ 0');
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(Array(12).fill('0 ֏'));
  await rooms().click();
  expect(await histogram().locator('svg').count()).toBe(2);
  expect(await histogram().locator('rect').count()).toBe(0);
});

test('Y scale uses monthly stack totals, round marks and updates with filters', async () => {
  fixture.state.items = [deal(1, { opportunity: '200000000', ufCrmRooms: 1 }),
    deal(2, { opportunity: '126000000', ufCrmRooms: 3 }),
    deal(3, { opportunity: '50000000', ufCrmRooms: 1, ufCrmDate: '2026-02-01' })];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url); await ready();
  const ticks = () => histogram().getByTestId('y-tick').allTextContents();
  await rooms().click();
  expect(await ticks()).toEqual(['0', '100 մլն', '200 մլն', '300 մլն', '400 մլն']);
  expect((await histogram().getByTestId('bar-amount').allTextContents())[0]).toBe('326 մլն ֏');
  fs.mkdirSync('test-results', { recursive: true });
  await histogram().screenshot({ path: 'test-results/histogram-stacked-1440.png', animations: 'disabled' });
  await months().click();
  expect(await ticks()).toEqual(['0', '100 մլն', '200 մլն', '300 մլն', '400 մլն']);
  await rooms().click();
  await page.getByRole('button', { name: 'Սենյակների քանակ՝ 3', exact: true }).click();
  expect(await ticks()).toEqual(['0', '25 մլն', '50 մլն', '75 մլն', '100 մլն', '125 մլն', '150 մլն']);
  await page.setViewportSize({ width: 375, height: 1000 });
  await histogram().screenshot({ path: 'test-results/histogram-stacked-375.png', animations: 'disabled' });
});

test.each([1440, 375, 320])('chart modes keep the count layout and sales KPI at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(url); await ready();
  const layout = () => histogram().evaluate(el => {
    const plot = el.querySelector('.histogram-plot').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { height: box.height, plotTop: plot.y - box.y, plotHeight: plot.height };
  });
  const baseline = await layout();
  for (const select of [months, rooms, counts]) {
    await select().click();
    expect(await layout()).toEqual(baseline);
    const titleBox = await histogram().locator('.histogram-axis').boundingBox();
    const tickBoxes = await histogram().getByTestId('y-tick').locator('text').evaluateAll(els => els.map(el => el.getBoundingClientRect().x));
    expect(Math.min(...tickBoxes)).toBeCloseTo(titleBox.x + 21, 0);
    expect(await histogram().getByTestId('bar-month').evaluateAll(els => els.map(el => getComputedStyle(el).fontSize)))
      .toEqual(Array(12).fill('12px'));
    expect(await histogram().locator('.histogram-modes button').evaluateAll(els => els.map(el => getComputedStyle(el).color)))
      .toEqual(Array(3).fill('rgb(0, 0, 0)'));
  }
  await months().click();
  expect(await histogram().getByRole('heading', { name: 'ընդհանուր արժեք', exact: true }).isVisible()).toBe(true);
  const data = '+276,5 ֏';
  expect(await histogram().getByTestId('histogram-kpi-value').innerText()).toBe('326,50 ֏');
  expect(await histogram().getByTestId('histogram-kpi-change').locator('span').first().innerText()).toBe(data);
  const percentage = '+553%';
  expect(await histogram().getByTestId('histogram-kpi-change').innerText()).toContain(percentage);
  await page.getByRole('button', { name: 'Սենյակների քանակ՝ 3', exact: true }).click();
  expect(await histogram().getByTestId('histogram-kpi-value').innerText()).toBe('226,25 ֏');
});

test.each([1440, 375])('count mode shares KPI totals and changes, shows 12 months and responds to filters at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(url); await ready();
  const requests = fixture.state.httpRequests.length;
  await counts().click();
  expect(await histogram().getByTestId('bar-count').count()).toBe(0);
  expect(await histogram().getByTestId('bar-month').evaluateAll(els => els.map(el => getComputedStyle(el).fontSize)))
    .toEqual(Array(12).fill('12px'));
  expect(await histogram().getByTestId('bar-amount').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('14px');
  const axisTitleBox = await histogram().locator('.histogram-axis').boundingBox();
  const tickBoxes = await Promise.all((await histogram().getByTestId('y-tick').locator('text').all()).map(tick => tick.boundingBox()));
  const leftInset = Math.min(...tickBoxes.map(box => box.x));
  expect(leftInset).toBeCloseTo(axisTitleBox.x + 21, 0);
  const axisLine = await histogram().getByTestId('histogram-y-axis').locator('line').boundingBox();
  for (const box of tickBoxes) expect(axisLine.x - box.x - box.width).toBeCloseTo(21, 0);
  const plotViewport = histogram().getByLabel('Գծապատկերի տարածք', { exact: true });
  await plotViewport.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const rightGap = await plotViewport.locator('svg > line').first().evaluate(el =>
    innerWidth - el.getBoundingClientRect().right);
  expect(rightGap).toBeCloseTo(leftInset, 0);
  await plotViewport.evaluate(el => { el.scrollLeft = 0; });
  const legend = histogram().getByLabel('Համեմատվող ժամանակահատվածներ', { exact: true });
  expect(await legend.evaluate(el => getComputedStyle(el).fontSize)).toBe('14px');
  expect(await histogram().locator('.histogram-kpi').evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
  expect(await histogram().getByTestId('histogram-kpi-change').evaluate(el => getComputedStyle(el).justifyContent)).toBe('center');
  expect(await legend.locator('span').count()).toBe(1);
  expect(await legend.innerText()).toContain('Ընտրված՝');
  expect(await histogram().locator('.histogram-kpi').innerText()).not.toMatch(/Ընտրված՝|Համեմատություն՝/);
  const selectedRange = await legend.locator('span').first().innerText();
  const compareToggle = histogram().getByRole('checkbox', { name: 'Ցուցադրել համեմատական հիստոգրամը', exact: true });
  await compareToggle.check();
  expect(await histogram().getByTestId('bar-amount').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  expect(await histogram().getByTestId('comparison-amount').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  expect(await legend.locator('span').count()).toBe(2);
  expect(await legend.locator('span').first().innerText()).toBe(selectedRange);
  expect(await legend.locator('span').last().innerText()).toContain('Համեմատություն՝');
  expect(await histogram().locator('.histogram-kpi').innerText()).not.toMatch(/Ընտրված՝|Համեմատություն՝/);
  await compareToggle.uncheck();
  expect(await histogram().getByTestId('bar-amount').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('14px');
  expect(await legend.locator('span').count()).toBe(1);
  expect(await legend.locator('span').first().innerText()).toBe(selectedRange);
  const value = histogram().getByTestId('histogram-kpi-value');
  const apartmentLabel = histogram().getByRole('heading', { name: 'բնակարան', exact: true });
  expect(await apartmentLabel.isVisible()).toBe(true);
  const valueBox = await value.boundingBox(), labelBox = await apartmentLabel.boundingBox();
  expect(valueBox.y + valueBox.height).toBeLessThanOrEqual(labelBox.y);
  const change = histogram().getByTestId('histogram-kpi-change');
  const changeBox = await change.boundingBox();
  const statisticsValue = await page.getByTestId('statistics-count').boundingBox();
  const statisticsLabel = await page.locator('.statistics-totals article').first().locator('h3').boundingBox();
  const referenceGap = statisticsLabel.y - statisticsValue.y - statisticsValue.height;
  expect(labelBox.y - valueBox.y - valueBox.height).toBeCloseTo(referenceGap, 1);
  expect(changeBox.y - labelBox.y - labelBox.height).toBeCloseTo(referenceGap + 8, 1);
  const expectKpi = async () => {
    expect(await value.innerText()).toBe(await page.getByTestId('statistics-count').innerText());
  };
  await expectKpi();
  expect(await value.innerText()).toBe('3');
  expect(await change.innerText()).toContain('+2');
  expect(await change.innerText()).toContain('200%');
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(['2', '1', ...Array(10).fill('0')]);
  expect(await histogram().getByTestId('y-tick').allTextContents()).toEqual(['0', '1', '2', '3', '4']);
  const january = histogram().getByRole('button', { name: 'Հունվար · 2 բնակարան · 126 ֏', exact: true });
  await january.focus();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Հունվար · 2 բնակարան · 126 ֏');
  await page.keyboard.press('Escape');
  await january.click();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Հունվար · 2 բնակարան · 126 ֏');
  expect(await january.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.getByRole('button', { name: 'Սենյակների քանակ՝ 3', exact: true }).click();
  await expectKpi();
  expect(await value.innerText()).toBe('2');
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(['1', '1', ...Array(10).fill('0')]);
  await page.getByRole('combobox', { name: 'Տարի', exact: true }).selectOption('2025');
  await expectKpi();
  expect(await value.innerText()).toBe('1');
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(['0', '0', '1', ...Array(9).fill('0')]);
  await page.getByRole('button', { name: 'Վերականգնել', exact: true }).click();
  await expectKpi();
  await page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true }).selectOption('custom');
  expect(await histogram().getByTestId('histogram-kpi-change').count()).toBe(0);
  expect(await histogram().getByText('Համեմատության համար նշեք երկու ամսաթվերը։', { exact: true }).isVisible()).toBe(true);
  const area = page.getByLabel('Մակերես (մ²)՝ Սկսած', { exact: true });
  await area.fill('900');
  expect(await value.innerText()).toBe('0');
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(Array(12).fill('0'));
  expect(await histogram().getByRole('status').innerText()).toBe('Տվյալներ չկան');
  await area.fill('');
  await page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true }).selectOption('year');
  expect(fixture.state.httpRequests).toHaveLength(requests);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  fs.mkdirSync('test-results', { recursive: true });
  await histogram().screenshot({ path: `test-results/histogram-count-${width}.png`, animations: 'disabled' });
});

test.each([1024, 1440, 1920])('all twelve months fit in every desktop mode with exact amount tooltips at %i px', async width => {
  fixture.state.items = Array.from({ length: 12 }, (_, index) => deal(index + 1, {
    ufCrmRooms: index % 3 + 1, ufCrmDate: `2025-${String(index + 1).padStart(2, '0')}-10`,
    opportunity: `${index + 1}23456789.12345`,
  }));
  await page.setViewportSize({ width, height: 1100 });
  await page.goto(url); await ready();
  await page.getByRole('combobox', { name: 'Տարի', exact: true }).selectOption('2025');
  for (const button of [rooms, months, counts]) {
    await button().click();
    const viewport = histogram().getByLabel('Գծապատկերի տարածք', { exact: true });
    // ResizeObserver supplies the actual plot width; wait for the compact labels.
    await page.waitForFunction(() => document.querySelector('[data-testid="bar-month"]')?.textContent === 'Հնվ');
    expect(await viewport.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const area = await viewport.boundingBox();
    const labels = await histogram().getByTestId('bar-month').allTextContents();
    expect(new Set(labels).size).toBe(12);
    for (const label of await histogram().getByTestId('bar-month').all()) {
      const box = await label.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(area.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width + 1);
    }
    const amounts = await histogram().getByTestId('bar-amount').all();
    for (let index = 1; index < amounts.length; index++) {
      const previous = await amounts[index - 1].boundingBox(), current = await amounts[index].boundingBox();
      expect(current.x).toBeGreaterThan(previous.x + previous.width);
    }
  }
  await months().click();
  await histogram().locator('.chart-column').first().focus();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Հունվար · 1 բնակարան · 123 456 789.12345 ֏');
  await page.keyboard.press('Escape');
  fs.mkdirSync('test-results', { recursive: true });
  await histogram().screenshot({ path: `test-results/histogram-fit-${width}.png`, animations: 'disabled' });
});

test.each([1440, 375])('comparison checkbox shows paired KPI-period histograms in all modes without loading data at %i px', async width => {
  fixture.state.items.push(deal(6, { opportunity: '500000000', ufCrmRooms: 3, ufCrmDate: '2025-01-15' }));
  await page.setViewportSize({ width, height: 1100 }); await page.goto(url); await ready();
  const checkbox = histogram().getByRole('checkbox', { name: 'Ցուցադրել համեմատական հիստոգրամը', exact: true });
  expect(await checkbox.isChecked()).toBe(false);
  await rooms().click();
  expect(await histogram().locator('.comparison-column').count()).toBe(0);
  const requests = fixture.state.httpRequests.length;
  const originalTicks = await histogram().getByTestId('y-tick').allTextContents();
  await checkbox.check();
  expect(await histogram().getByTestId('y-tick').allTextContents()).not.toEqual(originalTicks);
  expect(await histogram().getByTestId('y-tick').allTextContents()).toContain('100 մլն');
  expect(await histogram().getByLabel('Համեմատվող ժամանակահատվածներ', { exact: true }).innerText()).toContain('2025');
  const segment = histogram().getByRole('button', { name: 'Համեմատություն՝ 01.01.2025 – 31.01.2025 · 3 սենյակ · 500 000 000 ֏ · 1 բնակարան', exact: true });
  await segment.click();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Համեմատություն՝ 01.01.2025 – 31.01.2025 · 3 սենյակ · 500 000 000 ֏ · 1 բնակարան');
  expect(await segment.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  for (const button of [rooms, months, counts]) {
    await button().click();
    expect(await checkbox.isChecked()).toBe(true);
    expect(await histogram().locator('.comparison-column').count()).toBe(12);
    const current = await histogram().locator('.chart-column').first().locator('rect').first().boundingBox();
    const previous = await histogram().locator('.comparison-column').first().locator('rect').first().boundingBox();
    expect(previous.x).toBeGreaterThanOrEqual(current.x + current.width);
    if (width === 1440) expect(await histogram().getByLabel('Գծապատկերի տարածք', { exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  expect(await histogram().getByTestId('comparison-amount').allTextContents()).toEqual(['1', '0', '1', ...Array(9).fill('0')]);
  await page.getByRole('button', { name: 'Սենյակների քանակ՝ 1', exact: true }).click();
  expect(await histogram().getByTestId('comparison-amount').allTextContents()).toEqual(Array(12).fill('0'));
  expect(fixture.state.httpRequests).toHaveLength(requests);
  await checkbox.uncheck();
  expect(await histogram().locator('.comparison-column').count()).toBe(0);
  await checkbox.focus(); await page.keyboard.press('Space');
  expect(await checkbox.isChecked()).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await histogram().screenshot({ path: `test-results/histogram-comparison-${width}.png`, animations: 'disabled' });
});

test('comparison follows KPI previous month, custom window and unavailable baseline', async () => {
  fixture.state.items = [deal(1, { opportunity: '100', ufCrmDate: '2026-02-10' }),
    deal(2, { opportunity: '200', ufCrmDate: '2026-01-10' }),
    deal(3, { opportunity: '300', ufCrmDate: '2025-02-10' })];
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto(url); await ready();
  const period = page.getByRole('combobox', { name: 'Կնքման ժամանակահատված', exact: true });
  await period.selectOption('month');
  await page.locator('.date-filter').getByRole('button', { name: 'Ամիսներ', exact: true }).click();
  const monthPopup = page.getByRole('dialog', { name: 'Ամիսների ընտրություն', exact: true });
  await monthPopup.getByRole('button', { name: 'Փետրվար', exact: true }).click();
  await monthPopup.getByRole('button', { name: 'Նոյեմբեր', exact: true }).click();
  await page.keyboard.press('Escape');
  const checkbox = histogram().getByRole('checkbox', { name: 'Ցուցադրել համեմատական հիստոգրամը', exact: true });
  await counts().click(); await checkbox.check();
  expect(await histogram().getByTestId('comparison-amount').allTextContents()).toEqual(['0', '1', ...Array(10).fill('0')]);
  const legend = histogram().getByLabel('Համեմատվող ժամանակահատվածներ', { exact: true });
  expect(await legend.innerText()).toContain('01.01.2026 – 31.01.2026');
  await histogram().locator('.comparison-column').nth(1).focus();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Համեմատություն՝ 01.01.2026 – 31.01.2026 · 1 գործարք · 200 ֏');
  await period.selectOption('custom');
  await page.getByLabel('Կնքման ժամանակահատված՝ Սկսած', { exact: true }).fill('2026-02-01');
  await page.getByLabel('Կնքման ժամանակահատված՝ Մինչև', { exact: true }).fill('2026-02-28');
  expect(await histogram().getByTestId('bar-amount').allTextContents()).toEqual(['0', '1', ...Array(10).fill('0')]);
  expect(await histogram().getByTestId('comparison-amount').allTextContents()).toEqual(['0', '1', ...Array(10).fill('0')]);
  expect(await legend.innerText()).toContain('04.01.2026 – 31.01.2026');
  await histogram().locator('.comparison-column').nth(1).focus();
  expect(await histogram().getByRole('tooltip').innerText()).toBe('Համեմատություն՝ 04.01.2026 – 31.01.2026 · 1 գործարք · 200 ֏');
  await page.getByLabel('Կնքման ժամանակահատված՝ Մինչև', { exact: true }).fill('');
  expect(await checkbox.isDisabled()).toBe(true);
  expect(await histogram().locator('.comparison-column').count()).toBe(0);
  await period.selectOption('quick');
  await page.getByRole('combobox', { name: 'Արագ ընտրություն', exact: true }).selectOption('all');
  expect(await checkbox.isDisabled()).toBe(true);
  expect(await histogram().locator('.comparison-column').count()).toBe(0);
});
