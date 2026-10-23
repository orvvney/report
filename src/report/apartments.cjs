const PROPERTY_TYPE = 'Անշարժ գույքի տեսակ';
const APARTMENT = 'Բնակարան';

function enumId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
}

function apartmentItems({ fields, items }) {
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
  const options = field.items.filter((entry) => entry.VALUE === APARTMENT);
  if (options.length !== 1) throw new Error('Apartment option must be unique');
  const apartmentId = enumId(options[0].ID);
  return items.filter((item) => enumId(item[field.code]) === apartmentId);
}

module.exports = { PROPERTY_TYPE, apartmentItems };
