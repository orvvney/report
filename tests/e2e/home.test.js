describe('home page', () => {
  test('loads the built report over HTTP', async () => {
    const response = await page.goto('/');

    expect(response.status()).toBe(200);
    await page.getByRole('heading', { name: 'Կնքված գործարքներ' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '2՝ 35 AMD, 2 գործարք', exact: true }).waitFor();
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
    await page.getByRole('heading', { name: 'Կնքված գործարքներ' }).waitFor({ state: 'visible' });

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
