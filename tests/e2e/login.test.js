const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { authenticator } = require('otplib');
const { createServer } = require('../../server.js');
const { createAuthFixture } = require('../support/auth-fixture.cjs');

const ALLOWED = 'first@example.com';
const GSI = 'https://accounts.google.com/gsi/client**';
// Заглушка Google Identity Services: кнопка сразу отдаёт проверяемый токен.
const STUB = `window.google={accounts:{id:{
  initialize:(options)=>{window.__gsi=options.callback;},
  renderButton:(target)=>{const button=document.createElement('button');button.id='gsi-stub';
    button.type='button';button.textContent='Google';
    button.addEventListener('click',()=>window.__gsi({credential:'valid-google-token'}));target.append(button);},
}}};`;

let server, url, dataDir, auth;

beforeEach(async () => {
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  await page.route(GSI, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-login-e2e-'));
  auth = {
    googleClientId: 'client', allowedEmails: new Set([ALLOWED]), encryptionSecret: 'a'.repeat(32),
    publicOrigin: 'http://127.0.0.1', secureCookies: false,
    googleClient: { verifyIdToken: async ({ idToken }) => {
      if (idToken !== 'valid-google-token') throw new Error('invalid token');
      return { getPayload: () => ({ email: ALLOWED, email_verified: true }) };
    } },
  };
  server = createServer({ ...createAuthFixture(), dataDir, auth });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  auth.publicOrigin = url;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { force: true, recursive: true });
});

const card = () => page.locator('.login-card');
const qr = () => page.locator('#qr');

async function enroll() {
  await page.goto(url);
  await card().waitFor({ state: 'visible' });
  await page.locator('#gsi-stub').click();
  await qr().waitFor({ state: 'visible' });
  return (await page.locator('#manual-key').innerText()).trim();
}

async function signIn() {
  const key = await enroll();
  await page.locator('#code').fill(authenticator.generate(key));
  await page.locator('#totp-form button[type=submit]').click();
  await page.getByTestId('statistics-count').waitFor();
  return key;
}

test('the report stays closed until Google and Authenticator pass, and the account can sign out', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await card().waitFor({ state: 'visible' });
  expect(await page.locator('.report-header').count()).toBe(0);
  expect((await page.request.get(`${url}/api/report`)).status()).toBe(401);
  expect(await page.locator('#login-help').innerText()).toContain('Google');
  expect(await page.locator('#totp-step').isVisible()).toBe(false);

  await page.locator('#gsi-stub').click();
  await qr().waitFor({ state: 'visible' });
  expect(await qr().getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  expect(await page.locator('#login-help').innerText()).toContain(ALLOWED);
  const key = (await page.locator('#manual-key').innerText()).trim();
  expect(key).toMatch(/^[A-Z2-7]{16,}$/);
  await page.screenshot({ path: 'test-results/login-card.png' });
  expect(await page.locator('#google-button').isVisible()).toBe(false);

  await page.locator('#code').fill('000000');
  await page.locator('#totp-form button[type=submit]').click();
  await page.locator('#login-error').filter({ hasText: 'Authenticator' }).waitFor();
  expect(await page.locator('#code').inputValue()).toBe('');

  await page.locator('#code').fill(authenticator.generate(key));
  await page.locator('#totp-form button[type=submit]').click();
  await page.getByTestId('statistics-count').waitFor();
  expect(await page.locator('.login-card').count()).toBe(0);
  expect(fs.existsSync(path.join(dataDir, 'auth-users.enc'))).toBe(true);

  const logout = page.getByRole('button', { name: 'Ելք', exact: true });
  expect(await logout.getAttribute('title')).toBe(ALLOWED);
  const frame = await page.locator('.header-actions').boundingBox();
  const refresh = await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).boundingBox();
  expect(refresh.x).toBeGreaterThan(frame.x);
  expect(await logout.boundingBox()).toMatchObject({ height: refresh.height });
  await page.screenshot({ path: 'test-results/login-report.png' });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await logout.isVisible()).toBe(true);
  }


  await logout.click();
  await card().waitFor({ state: 'visible' });
  expect((await page.request.get(`${url}/api/report`)).status()).toBe(401);
});

test('a stored Authenticator skips enrollment and the code field is the only step', async () => {
  const key = await signIn();
  await page.context().clearCookies();
  await page.goto(url);
  await card().waitFor({ state: 'visible' });
  await page.locator('#gsi-stub').click();
  await page.locator('#totp-form').waitFor({ state: 'visible' });
  expect(await page.locator('#enrollment').isVisible()).toBe(false);
  await page.locator('#code').fill(authenticator.generate(key));
  await page.locator('#totp-form button[type=submit]').click();
  await page.getByTestId('statistics-count').waitFor();
});

test('the Armenian guide opens above the QR code with every screenshot loaded', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enroll();
  const guide = page.locator('#login-guide');
  expect(await guide.isVisible()).toBe(false);
  await page.getByRole('button', { name: 'Ինչպե՞ս սկանավորել', exact: true }).click();
  await guide.waitFor({ state: 'visible' });
  const dialog = page.getByRole('dialog', { name: 'Ինչպե՞ս մուտք գործել' });
  expect(await dialog.isVisible()).toBe(true);
  expect(await dialog.innerText()).toContain('Milon Report');
  const images = dialog.locator('img');
  expect(await images.count()).toBe(4);
  for (let index = 0; index < 4; index++) {
    const source = await images.nth(index).getAttribute('src');
    expect(source).toMatch(/^\/assets\/authenticator-[\w-]+\.(?:png|jpg)$/);
    expect(await images.nth(index).evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/login-guide.png' });
  await page.keyboard.press('Escape');
  await guide.waitFor({ state: 'hidden' });
  expect(await qr().isVisible()).toBe(true);
});

for (const endpoint of ['report', 'toon-expo']) {
  test(`an expired session on ${endpoint} returns to login and hides report data`, async () => {
    await signIn();
    if (endpoint === 'toon-expo') {
      await page.getByRole('button', { name: 'Հաշվետվությունների տեսակ', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Տուն Էքսպո', exact: true }).click();
      await page.getByTestId('expo-leads').waitFor();
    }
    await page.context().clearCookies();
    await page.getByRole('button', { name: 'Թարմացնել ամբողջ հաշվետվությունը', exact: true }).click();
    await card().waitFor({ state: 'visible' });
    expect(await page.locator('.report-header').count()).toBe(0);
    expect(await page.locator('#totp-step').isVisible()).toBe(false);
    expect(await page.locator('#gsi-stub').isVisible()).toBe(true);
  });
}

test('the session timer returns to login even when browser wall time differs', async () => {
  await signIn();
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, expiresIn: 1200 } });
  });
  await page.reload();
  await page.getByTestId('statistics-count').waitFor();
  await card().waitFor({ state: 'visible' });
  expect(await page.locator('.report-header').count()).toBe(0);
});
