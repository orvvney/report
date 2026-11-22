const titles = ['Հետաքրքրված հաճախորդներ', 'Անմիջապես գրանցված գործարքներ', 'Հետաքրքրությունից դեպի գործարք'];
const ids = ['expo-leads', 'expo-direct-deals', 'expo-deals'];
const makeRows = (entity, offset) => ['2026-10-31', '2026-11-01', '2026-11-13', '2026-11-14'].map((date, i) => ({ id: offset + i, date, title: 'Internal title', customerName: `Person ${offset + i}`, stageId: 'NEW', stageName: entity === 'lead' ? 'Նոր լիդ' : 'Նոր գործարք', url: `https://portal.example/crm/${entity}/details/${offset + i}/` }));
const data = { sourceId: 'UC_TOON_EXPO', updatedAt: '2026-11-13T10:00:00Z', leads: makeRows('lead', 1), directDeals: makeRows('deal', 11), deals: makeRows('deal', 21) };
const column = index => page.locator('.expo-column').filter({ has: page.getByRole('heading', { name: titles[index], exact: true }) });
const openLists = async () => { await page.locator('.expo-panel > .expo-lists > button').click(); await page.locator('.expo-records .deals-list-scroll').first().waitFor({state:'visible'}); };
const list = index => page.getByRole('region', { name: `${titles[index]}՝ ցանկ`, exact: true });
beforeEach(async () => { await page.clock.setFixedTime(new Date('2026-11-13T10:00:00Z')); await page.route('**/api/toon-expo*', route => route.fulfill({ json: data })); });

test.each([
  [0, 'Հետաքրքրված հաճախորդների մասին', 'expo-interested-help', 'Այս սյունակում ներկայացված են Տուն Էքսպոյից եկած հետաքրքրված հաճախորդները:'],
  [1, 'Անմիջապես գրանցված գործարքների մասին', 'expo-direct-help', 'Այս սյունակում ներկայացված են Տուն Էքսպոյից անմիջապես գրանցված գործարքները:'],
  [2, 'Հետաքրքրությունից գործարք դառնալու մասին', 'expo-converted-help', 'Այս սյունակում ներկայացված են հետաքրքրված հաճախորդներից ձևավորված գործարքները:'],
])('explains column %s with centered help on hover and keyboard focus', async (index, label, id, text) => {
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  const button = page.getByRole('button', { name: label, exact: true }), tooltip = page.locator(`#${id}`);
  expect(await tooltip.isVisible()).toBe(false); await button.hover(); expect(await tooltip.innerText()).toBe(text);
  const h = await column(index).locator('h3').boundingBox(), t = await tooltip.boundingBox(), b = await button.boundingBox();
  expect(t.x + t.width / 2).toBeCloseTo(h.x + h.width / 2, 0); expect(t.y).toBeGreaterThanOrEqual(h.y + h.height); expect(b.x).toBeGreaterThanOrEqual(h.x + h.width);
  await page.mouse.move(0, 300); expect(await tooltip.isVisible()).toBe(false); await button.focus(); expect(await tooltip.isVisible()).toBe(true); await page.keyboard.press('Escape'); expect(await tooltip.isVisible()).toBe(false); await button.click(); expect(await tooltip.isVisible()).toBe(true);
});
test.each([320, 390, 600])('phone keeps each collapsed list within its section and adapts heading help at %i', async width => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  for (let i = 0; i < 3; i++) {
    const index = [1, 0, 2][i];
    const section = column(index), records = list(index), toggle = section.getByRole('button', { name: 'Ցանկ', exact: true });
    if (i > 0) {
      const divider = await section.evaluate(el => { const s = getComputedStyle(el); return { width: s.borderTopWidth, color: s.borderTopColor, space: s.paddingTop, bottomSpace: getComputedStyle(el.previousElementSibling).paddingBottom }; });
      expect(divider).toEqual({ width: '1px', color: 'rgb(211, 223, 219)', space: '24px', bottomSpace: '24px' });
    }
    expect(await toggle.getAttribute('aria-expanded')).toBe('false');
    expect(await records.locator('.filter-help').count()).toBe(0);
    expect(await toggle.locator('.deals-list-count').innerText()).toBe('3');
    expect(await toggle.locator('.deals-list-chevron').isVisible()).toBe(true);
    const style = await section.locator('.expo-lists').evaluate(el => { const s = getComputedStyle(el); return { border: s.borderTopWidth, radius: s.borderRadius, shadow: s.boxShadow !== 'none' }; });
    expect(style).toEqual({ border: '1px', radius: '12px', shadow: true });
    expect(await records.locator('table').isVisible()).toBe(false);
    await toggle.click(); await records.locator('table').waitFor();
    expect(await records.locator('.expo-record-row td:nth-child(2)').allInnerTexts()).toEqual(['14.11.26', '13.11.26', '01.11.26']);
    expect(await records.locator('tbody a').first().innerText()).toMatch(/^Person\s*\n\d+$/);
    const box = await records.boundingBox(), summary = await section.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(summary.y + summary.height);
    if (i < 2) expect((await column([1, 0, 2][i + 1]).boundingBox()).y).toBeGreaterThanOrEqual(box.y + box.height);
    const heading = await section.locator('h3').boundingBox(), help = await section.locator('.filter-help').boundingBox();
    const multiline = await section.locator('.filter-title').evaluate(el => el.classList.contains('is-multiline'));
    const total = await section.locator('.expo-totals').boundingBox();
    const bottomElement = multiline ? help : heading;
    expect(total.y - bottomElement.y - bottomElement.height).toBeCloseTo(24, 0);
    if (multiline) {
      expect(help.y).toBeGreaterThanOrEqual(heading.y + heading.height);
      expect(help.x + help.width / 2).toBeCloseTo(heading.x + heading.width / 2, 0);
    } else {
      expect(help.x).toBeGreaterThanOrEqual(heading.x + heading.width);
      expect(help.y + help.height / 2).toBeCloseTo(heading.y + heading.height / 2, 0);
    }
    await toggle.click(); expect(await records.locator('table').isVisible()).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/expo-mobile-${width}.png`, fullPage: true });
});

test.each([390, 768, 1440])('shows the renamed November section, reordered columns and no period controls at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/'); await page.getByTestId('statistics-count').waitFor();
  await page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Տուն Էքսպո Նոյեմբեր 2026', exact: true }).click();
  await page.getByTestId('expo-leads').waitFor();
  expect(await page.locator('.report-header-subtitle').textContent()).toBe('Տուն Էքսպո Նոյեմբեր 2026');
  expect(await page.locator('.expo-column-title').allTextContents()).toEqual([titles[1], titles[0], titles[2]]);
  expect(await page.locator('.expo-event-filter, .expo-panel select').count()).toBe(0);
  expect(await page.locator('.expo-totals').allTextContents()).toEqual(['3', '3', '3']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/expo-${width}.png`, fullPage: true });
});

test.each([640, 900, 1440])('toggles all desktop tables together with one keyboard-accessible control at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  const toggle = page.locator('.expo-panel > .expo-lists > button');
  expect(await page.locator('.expo-lists .expo-records-toggle').count()).toBe(1);
  expect(await toggle.getAttribute('aria-expanded')).toBe('false');
  expect(await toggle.getAttribute('aria-controls')).toBe('expo-lists-content');
  expect(await toggle.locator('.deals-list-count').count()).toBe(0);
  expect(await toggle.locator('.expo-records-title').innerText()).toBe('Ցանկ');
  const bounds = await toggle.boundingBox(), label = await toggle.locator('.expo-records-title').boundingBox(), arrow = await toggle.locator('.deals-list-chevron').boundingBox();
  expect(arrow.x - label.x - label.width).toBeCloseTo(12, 0);
  expect((label.x + arrow.x + arrow.width) / 2).toBeCloseTo(bounds.x + bounds.width / 2, 0);
  for (let i = 0; i < 3; i++) expect(await list(i).locator('table').isVisible()).toBe(false);
  await toggle.focus(); await page.keyboard.press('Enter'); await list(0).locator('.deals-list-scroll').waitFor({state:'visible'});
  expect(await toggle.getAttribute('aria-expanded')).toBe('true');
  for (let i = 0; i < 3; i++) expect(await list(i).locator('table').isVisible()).toBe(true);
  await page.keyboard.press('Space');
  for (let i = 0; i < 3; i++) expect(await list(i).locator('table').isVisible()).toBe(false);
  await page.screenshot({ path: `test-results/expo-collapsed-${width}.png`, fullPage: true });
});

test('applies November creation date and stage filters to all counters and tables', async () => {
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: {
    ...data,
    leads: [...data.leads, { ...data.leads[2], id: 100, stageName: 'Մերժված' }, { ...data.leads[2], id: 101, stageName: null }],
    directDeals: [...data.directDeals, { ...data.directDeals[2], id: 200, stageName: 'Մերժված' }],
    deals: [...data.deals, { ...data.deals[2], id: 300, stageName: 'Կնքված.' }],
  } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor(); await openLists();
  expect(await page.getByTestId('expo-leads').innerText()).toBe('3');
  expect(await page.getByTestId('expo-direct-deals').innerText()).toBe('3');
  expect(await page.getByTestId('expo-deals').innerText()).toBe('4');
  expect(await list(0).locator('.expo-record-row td:nth-child(2)').allTextContents()).toEqual(['14.11.2026', '13.11.2026', '01.11.2026']);
  expect(await page.locator('.expo-records').evaluateAll(nodes => nodes.map(el => el.getAttribute('aria-label')))).toEqual([titles[1], titles[0], titles[2]].map(title => `${title}՝ ցանկ`));
});

test.each([390, 1440])('paginates each list independently with at most ten rows at %i px', async width => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ ...data.leads[3], id: i + 100, customerName: i === 20 ? null : `Customer ${i}` }));
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, leads: rows, directDeals: rows.map(row => ({ ...row, stageName: 'Նոր գործարք' })) } }));
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  if (width >= 640) await openLists();
  else for (const i of [0, 1]) await list(i).getByRole('button', { name: 'Ցանկ', exact: true }).click();
  for (const i of [0, 1]) {
    expect(await list(i).locator('.expo-record-row').count()).toBe(10);
    expect(await list(i).getByText('1 / 3', { exact: true }).isVisible()).toBe(true);
  }
  expect(await list(0).getByRole('link', { name: 'Անունը նշված չէ', exact: true }).isVisible()).toBe(true);
  await list(0).getByRole('button', { name: 'Հաջորդ', exact: true }).click();
  expect(await list(0).locator('.expo-record-row').count()).toBe(10);
  expect(await list(1).getByText('1 / 3', { exact: true }).isVisible()).toBe(true);
  await list(0).getByRole('button', { name: 'Հաջորդ', exact: true }).click();
  expect(await list(0).locator('.expo-record-row').count()).toBe(1);
  await list(0).getByRole('button', { name: /Հաճախորդ/ }).click();
  expect(await list(0).getByText('1 / 3', { exact: true }).isVisible()).toBe(true);
});

test('empty lists preserve table headers after expanding', async () => {
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, leads: [], directDeals: [], deals: [] } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor(); await openLists();
  for (let i = 0; i < 3; i++) {
    expect(await list(i).getByRole('columnheader').count()).toBe(3);
    expect(await list(i).getByRole('status').innerText()).toBe('Տվյալներ չկան');
    expect(await list(i).locator('.expo-empty-row td').getAttribute('colspan')).toBe('3');
  }
});

test('refresh hides stale records, preserves the common toggle and recovers after errors', async () => {
  await page.unroute('**/api/toon-expo*'); let fail = false;
  await page.route('**/api/toon-expo*', route => route.fulfill(fail ? { status: 502, json: { error: 'CRM_READ_ERROR' } } : { json: data }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor(); await openLists();
  fail = true; await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click(); await page.getByRole('alert').waitFor();
  expect(await page.locator('.expo-records tbody tr').count()).toBe(0);
  fail = false; await page.getByRole('button', { name: 'Կրկին փորձել', exact: true }).click(); await page.getByTestId('expo-leads').waitFor();
  expect(await page.locator('.expo-panel > .expo-lists > button').getAttribute('aria-expanded')).toBe('true');
  expect(await list(0).locator('table').isVisible()).toBe(true);
});

test.each([390, 1440])('keeps ten row slots, equal list heights and sticky column headings at %i px', async width => {
  const rows = Array.from({ length: 11 }, (_, i) => ({ ...data.leads[3], id: i + 100, customerName: `Customer ${i}` }));
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, leads: rows, directDeals: [], deals: data.deals.slice(-1) } }));
  await page.setViewportSize({ width, height: 600 }); await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  if (width >= 640) await openLists();
  else for (let i = 0; i < 3; i++) await list(i).getByRole('button', { name: 'Ցանկ', exact: true }).click();
  const heights = [];
  for (let i = 0; i < 3; i++) {
    expect(await list(i).locator('tbody tr').count()).toBe(10);
    heights.push((await list(i).locator('.expo-records-content').boundingBox()).height);
  }
  for (const height of heights) expect(height).toBeCloseTo(heights[0], 0);
  const initial = await list(0).locator('.expo-records-content').boundingBox();
  await list(0).getByRole('button', { name: 'Հաջորդ', exact: true }).click();
  expect(await list(0).locator('.expo-record-row').count()).toBe(1);
  expect(await list(0).locator('.expo-placeholder-row').count()).toBe(9);
  expect((await list(0).locator('.expo-records-content').boundingBox()).height).toBeCloseTo(initial.height, 0);
  const scroller = list(0).locator('.deals-list-scroll');
  expect(await scroller.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  const rowHeights = await list(0).locator('tbody tr').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().height));
  for (const height of rowHeights) expect(height).toBeCloseTo(72, 0);
  const areaHeight = (await scroller.boundingBox()).height;
  expect(areaHeight).toBeCloseTo(720 + (await list(0).locator('thead').boundingBox()).height, 0);
  await scroller.evaluate(el => window.scrollTo(0, scrollY + el.getBoundingClientRect().top + 180));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await list(0).getByRole('columnheader').first().boundingBox();
  expect(after.y).toBeCloseTo(0, 0);
  expect(await scroller.evaluate(el => el.scrollTop)).toBe(0);
  await page.screenshot({ path: `test-results/expo-sticky-${width}.png`, fullPage: true });
});

test.each([320, 375, 1440])('comparison shows monthly average and total after lists at %i px', async width => {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data,
    createdDealsComparison: { baselineCount: 11, baselineMonths: 5, baselineMonthlyAverage: 2.2, expoCount: 7 },
  } }));
  await page.goto('/#toon-expo');
  const chart = page.locator('.expo-comparison');
  await chart.getByTestId('expo-comparison-value').first().waitFor();
  expect(await chart.getByTestId('expo-comparison-value').allTextContents()).toEqual([await page.evaluate(() => new Intl.NumberFormat('hy-AM', { maximumFractionDigits: 2 }).format(2.2)), '7']);
  expect(await chart.locator('.expo-comparison-labels').innerText()).toBe('Միջին ամսական գործարքների քանակ\nՏուն Էքսպո · ընդհանուր գործարքների քանակ');
  expect(await chart.innerText()).not.toContain('01.06.2026–31.10.2026');
  expect(await chart.innerText()).not.toContain('01.11.2026-ից');
  expect(await chart.innerText()).not.toContain('գործարք / ամիս');
  expect(await chart.innerText()).not.toContain('Բոլոր աղբյուրները · 5 ամիս');
  expect(await chart.innerText()).not.toContain('Գործարքի աղբյուրը՝ Տուն Էքսպո');
  const heading = chart.getByRole('heading', { name: 'Ավելացված գործարքների համեմատություն', exact: true });
  expect(await heading.evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).fontWeight]))
    .toEqual(['14px', '600']);
  expect(await chart.locator('svg').evaluate(el => el.getBoundingClientRect().height)).toBe(380);
  expect(await chart.getByTestId('expo-comparison-value').first().getAttribute('font-size')).toBe('14');
  const help = chart.getByRole('button', { name: 'Ավելացված գործարքների համեմատության մասին' });
  const tooltip = chart.getByRole('tooltip');
  await help.focus();
  expect(await tooltip.isVisible()).toBe(true);
  expect(await tooltip.innerText()).toContain('Տուն Էքսպոյի ընթացքում');
  await page.keyboard.press('Escape');
  expect(await tooltip.isVisible()).toBe(false);
  await help.click();
  expect(await tooltip.isVisible()).toBe(true);
  await help.blur();
  await page.mouse.move(0, 0);
  const titleBox = await heading.boundingBox(), helpBox = await help.boundingBox(), chartBox = await chart.boundingBox();
  expect((titleBox.x + helpBox.x + helpBox.width) / 2).toBeCloseTo(chartBox.x + chartBox.width / 2, 0);
  const stages = await page.locator('.expo-stages').boundingBox();
  const firstHeading = await page.locator('.expo-column-title').first().boundingBox();
  expect(firstHeading.y).toBeGreaterThan(stages.y + stages.height);
  for (const column of await page.locator('.expo-column').all()) {
    const title = await column.locator('h3').boundingBox();
    const total = await column.locator('.expo-totals').boundingBox();
    const stackedHelp = width < 640 && await column.locator('.filter-title').evaluate(el => el.classList.contains('is-multiline'));
    const bottomElement = stackedHelp ? await column.locator('.filter-help').boundingBox() : title;
    expect(total.y - bottomElement.y - bottomElement.height).toBeCloseTo(24, 0);
  }
  const labelStyle = await chart.locator('.expo-comparison-labels h3').first().evaluate(el => {
    const style = getComputedStyle(el);
    return [style.fontSize, style.fontWeight, style.color];
  });
  expect(labelStyle).toEqual(['14px', '500', 'rgb(67, 76, 93)']);
  const panelBox = await page.locator('.expo-panel').boundingBox();
  const sectionGap = await page.locator('.report-page').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--section-gap')));
  expect(chartBox.y - panelBox.y - panelBox.height).toBeCloseTo(sectionGap, 0);
  expect(chartBox.x).toBeCloseTo(panelBox.x, 0);
  expect(chartBox.width).toBeCloseTo(panelBox.width, 0);
  const bars = chart.locator('rect');
  const first = await bars.nth(0).boundingBox(), second = await bars.nth(1).boundingBox();
  const labelBox = await chart.locator('.expo-comparison-labels').boundingBox();
  const svgBox = await chart.locator('svg').boundingBox();
  const titleGap = titleBox.y - chartBox.y;
  expect(labelBox.y - (svgBox.y + 310)).toBeCloseTo(titleGap, 0);
  const textBoxes = await chart.locator('.expo-comparison-labels h3').evaluateAll(elements =>
    elements.map(el => { const box = el.getBoundingClientRect(); return { bottom: box.bottom }; }));
  expect(chartBox.y + chartBox.height - Math.max(...textBoxes.map(box => box.bottom))).toBeCloseTo(titleGap, 0);
  expect(first.x).toBeLessThan(second.x);
  expect(first.height / second.height).toBeCloseTo(2.2 / 7, 3);
  const lists = page.locator(width < 640 ? '.expo-column .expo-lists' : '.expo-panel > .expo-lists');
  const lastList = await lists.last().boundingBox();
  expect((await chart.boundingBox()).y).toBeGreaterThanOrEqual(lastList.y + lastList.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/expo-comparison-' + width + '.png', fullPage: true });
});

test('comparison hides stale values during refresh and errors and recovers with zero totals', async () => {
  let release;
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data,
    createdDealsComparison: { baselineCount: 11, baselineMonths: 5, baselineMonthlyAverage: 2.2, expoCount: 7 },
  } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-comparison-value').first().waitFor();
  await page.route('**/api/toon-expo*', async route => {
    await new Promise(resolve => { release = resolve; }); await route.fulfill({ status: 502, json: { error: 'CRM_READ_ERROR' } });
  });
  await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Տվյալները բեռնվում են' }).first().waitFor();
  expect(await page.locator('.expo-comparison').count()).toBe(0);
  release();
  await page.getByRole('alert').waitFor();
  expect(await page.locator('.expo-comparison').count()).toBe(0);
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data,
    createdDealsComparison: { baselineCount: 0, baselineMonths: 5, baselineMonthlyAverage: 0, expoCount: 0 },
  } }));
  await page.getByRole('button', { name: 'Կրկին փորձել', exact: true }).click();
  await page.getByTestId('expo-comparison-value').first().waitFor();
  expect(await page.getByTestId('expo-comparison-value').allTextContents()).toEqual(['0', '0']);
});

test('direct Expo opening defers apartment deal data until the first visit and preserves data through history navigation', async () => {
  const paths=[];
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/'))paths.push(path);});
  await page.goto('/#toon-expo');
  await page.getByTestId('expo-leads').waitFor({state:'visible'});
  expect(paths.filter(path=>path==='/api/report')).toEqual([]);
  const stageRequests = () => paths.filter(path => ['/api/property-stages','/api/parking-stages'].includes(path));
  const stagePanels = page.locator('.property-stage-panels-inline:not(.expo-stages), #floating-property-stages');
  expect(stageRequests()).toEqual([]);
  expect(await stagePanels.count()).toBe(0);
  await page.getByRole('button',{name:'Հաշվետվությունների տեսակ',exact:true}).click();
  await page.getByRole('menuitem',{name:'Կնքված բնակարաններ',exact:true}).click();
  await page.getByTestId('statistics-count').waitFor({state:'visible'});
  await page.locator('.property-stage-panels-inline .property-stages article').first().waitFor();
  expect(paths.filter(path=>path==='/api/report')).toHaveLength(1);
  expect(paths.filter(path=>path==='/api/property-stages')).toHaveLength(1);
  await page.goBack();
  await page.getByTestId('expo-leads').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Թարմացնել ամբողջ հաշվետվությունը',exact:true}).click();
  await page.getByTestId('expo-leads').waitFor({state:'visible'});
  expect(paths.filter(path=>path==='/api/report')).toHaveLength(1);
  expect(stageRequests()).toEqual(['/api/property-stages']);
  expect(await stagePanels.count()).toBe(0);
  await page.goForward();
  await page.getByTestId('statistics-count').waitFor({state:'visible'});
  expect(paths.filter(path=>path==='/api/report')).toHaveLength(1);
});

test.each([320, 390, 1440])('shows Expo stage distributions and highlights the result at %i px', async width => {
  await page.setViewportSize({ width, height: 850 });
  const salesStages = ['Ազատ', 'Ռեզերվ', 'Վաճառքի ընթացքում', 'Վաճառված'];
  const counts = values => salesStages.map((name, index) => ({
    id: `stage-${index}`, name, count: values[index] ?? 0,
  }));
  await page.route('**/api/expo-stages', route => route.fulfill({
    json: { stages: counts([83, 0, 0, 490]), after: counts([47, 2, 0, 490]) },
  }));
  await page.goto('/#toon-expo');
  const stages = page.getByRole('region', { name: width < 640 ? 'Առաջ ու հետո' : 'Տուն Էքսպոյից առաջ ու հետո', exact: true });
  const card = stages.locator('article').first();
  await card.waitFor();
  expect(await stages.locator('article h3').allTextContents()).toEqual(salesStages);
  expect(await stages.getByRole('button', { name: /^(Առաջ|Հետո)$/ }).count()).toBe(0);
  const beforeTrack = stages.getByRole('group', { name: 'Առաջ', exact: true });
  const afterTrack = stages.getByRole('group', { name: 'Հետո', exact: true });
  expect(await beforeTrack.getByRole('button').count()).toBe(2);
  expect(await afterTrack.getByRole('button').count()).toBe(3);
  const segment = beforeTrack.getByRole('button', { name: 'Ազատ՝ 83', exact: true });
  const track = beforeTrack.locator('.property-stage-track');
  expect((await segment.boundingBox()).width / (await track.boundingBox()).width).toBeCloseTo(83 / 573, 2);
  await segment.focus();
  expect(await beforeTrack.getByRole('tooltip').innerText()).toBe('Ազատ՝ 83');
  await page.keyboard.press('Escape');
  expect(await beforeTrack.getByRole('tooltip').count()).toBe(0);
  expect(await stages.locator('.property-stage-share').count()).toBe(0);
  const totals = stages.locator('.expo-total-values');
  expect((await totals.textContent()).replace(/\s+/g, ' ').trim()).toBe('573 → 539');
  const offsets = await totals.evaluate(node => {
    const center = item => {
      const bounds = item.getBoundingClientRect();
      return bounds.top + bounds.height / 2;
    };
    const arrowCenter = center(node.querySelector('svg'));
    return [...node.querySelectorAll('span:not(.sr-only)')].map(item => center(item) - arrowCenter);
  });
  expect(offsets).toEqual([expect.closeTo(0, 1), expect.closeTo(0, 1)]);
  expect(await stages.locator('.expo-stage-baseline').allTextContents()).toEqual(['Առաջ՝ 83', 'Առաջ՝ 0', 'Առաջ՝ 0', 'Առաջ՝ 490']);
  expect(await card.locator('.expo-stage-result').textContent()).toBe('Հետո՝ 47');
  expect(await card.locator('.expo-stage-result .sr-only').evaluate(node => getComputedStyle(node).clipPath))
    .toBe('inset(50%)');
  expect(await card.locator('.expo-stage-result svg').count()).toBe(0);
  const deltas = stages.locator('.expo-stage-delta');
  expect((await deltas.allTextContents()).map(value => value.trim()))
    .toEqual([expect.stringMatching(/^−36 \(−43[.,]4%\)$/), '+2 (—)', '0 (0%)', '0 (0%)']);
  const shareMeter = card.getByRole('meter', { name: 'Մասնաբաժինը ընդհանուրում' });
  expect(await card.locator('.expo-stage-share-percent').innerText()).toMatch(/^8[.,]7%$/);
  expect(Number(await shareMeter.getAttribute('aria-valuenow'))).toBeCloseTo(100 * 47 / 539, 3);
  const shareBox = await shareMeter.boundingBox();
  const markerBox = await shareMeter.locator('.expo-stage-share-marker').boundingBox();
  expect(shareBox.height).toBe(8);
  expect(markerBox.height).toBe(16);
  await shareMeter.hover();
  expect(await shareMeter.getByRole('tooltip').innerText()).toMatch(/Նշագիծը ցույց է տալիս\u00a0նախկին մասնաբաժինը՝/);
  expect((markerBox.x + markerBox.width / 2 - shareBox.x) / shareBox.width).toBeCloseTo(83 / 573, 2);
  expect(await card.locator('.expo-stage-share > p').evaluate(node => getComputedStyle(node).textAlign)).toBe('start');
  expect((await shareMeter.locator('.expo-stage-share-fill').boundingBox()).width / shareBox.width)
    .toBeCloseTo(47 / 539, 2);
  expect(await deltas.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor)))
    .toEqual(salesStages.map(() => 'rgb(238, 240, 242)'));
  expect(await deltas.locator('svg').count()).toBe(salesStages.length);
  expect(await stages.locator('article .property-stage-card-stripe').count()).toBe(salesStages.length);
  const cardTrack = card.locator('.property-stage-card-stripe');
  expect((await cardTrack.boundingBox()).width).toBeCloseTo((await card.boundingBox()).width - 2, 1);
  const [resultSize, baselineSize] = await card.locator('.expo-stage-values > p')
    .evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
  expect(resultSize).toBeGreaterThan(baselineSize);
  await page.getByTestId('expo-direct-deals').waitFor();
  const titleSize = await stages.locator('h2').evaluate(node => getComputedStyle(node).fontSize);
  expect(titleSize).toBe('14px');
  expect(await page.locator('.expo-column-title').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontSize)))
    .toEqual([titleSize, titleSize, titleSize]);
  expect(await page.locator('.expo-totals strong').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize))))
    .toEqual([resultSize, resultSize, resultSize]);
  expect(await stages.locator('article h3').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontSize)))
    .toEqual(salesStages.map(() => '14px'));
  expect(await stages.locator('article h3').evaluateAll(nodes => nodes.map(node =>
    [getComputedStyle(node).justifyContent, getComputedStyle(node, '::before').content])))
    .toEqual(salesStages.map(() => ['flex-start', '""']));
  expect(baselineSize).toBe(12);
  const insets = await stages.locator('article').evaluateAll(cards => cards.map(card => {
    const cardBox = card.getBoundingClientRect(), valuesBox = card.querySelector('.expo-stage-values').getBoundingClientRect();
    const titleBox = card.querySelector('h3').getBoundingClientRect();
    return {
      gap: valuesBox.top - titleBox.bottom,
      above: titleBox.top - cardBox.top,
      below: cardBox.bottom - card.querySelector('.expo-stage-share').getBoundingClientRect().bottom,
    };
  }));
  for (const { gap, above, below } of insets) {
    expect(above).toBeCloseTo(gap, 1);
    expect(below).toBeCloseTo(gap, 1);
  }
  const rowLayout = await stages.locator('article').evaluateAll(cards => {
    const panel = cards[0].closest('.property-stages');
    const headingInset = panel.querySelector('h2').getBoundingClientRect().left - panel.getBoundingClientRect().left;
    return cards.map(card => {
      const frame = card.getBoundingClientRect();
      const result = card.querySelector('.expo-stage-result').getBoundingClientRect();
      const baseline = card.querySelector('.expo-stage-baseline').getBoundingClientRect();
      const titleLeft = card.querySelector('h3 span').getBoundingClientRect().left;
      const delta = card.querySelector('.expo-stage-delta').getBoundingClientRect();
      const share = card.querySelector('.expo-stage-share').getBoundingClientRect();
      return {
        titleInsetError: titleLeft - frame.left - headingInset,
        sameRow: baseline.left >= result.right && baseline.bottom > result.top && baseline.right <= frame.right,
        aligned: [result.left, delta.left, share.left].every(left => Math.abs(left - titleLeft) < 0.1),
        shareBelowDelta: share.top > delta.bottom,
      };
    });
  });
  expect(rowLayout).toEqual(salesStages.map(() => ({
    titleInsetError: expect.closeTo(width < 640 ? 4 : 0, 1), sameRow: true, aligned: true, shareBelowDelta: true,
  })));
  if (width < 640) {
    expect(await stages.locator('.property-stages-total, .property-stages-total strong').evaluateAll(nodes =>
      nodes.map(node => [getComputedStyle(node).fontSize, getComputedStyle(node).fontWeight])))
      .toEqual([['14px', '600'], ['14px', '600']]);
    expect(await page.locator('.expo-column-title, .expo-records-title').evaluateAll(nodes =>
      nodes.every(node => getComputedStyle(node).fontSize === '14px' && getComputedStyle(node).fontWeight === '600'))).toBe(true);
    const heights = await stages.locator('article').evaluateAll(cards => cards.map(item => item.getBoundingClientRect().height));
    expect(heights[3]).toBeCloseTo(heights[2], 1);
    const titleCenters = await stages.locator('article h3 span').evaluateAll(items => items.map(item => {
      const bounds = item.getBoundingClientRect();
      return bounds.top + bounds.height / 2;
    }));
    expect(titleCenters[3]).toBeCloseTo(titleCenters[2], 1);
    for (const selector of ['.expo-stage-result', '.expo-stage-baseline', '.expo-stage-delta']) {
      const positions = await stages.locator(selector).evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
      expect(positions[3]).toBeCloseTo(positions[2], 1);
    }
  }
  expect(await stages.getByText('Մինչև 01.11.2026 · Բոլոր աղբյուրները', { exact: true }).count()).toBe(0);
  expect(await stages.getByText('01.11.2026-ից · Տուն Էքսպո', { exact: true }).count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stages.screenshot({ path: `test-results/expo-stage-periods-${width}.png` });
  await page.goto('/#parking');
  const parkingCard = page.locator('.property-stage-panels-inline .property-stages article').filter({
    has: page.getByRole('heading', { name: 'Վաճառքի ընթացքում', exact: true }),
  });
  await parkingCard.waitFor();
  await page.waitForFunction(() => document.querySelector('.report-page').style.getPropertyValue('--stage-heading-inset') !== '');
  const titleInset = await parkingCard.evaluate(async card => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return card.querySelector('h3').getBoundingClientRect().top - card.getBoundingClientRect().top;
  });
  expect(insets.map(({ gap }) => gap)).toEqual(salesStages.map(() => expect.closeTo(titleInset, 1)));
});
