const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { authenticator } = require('otplib');
const { createServer } = require('../../server.js');
const { AuthService } = require('../../src/auth/service.cjs');
const { createAuthFixture } = require('../support/auth-fixture.cjs');

const SECRET = 'a'.repeat(32);
const ORIGIN = 'http://127.0.0.1:3000';
const ALLOWED = 'first@example.com';

let server, base, dataDir;
const googleClient = (email = ALLOWED, verified = true) => ({
  verifyIdToken: async ({ idToken }) => {
    if (idToken !== 'valid-google-token') throw new Error('invalid token');
    return { getPayload: () => ({ email, email_verified: verified }) };
  },
});

async function start({ auth, ...options } = {}) {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-auth-api-'));
  server = createServer({ ...createAuthFixture(), dataDir, ...options,
    auth: auth === undefined ? { googleClientId: 'client', allowedEmails: new Set([ALLOWED]),
      encryptionSecret: SECRET, publicOrigin: ORIGIN, secureCookies: false, googleClient: googleClient() } : auth });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { force: true, recursive: true });
});

const post = (url, body, cookie) => fetch(base + url, { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });

// Браузер хранит выданные cookie между шагами входа; тест повторяет это.
function createJar() {
  const store = new Map();
  return {
    header: () => [...store].map(([name, value]) => `${name}=${value}`).join('; '),
    keep(response) {
      for (const entry of response.headers.getSetCookie?.() || []) {
        const [name, value] = entry.split(';')[0].split('=');
        if (value) store.set(name, value); else store.delete(name);
      }
      return response;
    },
  };
}

// Полный вход: токен Google, привязка Authenticator и доступ к отчёту.
async function signIn() {
  const jar = createJar();
  jar.keep(await post('/api/auth/google', { credential: 'valid-google-token' }));
  const enroll = await jar.keep(await post('/api/auth/enroll', {}, jar.header())).json();
  const login = jar.keep(await post('/api/auth/login', { code: authenticator.generate(enroll.manualKey) }, jar.header()));
  return { enroll, login, jar, session: jar.header() };
}

test('report and session routes stay closed until Google and Authenticator pass', async () => {
  await start();
  const closed = await fetch(`${base}/api/report`);
  expect(closed.status).toBe(401);
  expect((await fetch(`${base}/api/toon-expo?refresh=1`)).status).toBe(401);
  expect(await closed.json()).toEqual({ error: { code: 'authentication_required', message: 'Մուտք գործեք համակարգ' } });
  expect((await fetch(`${base}/api/auth/me`)).status).toBe(401);
  expect(await (await fetch(`${base}/api/auth/config`)).json()).toEqual({ googleClientId: 'client' });
  expect((await post('/api/auth/enroll')).status).toBe(401);
  expect((await post('/api/auth/login', { code: '000000' })).status).toBe(401);

  const jar = createJar();
  const google = jar.keep(await post('/api/auth/google', { credential: 'valid-google-token' }));
  expect(await google.json()).toEqual({ email: ALLOWED, requiresEnrollment: true });
  expect(jar.header()).toContain('report_google_challenge=');
  const enroll = await jar.keep(await post('/api/auth/enroll', {}, jar.header())).json();
  expect(enroll.qrCode.startsWith('data:image/png;base64,')).toBe(true);
  expect(jar.header()).toContain('report_totp_enrollment=');

  expect((await post('/api/auth/login', { code: '000000' }, jar.header())).status).toBe(401);
  const login = jar.keep(await post('/api/auth/login', { code: authenticator.generate(enroll.manualKey) }, jar.header()));
  expect(await login.json()).toEqual({ username: ALLOWED });
  const session = jar.header();
  expect(session).toContain('report_session=');
  expect(session).not.toContain('report_google_challenge=');
  const report = await fetch(`${base}/api/report`, { headers: { cookie: session } });
  expect(report.status).toBe(200);
  expect(report.headers.get('cache-control')).toBe('no-store');
  expect((await report.json()).deals.length).toBeGreaterThan(0);
  expect((await fetch(`${base}/api/toon-expo`, { headers: { cookie: session } })).status).toBe(200);
  const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).json();
  expect(me.username).toBe(ALLOWED);
  expect(me.expiresIn).toBeGreaterThan(14 * 60 * 1000);
  expect(me.expiresIn).toBeLessThanOrEqual(15 * 60 * 1000);
});

test('rejected Google tokens and accounts never reach Authenticator', async () => {
  await start();
  expect((await post('/api/auth/google', { credential: 'forged' })).status).toBe(401);
  expect((await post('/api/auth/google', {})).status).toBe(401);
  await new Promise((resolve) => server.close(resolve));

  await start({ auth: { googleClientId: 'client', allowedEmails: new Set([ALLOWED]), encryptionSecret: SECRET,
    publicOrigin: ORIGIN, secureCookies: false, googleClient: googleClient('other@example.com') } });
  const foreign = await post('/api/auth/google', { credential: 'valid-google-token' });
  expect(foreign.status).toBe(403);
  expect((await foreign.json()).error.code).toBe('google_account_not_allowed');
  await new Promise((resolve) => server.close(resolve));

  await start({ auth: { googleClientId: 'client', allowedEmails: new Set([ALLOWED]), encryptionSecret: SECRET,
    publicOrigin: ORIGIN, secureCookies: false, googleClient: googleClient(ALLOWED, false) } });
  expect((await post('/api/auth/google', { credential: 'valid-google-token' })).status).toBe(401);
});

test('five wrong codes block further attempts for the same account', async () => {
  await start();
  const jar = createJar();
  jar.keep(await post('/api/auth/google', { credential: 'valid-google-token' }));
  const enroll = await jar.keep(await post('/api/auth/enroll', {}, jar.header())).json();
  for (let attempt = 0; attempt < 5; attempt++) {
    expect((await post('/api/auth/login', { code: '000000' }, jar.header())).status).toBe(401);
  }
  const blocked = await post('/api/auth/login', { code: authenticator.generate(enroll.manualKey) }, jar.header());
  expect(blocked.status).toBe(429);
  expect((await blocked.json()).error.code).toBe('too_many_attempts');
});

test('logout revokes the issued session and the report closes again', async () => {
  await start();
  const { session } = await signIn();
  expect((await fetch(`${base}/api/report`, { headers: { cookie: session } })).status).toBe(200);
  const logout = await post('/api/auth/logout', {}, session);
  expect(await logout.json()).toEqual({ ok: true });
  expect((await fetch(`${base}/api/toon-expo`, { headers: { cookie: session } })).status).toBe(401);
  expect((await fetch(`${base}/api/report`, { headers: { cookie: session } })).status).toBe(401);
  expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: session } })).status).toBe(401);
});

test('a session signed with another secret is refused', async () => {
  await start();
  const { session } = await signIn();
  const forged = new AuthService({ dataDir, encryptionSecret: 'c'.repeat(32), googleClientId: 'client',
    allowedEmails: new Set([ALLOWED]) });
  const cookie = forged.cookie(forged.createSession({ username: ALLOWED, sessionVersion: 0 })).split(';')[0];
  expect((await fetch(`${base}/api/report`, { headers: { cookie } })).status).toBe(401);
  expect((await fetch(`${base}/api/report`, { headers: { cookie: session } })).status).toBe(200);
});

test('requests from another origin are refused before any handler', async () => {
  await start();
  const foreign = await fetch(`${base}/api/auth/config`, { headers: { Origin: 'https://evil.example' } });
  expect(foreign.status).toBe(403);
  expect((await foreign.json()).error.code).toBe('origin_not_allowed');
  expect((await fetch(`${base}/api/auth/config`, { headers: { Origin: ORIGIN } })).status).toBe(200);
  expect((await fetch(base, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
});

test('the page and its assets stay public so the login form can load', async () => {
  await start();
  const index = await fetch(base);
  expect(index.status).toBe(200);
  expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(index.headers.get('content-security-policy')).toContain('https://accounts.google.com');
  expect(index.headers.get('content-security-policy')).toContain("script-src 'self' https://accounts.google.com;");
  const assets = (await index.text()).match(/\/assets\/[\w.-]+/g) || [];
  expect(assets.length).toBeGreaterThan(0);
  for (const asset of assets) expect((await fetch(base + asset)).status).toBe(200);
});

test('without configuration the report opens and the login API is absent', async () => {
  await start({ auth: null });
  expect((await fetch(`${base}/api/report`)).status).toBe(200);
  const me = await fetch(`${base}/api/auth/me`);
  expect(me.status).toBe(404);
  expect(me.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  expect((await fetch(`${base}/api/auth/config`)).status).toBe(404);
  expect(fs.existsSync(path.join(dataDir, 'auth-users.enc'))).toBe(false);
});
