function idOf(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid ID');
  return Number(value);
}
async function list(call, method, filter, select, first) {
  return listRows(call, method, { filter, select, order: { ID: 'ASC' } }, { first });
}

async function listRows(call, method, params, { first, itemsKey, idKey = 'ID' } = {}) {
  const initial = first || await call(method, { ...params, start: 0 });
  const rows = [], seen = new Set();
  function append(body, start, total) {
    const page = itemsKey ? body.result?.[itemsKey] : body.result;
    if (!Array.isArray(page) || page.length > 50) throw new Error('Invalid list');
    if (total !== undefined && (body.total !== total || page.length !== Math.min(50, total - start))) throw new Error('Changing list');
    if (body.next !== undefined && (!Number.isSafeInteger(body.next) || body.next !== start + 50 || page.length !== 50)) throw new Error('Invalid pagination');
    for (const row of page) {
      const id = idOf(row?.[idKey]);
      if (seen.has(id) || (rows.length && id <= Number(rows.at(-1)[idKey]))) throw new Error('Invalid order');
      seen.add(id); rows.push(row);
    }
  }
  const total = initial.total;
  if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) throw new Error('Invalid total');
  append(initial, 0, total);
  if (total !== undefined && call.batch) {
    for (let start = 50; start < total; start += 2500) {
      const commands = [];
      for (let offset = start; offset < Math.min(total, start + 2500); offset += 50)
        commands.push({ method, params: { ...params, start: offset } });
      const pages = await call.batch(commands);
      if (pages.length !== commands.length) throw new Error('Missing page');
      pages.forEach((page, index) => append(page, commands[index].params.start, total));
    }
  } else {
    let body = initial;
    while (body.next !== undefined) {
      const start = body.next;
      body = await call(method, { ...params, start });
      append(body, start, total);
    }
  }
  if (total !== undefined && rows.length !== total) throw new Error('Incomplete list');
  return rows;
}
module.exports = { idOf, list, listRows };
