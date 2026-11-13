const { createExpoLoader } = require('./src/report/expo-load.cjs');
const http = require('node:http');
const path = require('node:path');
const { readFile, realpath } = require('node:fs/promises');
const express = require('express');
const helmet = require('helmet');
const { createReportLoader } = require('./src/report/load.cjs');
const { loadAuthConfig } = require('./src/auth/config.cjs');
const { AuthService } = require('./src/auth/service.cjs');
const { createAuthRouter, createRateLimiter, requireSession, audit } = require('./src/auth/routes.cjs');

const ASSET = /^\/assets\/[a-zA-Z0-9_-]+\.(?:js|css|png|jpg)$/;

// Запрещающий список путей сохранён: раздаются только HTML сборки и assets.
function createStaticHandler({ distPath, liveReload }) {
  return async (request, response) => {
    const pathname = request.url.split('?')[0];
    const isIndex = ['/', '/index.html'].includes(pathname);
    const isFavicon = ['/favicon.ico', '/favicon.png'].includes(pathname);
    const isAsset = ASSET.test(pathname);
    if (!['GET', 'HEAD'].includes(request.method) || (!isIndex && !isAsset && !isFavicon)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      const root = await realpath(distPath);
      const file = await realpath(path.join(root, isIndex || isFavicon ? 'index.html' : pathname));
      if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Outside public build');
      let contents = await readFile(file);
      if (isFavicon) {
        const icon = contents.toString('utf8').match(/href="(\/assets\/[\w-]+\.png)"/);
        if (!icon) throw new Error('Favicon is not built');
        response.writeHead(302, { Location: icon[1], 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      if (isIndex && liveReload) contents = Buffer.from(liveReload.inject(contents.toString('utf8')));
      response.writeHead(200, {
        'Content-Type': isIndex ? 'text/html; charset=utf-8'
          : pathname.endsWith('.png') ? 'image/png'
            : pathname.endsWith('.jpg') ? 'image/jpeg'
            : pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8',
        'Content-Length': contents.length, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch {
      response.writeHead(isIndex ? 503 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : isIndex
        ? 'Էջը պատրաստ չէ։ Կատարեք npm run build։' : 'Not found');
    }
  };
}

// Инлайн-скрипт автообновления существует только в режиме разработки.
function createPolicy({ liveReload }) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com', ...(liveReload ? ["'unsafe-inline'"] : [])],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
        frameSrc: ['https://accounts.google.com'],
        connectSrc: ["'self'", 'https://accounts.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}

function createServer({ distPath = path.join(__dirname, 'dist'), dataDir = path.join(__dirname, 'data'),
  liveReload, env = process.env, envPath = path.resolve(__dirname, '.env'), auth, ...reportOptions } = {}) {
  const authConfig = auth === undefined ? loadAuthConfig({ env, envPath }) : auth;
  const authService = authConfig ? new AuthService({ dataDir, ...authConfig }) : null;
  const loadReport = createReportLoader({ env, envPath, ...reportOptions });
  const loadExpo = createExpoLoader({ env, envPath, ...reportOptions });

  const app = express();
  app.disable('x-powered-by');
  app.set('strict routing', true);
  app.set('case sensitive routing', true);
  app.set('trust proxy', 'loopback');
  app.use(createPolicy({ liveReload }));

  if (authConfig) {
    app.use((request, response, next) => {
      const origin = request.get('Origin');
      if (!origin || origin === authConfig.publicOrigin) return next();
      return response.status(403).json({ error: { code: 'origin_not_allowed', message: 'Origin is not allowed' } });
    });
  }
  app.use(express.json({ limit: '32kb' }));

  if (liveReload) app.get('/__dev/events', (request, response) => liveReload.connect(request, response));
  if (authService) app.use('/api/auth', createAuthRouter({ authService }));

  const reportGuards = authService
    ? [requireSession(authService), createRateLimiter({ limit: 60, windowMs: 60 * 1000, key: (request) => request.user?.username || request.ip })]
    : [];
  app.get(['/api/report', '/api/toon-expo'], ...reportGuards, async (request, response) => {
    const { status, body } = await (request.path === '/api/toon-expo' ? loadExpo : loadReport)({ refresh: new URL(request.url, 'http://localhost').searchParams.get('refresh') === '1' });
    if (authService) audit('report_viewed', { username: request.user.username, path: request.path, status, ip: request.ip });
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  });

  app.use(createStaticHandler({ distPath, liveReload }));
  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(`[server] ${error.name}: ${error.message}`);
    response.status(status).json({ error: { code: error.code || 'request_error',
      message: status >= 500 ? 'Internal server error' : error.message } });
  });
  return http.createServer(app);
}

if (require.main === module) {
  const port = process.env.PORT ?? '3000';
  let auth;
  try {
    auth = loadAuthConfig();
    if (!auth && process.env.NODE_ENV === 'production') {
      throw new Error('В production обязательна авторизация: заполните GOOGLE_CLIENT_ID, GOOGLE_ALLOWED_EMAILS, AUTH_ENCRYPTION_SECRET и PUBLIC_ORIGIN.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  if (process.exitCode) {
    // Ошибка настройки уже выведена.
  } else if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    console.error('PORT должен быть целым числом от 1 до 65535.');
    process.exitCode = 1;
  } else {
    const server = createServer({ auth });
    server.once('error', (error) => {
      console.error(`Не удалось запустить HTTP-сервер: ${error.code || 'ошибка запуска'}.`);
      process.exitCode = 1;
    });
    server.listen(Number(port), '127.0.0.1', () => {
      console.log(`Сайт доступен: http://127.0.0.1:${port}${auth ? ' (вход через Google и Authenticator)' : ''}`);
    });
  }
}

module.exports = { createServer };
