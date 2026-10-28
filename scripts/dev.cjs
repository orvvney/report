const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createServer } = require('../server.js');

async function createDevelopmentServer({ root = path.resolve(__dirname, '..'), ...reportOptions } = {}) {
  const { build } = await import('vite');
  const clients = new Set();
  let revision = randomUUID();
  const liveReload = {
    connect(request, response) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      clients.add(response);
      response.write(`data: ${revision}\n\n`);
      response.on('close', () => clients.delete(response));
    },
    inject(html) {
      return html.replace('</head>', `<script>
        const changes = new EventSource('/__dev/events');
        changes.onmessage = ({ data }) => {
          if (data !== ${JSON.stringify(revision)}) { changes.close(); location.reload(); }
        };
      </script></head>`);
    },
  };
  // Keep development output separate from the build used by npm start and tests.
  const distPath = path.join(root, 'dist-dev');
  // Loading the .mjs config directly avoids transient .vite-temp modules that
  // node --watch treats as changes and would restart on every build.
  const watcher = await build({ root, configLoader: 'native', build: { outDir: distPath, watch: {} } });
  let built = false;
  try {
    await new Promise((resolve, reject) => {
      watcher.on('event', (event) => {
        if (event.code === 'START') built = false;
        if (event.code === 'ERROR') { console.error(event.error); reject(event.error); }
        if (event.code === 'BUNDLE_END') built = true;
        if (event.code === 'END' && built) {
          revision = randomUUID();
          for (const client of clients) client.write(`data: ${revision}\n\n`);
          resolve();
        }
      });
    });
  } catch (error) {
    await watcher.close();
    throw error;
  }
  const server = createServer({ ...reportOptions, distPath, liveReload });
  const close = async () => {
    for (const client of clients) client.end();
    server.closeAllConnections();
    await Promise.all([watcher.close(), new Promise((resolve) => server.close(resolve))]);
  };
  return { server, close };
}

if (require.main === module) {
  const port = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    console.error('PORT должен быть целым числом от 1 до 65535.');
    process.exitCode = 1;
  } else {
    createDevelopmentServer().then(({ server, close }) => {
      server.once('error', async (error) => {
        console.error(`Не удалось запустить HTTP-сервер: ${error.code || 'ошибка запуска'}.`);
        await close(); process.exitCode = 1;
      });
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
        await close(); process.exit(0);
      });
      server.listen(Number(port), '127.0.0.1', () => {
        console.log(`Автообновление включено: http://127.0.0.1:${port}`);
      });
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = { createDevelopmentServer };
