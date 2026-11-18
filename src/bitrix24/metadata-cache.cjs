const METHODS = new Set(['crm.type.list', 'crm.category.list', 'crm.status.list', 'crm.item.fields']);
const stable = value => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);

// Cache only read-only directories, never records or count responses.
function createMetadataCache({ now = () => new Date(), ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  const sources = new Map();
  function wrap(call, source) {
    if (!sources.has(source)) sources.set(source, new Map());
    const cache = sources.get(source);
    async function batch(commands, options = {}) {
      if (!Array.isArray(commands) || !commands.length || commands.length > 50 || commands.some(command => !command || typeof command.method !== 'string')) return call.batch(commands, options);
      const missing = [], entries = commands.map(command => {
        if (!METHODS.has(command.method)) {
          const entry = {}; missing.push({ command, entry }); return entry;
        }
        const key = `${command.method}:${stable(command.params)}`;
        const cached = cache.get(key);
        if (cached && (cached.pending || now().getTime() - cached.at < ttlMs)) return cached;
        const entry = { pending: true };
        entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
        // A failed request can finish before another batch starts awaiting it.
        entry.promise.catch(() => {});
        cache.set(key, entry); missing.push({ command, entry, key }); return entry;
      });
      if (missing.length) {
        try {
          const values = await call.batch(missing.map(item => item.command), options);
          missing.forEach(({ entry, key }, index) => {
            const value = values[index];
            entry.pending = false; entry.at = now().getTime();
            if (key) {
              if (value === null && cache.get(key) === entry) cache.delete(key);
              entry.resolve(structuredClone(value));
            } else entry.promise = Promise.resolve(value);
          });
        } catch (error) {
          missing.forEach(({ entry, key }) => {
            if (key && cache.get(key) === entry) cache.delete(key);
            if (key) entry.reject(error);
          });
          throw error;
        }
      }
      return Promise.all(entries.map(async entry => structuredClone(await entry.promise)));
    }
    const client = async (method, params) => METHODS.has(method)
      ? (await batch([{ method, params }]))[0] : call(method, params);
    client.batch = batch;
    return client;
  }
  return { wrap, invalidate(source) { sources.get(source)?.clear(); } };
}
module.exports = { createMetadataCache };
