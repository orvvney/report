const SOURCE_DIRECTORY_ID = '305';

function resolveExpoSource(directory) {
  const matches = directory.filter(row => String(row?.ID) === SOURCE_DIRECTORY_ID);
  const sourceId = matches[0]?.STATUS_ID;
  if (matches.length !== 1 || typeof sourceId !== 'string' || !sourceId.trim()) {
    throw new Error('Invalid Expo source');
  }
  return sourceId;
}

module.exports = { resolveExpoSource };
