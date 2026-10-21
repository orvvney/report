const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async () => {
  // Never expose the project root: it now contains the local webhook secret.
  const index = fs.readFileSync(path.resolve(__dirname, '../../index.html'));
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!['GET', 'HEAD'].includes(request.method) || !['/', '/index.html'].includes(pathname)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : index);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  process.env.E2E_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  global.__E2E_SERVER__ = server;
};
