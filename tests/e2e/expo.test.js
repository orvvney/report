const titles = ['Հետաքրքրված հաճախորդներ', 'Անմիջապես գրանցված գործարքներ', 'Հետաքրքրությունից դեպի գործարք'];
const ids = ['expo-leads', 'expo-direct-deals', 'expo-deals'];
const makeRows = (entity, offset) => ['2026-10-31', '2026-11-01', '2026-11-13', '2026-11-14'].map((date, i) => ({ id: offset + i, date, title: 'Internal title', customerName: `Person ${offset + i}`, stageId: 'NEW', stageName: entity === 'lead' ? 'Նոր լիդ' : 'Նոր գործարք', url: `https://portal.example/crm/${entity}/details/${offset + i}/` }));
const data = { sourceId: 'UC_TOON_EXPO', updatedAt: '2026-11-13T10:00:00Z', leads: makeRows('lead', 1), directDeals: makeRows('deal', 11), deals: makeRows('deal', 21) };
const column = index => page.locator('.expo-column').filter({ has: page.getByRole('heading', { name: titles[index], exact: true }) });
const openLists = async () => { await page.locator('.expo-panel > .expo-lists > button').click(); };
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
  await toggle.focus(); await page.keyboard.press('Enter');
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
