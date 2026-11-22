const { listRows } = require('./expo-list.cjs');

const startOfDay = date => `${date}T00:00:00+04:00`;

async function readExpoStageCounts(call, metadata, groups,
  { firstExpoDealDate, lastExpoDealDate, directDeals = [] } = {}) {
  if (!firstExpoDealDate || !lastExpoDealDate) {
    const empty = groups.map(({ name }) => ({ name, count: null }));
    return { stages: empty, after: empty };
  }

  const { entityTypeId, propertyCode, apartmentId, stages } = metadata;
  const cutoff = startOfDay(lastExpoDealDate);
  const boundary = Date.parse(cutoff);
  const [apartments, transitions] = await Promise.all([
    listRows(call, 'crm.item.list', { entityTypeId, order: { id: 'ASC' },
      filter: { [propertyCode]: apartmentId, '<createdTime': cutoff }, select: ['id', 'createdTime', propertyCode],
    }, { itemsKey: 'items', idKey: 'id' }),
    listRows(call, 'crm.stagehistory.list', { entityTypeId, order: { ID: 'ASC' },
      filter: { '<CREATED_TIME': cutoff }, select: ['ID', 'OWNER_ID', 'STAGE_ID', 'CREATED_TIME'],
    }, { itemsKey: 'items' }),
  ]);
  const created = new Map(apartments.map(item => {
    const time = Date.parse(item.createdTime);
    if (String(item[propertyCode]) !== String(apartmentId) || !(time < boundary)) {
      throw new Error('Unexpected historical apartment');
    }
    return [String(item.id), time];
  }));

  const firstBoundary = Date.parse(startOfDay(firstExpoDealDate));
  const first = new Map(), last = new Map();
  function record(snapshot, owner, time, stageId) {
    const previous = snapshot.get(owner);
    // Rows are in ID order, so the higher ID wins when timestamps are equal.
    if (!previous || time >= previous.time) snapshot.set(owner, { time, stageId });
  }
  for (const transition of transitions) {
    const owner = String(transition.OWNER_ID);
    if (!created.has(owner)) continue;
    const time = Date.parse(transition.CREATED_TIME);
    if (!(time < boundary) || typeof transition.STAGE_ID !== 'string') throw new Error('Invalid historical stage');
    record(last, owner, time, transition.STAGE_ID);
    if (created.get(owner) < firstBoundary && time < firstBoundary) record(first, owner, time, transition.STAGE_ID);
  }
  if (last.size !== created.size || first.size !== [...created.values()].filter(time => time < firstBoundary).length) {
    throw new Error('Incomplete apartment stage history');
  }

  function counts(snapshot) {
    const names = new Map();
    for (const { stageId } of snapshot.values()) {
      const name = stages.get(stageId)?.name;
      names.set(name, (names.get(name) || 0) + 1);
    }
    return groups.map(group => ({
      name: group.name,
      count: group.stages.reduce((sum, stageName) => sum + (names.get(stageName) || 0), 0),
    }));
  }
  const before = counts(first), after = counts(last);
  after[0].count = before[0].count - directDeals.length;
  return { stages: before, after };
}

module.exports = { readExpoStageCounts };
