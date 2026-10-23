const { CheckError } = require('./config.cjs');
const { isObject } = require('./client.cjs');

const PIPELINE = 'Վաճառք';
const STAGE = 'Կնքված';
const FIELD_NAMES = ['Սենյակների քանակ', 'Մակերես (մ²)', 'Կնքման ամսաթիվ'];

function invalid(method) {
  throw new CheckError(`${method}: некорректная структура данных API.`);
}

async function listAll(call, method, params, readRows) {
  const rows = [];
  let start = 0;
  while (true) {
    const body = await call(method, { ...params, start });
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

async function getDeals(call, { additionalFields = [] } = {}) {
  const categories = await listAll(call, 'crm.category.list', { entityTypeId: 2 },
    (result) => result?.categories);
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
  const metadata = await call('crm.item.fields', { entityTypeId: 2, useOriginalUfNames: 'N' });
  if (!isObject(metadata.result?.fields)) invalid('crm.item.fields');
  const fields = Object.entries(metadata.result.fields)
    .filter(([code]) => code.startsWith('ufCrm'))
    .map(([code, field]) => {
      if (!isObject(field)) invalid('crm.item.fields');
      return { code, title: field.title, type: field.type,
        ...(additionalFields.includes(field.title) ? { items: field.items, isMultiple: field.isMultiple } : {}) };
    });
  const selectedFields = [...FIELD_NAMES, ...additionalFields].map((name) => {
    const field = unique(fields, name, 'title', 'code', 'Поле');
    if (typeof field.type !== 'string' || !field.type) invalid('crm.item.fields');
    return field;
  });
  const items = await listAll(call, 'crm.item.list', {
    entityTypeId: 2,
    useOriginalUfNames: 'N',
    filter: { categoryId, stageId: stage.STATUS_ID },
    select: ['id', 'categoryId', 'stageId', 'opportunity', 'currencyId', ...selectedFields.map((f) => f.code)],
    order: { id: 'ASC' },
  }, (result) => result?.items);
  let previousId = 0;
  for (const item of items) {
    const id = Number(item.id);
    if (!/^\d+$/.test(String(item.id)) || !Number.isSafeInteger(id) || id <= previousId
      || String(item.categoryId) !== String(categoryId) || item.stageId !== stage.STATUS_ID) {
      throw new CheckError('crm.item.list: нарушены фильтр или порядок сделок; полная загрузка не подтверждена.');
    }
    previousId = id;
  }
  return { category, stage, fields: selectedFields, items };
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

module.exports = { getDeals, formatResult };
