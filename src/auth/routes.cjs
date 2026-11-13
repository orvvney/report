const express = require('express');

function requestError(message, status = 400, code = 'invalid_request') {
  return Object.assign(new Error(message), { status, code });
}

const TOO_MANY = { error: { code: 'too_many_requests', message: 'Չափազանց շատ հարցումներ։ Փորձեք ավելի ուշ։' } };

function createRateLimiter({ limit, windowMs, key = (req) => req.ip }) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const id = key(req);
    const entry = attempts.get(id);
    if (!entry || entry.resetAt <= now) {
      if (attempts.size >= 10000) {
        for (const [entryKey, value] of attempts) if (value.resetAt <= now) attempts.delete(entryKey);
        if (attempts.size >= 10000) return res.status(429).json(TOO_MANY);
      }
      attempts.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count <= limit) return next();
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json(TOO_MANY);
  };
}

function audit(event, fields = {}) {
  console.log(JSON.stringify({ type: 'audit', event, at: new Date().toISOString(), ...fields }));
}

// Сессию проверяют и API отчёта, и выход; HTML и assets остаются публичными,
// потому что форма входа живёт внутри собранного приложения.
function requireSession(authService) {
  return (req, res, next) => {
    const session = authService.readSession(req);
    if (!session) {
      return res.status(401).json({ error: { code: 'authentication_required', message: 'Մուտք գործեք համակարգ' } });
    }
    req.user = session;
    return next();
  };
}

function createAuthRouter({ authService }) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const authRateLimit = createRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 });
  const loginFailures = new Map();

  router.get('/config', (_req, res) => res.json({ googleClientId: authService.googleClientId }));

  router.post('/google', authRateLimit, async (req, res, next) => {
    try {
      const email = await authService.verifyGoogleCredential(req.body?.credential);
      res.setHeader('Set-Cookie', authService.googleCookie(authService.createGoogleChallenge(email)));
      audit('google_auth_success', { username: email, ip: req.ip });
      res.json({ email, requiresEnrollment: !authService.hasUser(email) });
    } catch (error) { audit('google_auth_failure', { ip: req.ip }); next(error); }
  });

  router.get('/me', (req, res) => {
    const session = authService.readSession(req);
    if (!session) return res.status(401).json({ error: { code: 'authentication_required', message: 'Մուտք գործեք համակարգ' } });
    // expiresIn считается на сервере: часы браузера могут быть сбиты.
    return res.json({ username: session.username, expiresAt: session.exp, expiresIn: Math.max(0, session.exp - Date.now()) });
  });

  router.post('/enroll', authRateLimit, async (req, res, next) => {
    try {
      const challenge = authService.readGoogleChallenge(req);
      if (!challenge) throw requestError('Նախ մուտք գործեք Google հաշվով', 401, 'google_authentication_required');
      const enrollment = await authService.beginEnrollment(challenge.username);
      res.setHeader('Set-Cookie', authService.enrollmentCookie(enrollment.token));
      res.set('Cache-Control', 'no-store');
      audit('totp_enrollment_started', { username: challenge.username, ip: req.ip });
      res.json({ qrCode: enrollment.qrCode, manualKey: enrollment.manualKey });
    } catch (error) { next(error); }
  });

  router.post('/login', authRateLimit, (req, res, next) => {
    try {
      const challenge = authService.readGoogleChallenge(req);
      if (!challenge) throw requestError('Նախ մուտք գործեք Google հաշվով', 401, 'google_authentication_required');
      const key = `${req.ip}:${challenge.username}`;
      const attempt = loginFailures.get(key) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > Date.now()) throw requestError('Չափազանց շատ սխալ փորձեր։ Փորձեք 5 րոպե անց։', 429, 'too_many_attempts');
      const user = authService.verifyLogin(challenge.username, req.body?.code, authService.readEnrollment(req));
      if (!user) {
        attempt.count += 1;
        if (attempt.count >= 5) { attempt.count = 0; attempt.blockedUntil = Date.now() + 5 * 60 * 1000; }
        loginFailures.set(key, attempt);
        audit('totp_login_failure', { username: challenge.username, ip: req.ip });
        throw requestError('Authenticator կոդը սխալ է կամ արդեն ժամկետանց է', 401, 'invalid_code');
      }
      loginFailures.delete(key);
      res.setHeader('Set-Cookie', [authService.cookie(authService.createSession(user)), authService.clearGoogleCookie(), authService.clearEnrollmentCookie()]);
      audit('login_success', { username: user.username, ip: req.ip });
      res.json({ username: user.username });
    } catch (error) { next(error); }
  });

  router.post('/logout', (req, res) => {
    const session = authService.readSession(req);
    if (session) {
      authService.revokeSessions(session.username);
      audit('logout', { username: session.username, ip: req.ip });
    }
    res.setHeader('Set-Cookie', [authService.clearCookie(), authService.clearGoogleCookie(), authService.clearEnrollmentCookie()]);
    res.json({ ok: true });
  });

  router.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'API route not found' } }));

  return router;
}

module.exports = { createAuthRouter, createRateLimiter, requireSession, requestError, audit };
