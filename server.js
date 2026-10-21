const http = require('node:http');
const path = require('node:path');
const { readFile, realpath } = require('node:fs/promises');
const { loadReport } = require('./src/report/load.cjs');

function createServer({ distPath = path.join(__dirname, 'dist'), ...reportOptions } = {}) {
  return http.createServer(async (request, response) => {
    const pathname = request.url.split('?')[0];
    if (request.method === 'GET' && pathname === '/api/report') {
      const { status, body } = await loadReport(reportOptions);
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
      return;
    }
    const isIndex = ['/', '/index.html'].includes(pathname);
    const isAsset = /^\/assets\/[a-zA-Z0-9_-]+\.(?:js|css)$/.test(pathname);
    if (!['GET', 'HEAD'].includes(request.method) || (!isIndex && !isAsset)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      const root = await realpath(distPath);
      const file = await realpath(path.join(root, isIndex ? 'index.html' : pathname));
      if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Outside public build');
      const contents = await readFile(file);
      response.writeHead(200, {
        'Content-Type': isIndex ? 'text/html; charset=utf-8'
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
