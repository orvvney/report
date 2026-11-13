const titles = ['Հետաքրքրված հաճախորդներ', 'Անմիջապես գրանցված գործարքներ', 'Հետաքրքրությունից դեպի գործարք'];
const ids = ['expo-leads', 'expo-direct-deals', 'expo-deals'];
const makeRows = (entity, offset) => ['2025-01-01', '2026-11-12', '2026-11-13', '2026-11-14'].map((date, i) => ({ id: offset + i, date, title: 'Internal title', customerName: `Person ${offset + i}`, url: `https://portal.example/crm/${entity}/details/${offset + i}/` }));
const data = { sourceId: 'UC_TOON_EXPO', updatedAt: '2026-11-13T10:00:00Z', leads: makeRows('lead', 1), directDeals: makeRows('deal', 11), deals: makeRows('deal', 21) };
const column = index => page.getByRole('region', { name: titles[index], exact: true });
const list = index => page.getByRole('region', { name: `${titles[index]}՝ ցանկ`, exact: true });
async function expandLists() { const toggle = page.locator('.expo-lists .deals-list-toggle'); if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click(); }
beforeEach(async () => { await page.clock.setFixedTime(new Date('2026-11-13T10:00:00Z')); await page.route('**/api/toon-expo*', route => route.fulfill({ json: data })); });

test.each([0, 1, 2])('filters column %s independently before and from November 13, 2026', async index => {
  await page.goto('/#toon-expo'); await page.getByTestId(ids[index]).waitFor(); await expandLists();
  expect(await page.locator('.expo-panel select').count()).toBe(0);
  const current = column(index).getByRole('button', { name: 'Ներկայիս Տուն Էքսպո', exact: true });
  const past = column(index).getByRole('button', { name: 'Անցած Տուն Էքսպոներ', exact: true });
  expect(await current.getAttribute('aria-pressed')).toBe('true');
  expect(await list(index).locator('tbody td:nth-child(2)').allTextContents()).toEqual(['14.11.2026', '13.11.2026']);
  await past.click(); expect(await past.getAttribute('aria-pressed')).toBe('true');
  expect(await list(index).locator('tbody td:nth-child(2)').allTextContents()).toEqual(['12.11.2026', '01.01.2025']);
  for (let other = 0; other < 3; other++) if (other !== index) expect(await list(other).locator('tbody td:nth-child(2)').allTextContents()).toEqual(['14.11.2026', '13.11.2026']);
  await current.click(); expect(await list(index).locator('tbody td:nth-child(2)').allTextContents()).toEqual(['14.11.2026', '13.11.2026']);
});
test.each([390, 1440])('preserves shared header, column order, and responsive layout at %s px', async width => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/'); await page.getByTestId('statistics-count').waitFor();
  const header = await page.locator('.report-header').boundingBox();
  const gap = await page.evaluate(() => document.querySelector('.report-top-panels').getBoundingClientRect().top - document.querySelector('.report-header').getBoundingClientRect().bottom);
  await page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true }).click(); await page.getByRole('menuitem', { name: 'Տուն Էքսպո', exact: true }).click(); await page.getByTestId('expo-leads').waitFor();
  expect(page.context().pages()).toHaveLength(1); expect(page.url()).toMatch(/#toon-expo$/);
  expect(await page.locator('.report-header').boundingBox()).toEqual(header);
  expect(await page.evaluate(() => document.querySelector('.expo-panel').getBoundingClientRect().top - document.querySelector('.report-header').getBoundingClientRect().bottom)).toBeCloseTo(gap, 0);
  expect(await page.locator('.expo-column-title').allTextContents()).toEqual(titles);
  const boxes = await page.locator('.expo-column').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(), f = el.querySelector('.expo-event-filter').getBoundingClientRect(), h = el.querySelector('h3').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, filterY: f.y, filterCenter: f.x + f.width / 2, headingCenter: h.x + h.width / 2 }; }));
  for (const b of boxes) { expect(b.width).toBeCloseTo(boxes[0].width, 0); expect(b.filterCenter).toBeCloseTo(b.headingCenter, 0); if (width > 900) { expect(b.y).toBe(boxes[0].y); expect(b.filterY).toBe(boxes[0].filterY); } }
  await expandLists(); expect(await page.locator('.expo-records').count()).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/expo-${width}.png`, fullPage: true });
  await page.reload(); await page.getByTestId('expo-leads').waitFor();
  expect(await page.locator('.expo-lists .deals-list-toggle').getAttribute('aria-expanded')).toBe('false');
  await page.goBack(); await page.getByTestId('statistics-count').waitFor({ state: 'visible' });
});
test('places one collapsed list block inside the bottom of the summary with three aligned lists, names and sortable dates', async () => {
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  expect(await page.locator('.expo-panel > .expo-lists').count()).toBe(1);
  const toggle = page.locator('.expo-lists .deals-list-toggle'); expect(await toggle.innerText()).toBe('Ցանկ'); expect(await toggle.getAttribute('aria-expanded')).toBe('false');
  const panel = await page.locator('.expo-panel').boundingBox(), columns = await page.locator('.expo-columns').boundingBox(), block = await page.locator('.expo-lists').boundingBox(); expect(block.y).toBeGreaterThanOrEqual(columns.y + columns.height); expect(block.y + block.height).toBeLessThanOrEqual(panel.y + panel.height);
  await expandLists();
  const boxes = await page.locator('.expo-records').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return [r.y, r.width]; }));
  for (const box of boxes) { expect(box[0]).toBeCloseTo(boxes[0][0], 0); expect(box[1]).toBeCloseTo(boxes[0][1], 0); }
  for (let i = 0; i < 3; i++) {
    expect(await list(i).locator('tbody a').first().innerText()).toMatch(/^Person /);
    expect(await list(i).locator('tbody a').first().innerText()).not.toContain('#');
    expect(await list(i).locator('tbody td:nth-child(2)').allTextContents()).toEqual(['14.11.2026', '13.11.2026']);
    await list(i).getByRole('button', { name: /Ստեղծման ամսաթիվ/ }).click();
    expect(await list(i).locator('tbody td:nth-child(2)').allTextContents()).toEqual(['13.11.2026', '14.11.2026']);
  }
  await toggle.click(); expect(await page.locator('#expo-lists-content').isVisible()).toBe(false);
});
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
test('never restores converted customers to first column when another period is selected in third', async () => {
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, deals: data.deals.map(row => ({ ...row, leadId: 3 })) } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  expect(await page.getByTestId('expo-leads').innerText()).toBe('1');
  await column(2).getByRole('button', { name: 'Անցած Տուն Էքսպոներ', exact: true }).click();
  expect(await page.getByTestId('expo-leads').innerText()).toBe('1');
  await expandLists(); expect(await list(0).getByRole('link', { name: 'Person 3', exact: true }).count()).toBe(0);
});
test('shows safe load errors and retries, refreshes data while preserving independent selections', async () => {
  await page.unroute('**/api/toon-expo*'); let fail = true; const requests = [];
  await page.route('**/api/toon-expo*', route => { requests.push(route.request().url()); return route.fulfill(fail ? { status: 502, json: { error: 'CRM_READ_ERROR' } } : { json: data }); });
  await page.goto('/#toon-expo'); await page.getByRole('alert').waitFor(); expect(await page.getByTestId('expo-leads').isVisible()).toBe(false);
  fail = false; await page.getByRole('button', { name: 'Կրկին փորձել', exact: true }).click(); await page.getByTestId('expo-leads').waitFor();
  await column(1).getByRole('button', { name: 'Անցած Տուն Էքսպոներ', exact: true }).click();
  await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click(); await page.getByTestId('expo-leads').waitFor();
  expect(await column(1).getByRole('button', { name: 'Անցած Տուն Էքսպոներ', exact: true }).getAttribute('aria-pressed')).toBe('true'); expect(requests).toHaveLength(3); expect(requests[2]).toContain('?refresh=1');
});
test('resets only its own list page when switching exhibition and supports missing names', async () => {
  const many = Array.from({ length: 26 }, (_, i) => ({ ...data.leads[3], id: i + 100, customerName: i === 25 ? null : `Customer ${i}`, url: `https://portal.example/crm/lead/details/${i + 100}/` }));
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, leads: many, directDeals: many.map(row => ({ ...row, url: row.url.replace('/lead/', '/deal/') })) } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor(); await expandLists();
  expect(await list(0).getByRole('link', { name: 'Անունը նշված չէ', exact: true }).isVisible()).toBe(true);
  await list(0).getByRole('button', { name: 'Հաջորդ', exact: true }).click(); await list(1).getByRole('button', { name: 'Հաջորդ', exact: true }).click();
  await column(0).getByRole('button', { name: 'Անցած Տուն Էքսպոներ', exact: true }).click(); expect(await list(0).getByRole('status').innerText()).toBe('Տվյալներ չկան');
  await column(0).getByRole('button', { name: 'Ներկայիս Տուն Էքսպո', exact: true }).click(); expect(await list(0).getByText('1 / 2', { exact: true }).isVisible()).toBe(true); expect(await list(1).getByText('2 / 2', { exact: true }).isVisible()).toBe(true);
});

test('keeps all three tables and their column headers visible when there are no records', async () => {
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, leads: [], directDeals: [], deals: [] } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor(); await expandLists();
  for (let index = 0; index < 3; index++) {
    expect(await list(index).getByRole('table').isVisible()).toBe(true);
    expect(await list(index).getByRole('columnheader', { name: /Անուն \/ Ազգանուն/ }).isVisible()).toBe(true);
    expect(await list(index).getByRole('columnheader', { name: /Ստեղծման ամսաթիվ/ }).isVisible()).toBe(true);
    expect(await list(index).getByRole('status').innerText()).toBe('Տվյալներ չկան');
    expect(await list(index).locator('tbody td').getAttribute('colspan')).toBe('2');
  }
});
