const fs = require('node:fs');
const reportTitle = 'Կնքված բնակարանների հաշվետվություն';

describe('home page', () => {
  test('loads the built report over HTTP', async () => {
    const response = await page.goto('/');

    expect(response.status()).toBe(200);
    await page.getByRole('heading', { name: reportTitle, level: 1, exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('img', { name: '2՝ 35 AMD, 2 գործարք', exact: true }).waitFor();
  });

  test('keeps header text in place inside the full-width report section with side gutters', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.locator('footer time').waitFor();
    const region = page.getByRole('region', { name: 'Գործարքների հաշվետվություն' });
    const header = region.locator('header');
    const labels = [
      header.getByText('Հաշվետվություններ', { exact: true }),
      header.getByText('ԱՆՇԱՐԺ ԳՈՒՅՔԻ՝ ԲՆԱԿԱՐԱՆՆԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ', { exact: true }),
      header.getByRole('heading', { name: reportTitle, level: 1, exact: true }),
    ];
    const sizes = ['15px', '10px', '25px'];
    const colors = ['rgb(24, 37, 61)', 'rgb(139, 152, 168)', 'rgb(24, 37, 61)'];
    for (let i = 0; i < labels.length; i++) {
      expect(await labels[i].isVisible()).toBe(true);
      expect(await labels[i].evaluate(el => {
        const style = getComputedStyle(el);
        return { size: style.fontSize, weight: style.fontWeight, color: style.color, align: style.textAlign };
      })).toEqual({ size: sizes[i], weight: '700', color: colors[i], align: 'center' });
    }
    for (const text of ['ՎԱՃԱՌՔԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ', 'Վաճառքի վերլուծություն', 'Կնքված գործարքներ', 'Գործարքների ընդհանուր արժեքը՝ ըստ սենյակների և ամսաթվի']) {
      expect(await page.getByText(text, { exact: true }).count()).toBe(0);
    }
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(245, 247, 251)');
    const [label, category, title] = await Promise.all(labels.map(locator => locator.boundingBox()));
    const divider = await page.getByTestId('header-divider').boundingBox();
    const section = await region.boundingBox();
    const filters = await page.getByRole('form', { name: 'Զտիչներ' }).boundingBox();
    for (const box of [label, category, title]) expect(box.x + box.width / 2).toBeCloseTo(720);
    expect(label.y).toBe(16);
    expect(divider).toMatchObject({ x: 33, width: 1374, height: 1 });
    expect(await page.getByTestId('header-divider').evaluate(el => {
      const style = getComputedStyle(el);
      return [style.borderTopStyle, style.borderTopColor];
    })).toEqual(['solid', 'rgb(219, 228, 239)']);
    expect(divider.y - label.y - label.height).toBeCloseTo(16);
    expect(category.y - divider.y - divider.height).toBeCloseTo(16);
    expect(title.y - category.y - category.height).toBeCloseTo(8);
    expect(filters.y - title.y - title.height).toBeCloseTo(28);
    expect(section).toMatchObject({ x: 32, y: 0, width: 1376 });
    expect(filters).toMatchObject({ x: 45, width: 1350 });
    expect(await region.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/header-1440.png', fullPage: true, animations: 'disabled' });
    await page.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    expect((await labels[0].boundingBox()).y).toBeCloseTo(label.y - scrollY);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 1920, height: 1000 });
    expect(await region.boundingBox()).toMatchObject({ x: 32, width: 1856 });
    const wideTitle = await labels[2].boundingBox();
    expect(wideTitle.x + wideTitle.width / 2).toBeCloseTo(960);
    expect(wideTitle.y).toBe(title.y);
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
