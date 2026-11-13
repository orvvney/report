const { createExpoLoader } = require('./src/report/expo-load.cjs');
const http = require('node:http');
const path = require('node:path');
const { readFile, realpath } = require('node:fs/promises');
const { createReportLoader } = require('./src/report/load.cjs');

function createServer({ distPath = path.join(__dirname, 'dist'), liveReload, ...reportOptions } = {}) {
  const loadReport = createReportLoader(reportOptions);
  const loadExpo = createExpoLoader(reportOptions);
  return http.createServer(async (request, response) => {
    const pathname = request.url.split('?')[0];
    if (liveReload && request.method === 'GET' && pathname === '/__dev/events') {
      liveReload.connect(request, response);
      return;
    }
    if (request.method === 'GET' && ['/api/report', '/api/toon-expo'].includes(pathname)) {
      const { status, body } = await (pathname === '/api/toon-expo' ? loadExpo : loadReport)({ refresh: new URL(request.url, 'http://localhost').searchParams.get('refresh') === '1' });
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
      return;
    }
    const isIndex = ['/', '/index.html'].includes(pathname);
    const isFavicon = ['/favicon.ico', '/favicon.png'].includes(pathname);
    const isAsset = /^\/assets\/[a-zA-Z0-9_-]+\.(?:js|css|png)$/.test(pathname);
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
  });
}

if (require.main === module) {
  const port = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    console.error('PORT должен быть целым числом от 1 до 65535.');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.once('error', (error) => {
      console.error(`Не удалось запустить HTTP-сервер: ${error.code || 'ошибка запуска'}.`);
      process.exitCode = 1;
    });
    server.listen(Number(port), '127.0.0.1', () => {
      console.log(`Сайт доступен: http://127.0.0.1:${port}`);
    });
  }
}

module.exports = { createServer };
