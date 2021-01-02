#!/usr/bin/env -S node --disable-proto delete --disallow-code-generation-from-strings

import DB from '../database/db.mjs';
import PROVIDERS from '../providers/index.mjs';

async function importFromProvider(db, provider) {
  const providerState = await db.getProviderState(provider.name);
  const progress = providerState.importProgress;
  const setProgress = (p) => db.setProviderImportProgress(providerState.id, p);

  if (progress !== 'done') {
    // Full scan (load from last stopping point until we run out of records)
    process.stderr.write(`Full load for ${provider.name} from ${progress || 'beginning'}\n`);
    for await (const listing of provider.getFullListings(progress, setProgress)) {
      process.stderr.write(`Loading ${provider.name}: ${listing.id} (${listing.filterName})\n`);
      await db.add(providerState.id, listing.id, listing.raw, listing.filterName);
    }
    await db.setProviderImportProgress(providerState.id, 'done');
    process.stderr.write(`Finished loading ${provider.name}\n`);
    // fall-through to incremental update to get latest data
  }

  // Incremental update (load until we find records we know)
  process.stderr.write(`Incremental update for ${provider.name}\n`);
  const gen = provider.getLatestListings();
  let genFeedback = true;
  while (true) {
    const next = await gen.next(genFeedback);
    if (next.done) {
      break;
    }
    const listing = next.value;
    if (await db.has(providerState.id, listing.id)) {
      genFeedback = false;
    } else {
      process.stderr.write(`Loading ${provider.name}: ${listing.id} (${listing.filterName})\n`);
      await db.add(providerState.id, listing.id, listing.raw, listing.filterName);
      genFeedback = true;
    }
  }
  process.stderr.write(`Finished updating ${provider.name}\n`);
}

async function run() {
  const providers = [];
  for (const provider of PROVIDERS) {
    const err = await provider.checkConnectionError();
    if (err) {
      process.stderr.write(`Unable to use provider ${provider.name}: ${err}\n`);
    } else {
      providers.push(provider);
    }
  }
  if (!providers.length) {
    throw new Error('No data providers available/configured');
  }

  const db = new DB();
  try {
    await db.connect();
    await Promise.all(providers.map((provider) => importFromProvider(db, provider)));
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
