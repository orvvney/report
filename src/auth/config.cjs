const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

class AuthConfigError extends Error {}

const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_ALLOWED_EMAILS', 'AUTH_ENCRYPTION_SECRET', 'PUBLIC_ORIGIN'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Переменные читаются из окружения процесса, а при их отсутствии — из корневого
// .env, как это уже делает настройка вебхука Битрикс24.
function readValues({ env, envPath }) {
  const values = {};
  let file;
  for (const key of KEYS) {
    if (env[key] !== undefined) {
      values[key] = env[key];
      continue;
    }
    if (file === undefined) {
      try {
        file = parseEnv(fs.readFileSync(envPath, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw new AuthConfigError('Не удалось прочитать .env. Проверьте файл и права доступа.');
        }
        file = {};
      }
    }
    if (file[key] !== undefined) values[key] = file[key];
  }
  return values;
}

function validateOrigin(value, production) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new AuthConfigError('PUBLIC_ORIGIN должен быть абсолютным URL, например https://reportmilon.duckdns.org.');
  }
  if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol)) {
    throw new AuthConfigError('PUBLIC_ORIGIN должен содержать только HTTP(S)-источник без пути и слеша в конце.');
  }
  if (production && origin.protocol !== 'https:') {
    throw new AuthConfigError('PUBLIC_ORIGIN в production должен использовать HTTPS.');
  }
  return origin;
}

// Отсутствие всех переменных отключает авторизацию: локальный запуск и тесты
// работают как раньше. Частичная настройка — всегда ошибка, чтобы публичный
// сервер не остался случайно открытым.
function loadAuthConfig({ env = process.env, envPath = path.resolve(__dirname, '../../.env') } = {}) {
  const values = readValues({ env, envPath });
  const filled = KEYS.filter((key) => String(values[key] ?? '').trim());
  if (!filled.length) return null;
  const missing = KEYS.filter((key) => !filled.includes(key));
  if (missing.length) {
    throw new AuthConfigError(`Авторизация настроена частично: заполните ${missing.join(', ')} в .env.`);
  }

  const encryptionSecret = values.AUTH_ENCRYPTION_SECRET.trim();
  if (encryptionSecret.length < 32) {
    throw new AuthConfigError('AUTH_ENCRYPTION_SECRET должен содержать не менее 32 символов.');
  }
  const allowedEmails = values.GOOGLE_ALLOWED_EMAILS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!allowedEmails.length || allowedEmails.some((email) => !EMAIL.test(email))) {
    throw new AuthConfigError('GOOGLE_ALLOWED_EMAILS должен содержать список адресов Google через запятую.');
  }
  const production = env.NODE_ENV === 'production';
  const publicOrigin = validateOrigin(values.PUBLIC_ORIGIN.trim().replace(/\/+$/, ''), production);

  return {
    googleClientId: values.GOOGLE_CLIENT_ID.trim(),
    allowedEmails: new Set(allowedEmails),
    encryptionSecret,
    publicOrigin: publicOrigin.origin,
    secureCookies: production || publicOrigin.protocol === 'https:',
  };
}

module.exports = { AuthConfigError, loadAuthConfig, KEYS };
