const fs = require('node:fs');
const { parseEnv } = require('node:util');

class CheckError extends Error {}

function validateWebhook(value) {
  const hint = 'Заполните BITRIX24_WEBHOOK_URL в .env базовым HTTPS URL входящего вебхука без имени REST-метода.';
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error();
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !/^\/rest\/[1-9]\d*\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) throw new Error();
    url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
    return url.href;
  } catch {
    throw new CheckError(hint);
  }
}

function loadConfig({ env = process.env, envPath } = {}) {
  let value = env.BITRIX24_WEBHOOK_URL;
  if (value === undefined) {
    try {
      value = parseEnv(fs.readFileSync(envPath, 'utf8')).BITRIX24_WEBHOOK_URL;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new CheckError('Не удалось прочитать .env. Проверьте файл и права доступа.');
      }
    }
  }
  return { webhookUrl: validateWebhook(value) };
}

function redact(text, webhookUrl) {
  if (!webhookUrl) return text;
  const url = new URL(webhookUrl);
  const token = url.pathname.split('/').filter(Boolean).at(-1);
  return [webhookUrl, webhookUrl.replace(/\/$/, ''), token]
    .reduce((output, secret) => output.split(secret).join('[скрыто]'), text);
}

module.exports = { CheckError, validateWebhook, loadConfig, redact };
