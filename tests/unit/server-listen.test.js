const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('the start command accepts connections on all IPv4 interfaces', () => {
  const filename = path.resolve(__dirname, '../../server.js');
  const realRequire = createRequire(filename);
  const server = { once: jest.fn(), listen: jest.fn() };
  const entryModule = { exports: {} };
  const entryRequire = (name) => {
    if (name === 'node:http') return { createServer: () => server };
    if (name === './src/auth/config.cjs') return { loadAuthConfig: () => null };
    if (name === './src/report/load.cjs') return { createReportLoader: () => jest.fn() };
    if (name === './src/report/expo-load.cjs') return { createExpoLoader: () => jest.fn() };
    return realRequire(name);
  };
  entryRequire.main = entryModule;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: entryRequire, module: entryModule, __dirname: path.dirname(filename),
    process: { env: { PORT: '3456' } }, console,
  }, { filename });
  expect(server.listen).toHaveBeenCalledWith(3456, '0.0.0.0', expect.any(Function));
});
