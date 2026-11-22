const fs = require('node:fs');
beforeEach(async () => { await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z')); });
const reportTitle = 'Հաշվետվություն';

describe('home page', () => {
  test('loads the built report over HTTP', async () => {
    const response = await page.goto('/');

    expect(response.status()).toBe(200);
    await page.getByRole('heading', { name: reportTitle, level: 1, exact: true }).waitFor({ state: 'visible' });
    await page.getByTestId('statistics-count').waitFor();
    expect(await page.getByTestId('statistics-count').innerText()).toBe('1');
    const favicon = page.locator('head link[rel="icon"][type="image/png"]');
    expect(await page.locator('head link[rel="icon"]').count()).toBe(1);
    expect(await favicon.getAttribute('sizes')).toBe('375x300');
    expect(await favicon.getAttribute('type')).toBe('image/png');
    expect(await page.title()).toBe('Milon Mining — Հաշվետվություն');
    const iconPath = await favicon.getAttribute('href');
    expect(iconPath).toMatch(/^\/assets\/favicon-[\w-]+\.png$/);
    const iconResponse = await page.request.get(iconPath);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()['content-type']).toBe('image/png');
    expect(await iconResponse.body()).toEqual(fs.readFileSync(require('node:path').join(__dirname, '../../images/favicon.png')));
    for (const fallback of ['/favicon.ico', '/favicon.png', '/favicon.avif']) {
      const redirect = await page.request.get(fallback, { maxRedirects: 0 });
      expect(redirect.status()).toBe(302);
      expect(redirect.headers().location).toBe(iconPath);
      expect(redirect.headers()['cache-control']).toBe('no-store');
      const response = await page.request.get(fallback);
      expect(response.headers()['content-type']).toBe('image/png');
      expect(await response.body()).toEqual(await iconResponse.body());
      const head = await page.request.head(fallback);
      expect(head.status()).toBe(200);
      expect(await head.body()).toHaveLength(0);
    }
    expect(await page.evaluate(async () => {
      const icon = new Image(); icon.src = document.querySelector('link[rel="icon"][type="image/png"]').href;
      await icon.decode(); return icon.naturalWidth === 375 && icon.naturalHeight === 300;
    })).toBe(true);
  });

  test('keeps header text in place inside the full-width report section without side gutters', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.getByTestId('statistics-count').waitFor();
    const region = page.getByRole('region', { name: 'Գործարքների հաշվետվություն' });
    const header = region.locator('header');
    const labels = [
      header.getByRole('heading', { name: reportTitle, level: 1, exact: true }),
      header.locator('.report-header-subtitle > span'),
    ];
    const sizes = ['25px', '15px'];
    const colors = ['rgb(255, 255, 255)', 'rgb(255, 255, 255)'];
    for (let i = 0; i < labels.length; i++) {
      expect(await labels[i].isVisible()).toBe(true);
      expect(await labels[i].evaluate(el => {
        const style = getComputedStyle(el);
        return { size: style.fontSize, weight: style.fontWeight, color: style.color, align: style.textAlign };
      })).toEqual({ size: sizes[i], weight: '400', color: colors[i], align: 'center' });
    }
    for (const text of ['ԱՆՇԱՐԺ ԳՈՒՅՔԻ՝ ԲՆԱԿԱՐԱՆՆԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ', 'ՎԱՃԱՌՔԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ', 'Վաճառքի վերլուծություն', 'Կնքված գործարքներ', 'Գործարքների ընդհանուր արժեքը՝ ըստ սենյակների և ամսաթվի']) {
      expect(await page.getByText(text, { exact: true }).count()).toBe(0);
    }
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 40, 62)');
    expect(await header.getByText('Հաշվետվություններ', { exact: true }).count()).toBe(0);
    const title = await labels[0].boundingBox();
    const section = await region.boundingBox();
    const filters = await page.getByRole('form', { name: 'Զտիչներ' }).boundingBox();
    for (const box of [title]) expect(box.x + box.width / 2).toBeCloseTo(720, 1);
    expect(title.y).toBeGreaterThanOrEqual(16);
    const headerBox = await header.boundingBox();
    const subtitle = await labels[1].boundingBox();
    const headerRow = await header.locator('.report-header-row').boundingBox();
    expect(subtitle.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(Math.abs((title.y + subtitle.y + subtitle.height) / 2 - headerRow.y - headerRow.height / 2)).toBeLessThan(1);
    expect(headerBox.height).toBeGreaterThanOrEqual(132);
    expect(await header.locator('hr').count()).toBe(0);
    expect(filters.y).toBeGreaterThan(headerBox.y + headerBox.height);
    expect(section).toMatchObject({ x: 0, y: 0, width: 1440 });
    expect(filters.width).toBeLessThan(1350 * .7);
    expect((await page.locator('.report-top-panels').boundingBox()).x).toBeCloseTo((await page.locator('.deals-histogram').boundingBox()).x, 0);
    expect(await region.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/header-1440.png', fullPage: true, animations: 'disabled' });
    await page.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    expect((await labels[0].boundingBox()).y).toBeCloseTo(title.y - scrollY);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 1920, height: 1000 });
    expect(await region.boundingBox()).toMatchObject({ x: 0, width: 1920 });
    const wideTitle = await labels[0].boundingBox();
    expect(wideTitle.x + wideTitle.width / 2).toBeCloseTo(960, 1);
    expect(wideTitle.y).toBe(title.y);
  });

  test.each([1920, 1440, 1024, 375, 320])('shows the logo left and the only refresh button right in the header at %i px', async width => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
    await page.getByTestId('statistics-count').waitFor();
    const header = page.locator('.report-header');
    expect(await header.evaluate(el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, radius: style.borderRadius, shadow: style.boxShadow !== 'none' };
    })).toEqual({ background: 'rgb(29, 40, 62)', radius: '12px', shadow: true });
    const logo = header.getByRole('img', { name: 'Milon Mining', exact: true });
    const refresh = header.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true });
    await page.locator('.property-stage-panels-inline .property-stages[aria-busy="false"]').waitFor();
    const frame = await page.locator('.report-top-panels').boundingBox();
    const title = await header.getByRole('heading', { name: reportTitle, exact: true }).boundingBox();
    const image = await logo.boundingBox(), button = await refresh.boundingBox();
    const menuButton = header.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true });
    const menuBox = await menuButton.boundingBox();
    expect(button.width).toBeCloseTo(width < 640 ? 29.5625 : 40, 2); expect(button.height).toBe(button.width);
    expect(menuBox.width).toBe(button.width); expect(menuBox.height).toBe(button.height);
    if (width < 640) {
      expect(await refresh.evaluate(el => getComputedStyle(el).borderRadius)).toBe('8px');
      expect(await menuButton.evaluate(el => getComputedStyle(el).borderRadius)).toBe('8px');
    }
    expect(menuBox.x - button.x - button.width).toBe(width < 640 ? 4 : 8);
    expect(await refresh.innerText()).toBe('');
    const refreshIcon = await refresh.locator('.reset-icon').boundingBox(), menuIcon = await menuButton.locator('.header-menu-icon').boundingBox();
    expect(refreshIcon.width).toBe(menuIcon.width); expect(refreshIcon.height).toBe(menuIcon.height);
    expect(await refresh.locator('svg').count()).toBe(0); expect(await menuButton.locator('svg').count()).toBe(0);
    const refreshMask = await refresh.locator('.reset-icon').evaluate(el => {
      const style = getComputedStyle(el);
      return {image:style.maskImage, size:style.maskSize};
    });
    expect(refreshMask.image).toMatch(/reset-.*\.avif/);
    expect(refreshMask.size).toBe('contain');
    const menuAsset = await menuButton.locator('.header-menu-icon').evaluate(async element => {
      const url = getComputedStyle(element).maskImage.slice(5, -2);
      const image = new Image();
      image.src = url;
      await image.decode();
      return {url, width:image.naturalWidth, height:image.naturalHeight};
    });
    expect(menuAsset.url).toMatch(/menu-.*\.avif$/);
    expect(menuAsset.width).toBeGreaterThan(0);
    expect(menuAsset.height).toBeGreaterThan(0);
    expect(refreshIcon).toMatchObject({ width: 20, height: 20 });
    expect(refreshIcon.x + refreshIcon.width / 2).toBeCloseTo(button.x + button.width / 2, 1);
    expect(refreshIcon.y + refreshIcon.height / 2).toBeCloseTo(button.y + button.height / 2, 1);
    const brandName = header.getByText('MILON MINING', { exact: true });
    expect(await brandName.isVisible()).toBe(width >= 640);
    expect(await brandName.evaluate(el => {
      const style = getComputedStyle(el); return { font: style.fontFamily, color: style.color, weight: style.fontWeight };
    })).toEqual({ font: 'Georgia, serif', color: 'rgb(255, 255, 255)', weight: '400' });
    expect(await header.locator('.report-header-row').locator('h1, span, button').evaluateAll(els => els.every(el => getComputedStyle(el).fontWeight === '400'))).toBe(true);
    if (width >= 640) {
    const wide = await header.evaluate(el => el.classList.contains('header-wide'));
    expect(image).toMatchObject(wide ? {width:102,height:102} : {width:72,height:72});
    const brandBox = await brandName.boundingBox();
    expect(brandBox.x - image.x - image.width).toBeCloseTo(wide ? 12 : 8, 1);
    expect(Math.abs(brandBox.y + brandBox.height / 2 - image.y - image.height / 2)).toBeLessThan(1);
    }
    expect(await header.locator('hr').count()).toBe(0);
    expect(await refresh.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]))
      .toEqual(['rgb(255, 255, 255)', 'rgb(29, 40, 62)']);
    expect(await logo.evaluate(img => img.complete && img.naturalWidth === 512 && img.naturalHeight === 512)).toBe(true);
    const headerBox = await header.boundingBox();
    expect(headerBox.x).toBe(0);
    expect(headerBox.width).toBe(width);
    for (const selector of ['.report-top-panels', '.deals-histogram', '.deals-list']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBe(0); expect(box.width).toBe(width);
    }
    expect(Math.abs(headerBox.x - frame.x)).toBeLessThan(1);
    expect(Math.abs(headerBox.width - frame.width)).toBeLessThan(1);
    if (width >= 640) {
      expect(Math.abs(image.x - (await page.locator('.filter-heading h2 .filter-icon').first().boundingBox()).x)).toBeLessThan(1);
      const groupBy = await page.locator('.statistics-trigger').boundingBox();
      expect(Math.abs(menuBox.x + menuBox.width - groupBy.x - groupBy.width)).toBeLessThan(1);
    } else {
      expect(image.x).toBeCloseTo(12, 0);
      expect(menuBox.x + menuBox.width).toBeCloseTo(width - 12, 0);
    }
    if (await header.evaluate(el => el.classList.contains('header-wide'))) {
      const copy = await header.locator('.report-header-copy').boundingBox();
      expect(Math.abs(image.y + image.height / 2 - copy.y - copy.height / 2)).toBeLessThan(1);
      expect(Math.abs(image.y + image.height / 2 - button.y - button.height / 2)).toBeLessThan(1);
    } else if (width >= 640) expect(button.y).toBeGreaterThanOrEqual(title.y + title.height);
    else {
      const copy = await header.locator('.report-header-copy').boundingBox();
      expect(image.height).toBeCloseTo(75.75, 1);
      expect(image.width / image.height).toBeCloseTo(1, 2);
      expect(await header.locator('.report-header-subtitle').isVisible()).toBe(false);
      expect(await header.locator('h1').evaluate(el => getComputedStyle(el).fontSize)).toBe('18px');
      expect(title.x).toBeGreaterThanOrEqual(image.x + image.width);
      expect(title.x + title.width).toBeLessThanOrEqual(button.x);
      expect(image.y + image.height / 2).toBeCloseTo(button.y + button.height / 2, 0);
      expect(image.x + image.width).toBeLessThanOrEqual(copy.x);
      expect(copy.x + copy.width).toBeLessThanOrEqual(button.x);
    }
    expect(await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).count()).toBe(1);
    const source = await logo.getAttribute('src');
    expect(source).toMatch(/^\/assets\/logo_milon-[\w-]+\.avif$/);
    const response = await page.request.get(source);
    expect(response.status()).toBe(200); expect(response.headers()['content-type']).toBe('image/avif');
    expect(await page.getByRole('heading', { name: 'Ընդհանուր տեղեկություն', exact: true }).count()).toBe(1);
    expect(await page.getByRole('group', { name: 'Խմբավորում', exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Սենյակներ', exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Վաճառքի գումար', exact: true }).count()).toBe(1);
    await page.getByLabel('Գծապատկերի տարածք', { exact: true }).waitFor();
    expect(await page.getByLabel('Գծապատկերի տարածք', { exact: true }).count()).toBe(1);
    const histogram = await page.getByRole('region', { name: 'Գործարքների հիստոգրամ', exact: true }).boundingBox();
    const pageGaps = await page.evaluate(() => {
      const header = document.querySelector('.report-header').getBoundingClientRect();
      const lastBlock = document.querySelector('.deals-list').getBoundingClientRect();
      return { top: header.top + scrollY, bottom: document.documentElement.scrollHeight - lastBlock.bottom - scrollY };
    });
    const expectedGap = image.y;
    expect(pageGaps.top).toBe(0);
    const kpiFrame = await page.locator('.deals-histogram').boundingBox();
    const aboveLogo = image.y;
    if (width < 640) {
      const copy = await header.locator('.report-header-copy').boundingBox();
      expect(copy.x + copy.width / 2).toBeCloseTo(width / 2, 0);
      expect(copy.y + copy.height / 2).toBeCloseTo(image.y + image.height / 2, 0);
    }
    expect(await header.evaluate(el => [getComputedStyle(el).paddingTop, getComputedStyle(el).paddingBottom])).toEqual(width < 640 ? ['15px', '15px'] : ['20px', '20px']);
    const stages = await page.locator('.property-stage-panels-inline').boundingBox();
    expect(stages.y - headerBox.y - headerBox.height).toBeCloseTo(0, 0);
    expect(frame.y - stages.y - stages.height).toBeCloseTo(aboveLogo, 0);
    expect(kpiFrame.y - frame.y - frame.height).toBeCloseTo(aboveLogo, 0);
    const dealsFrame = await page.locator('.deals-histogram + .deals-list').boundingBox();
    expect(dealsFrame.y - kpiFrame.y - kpiFrame.height).toBeCloseTo(aboveLogo, 0);
    expect(Math.abs(pageGaps.bottom - expectedGap)).toBeLessThan(1);

    expect(histogram.y).toBeGreaterThanOrEqual(frame.y + frame.height);
    expect(await page.locator('.deals-histogram').isVisible()).toBe(true);
    expect(await page.getByRole('region', { name: 'Վիճակագրություն', exact: true }).isVisible()).toBe(true);
    for (const surface of [page.locator('.report-top-panels'),
      page.getByRole('region', { name: 'Գործարքների հիստոգրամ', exact: true }), page.locator('.deals-list')]) {
      expect(await surface.evaluate(el => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, border: style.borderTopColor, shadow: style.boxShadow !== 'none' };
      })).toEqual({ background: 'rgb(255, 255, 255)', border: 'rgb(211, 223, 219)', shadow: true });
    }
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 40, 62)');
    expect(await page.locator('.complex-buttons button').first().evaluate(el => {
      const style = getComputedStyle(el); return [style.backgroundColor, style.color];
    })).toEqual(['rgb(0, 127, 105)', 'rgb(255, 255, 255)']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/header-logo-${width}.png`, fullPage: true, animations: 'disabled' });
  });

  test('opens and dismisses the property menu', async () => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Հաշվետվությունների տեսակ' });
    await menu.waitFor({ state: 'visible' });
    expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['Կնքված բնակարաններ', 'Կնքված կայանատեղիներ', 'Տուն Էքսպո Նոյեմբեր 2026']);
    expect(await menu.getByRole('separator').count()).toBe(0);
    expect(await menu.getByRole('menuitem').evaluateAll(els => els.map(el => getComputedStyle(el).fontSize))).toEqual(Array(3).fill('15px'));
    await menu.getByRole('menuitem', { name: 'Կնքված կայանատեղիներ', exact: true }).click();
    expect(await menu.isVisible()).toBe(false);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Կնքված բնակարաններ', exact: true }).focus();
    await page.keyboard.press('Escape');
    expect(await menu.isVisible()).toBe(false);
  });

  test('does not serve local secrets or project files', async () => {
    for (const target of ['/.env', '/%2eenv', '/.env.local', '/.env.example', '/.git/config', '/server.js', '/package.json']) {
      const response = await page.request.get(target);
      expect(response.status()).toBe(404);
      expect(await response.text()).toBe('Not found');
    }
  });

  test('serves the HTML file with query parameters and supports HEAD', async () => {
    const response = await page.goto('/index.html?view=report');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('text/html; charset=utf-8');
    await page.getByRole('heading', { name: reportTitle, level: 1, exact: true }).waitFor({ state: 'visible' });

    const head = await page.request.head('/');
    expect(head.status()).toBe(200);
    expect(head.headers()['content-length']).toBe(response.headers()['content-length']);
    expect(await head.body()).toHaveLength(0);
  });

  test('rejects unknown paths and unsupported methods', async () => {
    for (const target of ['/missing.html', '/src/bitrix24/config.cjs']) {
      const response = await page.request.get(target);
      expect(response.status()).toBe(404);
    }
    const response = await page.request.post('/');
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe('Not found');
  });
});

test.each(['', '#parking', '#toon-expo'])('brand reloads the current section locally (%s)', async hash => {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (hash === '#toon-expo') {
    await page.route('**/api/toon-expo?*', route => route.fulfill({ json: {
      snapshotId: 'test-expo', leads: [], deals: [], directDeals: [],
      createdDealsComparison: { baselineMonthlyAverage: 2, expoCount: 7 },
    } }));
  }
  await page.goto('/' + hash);
  const url = page.url();
  const brand = page.getByRole('button', { name: /^MILON MINING/ });
  const requests = [];
  const recordRequest = request => {
    if (request.isNavigationRequest() || new URL(request.url()).pathname.startsWith('/api/')) {
      requests.push(request.url());
    }
  };

  if (hash === '#toon-expo') {
    await page.getByTestId('expo-comparison-value').first().waitFor();
    const list = page.locator('.expo-desktop-toggle');
    await Promise.all([
      page.waitForResponse(response => response.url().includes('view=details')),
      list.click(),
    ]);
    expect(await list.getAttribute('aria-expanded')).toBe('true');
    page.on('request', recordRequest);
    await brand.getByRole('img').click();
    expect(await list.getAttribute('aria-expanded')).toBe('false');
    expect(await page.getByTestId('expo-comparison-value').first().isVisible()).toBe(true);
  } else {
    const amount = page.locator('#amount-min');
    await amount.fill('123');
    page.on('request', recordRequest);
    await brand.getByText('MILON MINING', { exact: true }).click();
    expect(await amount.inputValue()).toBe('');
    expect(await page.getByTestId('statistics-count').isVisible()).toBe(true);
  }

  expect(page.url()).toBe(url);
  expect(requests).toEqual([]);
});
