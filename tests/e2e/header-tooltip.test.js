beforeEach(async () => { await page.clock.install(); await page.goto('/'); await page.getByTestId('statistics-count').waitFor(); });
test.each([
  ['Թարմացնել ամբողջ հաշվետվությունը', 'refresh-tooltip'],
  ['Հաշվետվությունների տեսակ', 'menu-tooltip'],
])('shows %s tooltip at 400ms for hover and focus and cancels it on exit', async (label, id) => {
  const button = page.getByRole('button', { name: label, exact: true });
  expect(await button.getAttribute('title')).toBeNull();
  await button.hover(); await page.clock.runFor(399);
  expect(await page.locator(`#${id}`).count()).toBe(0);
  await page.clock.runFor(1);
  expect(await page.getByRole('tooltip', { name: label, exact: true }).isVisible()).toBe(true);
  expect(await button.getAttribute('aria-describedby')).toBe(id);
  await page.mouse.move(0, 300);
  expect(await page.locator(`#${id}`).count()).toBe(0);
  await button.hover(); await page.clock.runFor(200); await page.mouse.move(0, 300); await page.clock.runFor(400);
  expect(await page.locator(`#${id}`).count()).toBe(0);
  await button.focus(); await page.clock.runFor(399);
  expect(await page.locator(`#${id}`).count()).toBe(0);
  await page.clock.runFor(1);
  expect(await page.locator(`#${id}`).isVisible()).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.locator(`#${id}`).count()).toBe(0);
});
test('hides the menu tooltip when opening the menu', async () => {
  const menu = page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true });
  await menu.hover(); await page.clock.runFor(400); await menu.click();
  expect(await page.getByRole('tooltip').count()).toBe(0);
  expect(await page.getByRole('menu').isVisible()).toBe(true);
});
