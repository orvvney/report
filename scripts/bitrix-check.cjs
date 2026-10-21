const path = require('node:path');
const { CheckError, loadConfig, redact } = require('../src/bitrix24/config.cjs');
const { createClient } = require('../src/bitrix24/client.cjs');
const { getDeals, formatResult } = require('../src/bitrix24/deals.cjs');

async function main({
  env = process.env,
  envPath = path.resolve(__dirname, '../.env'),
  fetchImpl = globalThis.fetch,
  timeoutMs,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let webhookUrl;
  try {
    ({ webhookUrl } = loadConfig({ env, envPath }));
    const call = createClient({ webhookUrl, fetchImpl, timeoutMs });
    const result = await getDeals(call);
    stdout.write(`${redact(formatResult(result), webhookUrl)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof CheckError ? error.message : 'Внутренняя ошибка проверки API.';
    stderr.write(`${redact(message, webhookUrl)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}

module.exports = { main };
