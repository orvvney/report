const http = require('node:http');
const path = require('node:path');
const { readFile } = require('node:fs/promises');

function createServer() {
  const indexPath = path.join(__dirname, 'index.html');

  return http.createServer(async (request, response) => {
    // Serve only the page: the project root contains the private CRM webhook.
    const pathname = request.url.split('?')[0];
    if (!['GET', 'HEAD'].includes(request.method)
      || !['/', '/index.html'].includes(pathname)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    try {
      const index = await readFile(indexPath);
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': index.length,
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : index);
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Unable to read index.html');
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
