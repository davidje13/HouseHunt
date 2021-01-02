#!/usr/bin/env -S node --disable-proto delete --disallow-code-generation-from-strings

import DB from '../database/db.mjs';
import PROVIDERS from '../providers/index.mjs';

async function processProvider(db, provider) {
  const providerState = await db.getProviderState(provider.name);
  let count = 0;
  while (true) {
    const batch = await db.getDirtyBatch(providerState.id, 100);
    if (!batch.length) {
      break;
    }
    for (const item of batch) {
      const filter = item.filterName;
      const processed = provider.processData(filter, item.raw);
      await db.recordProcessed(item.id, processed);
    }
    count += batch.length;
  }
  process.stderr.write(`Finished processing ${provider.name} (${count})\n`);
}

async function run() {
  const db = new DB();
  try {
    await db.connect();
    for (const provider of PROVIDERS) {
      await processProvider(db, provider);
    }
    process.stderr.write('Done.\n');
  } finally {
    try {
      db.close();
    } catch (e) {
      // ignore (do not pollute meaningful error)
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
