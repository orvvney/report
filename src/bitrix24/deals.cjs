const { CheckError } = require('./config.cjs');
const { isObject } = require('./client.cjs');
const { fieldKey } = require('./details.cjs');

const PIPELINE = 'Վաճառք';
const STAGE = 'Կնքված';
const FIELD_NAMES = ['Սենյակների քանակ', 'Մակերես (մ²)', 'Կնքման ամսաթիվ'];

function invalid(method) {
  throw new CheckError(`${method}: некорректная структура данных API.`);
}

async function listAll(call, method, params, readRows, first) {
  const rows = [];
  let start = 0;
  while (true) {
    const body = start === 0 && first ? first : await call(method, { ...params, start });
    const page = readRows(body.result);
    if (!Array.isArray(page) || page.some((row) => !isObject(row))) invalid(method);
    rows.push(...page);
    if (body.next === undefined) return rows;
    if (!Number.isSafeInteger(body.next) || body.next <= start || !page.length) {
      throw new CheckError(`${method}: некорректная пагинация; полная загрузка не подтверждена.`);
    }
    start = body.next;
  }
}

// Independent ID ranges allow batch paging without counts, offsets or references
// to a missing last element. Each range stops on its own short page.
function checkPage(body, params, lower, upper = Number.MAX_SAFE_INTEGER, descending = false) {
  const items = body.result?.items;
  if (!Array.isArray(items) || items.length > 50) invalid('crm.item.list');
  let previous = descending ? Infinity : lower;
  for (const item of items) {
    const id = Number(item?.id);
    if (!isObject(item) || !/^\d+$/.test(String(item.id)) || !Number.isSafeInteger(id)
      || id <= lower || id > upper || (descending ? id >= previous : id <= previous)
      || String(item.categoryId) !== String(params.filter.categoryId) || item.stageId !== params.filter.stageId) {
      throw new CheckError('crm.item.list: нарушены фильтр или порядок сделок; полная загрузка не подтверждена.');
    }
    previous = id;
  }
  return items;
}

async function listDeals(call, params) {
  // Read both ends together: useful rows establish tight bounds even when IDs
  // are sparse or the portal has long stretches without matching deals.
  const ends = ['ASC', 'DESC'].map((id) => ({ method: 'crm.item.list',
    params: { ...params, start: -1, order: { id } } }));
  const initial = call.batch ? await call.batch(ends)
    : await Promise.all(ends.map(({ method, params: values }) => call(method, values)));
  const first = checkPage(initial[0], params, 0);
  const last = checkPage(initial[1], params, 0, Number.MAX_SAFE_INTEGER, true);
  if (first.length !== last.length) invalid('crm.item.list');
  const byId = new Map(first.map((row) => [Number(row.id), row]));
  for (const row of last) {
    const prior = byId.get(Number(row.id));
    if (prior && params.select.some((key) => JSON.stringify(prior[key]) !== JSON.stringify(row[key]))) {
      invalid('crm.item.list');
    }
    byId.set(Number(row.id), row);
  }
  const rows = [...byId.values()];
  if (first.length < 50 && rows.length !== first.length) invalid('crm.item.list');
  const lowerBound = first.length ? Number(first.at(-1).id) : 0;
  const upper = last.length ? Number(last.at(-1).id) - 1 : 0;
  const width = Math.ceil((upper - lowerBound) / 10);
  let active = [];
  if (first.length === 50) {
    for (let lower = lowerBound; lower < upper;) {
      const end = lower + Math.min(width, upper - lower);
      active.push({ lower, upper: end });
      lower = end;
    }
  }
  while (active.length) {
    const commands = active.map(({ lower, upper: end }) => ({ method: 'crm.item.list',
      params: { ...params, start: -1, filter: { ...params.filter, '>id': lower, '<=id': end } } }));
    const pages = call.batch ? await call.batch(commands)
      : await Promise.all(commands.map(({ method, params: values }) => call(method, values)));
    if (pages.length !== active.length) invalid('batch');
    const next = [];
    pages.forEach((body, index) => {
      const range = active[index];
      const page = checkPage(body, params, range.lower, range.upper);
      rows.push(...page);
      if (page.length === 50) next.push({ ...range, lower: Number(page.at(-1).id) });
    });
    active = next;
  }
  rows.sort((a, b) => Number(a.id) - Number(b.id));
  let previous = 0;
  for (const item of rows) {
    if (Number(item.id) <= previous) invalid('crm.item.list');
    previous = Number(item.id);
  }
  return rows;
}

function unique(rows, name, nameKey, idKey, kind) {
  const matches = rows.filter((row) => row[nameKey] === name);
  if (matches.length !== 1) {
    const candidates = (matches.length ? matches : rows)
      .map((row) => ({ id: row[idKey], name: row[nameKey] }));
    throw new CheckError(
      `${kind} ${JSON.stringify(name)}: ${matches.length ? 'найдено несколько совпадений' : 'не найдено'}. `
      + `Кандидаты: ${JSON.stringify(candidates)}.`,
    );
  }
  return matches[0];
}

async function getMetadata(call, { additionalFields = [], optionalFields = [] } = {}) {
  const fieldParams = { entityTypeId: 2, useOriginalUfNames: 'N' };
  const initial = call.batch ? await call.batch([
    { method: 'crm.category.list', params: { entityTypeId: 2, start: 0 } },
    { method: 'crm.item.fields', params: fieldParams },
  ]) : null;
  const categories = await listAll(call, 'crm.category.list', { entityTypeId: 2 },
    (result) => result?.categories, initial?.[0]);
  const category = unique(categories, PIPELINE, 'name', 'id', 'Воронка');
  const categoryId = Number(category.id);
  if (!/^\d+$/.test(String(category.id)) || !Number.isSafeInteger(categoryId)) invalid('crm.category.list');
  const entityId = categoryId === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${categoryId}`;
  const stages = await listAll(call, 'crm.status.list', { filter: { ENTITY_ID: entityId } },
    (result) => result);
  const stage = unique(stages.filter((row) => row.ENTITY_ID === entityId),
    STAGE, 'NAME', 'STATUS_ID', 'Стадия');
  if (typeof stage.STATUS_ID !== 'string' || !stage.STATUS_ID) invalid('crm.status.list');

  // On the live portal, Y drops explicitly selected standard fields from item.list.
  // Use the same camelCase names returned by metadata, without guessing UF codes.
  const metadata = initial?.[1] || await call('crm.item.fields', fieldParams);
  if (!isObject(metadata.result?.fields)) invalid('crm.item.fields');
  const fields = Object.entries(metadata.result.fields)
    .filter(([code]) => code.startsWith('ufCrm'))
    .map(([code, field]) => {
      if (!isObject(field)) invalid('crm.item.fields');
      return { code, title: field.title, type: field.type,
        ...(additionalFields.includes(field.title) || optionalFields.some(original => fieldKey(original) === fieldKey(code))
          ? { items: field.items, isMultiple: field.isMultiple } : {}) };
    });
  const selectedFields = [...FIELD_NAMES, ...additionalFields].map((name) => {
    const field = unique(fields, name, 'title', 'code', 'Поле');
    if (typeof field.type !== 'string' || !field.type) invalid('crm.item.fields');
    return field;
  });
  for (const original of optionalFields) {
    const matches = fields.filter(field => fieldKey(field.code) === fieldKey(original));
    if (matches.length > 1) invalid('crm.item.fields');
    if (matches.length && !selectedFields.some(field => field.code === matches[0].code)) selectedFields.push(matches[0]);
  }
  return { category, stage, fields: selectedFields };
}

async function getDeals(call, { additionalFields = [], metadata, extraSelect = [] } = {}) {
  const resolved = metadata || await getMetadata(call, { additionalFields });
  const { category, stage, fields } = resolved;
  const items = await listDeals(call, {
    entityTypeId: 2,
    useOriginalUfNames: 'N',
    filter: { categoryId: Number(category.id), stageId: stage.STATUS_ID },
    select: [...new Set(['id', 'categoryId', 'stageId', 'opportunity', 'currencyId', ...fields.map((f) => f.code), ...extraSelect])],
    order: { id: 'ASC' },
  });
  return { ...resolved, items };
}

function display(value) {
  return value === undefined || value === null || value === '' ? 'не заполнено' : JSON.stringify(value);
}

function formatResult({ category, stage, fields, items }) {
  const lines = [
    `Воронка: ${PIPELINE} (ID ${display(category.id)})`,
    `Стадия: ${STAGE} (ID ${display(stage.STATUS_ID)})`,
    ...fields.map((field) => `Поле ${field.title}: ${display(field.code)}, тип ${display(field.type)}`),
    `Загружено сделок: ${items.length}`,
  ];
  if (!items.length) lines.push('Сделок не найдено');
  for (const item of items.slice(0, 5)) {
    lines.push(
      `Сделка ID ${display(item.id)}`,
      `  ${FIELD_NAMES[0]}: ${display(item[fields[0].code])}`,
      `  Ընդհանուր արժեք: ${display(item.opportunity)}; валюта: ${display(item.currencyId)}`,
      `  ${FIELD_NAMES[1]}: ${display(item[fields[1].code])}`,
      `  ${FIELD_NAMES[2]}: ${display(item[fields[2].code])}`,
    );
  }
  lines.push('Проверка завершена. Показаны данные, доступные владельцу вебхука.');
  return lines.join('\n');
}

module.exports = { getDeals, getMetadata, formatResult };
