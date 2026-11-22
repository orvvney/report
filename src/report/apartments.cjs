const PROPERTY_TYPE = 'Անշարժ գույքի տեսակ';
const APARTMENT = 'Բնակարան';

function enumId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
}

function apartmentItems({ fields, items }, propertyType = APARTMENT) {
  const matches = fields.filter((field) => field.title === PROPERTY_TYPE);
  const field = matches[0];
  if (matches.length !== 1 || field.type !== 'enumeration' || field.isMultiple !== false
    || !Array.isArray(field.items)) throw new Error('Invalid property type metadata');
  const ids = new Set();
  for (const entry of field.items) {
    const id = enumId(entry?.ID);
    if (!id || typeof entry.VALUE !== 'string' || ids.has(id)) throw new Error('Invalid property type options');
    ids.add(id);
  }
  const options = field.items.filter((entry) => entry.VALUE === propertyType);
  if (options.length !== 1) throw new Error('Apartment option must be unique');
  const apartmentId = enumId(options[0].ID);
  return items.filter((item) => enumId(item[field.code]) === apartmentId);
}

async function readSalesApartmentFields(call) {
  const categories = [];
  let start = 0;
  while (true) {
    const page = await call('crm.category.list', { entityTypeId: 2, start });
    if (!Array.isArray(page.result?.categories)) throw new Error('Invalid categories');
    categories.push(...page.result.categories);
    if (page.next === undefined) break;
    if (!Number.isSafeInteger(page.next) || page.next <= start || !page.result.categories.length) throw new Error('Invalid pagination');
    start = page.next;
  }
  const matches = categories.filter(row => row?.name === 'Վաճառք');
  const categoryId = matches[0]?.id;
  if (matches.length !== 1 || !/^\d+$/.test(String(categoryId)) || !Number.isSafeInteger(Number(categoryId))) throw new Error('Invalid sales pipeline');
  const body = await call('crm.item.fields', { entityTypeId: 2, useOriginalUfNames: 'Y' });
  if (!body.result?.fields || typeof body.result.fields !== 'object' || Array.isArray(body.result.fields)) throw new Error('Invalid fields');
  const fields = Object.entries(body.result.fields).map(([code, field]) => ({ ...field, code }));
  apartmentItems({ fields, items: [] });
  const property = fields.find(field => field.title === PROPERTY_TYPE);
  const apartmentId = property.items.find(item => item.VALUE === APARTMENT).ID;
  return { categoryId, fields, propertyCode: property.code, apartmentId };
}

module.exports = { PROPERTY_TYPE, apartmentItems, readSalesApartmentFields };
