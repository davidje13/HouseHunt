import { callAPI } from './api.mjs';

class TooManyError extends Error {}
const EFFECTIVELY_INF = 1e50;

export const strategyPaginated = (stopIfTooMany = false, pageSize = 100, maxPages = 100) => function* (filter, progress = 1) {
  for (let page = progress; page < maxPages; page += 1) {
    const { total, stop } = yield {
      progress: page,
      filter: { ...filter, page_number: page, page_size: pageSize },
    };
    if (stop || total <= page * pageSize) {
      return;
    }
    if (stopIfTooMany && total > maxPages * pageSize) {
      throw new TooManyError();
    }
  }
  console.warn('Too many items found; some will be lost');
};

export const strategyFiltered = (options, extraKey = 'filterName') => function* (filter, progress = 0) {
  for (let i = progress; i < options.length; i += 1) {
    const option = options[i];
    const { tooMany } = yield {
      progress: i,
      filter: { ...filter, ...option.filter },
      extra: (extraKey && option.name) ? { [extraKey]: option.name } : {},
    };
    if (tooMany) {
      throw new TooManyError();
    }
  }
};

export const strategyBands = ({
  name,
  minKey,
  maxKey,
  begin,
  softBegin,
  maxStep,
  minStep,
  softEnd,
  end,
  delta = 0,
  extras = {},
}) => function* (filter, progress = {}) {
  let {
    min = begin,
    max = Math.max(begin + minStep, softBegin),
  } = progress;
  const effEnd = Math.min(end, EFFECTIVELY_INF); // avoid infinity, which cannot be stored in JSON

  while (min < effEnd) {
    console.info(`Loading ${name} ${min} - ${max}`);
    const subFilter = { ...filter, ...extras };
    if (min > -EFFECTIVELY_INF) {
      subFilter[minKey] = min;
    }
    if (max < EFFECTIVELY_INF) {
      subFilter[maxKey] = max - delta;
    }
    const { total, tooMany } = yield {
      progress: { min, max },
      filter: subFilter,
    };
    const gap = max - min;
    if (tooMany) {
      const newGap = Math.floor(Math.max((Math.min(gap, maxStep) / 4) / minStep, 1)) * minStep;
      if (newGap >= gap) {
        throw new TooManyError();
      }
      console.info(`Too many results (${total}); reducing ${name} range from ${gap} to ${newGap}`);
      max = min + newGap;
    } else {
      min = max;
      max += Math.round(Math.max((Math.min(gap * 2, maxStep)) / minStep, 1)) * minStep;
      if (max >= softEnd) {
        max = effEnd;
      }
    }
  }
};

export const strategyApplyIfNeeded = (subStrategy) => function* (filter, progress) {
  if (!progress) {
    const { tooMany } = yield { progress: null, filter };
    if (!tooMany) {
      return;
    }
  }
  yield* subStrategy(filter, progress);
};

const yieldFilterHandler = () => {
  return function* (filter, extras, progress, resultOut) {
    const result = yield { filter, extras, progress };
    Object.assign(resultOut, result);
  };
};

export const strategyMulti = (subconfigs) => async function* (filter, progress = { pos: 0 }) {
  for (let i = progress.pos; i < subconfigs.length; i += 1) {
    console.info(`Beginning sub-strategy ${i + 1}`);
    const subGen = getListings(
      { ...filter, ...subconfigs[i].filter },
      subconfigs[i].strategies,
      progress.sub,
      null,
      yieldFilterHandler,
    );
    let result = {};
    while (true) {
      const next = await subGen.next(result);
      if (next.done) {
        break;
      }
      const sub = next.value;
      result = yield {
        progress: { pos: i, sub: sub.progress },
        filter: sub.filter,
        extras: sub.extras,
      };
    }
    delete progress.sub;
  }
};

const yieldListingsHandler = (setProgress) => {
  const observedIds = new Set();

  return async function* (filter, extras, progress, resultOut) {
    if (setProgress) {
      await setProgress(progress);
    }
    const data = await callAPI('property_listings', filter);

    resultOut.total = data.result_count;
    resultOut.tooMany = false;
    resultOut.stop = false;

    for (const listing of data.listing) {
      const id = listing.listing_id;
      if (observedIds.has(id)) { // avoid overlap between pages if data has changed
        console.info(`Skipping ${id} (already seen)`);
      } else {
        observedIds.add(id);
        const status = yield { id: id, raw: JSON.stringify(listing), ...extras };
        if (status === false) {
          // consumer wants us to stop
          console.info('Consumer rejected property; stopping current segment');
          resultOut.stop = true;
          break;
        }
      }
    }
  };
};

export async function* getListings(
  baseFilter,
  pagingStrategies,
  progress = undefined,
  setProgress = undefined,
  handler = yieldListingsHandler,
) {
  const filterHandler = handler(setProgress);
  const generators = [];
  const filters = [baseFilter];
  const extras = [{}];
  const progresses = JSON.parse(progress || '[]');
  const strategyCount = pagingStrategies.length;
  const latestResult = {};
  for (let i = 0; i >= 0;) {
    if (i === strategyCount) {
      yield* filterHandler(
        filters[i],
        extras[i],
        JSON.stringify(progresses),
        latestResult,
      );
      i -= 1;
      continue;
    }
    if (!generators[i]) {
      generators[i] = pagingStrategies[i](filters[i], progresses[i] ?? undefined);
    }
    try {
      const genStep = await generators[i].next(latestResult);
      if (genStep.done) {
        generators[i] = null;
        progresses[i] = null;
        i -= 1;
        continue;
      }
      const step = genStep.value;
      progresses[i] = step.progress;
      filters[i + 1] = step.filter;
      extras[i + 1] = Object.assign({}, extras[i], step.extra || {});
      i += 1;
    } catch (e) {
      if (i === 0 || !(e instanceof TooManyError)) {
        throw e;
      }
      latestResult.tooMany = true;
      generators[i] = null;
      progresses[i] = null;
      i -= 1;
    }
  }
}
