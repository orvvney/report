const { CheckError, validateWebhook } = require('./config.cjs');

const METHODS = new Set([
  'crm.category.list', 'crm.status.list', 'crm.item.fields', 'crm.item.list',
]);
const API_ERRORS = {
  INVALID_CREDENTIALS: 'Неверные учётные данные вебхука.',
  NO_AUTH_FOUND: 'Вебхук не авторизован.',
  insufficient_scope: 'Вебхуку не хватает области доступа crm.',
  ACCESS_DENIED: 'Нет прав на чтение CRM.',
  access_denied: 'Нет прав на чтение CRM.',
  QUERY_LIMIT_EXCEEDED: 'Превышен лимит запросов. Повторите проверку позднее.',
  OPERATION_TIME_LIMIT: 'Превышен лимит времени API. Повторите проверку позднее.',
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// One queue per portal, shared by successive reports and concurrent browser tabs.
const portalQueues = new Map();
function createRequestScheduler({ intervalMs = 200 } = {}) {
  let tail = Promise.resolve();
  let lastStart = -Infinity;
  return function schedule(task) {
    const result = tail.then(async () => {
      let remaining;
      while ((remaining = intervalMs - (performance.now() - lastStart)) > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.ceil(remaining)));
      }
      lastStart = performance.now();
      return task();
    });
    tail = result.catch(() => {});
    return result;
  };
}

function createClient({ webhookUrl, fetchImpl = globalThis.fetch, timeoutMs = 15000, scheduleRequest }) {
  const base = validateWebhook(webhookUrl);
  if (!scheduleRequest) {
    const portal = new URL(base).origin;
    if (!portalQueues.has(portal)) portalQueues.set(portal, createRequestScheduler());
    scheduleRequest = portalQueues.get(portal);
  }
  async function call(method, params) {
    if (!METHODS.has(method)) throw new CheckError('Разрешены только методы чтения интеграции.');
    return scheduleRequest(() => request(method, params));
  }
  // Only structured, allowlisted read commands may enter a batch.
  call.batch = async (commands) => {
    if (!Array.isArray(commands) || !commands.length || commands.length > 50
      || commands.some((command) => !isObject(command) || !METHODS.has(command.method))) {
      throw new CheckError('batch: разрешено от 1 до 50 методов чтения интеграции.');
    }
    const cmd = Object.fromEntries(commands.map(({ method, params }, index) => {
      const query = new URLSearchParams();
      function append(key, value) {
        if (Array.isArray(value) || isObject(value)) {
          for (const [child, entry] of Object.entries(value)) append(`${key}[${child}]`, entry);
        } else query.append(key, String(value));
      }
      for (const [key, value] of Object.entries(params)) append(key, value);
      return [`q${index}`, `${method}?${query}`];
    }));
    const { result } = await scheduleRequest(() => request('batch', { halt: 1, cmd }));
    const map = (value) => isObject(value) || (Array.isArray(value) && value.length === 0);
    if (!isObject(result) || !map(result.result_error) || Object.keys(result.result_error).length
      || !isObject(result.result) || !map(result.result_total) || !map(result.result_next)) {
      throw new CheckError('batch: ошибка или некорректный ответ пакета; полная загрузка не подтверждена.');
    }
    return commands.map((_, index) => {
      const key = `q${index}`;
      if (!Object.hasOwn(result.result, key)) throw new CheckError('batch: отсутствует результат запроса.');
      return { result: result.result[key],
        ...(Object.hasOwn(result.result_total, key) ? { total: result.result_total[key] } : {}),
        ...(Object.hasOwn(result.result_next, key) ? { next: result.result_next[key] } : {}) };
    });
  };
  return call;

  // Start the response timeout only when the request leaves the queue.
  async function request(method, params) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CheckError(`${method}: время ожидания ответа истекло.`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        deadline,
        (async () => {
          const response = await fetchImpl(`${base}${method}.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(params),
            signal: controller.signal,
            redirect: 'error',
          });
          if (!response.ok) {
            const status = Number.isInteger(response.status) ? response.status : 'неизвестен';
            throw new CheckError(`${method}: ошибка HTTP ${status}. Проверьте доступ к API.`);
          }
          let body;
          try { body = await response.json(); }
          catch { throw new CheckError(`${method}: ответ API не является корректным JSON.`); }
          if (!isObject(body)) throw new CheckError(`${method}: некорректный ответ API.`);
          if (Object.hasOwn(body, 'error')) {
            const reason = Object.hasOwn(API_ERRORS, body.error)
              ? API_ERRORS[body.error] : 'REST API вернул ошибку. Проверьте вебхук и права CRM.';
            throw new CheckError(`${method}: ${reason}`);
          }
          if (!Object.hasOwn(body, 'result')) throw new CheckError(`${method}: отсутствует result в ответе API.`);
          return body;
        })(),
      ]);
    } catch (error) {
      if (error instanceof CheckError) throw error;
      if (controller.signal.aborted) throw new CheckError(`${method}: время ожидания ответа истекло.`);
      throw new CheckError(`${method}: сетевая ошибка. Проверьте соединение и доступность портала.`);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { createClient, createRequestScheduler, isObject };
