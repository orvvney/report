const path = require('node:path');
const { createFixture } = require('./crm-fixture.cjs');
const root = process.argv[2];
const { createDevelopmentServer } = require(path.join(root, 'scripts/dev.cjs'));
createDevelopmentServer({ root, ...createFixture() }).then(({ server, close }) => {
  server.once('error', async (error) => { console.error(error); await close(); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await close(); process.exit(0); });
  server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
}).catch((error) => { console.error(error); process.exitCode = 1; });
