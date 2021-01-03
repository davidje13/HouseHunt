import { checkConnectionError } from './api.mjs';
import {
  getListings,
  strategyPaginated,
  strategyFiltered,
  strategyBands,
  strategyApplyIfNeeded,
  strategyMulti,
} from './listings.mjs';
import processData from './process.mjs';

// Zoopla API has a few limitations/bugs which we must work around:
// - undocumented max page limit: 100
// - lat/lon min/max lookup includes bleed edge of unknown size
// - lat/lon min/max lookup with radius results in a point lookup at the centre with the given radius
// - chain_free=false filter does nothing
// - maximum_price is EXCLUSIVE, not inclusive

const FILTER = {
  order_by: 'age',
  ordering: 'descending', // newest first
  listing_status: 'sale',
};

const STATUS_FILTERS = [
  { name: 'new',        filter: { new_homes: 'yes' } },
  // chain_free: false/no seems to be broken in the Zoopla API, so we don't try to load that data to save API calls
  //{ name: 'chain',      filter: { new_homes: 'no', chain_free: 'no' } },
  //{ name: 'chain_free', filter: { new_homes: 'no', chain_free: 'yes' } },
  { name: 'owned',      filter: { new_homes: 'no' } },
];

function getFullListings(progress, setProgress) {
  return getListings({
    ...FILTER,
    lat_min: -90,
    lat_max: 90,
    lon_min: -180,
    lon_max: 180,
  }, [
    strategyFiltered(STATUS_FILTERS),
    strategyMulti([
      {
        filter: {},
        strategies: [
          strategyBands({
            name: 'price',
            minKey: 'minimum_price',
            maxKey: 'maximum_price',
            begin: 1,
            softBegin: 50000,
            maxStep: 100000,
            minStep: 1000,
            softEnd: 1000000,
            end: Number.POSITIVE_INFINITY,
          }),
        ],
      },
      {
        filter: { maximum_price: 1 },
        strategies: [
          strategyApplyIfNeeded(strategyBands({
            name: 'latitudes',
            minKey: 'lat_min',
            maxKey: 'lat_max',
            begin: -90,
            softBegin: 48,
            maxStep: 1,
            minStep: 0.01,
            softEnd: 59,
            end: 90,
            delta: 0,
            extras: { lon_min: -180, lon_max: 180 },
          })),
        ],
      },
    ]),
    strategyPaginated(true),
  ], progress, setProgress);
}

function getLatestListings() {
  return getListings({
    ...FILTER,
    lat_min: -90,
    lat_max: 90,
    lon_min: -180,
    lon_max: 180,
  }, [
    strategyFiltered(STATUS_FILTERS),
    strategyPaginated(false),
  ]);
}

export default {
  name: 'zoopla',
  checkConnectionError,
  getFullListings,
  getLatestListings,
  processData,
};
