const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { main } = require('../../scripts/bitrix-check.cjs');
const { loadConfig } = require('../../src/bitrix24/config.cjs');
const { createClient } = require('../../src/bitrix24/client.cjs');
const { getDeals } = require('../../src/bitrix24/deals.cjs');

const TOKEN = 'synthetic-test-secret';
const URL = `https://portal.example/rest/7/${TOKEN}/`;
const codes = ['ufCrm100', 'ufCrm200', 'ufCrm300'];
const titles = ['Սենյակների քանակ', 'Մակերես (մ²)', 'Կնքման ամսաթիվ'];
const reply = (body) => ({ ok: true, status: 200, json: async () => body });

function fixture({ count = 51, categoryId = 3 } = {}) {
  const entityId = categoryId === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${categoryId}`;
  const stageId = categoryId === 0 ? 'WON' : `C${categoryId}:WON`;
  const categories = [{ id: 90, name: 'Другая' }, { id: categoryId, name: 'Վաճառք' }];
  const stages = [
    { ID: '900', ENTITY_ID: 'DEAL_STAGE_90', STATUS_ID: 'C90:WON', NAME: 'Կնքված' },
    { ID: '901', ENTITY_ID: entityId, STATUS_ID: stageId, NAME: 'Կնքված' },
  ];
  const fields = {
    opportunity: { title: 'Сумма', type: 'double' },
    closedate: { title: titles[2], type: 'date' },
    ...Object.fromEntries(codes.map((code, i) => [code, { title: titles[i], type: ['integer', 'double', 'date'][i] }])),
  };
  const items = Array.from({ length: count }, (_, i) => ({
    id: i + 1, categoryId, stageId, opportunity: '123456.789', currencyId: 'AMD',
    [codes[0]]: 0, [codes[1]]: '75.05', [codes[2]]: '2026-10-20T23:15:00+04:00',
  }));
  // Foreign deals must be excluded by the transmitted filters.
  const allItems = [...items, { id: 9001, categoryId: 90, stageId: 'C90:WON' },
    { id: 9002, categoryId, stageId: 'NEW' }];
  const fetchImpl = jest.fn(async (url, options) => {
    const method = url.split('/').at(-1).replace(/\.json$/, '');
    const params = JSON.parse(options.body);
    if (method === 'crm.category.list') return reply({ result: { categories } });
    if (method === 'crm.status.list') return reply({ result: stages });
    if (method === 'crm.item.fields') {
      const entries = Object.entries(fields).map(([key, value]) => [
        params.useOriginalUfNames === 'Y' && key.startsWith('ufCrm')
          ? `UF_CRM_${key.slice(5)}` : key, value,
      ]);
      return reply({ result: { fields: Object.fromEntries(entries) } });
    }
    if (method === 'crm.item.list') {
      const matches = allItems.filter((item) => item.categoryId === params.filter.categoryId
        && item.stageId === params.filter.stageId);
      const page = matches.slice(params.start, params.start + 50).map((item) => {
        // Reproduce the observed portal behavior: Y omits selected standard fields.
        const entries = Object.entries(item).map(([key, value]) => [
          params.useOriginalUfNames === 'Y' && key.startsWith('ufCrm')
            ? `UF_CRM_${key.slice(5)}` : key, value,
        ]);
        return Object.fromEntries(entries.filter(([key]) => params.select.includes(key)
          && (params.useOriginalUfNames !== 'Y' || key.startsWith('UF_CRM_'))));
      });
      return reply({
        result: { items: page },
        ...(params.start + 50 < matches.length ? { next: params.start + 50 } : {}),
      });
    }
    throw new Error(`Unexpected method ${method}`);
  });
  return { fetchImpl, categories, stages, fields, items, stageId };
}

async function run(fetchImpl, options = {}) {
  let out = '';
  let err = '';
  const code = await main({
    env: { BITRIX24_WEBHOOK_URL: URL }, fetchImpl,
    stdout: { write: (text) => { out += text; } },
    stderr: { write: (text) => { err += text; } },
    ...options,
  });
  return { code, out, err };
}

describe('Bitrix24 configuration', () => {
  let dir;
  let envPath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-bitrix-test-'));
    envPath = path.join(dir, '.env');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('reads .env without changing it and prioritizes process environment', () => {
    const contents = `# synthetic fixture\nBITRIX24_WEBHOOK_URL="${URL}"\n`;
    fs.writeFileSync(envPath, contents);
    expect(loadConfig({ env: {}, envPath }).webhookUrl).toBe(URL);
    const other = 'https://other.example/rest/2/other-synthetic-token';
    expect(loadConfig({ env: { BITRIX24_WEBHOOK_URL: other }, envPath }).webhookUrl).toBe(`${other}/`);
    expect(fs.readFileSync(envPath, 'utf8')).toBe(contents);
  });

  test.each([
    undefined, '', 'invalid', 'http://portal.example/rest/7/token/',
    `${URL}crm.item.list`, `${URL}?auth=secret`, `${URL}#fragment`,
    'https://user:password@portal.example/rest/7/token/',
  ])('invalid or absent configuration fails before network requests: %s', async (value) => {
    const fetchImpl = jest.fn();
    const result = await run(fetchImpl, { env: { BITRIX24_WEBHOOK_URL: value }, envPath });
    expect(result.code).toBe(1);
    expect(result.err).toContain('Заполните BITRIX24_WEBHOOK_URL в .env');
    expect(result.out).toBe('');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an explicitly empty environment variable does not fall back to a file', async () => {
    fs.writeFileSync(envPath, `BITRIX24_WEBHOOK_URL=${URL}\n`);
    const result = await run(jest.fn(), { env: { BITRIX24_WEBHOOK_URL: '' }, envPath });
    expect(result.code).toBe(1);
  });

  test('actual executable exits with code 1 without printing stack or environment', () => {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/bitrix-check.cjs')], {
      env: { ...process.env, BITRIX24_WEBHOOK_URL: '' }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Заполните BITRIX24_WEBHOOK_URL');
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain(' at ');
  });
});

describe('Bitrix24 complete check', () => {
  test('keeps system and custom fields when the portal omits system fields in original-name mode', async () => {
    const result = await run(fixture({ count: 1 }).fetchImpl);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain('Сделка ID 1');
    expect(result.out).toContain('Ընդհանուր արժեք: "123456.789"; валюта: "AMD"');
    expect(result.out).toContain('Սենյակների քանակ: 0');
  });
  test('retrieves 51 matching deals, follows next and prints only five samples', async () => {
    const f = fixture();
    const result = await run(f.fetchImpl);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain('Загружено сделок: 51');
    expect(result.out.match(/Сделка ID /g)).toHaveLength(5);
    expect(result.out).toContain('Ընդհանուր արժեք: "123456.789"; валюта: "AMD"');
    expect(result.out).toContain('Սենյակների քանակ: 0');
    for (const code of codes) expect(result.out).toContain(code);
    expect(result.out).not.toContain(TOKEN);
    const requests = f.fetchImpl.mock.calls.map(([url, opts]) => ({ url, ...opts, params: JSON.parse(opts.body) }));
    expect(requests.every((req) => req.method === 'POST' && req.redirect === 'error')).toBe(true);
    expect(requests.find((r) => r.url.endsWith('crm.status.list.json')).params.filter)
      .toEqual({ ENTITY_ID: 'DEAL_STAGE_3' });
    expect(requests.find((r) => r.url.endsWith('crm.item.fields.json')).params)
      .toEqual({ entityTypeId: 2, useOriginalUfNames: 'N' });
    const lists = requests.filter((r) => r.url.endsWith('crm.item.list.json'));
    expect(lists.map((r) => r.params.start)).toEqual([0, 50]);
    for (const { params } of lists) {
      expect(params).toMatchObject({
        entityTypeId: 2, useOriginalUfNames: 'N',
        filter: { categoryId: 3, stageId: 'C3:WON' }, order: { id: 'ASC' },
        select: ['id', 'categoryId', 'stageId', 'opportunity', 'currencyId', ...codes],
      });
      expect(Object.keys(params.filter)).toHaveLength(2);
    }
    const data = await getDeals(createClient({ webhookUrl: URL, fetchImpl: f.fetchImpl }));
    expect(data.items).toHaveLength(51);
    expect(data.items.at(-1).id).toBe(51);
  });

  test('supports the default category ID 0 and uses STATUS_ID, not directory ID', async () => {
    const f = fixture({ categoryId: 0, count: 1 });
    const result = await run(f.fetchImpl);
    expect(result.code).toBe(0);
    expect(result.out).toContain('ID "WON"');
    const params = JSON.parse(f.fetchImpl.mock.calls.find(([url]) => url.endsWith('crm.status.list.json'))[1].body);
    expect(params.filter).toEqual({ ENTITY_ID: 'DEAL_STAGE' });
  });

  test.each(['category', 'stage', ...codes])('missing or ambiguous %s stops before reading deals', async (target) => {
    for (const duplicate of [false, true]) {
      const f = fixture();
      if (target === 'category') {
        if (duplicate) f.categories.push({ ...f.categories[1], id: 8 });
        else f.categories.pop();
      } else if (target === 'stage') {
        if (duplicate) f.stages.push({ ...f.stages[1], STATUS_ID: 'OTHER' });
        else f.stages.pop();
      } else {
        if (duplicate) f.fields[`${target}_COPY`] = { ...f.fields[target] };
        else delete f.fields[target];
      }
      const result = await run(f.fetchImpl);
      expect(result.code).toBe(1);
      expect(result.err).toContain(duplicate ? 'несколько совпадений' : 'не найдено');
      expect(result.err).toContain('Кандидаты:');
      expect(result.out).toBe('');
      expect(f.fetchImpl.mock.calls.some(([url]) => url.endsWith('crm.item.list.json'))).toBe(false);
    }
  });

  test('empty selection succeeds with an explicit message', async () => {
    const result = await run(fixture({ count: 0 }).fetchImpl);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Загружено сделок: 0');
    expect(result.out).toContain('Сделок не найдено');
    expect(result.out).not.toContain('Сделка ID ');
  });

  test('preserves raw dates, amounts, arrays and zero while marking empty values', async () => {
    const f = fixture({ count: 2 });
    f.items[0][codes[1]] = [0, '20.005'];
    f.items[1][codes[0]] = null;
    f.items[1][codes[1]] = '';
    delete f.items[1][codes[2]];
    const result = await run(f.fetchImpl);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Загружено сделок: 2');
    expect(result.out.match(/Сделка ID /g)).toHaveLength(2);
    expect(result.out).toContain('[0,"20.005"]');
    expect(result.out).toContain('2026-10-20T23:15:00+04:00');
    expect(result.out.match(/не заполнено/g)).toHaveLength(3);
    expect(result.out).toContain('Սենյակների քանակ: 0');
  });

  test('redacts secrets even if reflected inside metadata or values', async () => {
    const f = fixture({ count: 1 });
    f.items[0][codes[0]] = `${TOKEN} ${URL}`;
    const result = await run(f.fetchImpl);
    expect(result.code).toBe(0);
    expect(result.out).not.toContain(TOKEN);
    expect(result.out).not.toContain(URL);
    expect(result.out).toContain('[скрыто]');
  });
});

describe('Bitrix24 safe errors', () => {
  test.each([
    ['HTTP', async () => ({ ok: false, status: 403, json: async () => ({ secret: URL }) }), 'HTTP 403'],
    ['REST', async () => reply({ error: 'ACCESS_DENIED', error_description: URL }), 'Нет прав'],
    ['unknown REST', async () => reply({ error: TOKEN, error_description: URL }), 'REST API'],
    ['JSON', async () => ({ ok: true, json: async () => { throw new Error(URL); } }), 'JSON'],
    ['network', async () => { throw new Error(URL); }, 'сетевая ошибка'],
    ['missing result', async () => reply({ value: URL }), 'отсутствует result'],
    ['invalid structure', async () => reply({ result: { categories: 'bad' } }), 'структура'],
  ])('%s failures do not leak the URL or print success', async (_name, fetchImpl, expected) => {
    const result = await run(fetchImpl);
    expect(result.code).toBe(1);
    expect(result.err).toContain(expected);
    expect(result.err).toContain('crm.category.list');
    expect(result.err).not.toContain(TOKEN);
    expect(result.err).not.toContain(URL);
    expect(result.out).toBe('');
  });

  test.each(['request', 'body'])('bounds %s time and aborts the request', async (phase) => {
    const fetchImpl = jest.fn(async () => phase === 'request'
      ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) });
    const result = await run(fetchImpl, { timeoutMs: 10 });
    expect(result.code).toBe(1);
    expect(result.err).toContain('время ожидания');
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.out).toBe('');
  });

  test('a failure on the second page never reports a complete count', async () => {
    const f = fixture();
    const fetchImpl = async (url, opts) => {
      if (url.endsWith('crm.item.list.json') && JSON.parse(opts.body).start === 50) {
        return reply({ error: 'QUERY_LIMIT_EXCEEDED', error_description: URL });
      }
      return f.fetchImpl(url, opts);
    };
    const result = await run(fetchImpl);
    expect(result.code).toBe(1);
    expect(result.err).toContain('лимит запросов');
    expect(result.err).not.toContain(TOKEN);
    expect(result.out).toBe('');
  });

  test.each([0, -1, '50'])('invalid next=%s does not loop or report success', async (next) => {
    const f = fixture();
    const result = await run(async (url, opts) => {
      const response = await f.fetchImpl(url, opts);
      if (url.endsWith('crm.item.list.json')) {
        const body = await response.json();
        body.next = next;
        return reply(body);
      }
      return response;
    });
    expect(result.code).toBe(1);
    expect(result.err).toContain('пагинация');
    expect(result.out).toBe('');
  });

  test.each(['filter', 'duplicate'])('rejects invalid returned deals: %s', async (failure) => {
    const f = fixture({ count: 2 });
    if (failure === 'duplicate') f.items[1].id = f.items[0].id;
    const result = await run(async (url, opts) => {
      const response = await f.fetchImpl(url, opts);
      if (url.endsWith('crm.item.list.json') && failure === 'filter') {
        const body = await response.json();
        body.result.items[0].categoryId = 99;
        return reply(body);
      }
      return response;
    });
    expect(result.code).toBe(1);
    expect(result.err).toContain('фильтр или порядок');
    expect(result.out).toBe('');
  });
});
