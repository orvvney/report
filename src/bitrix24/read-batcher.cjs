// A server owns one coordinator. It combines independent reads arriving in the
// same event-loop turn, without retaining data or changing the portal scheduler.
function createReadBatcher() {
  const sources = new Map();
  return function enqueue(source, commands, execute, options = {}) {
    return new Promise((resolve, reject) => {
      let queue = sources.get(source);
      if (!queue) {
        queue = [];
        sources.set(source, queue);
        // Browser requests may arrive in adjacent I/O turns. A short collection
        // window also aligns the next independent phases of both loaders.
        setTimeout(() => { sources.delete(source); flush(queue); }, 10);
      }
      queue.push({commands, execute, options, resolve, reject});
    });
  };
}

async function flush(queue) {
  while (queue.length) {
    const groups = [];
    let size = 0;
    while (queue.length && size + queue[0].commands.length <= 50) {
      const group = queue.shift();
      groups.push(group); size += group.commands.length;
    }
    try {
      const results = await groups[0].execute(groups.flatMap(g => g.commands), {allowPartial:true});
      let offset = 0;
      for (const group of groups) {
        const own = results.slice(offset, offset + group.commands.length);
        offset += group.commands.length;
        if (!group.options.allowPartial && own.some(result => result === null)) {
          // Retry required failures independently through the strict client.
          // A failure in one block cannot discard the other block's results.
          group.execute(group.commands).then(group.resolve, group.reject);
        } else group.resolve(own);
      }
    } catch (error) {
      groups.forEach(group => group.reject(error));
    }
  }
}

module.exports = { createReadBatcher };
