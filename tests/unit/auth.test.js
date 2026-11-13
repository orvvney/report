const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { authenticator } = require('otplib');
const { loadAuthConfig } = require('../../src/auth/config.cjs');
const { AuthService } = require('../../src/auth/service.cjs');

const SECRET = 'a'.repeat(32);
const FULL = {
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_ALLOWED_EMAILS: ' First@Example.com , second@example.com ',
  AUTH_ENCRYPTION_SECRET: SECRET,
  PUBLIC_ORIGIN: 'https://reportmilon.duckdns.org/',
};
const MISSING = path.join(os.tmpdir(), 'report-auth-missing.env');

function service(overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-auth-'));
  return { dataDir, auth: new AuthService({ dataDir, encryptionSecret: SECRET, googleClientId: 'client',
    allowedEmails: new Set(['first@example.com']), ...overrides }) };
}

test('authorization stays off without variables and never half-configured', () => {
  expect(loadAuthConfig({ env: {}, envPath: MISSING })).toBeNull();
  for (const key of Object.keys(FULL)) {
    const partial = { ...FULL };
    delete partial[key];
    expect(() => loadAuthConfig({ env: partial, envPath: MISSING })).toThrow(new RegExp(key));
  }
});

test('configuration normalizes accounts and origin and rejects weak values', () => {
  const config = loadAuthConfig({ env: FULL, envPath: MISSING });
  expect(config.googleClientId).toBe('client.apps.googleusercontent.com');
  expect([...config.allowedEmails]).toEqual(['first@example.com', 'second@example.com']);
  expect(config.publicOrigin).toBe('https://reportmilon.duckdns.org');
  expect(config.secureCookies).toBe(true);
  expect(loadAuthConfig({ env: { ...FULL, PUBLIC_ORIGIN: 'http://127.0.0.1:3000' }, envPath: MISSING }).secureCookies).toBe(false);
  for (const [field, value] of [
    ['AUTH_ENCRYPTION_SECRET', 'b'.repeat(31)],
    ['GOOGLE_ALLOWED_EMAILS', 'not-an-email'],
    ['PUBLIC_ORIGIN', 'https://reportmilon.duckdns.org/reports'],
    ['PUBLIC_ORIGIN', 'reportmilon.duckdns.org'],
  ]) {
    expect(() => loadAuthConfig({ env: { ...FULL, [field]: value }, envPath: MISSING })).toThrow(new RegExp(field));
  }
  expect(() => loadAuthConfig({ env: { ...FULL, PUBLIC_ORIGIN: 'http://127.0.0.1:3000', NODE_ENV: 'production' }, envPath: MISSING }))
    .toThrow(/HTTPS/);
});

test('only allowed and valid Google accounts are accepted', () => {
  const { auth } = service();
  expect(() => auth.normalizeUsername('second@example.com')).toThrow(expect.objectContaining({ status: 403, code: 'google_account_not_allowed' }));
  expect(() => auth.normalizeUsername('broken')).toThrow(expect.objectContaining({ status: 400 }));
  expect(auth.normalizeUsername(' First@Example.com ')).toBe('first@example.com');
});

test('enrollment is stored encrypted only after the first valid code', async () => {
  const { dataDir, auth } = service();
  const enrollment = await auth.beginEnrollment('first@example.com');
  expect(enrollment.qrCode.startsWith('data:image/png;base64,')).toBe(true);
  expect(enrollment.manualKey).toMatch(/^[A-Z2-7]{16,}$/);
  expect(auth.verifyLogin('first@example.com', '000000', enrollment.token)).toBeNull();
  expect(fs.existsSync(path.join(dataDir, 'auth-users.enc'))).toBe(false);

  const user = auth.verifyLogin('first@example.com', authenticator.generate(enrollment.manualKey), enrollment.token);
  expect(user).toMatchObject({ username: 'first@example.com', enabled: true, sessionVersion: 0 });
  const stored = fs.readFileSync(path.join(dataDir, 'auth-users.enc'), 'utf8');
  expect(stored).not.toContain(enrollment.manualKey);
  expect(stored).not.toContain('first@example.com');
  expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['data', 'iv', 'tag']);
  expect(auth.listUsers()[0].secret).toBe(enrollment.manualKey);
  await expect(auth.beginEnrollment('first@example.com')).rejects.toMatchObject({ status: 409 });
});

test('a second enrollment token cannot replace an existing Authenticator', async () => {
  const { auth } = service();
  const first = await auth.beginEnrollment('first@example.com');
  const second = auth.createSignedToken({ username: 'first@example.com', secret: authenticator.generateSecret(), type: 'enrollment', exp: Date.now() + 60000 });
  expect(auth.verifyLogin('first@example.com', authenticator.generate(first.manualKey), first.token)).toBeTruthy();
  expect(auth.verifyLogin('first@example.com', authenticator.generate(auth.readSignedToken(second, 'enrollment').secret), second)).toBeNull();
});

test('signed tokens resist tampering, foreign keys and expiry', () => {
  const { auth } = service();
  const other = service({ encryptionSecret: 'c'.repeat(32) }).auth;
  const token = auth.createSignedToken({ username: 'first@example.com', type: 'google', exp: Date.now() + 60000 });
  expect(auth.readSignedToken(token, 'google').username).toBe('first@example.com');
  expect(auth.readSignedToken(token, 'session')).toBeNull();
  expect(other.readSignedToken(token, 'google')).toBeNull();
  expect(auth.readSignedToken(`${token}x`, 'google')).toBeNull();
  expect(auth.readSignedToken(token.split('.')[0], 'google')).toBeNull();
  expect(auth.readSignedToken(auth.createSignedToken({ username: 'first@example.com', type: 'google', exp: Date.now() - 1 }), 'google')).toBeNull();
});

test('sessions follow the stored version and the cookie carries protective flags', async () => {
  const { auth } = service({ secureCookies: true });
  const enrollment = await auth.beginEnrollment('first@example.com');
  const user = auth.verifyLogin('first@example.com', authenticator.generate(enrollment.manualKey), enrollment.token);
  const cookie = auth.cookie(auth.createSession(user));
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('Max-Age=900');
  const request = { headers: { cookie: cookie.split(';')[0] } };
  expect(auth.readSession(request).username).toBe('first@example.com');
  auth.revokeSessions('first@example.com');
  expect(auth.readSession(request)).toBeNull();
  expect(auth.readSession({ headers: {} })).toBeNull();
  expect(auth.readSession({ headers: { cookie: 'report_session=%E0%A4%A' } })).toBeNull();
});
