const fs = require('node:fs/promises');
const path = require('node:path');
const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
let root, child, output, processGroup;

async function stopChild() {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    if (processGroup) process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
    await exited;
  }
}

beforeEach(async () => {
  const project = path.resolve(__dirname, '../..');
  await fs.mkdir(path.join(project, 'test-results'), { recursive: true });
  root = await fs.mkdtemp(path.join(project, 'test-results/dev-'));
  for (const file of ['src', 'scripts/dev.cjs', 'server.js', 'vite.config.mjs', 'index.html', 'package.json', '.gitignore']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.cp(path.join(project, file), path.join(root, file), { recursive: true });
  }
  output = ''; processGroup = false;
  child = fork(path.resolve(__dirname, '../support/dev-server.cjs'), [root], { silent: true });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => { output += data; });
  const { port } = await new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('exit', () => reject(new Error(output)));
    child.once('error', reject);
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('footer time').waitFor();
});
afterEach(async () => {
  await stopChild();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

test('saving UI and shared calculation code rebuilds and refreshes the open report automatically', async () => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const appPath = path.join(root, 'src/ui/App.vue');
  const app = await fs.readFile(appPath, 'utf8');
  await fs.writeFile(appPath, app.replace('Հաշվետվություններ</p>', 'Ավտոմատ թարմացում</p>'));
  await page.getByText('Ավտոմատ թարմացում', { exact: true }).waitFor();
  await page.locator('footer time').waitFor();
  const filterPath = path.join(root, 'src/report/filter.cjs');
  const filter = await fs.readFile(filterPath, 'utf8');
  await fs.writeFile(filterPath, filter.replace('count: 0 });', 'count: 10 });'));
  await page.getByTestId('total-count').filter({ hasText: 'Գործարքների քանակ՝ 63' }).waitFor();
  expect(errors).toEqual([]);
  for (const route of ['/.env', '/src/ui/App.vue', '/server.js']) {
    expect((await page.request.get(new URL(route, page.url()).href)).status()).toBe(404);
  }
});

test('a failed rebuild keeps the current page and a corrected file updates it', async () => {
  await page.evaluate(() => { window.previousPage = true; });
  const mainPath = path.join(root, 'src/ui/main.js');
  const original = await fs.readFile(mainPath, 'utf8');
  const buildError = new Promise((resolve) => {
    const listener = (chunk) => {
      if (/ERROR|error|Unexpected|Expected/.test(chunk.toString())) { child.stderr.off('data', listener); resolve(); }
    };
    child.stderr.on('data', listener);
  });
  await fs.writeFile(mainPath, `${original}\nconst broken = ;`);
  await buildError;
  expect(await page.evaluate(() => window.previousPage)).toBe(true);
  const navigation = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
  await fs.writeFile(mainPath, original);
  await navigation; await page.locator('footer time').waitFor();
  expect(await page.evaluate(() => window.previousPage)).toBeUndefined();
});

test('npm run dev stays running, reloads UI and restarts once after a server edit', async () => {
  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(error.message));
  page.on('requestfailed', (request) => diagnostics.push([request.url(), request.failure()]));
  page.on('response', (response) => diagnostics.push([response.url(), response.status()]));
  await stopChild();
  const portProbe = net.createServer();
  await new Promise((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  output = ''; processGroup = process.platform !== 'win32';
  child = spawn(process.execPath, [process.env.npm_execpath, 'run', 'dev'], {
    cwd: root, detached: processGroup, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), BITRIX24_WEBHOOK_URL: 'invalid-test-configuration' },
  });
  const started = new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      output += data;
      if (output.includes('Автообновление включено:')) resolve();
    });
    child.stderr.on('data', (data) => { output += data; });
    child.once('error', reject);
    child.once('exit', () => reject(new Error(output)));
  });
  await started;
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('alert').waitFor();
  const appPath = path.join(root, 'src/ui/App.vue');
  const app = await fs.readFile(appPath, 'utf8');
  await fs.writeFile(appPath, app.replace('Հաշվետվություններ</p>', 'CLI ավտոմատ թարմացում</p>'));
  await page.getByText('CLI ավտոմատ թարմացում', { exact: true }).waitFor();
  await page.getByRole('alert').waitFor();
  expect(output.match(/Автообновление включено:/g)).toHaveLength(1);
  // A server-side module edit must restart the process and reconnect the browser.
  // Tailwind can rebuild first when server.js changes; wait for the new process,
  // then its HTML response rather than accepting that earlier browser reload.
  const reloaded = page.waitForResponse((response) => response.url() === `http://127.0.0.1:${port}/`
    && (output.match(/Автообновление включено:/g) || []).length === 2);
  await fs.appendFile(path.join(root, 'server.js'), '\n// CLI restart regression\n');
  await reloaded;
  try { await page.getByRole('alert').waitFor(); }
  catch (error) { console.log({ output, diagnostics, html: await page.content() }); throw error; }
  await page.getByText('CLI ավտոմատ թարմացում', { exact: true }).waitFor();
  expect(output.match(/Автообновление включено:/g)).toHaveLength(2);
  expect(output).not.toContain('.vite-temp');
  expect(child.exitCode).toBeNull();
});
