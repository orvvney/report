const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createServer } = require('../../server.js');
const { createFixture } = require('./crm-fixture.cjs');
module.exports = async () => {
  execFileSync(process.execPath, [path.resolve(__dirname, '../../node_modules/vite/bin/vite.js'), 'build'], {
    cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' },
  });
  const server = createServer(createFixture());
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  process.env.E2E_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  global.__E2E_SERVER__ = server;
};
