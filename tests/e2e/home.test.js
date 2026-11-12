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
    expect(iconPath).toMatch(/^\/assets\/favicon-[\w-]+\.png$/);
    const iconResponse = await page.request.get(iconPath);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()['content-type']).toBe('image/png');
    expect(await iconResponse.body()).toEqual(fs.readFileSync(require('node:path').join(__dirname, '../../images/favicon.png')));
  });

  test('keeps header text in place inside the full-width report section with side gutters', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.getByTestId('statistics-count').waitFor();
    const region = page.getByRole('region', { name: 'Գործարքների հաշվետվություն' });
    const header = region.locator('header');
    const labels = [
      header.getByRole('heading', { name: reportTitle, level: 1, exact: true }),
    ];
    const sizes = ['25px'];
    const colors = ['rgb(24, 37, 61)', 'rgb(24, 37, 61)'];
    for (let i = 0; i < labels.length; i++) {
      expect(await labels[i].isVisible()).toBe(true);
      expect(await labels[i].evaluate(el => {
        const style = getComputedStyle(el);
        return { size: style.fontSize, weight: style.fontWeight, color: style.color, align: style.textAlign };
      })).toEqual({ size: sizes[i], weight: '700', color: colors[i], align: 'center' });
    }
    for (const text of ['ԱՆՇԱՐԺ ԳՈՒՅՔԻ՝ ԲՆԱԿԱՐԱՆՆԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ', 'ՎԱՃԱՌՔԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ', 'Վաճառքի վերլուծություն', 'Կնքված գործարքներ', 'Գործարքների ընդհանուր արժեքը՝ ըստ սենյակների և ամսաթվի']) {
      expect(await page.getByText(text, { exact: true }).count()).toBe(0);
    }
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(245, 247, 251)');
    expect(await header.getByText('Հաշվետվություններ', { exact: true }).count()).toBe(0);
    const title = await labels[0].boundingBox();
    const divider = await page.getByTestId('header-divider').boundingBox();
    const section = await region.boundingBox();
    const filters = await page.getByRole('form', { name: 'Զտիչներ' }).boundingBox();
    for (const box of [title]) expect(box.x + box.width / 2).toBeCloseTo(720, 1);
    expect(title.y).toBeGreaterThanOrEqual(16);
    expect(divider).toMatchObject({ x: 33, width: 1374, height: 1 });
    expect(await page.getByTestId('header-divider').evaluate(el => {
      const style = getComputedStyle(el);
      return [style.borderTopStyle, style.borderTopColor];
    })).toEqual(['solid', 'rgb(219, 228, 239)']);
    expect(divider.y - title.y - title.height).toBeGreaterThanOrEqual(16);
    expect(filters.y).toBeGreaterThan(divider.y + divider.height);
    expect(section).toMatchObject({ x: 32, y: 0, width: 1376 });
    expect(filters.width).toBeLessThan(1350 * .7);
    expect((await page.locator('.report-top-panels').boundingBox()).x).toBeCloseTo((await page.getByTestId('kpi-container').boundingBox()).x, 0);
    expect(await region.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/header-1440.png', fullPage: true, animations: 'disabled' });
    await page.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    expect((await labels[0].boundingBox()).y).toBeCloseTo(title.y - scrollY);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 1920, height: 1000 });
    expect(await region.boundingBox()).toMatchObject({ x: 32, width: 1856 });
    const wideTitle = await labels[0].boundingBox();
    expect(wideTitle.x + wideTitle.width / 2).toBeCloseTo(960, 1);
    expect(wideTitle.y).toBe(title.y);
  });

  test.each([1920, 1440, 1024, 375, 320])('shows the logo left and the only refresh button right in the header at %i px', async width => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
    await page.getByTestId('statistics-count').waitFor();
    const header = page.locator('.report-header');
    const logo = header.getByRole('img', { name: 'Milon Mining', exact: true });
    const refresh = header.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true });
    const frame = await page.locator('.report-top-panels').boundingBox();
    const title = await header.getByRole('heading', { name: reportTitle, exact: true }).boundingBox();
    const image = await logo.boundingBox(), button = await refresh.boundingBox();
    expect(await logo.evaluate(img => img.complete && img.naturalWidth === 375 && img.naturalHeight === 300)).toBe(true);
    expect(Math.abs(image.x - frame.x)).toBeLessThan(1);
    expect(Math.abs(button.x + button.width - frame.x - frame.width)).toBeLessThan(1);
    if (await header.evaluate(el => el.classList.contains('header-wide'))) {
      expect(Math.abs(image.y + image.height / 2 - title.y - title.height / 2)).toBeLessThan(1);
      expect(Math.abs(image.y + image.height / 2 - button.y - button.height / 2)).toBeLessThan(1);
    } else expect(button.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(await page.getByRole('button', { name: 'Թարմացնել հաշվետվությունը', exact: true }).count()).toBe(1);
    const source = await logo.getAttribute('src');
    expect(source).toMatch(/^\/assets\/logo_milon-[\w-]+\.png$/);
    const response = await page.request.get(source);
    expect(response.status()).toBe(200); expect(response.headers()['content-type']).toBe('image/png');
    expect(await page.getByText('Ցուցադրություն', { exact: true }).count()).toBe(0);
    expect(await page.getByRole('group', { name: 'Խմբավորում', exact: true }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Սենյակների քանակ', exact: true }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Կնքման ամսաթիվ', exact: true }).count()).toBe(0);
    expect(await page.getByLabel('Գծապատկերի տարածք', { exact: true }).count()).toBe(0);
    expect(await page.locator('footer, .chart-column').count()).toBe(0);
    expect(await page.getByTestId('kpi-container').isVisible()).toBe(true);
    expect(await page.getByRole('region', { name: 'Վիճակագրություն', exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/header-logo-${width}.png`, fullPage: true, animations: 'disabled' });
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
