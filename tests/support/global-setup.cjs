const { createServer } = require('../../server.js');

module.exports = async () => {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  process.env.E2E_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  global.__E2E_SERVER__ = server;
};
