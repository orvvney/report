describe('home page', () => {
  test('loads the starter page over HTTP and displays its content', async () => {
    const response = await page.goto('/');

    expect(response.status()).toBe(200);
    await page.getByText('hello world', { exact: false }).waitFor({ state: 'visible' });
    expect(await page.locator('body').innerText()).toMatch(/test\s+hello world/);
  });

  test('does not serve local secrets or project files', async () => {
    for (const target of ['/.env', '/%2eenv', '/.env.local', '/.env.example', '/.git/config']) {
      const response = await page.request.get(target);
      expect(response.status()).toBe(404);
      expect(await response.text()).toBe('Not found');
    }
  });
});
