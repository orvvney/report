const data = { sourceId: '305', updatedAt: '2026-11-13T10:00:00Z', leads: [
  { id: 1, title: 'Առաջին', date: '2026-01-01', url: 'https://portal.example/crm/lead/details/1/' },
  { id: 2, title: 'Երկրորդ', date: '2026-01-02', url: 'https://portal.example/crm/lead/details/2/' },
], deals: [
  { id: 11, title: 'A', date: '2026-01-01', url: 'https://portal.example/crm/deal/details/11/' },
  { id: 12, title: 'B', date: '2026-01-03', url: 'https://portal.example/crm/deal/details/12/' },
  { id: 13, title: 'C', date: '2026-02-01', url: 'https://portal.example/crm/deal/details/13/' },
] };
async function open() {
  await page.getByRole('button', { name: 'Անշարժ գույքի տեսակ', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Տուն Էքսպո', exact: true }).click();
  await page.getByTestId('expo-leads').waitFor();
}
beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00Z'));
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: data }));
});
test('opens in the same tab, preserves the apartment report and shows independent source deals', async () => {
  await page.goto('/'); await page.getByTestId('statistics-count').waitFor();
  const header = await page.locator('.report-header').boundingBox();
  await open();
  expect(await page.getByRole('heading', { name: 'Հաշվետվություն', exact: true }).isVisible()).toBe(true);
  expect(await page.locator('.report-header').boundingBox()).toEqual(header);
  const subtitle = page.locator('.report-header').getByRole('paragraph').filter({ hasText: 'Տուն Էքսպո' });
  expect(await subtitle.isVisible()).toBe(true);
  expect(await subtitle.evaluate(el => getComputedStyle(el).fontSize)).toBe('15px');
  expect(page.url()).toMatch(/#toon-expo$/);
  expect(page.context().pages()).toHaveLength(1);
  expect(await page.getByRole('menu').isVisible()).toBe(false);
  expect(await page.getByTestId('statistics-count').isVisible()).toBe(false);
  expect(await page.getByTestId('expo-leads').innerText()).toBe('2');
  expect(await page.getByTestId('expo-rate').count()).toBe(0);
  expect(await page.getByTestId('expo-deals').innerText()).toBe('3');
  expect(await page.getByRole('link', { name: '#11 · A', exact: true }).getAttribute('href')).toBe('https://portal.example/crm/deal/details/11/');
  await page.getByRole('combobox', { name: 'Գործարքի ստեղծման ժամանակահատված', exact: true }).selectOption('custom');
  await page.getByLabel('Գործարքի ստեղծման ժամանակահատված՝ Սկսած', { exact: true }).fill('2026-01-02');
  expect(await page.getByTestId('expo-deals').innerText()).toBe('2');
  await page.getByLabel('Գործարքի ստեղծման ժամանակահատված՝ Մինչև', { exact: true }).fill('2025-01-01');
  expect(await page.getByRole('alert').isVisible()).toBe(true);
  await page.getByRole('combobox', { name: 'Գործարքի ստեղծման ժամանակահատված', exact: true }).selectOption('quick');
  await page.getByRole('region', { name: 'Գործարքներ', exact: true }).getByLabel('Արագ ընտրություն', { exact: true }).selectOption('all');
  expect(await page.getByTestId('expo-leads').innerText()).toBe('2');
  await page.goBack(); await page.getByTestId('statistics-count').waitFor({ state: 'visible' });
  await page.goForward(); await page.getByTestId('expo-leads').waitFor({ state: 'visible' });
});
test.each([390, 1280])('supports direct navigation, reload and responsive layout at %s px', async width => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await page.getByTestId('expo-leads').waitFor();
  await page.screenshot({ path: `test-results/expo-${width}.png`, fullPage: true });
});
test('shows loading and errors, retries and refreshes only the expo endpoint', async () => {
  await page.unroute('**/api/toon-expo*');
  let fail = true, requests = [];
  await page.route('**/api/toon-expo*', async route => {
    requests.push(route.request().url());
    await route.fulfill(fail ? { status: 502, json: { error: 'CRM_READ_ERROR' } } : { json: { ...data, leads: [] } });
  });
  await page.goto('/#toon-expo'); await page.getByRole('alert').waitFor();
  expect(await page.getByTestId('expo-leads').isVisible()).toBe(false);
  fail = false; await page.getByRole('button', { name: 'Կրկին փորձել', exact: true }).click();
  await page.getByTestId('expo-leads').waitFor(); expect(await page.getByTestId('expo-deals').innerText()).toBe('3');
  await page.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true }).click();
  await page.getByTestId('expo-leads').waitFor();
  expect(requests).toHaveLength(3); expect(requests[2]).toContain('?refresh=1');
});

test.each([390, 1280])('keeps identical shared header geometry across navigation and direct entry at %s px', async width => {
  await page.setViewportSize({ width, height: 900 });
  const geometry = () => page.locator('.report-header').evaluate(header => {
    const selectors = ['.report-header', '.report-header-row', '.report-logo', '.report-brand-name', 'h1', '.header-actions', '.refresh-button', '.property-menu-trigger'];
    return selectors.map(selector => {
      const el = selector === '.report-header' ? header : header.querySelector(selector);
      const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        padding: css.padding, margin: css.margin, gap: css.gap, fontSize: css.fontSize };
    });
  });
  await page.goto('/'); await page.getByTestId('statistics-count').waitFor();
  const baseline = await geometry();
  const gap = await page.evaluate(() => document.querySelector('.report-top-panels').getBoundingClientRect().top - document.querySelector('.report-header').getBoundingClientRect().bottom);
  await open(); expect(await geometry()).toEqual(baseline);
  const expoGap = () => page.evaluate(() => document.querySelector('.expo-panel').getBoundingClientRect().top - document.querySelector('.report-header').getBoundingClientRect().bottom);
  expect(await expoGap()).toBeCloseTo(gap, 1);
  await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 900 });
  await page.setViewportSize({ width, height: 900 });
  await page.waitForFunction(w => document.querySelector('.report-header').classList.contains('header-wide') === (w >= 1100), width);
  expect(await geometry()).toEqual(baseline);
  await page.reload(); await page.getByTestId('expo-leads').waitFor();
  expect(await geometry()).toEqual(baseline);
  expect(await expoGap()).toBeCloseTo(gap, 1);
});

test.each([390, 1280])('shows arrival and deals together in equal columns or stacked at %s px', async width => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  const arrival = page.getByRole('region', { name: 'Լիդերի մուտք', exact: true });
  const conversion = page.getByRole('region', { name: 'Գործարքներ', exact: true });
  expect(await arrival.isVisible()).toBe(true); expect(await conversion.isVisible()).toBe(true);
  expect(await page.getByTestId('expo-deals').isVisible()).toBe(true);
  const a = await arrival.boundingBox(), b = await conversion.boundingBox();
  expect(a.width).toBeCloseTo(b.width, 0);
  if (width > 900) { expect(a.y).toBe(b.y); expect(b.x).toBeCloseTo(a.x + a.width, 0); }
  else { expect(a.x).toBe(b.x); expect(b.y).toBeGreaterThanOrEqual(a.y + a.height); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Լիդի ստեղծման ժամանակահատված', exact: true }).selectOption('custom');
  await page.getByLabel('Լիդի ստեղծման ժամանակահատված՝ Սկսած', { exact: true }).fill('2026-01-02');
  expect(await arrival.getByTestId('expo-leads').innerText()).toBe('1');
  expect(await conversion.getByTestId('expo-deals').innerText()).toBe('3');
});

test('places a separate period filter above each column and keeps their selections independent', async () => {
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  const form = page.getByRole('form', { name: 'Լիդի ստեղծման ժամանակահատված', exact: true });
  const period = form.getByRole('combobox', { name: 'Լիդի ստեղծման ժամանակահատված', exact: true });
  expect(await period.locator('option').allTextContents()).toEqual(await page.locator('.filter-container .date-filter select').first().locator('option').allTextContents());
  const panel = await page.getByRole('region', { name: 'Լիդերի մուտք', exact: true }).boundingBox(), filter = await form.boundingBox();
  expect(await page.locator('.expo-panel > .expo-period-filter').count()).toBe(0);
  expect(await page.locator('.expo-column > .expo-period-filter').count()).toBe(2);
  expect(filter.y).toBeGreaterThan(panel.y);
  expect(filter.y + filter.height).toBeLessThanOrEqual((await page.getByTestId('expo-leads').boundingBox()).y);
  await page.getByRole('combobox', { name: 'Գործարքի ստեղծման ժամանակահատված', exact: true }).selectOption('custom');
  await page.getByLabel('Գործարքի ստեղծման ժամանակահատված՝ Սկսած', { exact: true }).fill('2026-02-01');
  expect(await page.getByTestId('expo-deals').innerText()).toBe('1');
  await period.selectOption('month');
  await form.getByRole('button', { name: 'Ամիսներ', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Ամիսների ընտրություն' });
  await popup.getByRole('button', { name: 'Հունվար', exact: true }).click();
  expect(await page.getByTestId('expo-leads').innerText()).toBe('2');
  await page.keyboard.press('Escape');
  await period.selectOption('quarter');
  await form.getByRole('button', { name: 'I', exact: true }).click();
  expect(await page.getByTestId('expo-deals').innerText()).toBe('1');
});

test('removes the expo intro, aligns quarters beside year, and matches the apartment month popup', async () => {
  await page.goto('/'); await page.getByTestId('statistics-count').waitFor();
  const apartment = page.locator('.filter-container .date-filter');
  await apartment.getByLabel('Կնքման ժամանակահատված', { exact: true }).selectOption('month');
  await apartment.getByRole('button', { name: 'Ամիսներ', exact: true }).hover();
  const popup = page.getByRole('dialog', { name: 'Ամիսների ընտրություն' });
  await popup.waitFor({ state: 'visible' });
  const styles = () => popup.evaluate(el => {
    const css = node => { const s = getComputedStyle(node); return ['padding', 'fontSize', 'height', 'borderRadius', 'backgroundColor', 'color', 'opacity'].map(key => s[key]); };
    return { box: css(el), grid: getComputedStyle(el.querySelector('.month-grid')).gridTemplateColumns,
      buttons: [...el.querySelectorAll('button')].map(css) };
  });
  const baseline = await styles();
  await page.keyboard.press('Escape'); await open();
  const expo = page.getByRole('region', { name: 'Տուն Էքսպո', exact: true });
  expect(await expo.getByRole('heading', { name: 'Տուն Էքսպո', exact: true }).count()).toBe(0);
  expect(await expo.getByText('Լիդերի հոսք և փոխակերպում գործարքների', { exact: true }).count()).toBe(0);
  expect(await expo.getByText('Toon Expo', { exact: true }).count()).toBe(0);
  const form = expo.getByRole('form', { name: 'Լիդի ստեղծման ժամանակահատված', exact: true });
  await form.getByRole('combobox', { name: 'Լիդի ստեղծման ժամանակահատված', exact: true }).selectOption('quarter');
  const year = await form.getByLabel('Տարի', { exact: true }).boundingBox();
  const quarters = await form.getByRole('group', { name: 'Եռամսյակներ' }).boundingBox();
  expect(quarters.y).toBeCloseTo(year.y, 0); expect(quarters.x).toBeGreaterThanOrEqual(year.x + year.width);
  await form.getByRole('combobox', { name: 'Լիդի ստեղծման ժամանակահատված', exact: true }).selectOption('month');
  await form.getByRole('button', { name: 'Ամիսներ', exact: true }).hover();
  await popup.waitFor({ state: 'visible' }); expect(await styles()).toEqual(baseline);
});

test('includes source deals when no source leads exist and offers earlier deal years', async () => {
  await page.route('**/api/toon-expo*', route => route.fulfill({ json: { ...data, leads: [], deals: [
    { id: 14, title: 'Independent', date: '2025-05-01', url: 'https://portal.example/crm/deal/details/14/' },
  ] } }));
  await page.goto('/#toon-expo'); await page.getByTestId('expo-leads').waitFor();
  await page.getByRole('region', { name: 'Գործարքներ', exact: true }).getByLabel('Տարի', { exact: true }).selectOption('2025');
  expect(await page.getByTestId('expo-leads').innerText()).toBe('0');
  expect(await page.getByTestId('expo-deals').innerText()).toBe('1');
  expect(await page.getByRole('link', { name: '#14 · Independent' }).isVisible()).toBe(true);
});
