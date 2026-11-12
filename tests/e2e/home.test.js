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
    const favicon = page.locator('head link[rel="icon"]');
    expect(await favicon.getAttribute('type')).toBe('image/png');
    expect(await page.title()).toBe('Milon Mining — Հաշվետվություն');
    const iconPath = await favicon.getAttribute('href');
    expect(iconPath).toMatch(/^\/assets\/(?:favicon|logo_milon)-[\w-]+\.png$/);
    const iconResponse = await page.request.get(iconPath);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()['content-type']).toBe('image/png');
    expect(await iconResponse.body()).toEqual(fs.readFileSync(require('node:path').join(__dirname, '../../images/favicon.png')));
    for (const fallback of ['/favicon.ico', '/favicon.png']) {
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
      const icon = new Image(); icon.src = document.querySelector('link[rel="icon"]').href;
      await icon.decode(); return icon.naturalWidth > 0 && icon.naturalHeight > 0;
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
    ];
    const sizes = ['25px'];
    const colors = ['rgb(255, 255, 255)'];
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
    const refresh = header.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true });
    const frame = await page.locator('.report-top-panels').boundingBox();
    const title = await header.getByRole('heading', { name: reportTitle, exact: true }).boundingBox();
    const image = await logo.boundingBox(), button = await refresh.boundingBox();
    const menuButton = header.getByRole('button', { name: 'Անշարժ գույքի տեսակ', exact: true });
    const menuBox = await menuButton.boundingBox();
    expect(button.width).toBe(40); expect(button.height).toBe(40);
    expect(menuBox.width).toBe(40); expect(menuBox.height).toBe(40);
    expect(menuBox.x - button.x - button.width).toBe(8);
    expect(await refresh.innerText()).toBe('');
    const brandName = header.getByText('MILON MINING', { exact: true });
    expect(await brandName.isVisible()).toBe(true);
    expect(await brandName.evaluate(el => {
      const style = getComputedStyle(el); return { font: style.fontFamily, color: style.color, weight: style.fontWeight };
    })).toEqual({ font: 'Georgia, serif', color: 'rgb(255, 255, 255)', weight: '400' });
    expect(await header.locator('h1, span, button').evaluateAll(els => els.every(el => getComputedStyle(el).fontWeight === '400'))).toBe(true);
    const brandBox = await brandName.boundingBox();
    expect(brandBox.x).toBeGreaterThanOrEqual(image.x + image.width + 7);
    expect(Math.abs(brandBox.y + brandBox.height / 2 - image.y - image.height / 2)).toBeLessThan(1);
    expect(await header.locator('hr').count()).toBe(0);
    expect(await refresh.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]))
      .toEqual(['rgb(255, 255, 255)', 'rgb(29, 40, 62)']);
    expect(await logo.evaluate(img => img.complete && img.naturalWidth === 375 && img.naturalHeight === 300)).toBe(true);
    const headerBox = await header.boundingBox();
    expect(headerBox.x).toBe(0);
    expect(headerBox.width).toBe(width);
    for (const selector of ['.report-top-panels', '.deals-histogram', '.deals-list']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBe(0); expect(box.width).toBe(width);
    }
    expect(Math.abs(headerBox.x - frame.x)).toBeLessThan(1);
    expect(Math.abs(headerBox.width - frame.width)).toBeLessThan(1);
    expect(Math.abs(image.x - frame.x - 16)).toBeLessThan(1);
    expect(Math.abs(menuBox.x + menuBox.width - frame.x - frame.width + 16)).toBeLessThan(1);
    if (await header.evaluate(el => el.classList.contains('header-wide'))) {
      expect(Math.abs(image.y + image.height / 2 - title.y - title.height / 2)).toBeLessThan(1);
      expect(Math.abs(image.y + image.height / 2 - button.y - button.height / 2)).toBeLessThan(1);
    } else expect(button.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(await page.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true }).count()).toBe(1);
    const source = await logo.getAttribute('src');
    expect(source).toMatch(/^\/assets\/logo_milon-[\w-]+\.png$/);
    const response = await page.request.get(source);
    expect(response.status()).toBe(200); expect(response.headers()['content-type']).toBe('image/png');
    expect(await page.getByRole('heading', { name: 'Ցուցադրություն', exact: true }).count()).toBe(1);
    expect(await page.getByRole('group', { name: 'Խմբավորում', exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Սենյակներ', exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Վաճառքի գումար', exact: true }).count()).toBe(1);
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
    expect(frame.y - image.y - image.height).toBeCloseTo(aboveLogo, 0);
    expect(kpiFrame.y - frame.y - frame.height).toBeCloseTo(aboveLogo, 0);
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
    const trigger = page.getByRole('button', { name: 'Անշարժ գույքի տեսակ', exact: true });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Անշարժ գույքի տեսակ' });
    await menu.waitFor({ state: 'visible' });
    await menu.getByRole('menuitem', { name: 'Ավտոկայանատեղիներ', exact: true }).click();
    expect(await menu.isVisible()).toBe(false);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Բնակարաններ', exact: true }).focus();
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
