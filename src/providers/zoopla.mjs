import fetch from 'node-fetch';
import Throttle from '../util/Throttle.mjs';
import { patchFromDescription } from './descriptionParser.mjs';

const API_BASE = 'https://api.zoopla.co.uk/api/v1';
const API_KEY = process.env.ZOOPLA_KEY;

const PAGE_SIZE = 100; // max permitted
const MAX_PAGES = 100; // max permitted
const apiThrottle = new Throttle(100, 1000 * 60 * 60); // max permitted API call rate: 100/hour
const RETRY_MIN_DELAY = 5000;

const LAT_BEGIN = 48;
const LAT_END = 59;
const LAT_MAX_SEP = 1;

const FILTER = {
  order_by: 'age',
  ordering: 'descending', // newest first
  listing_status: 'sale',
};

const STATUS_FILTERS = [
  // chain_free: false/no seems to be broken in the Zoopla API, so we don't try to load that data to save API calls
  //{ name: 'chain',      filter: { new_homes: 'no', chain_free: 'no' } },
  //{ name: 'chain_free', filter: { new_homes: 'no', chain_free: 'yes' } },
  { name: 'owned',      filter: { new_homes: 'no' } },
  { name: 'new',        filter: { new_homes: 'yes' } },
];

function getText(res) {
  return res.text().catch(() => '<failed to get response text>');
}

async function callAPI(api, params) {
  const url = `${API_BASE}/${api}.json?${new URLSearchParams({ api_key: API_KEY, ...params })}`;
  const maskedUrl = `${API_BASE}/${api}.json?${new URLSearchParams({ api_key: 'hidden', ...params })}`;
  console.info(`calling ${maskedUrl}`);

  while (true) {
    await apiThrottle.check();
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      console.warn(`Failed to load ${maskedUrl}; error: ${e.message}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MIN_DELAY));
      continue;
    }
    if (res.ok) {
      let json;
      try {
        json = await res.json();
      } catch (e) {
        const text = await getText(res);
        throw new Error(`JSON parse error from ${maskedUrl}; error: ${e.message}; raw: ${text}`);
      }
      if (json.error_code) {
        throw new Error(`API error from ${maskedUrl}: ${json.error_code} - ${json.error_string}`);
      }
      return json;
    }
    const text = await getText(res);
    if (res.status === 403 && text.includes('Developer Over Rate')) {
      // We have reached the API rate limit
      console.warn(`${new Date().toISOString()}: API rate limit reached`);
      await apiThrottle.limitReached();
      continue;
    }
    if (res.status < 500) {
      throw new Error(`Status error from ${maskedUrl}; status: ${res.status}; raw: ${text}`);
    }
    console.warn(`Status error from ${maskedUrl}; status: ${res.status}; raw: ${text}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_MIN_DELAY));
  }
}

async function checkConnectionError() {
  if (!API_KEY) {
    return 'No Zoopla API key given; see the Readme for details';
  }
  const res = await callAPI('geo_autocomplete', {}).catch((e) => e.message);
  if (typeof res !== 'string') {
    return 'Unexpected result from Zoopla API';
  }
  if (res.includes('status: 403')) {
    return 'Invalid Zoopla API key given';
  }
  return null;
}

async function* getPaginatedListings(observedIds, filter, { pageStart = 1, pageBeginCallback, tooManyCallback } = {}) {
  for (let page = pageStart; page < MAX_PAGES; page += 1) {
    if (pageBeginCallback) {
      await pageBeginCallback(page);
    }
    const data = await callAPI('property_listings', {
      ...filter,
      page_number: page,
      page_size: PAGE_SIZE,
    });

    const begin = (page - 1) * PAGE_SIZE;
    const total = data.result_count;
    const items = data.listing.length;

    for (const listing of data.listing) {
      const id = listing.listing_id;
      if (!observedIds.has(id)) { // avoid overlap between pages if data has changed
        observedIds.add(id);
        const status = yield { id: id, raw: JSON.stringify(listing) };
        if (status === false) {
          // consumer wants us to stop
          return;
        }
      }
    }
    if (tooManyCallback && total > PAGE_SIZE * MAX_PAGES) {
      // too many items for us to iterate through all of them
      tooManyCallback(total / (PAGE_SIZE * MAX_PAGES));
      break;
    }

    if (items < PAGE_SIZE || begin + items >= total) {
      break;
    }
    if (page === MAX_PAGES - 1) {
      console.warn(`Too many items found; some will be lost (total: ${total}, limit: ${PAGE_SIZE * MAX_PAGES})`);
    }
  }
}

async function* getFilteredListings(observedIds, filter, { filterStart = 0, pageStart = 1, beginCallback, tooManyCallback } = {}) {
  let tooMany = 0;
  const tooManyInnerCallback = tooManyCallback ? ((v) => { tooMany = v; tooManyCallback(v); }) : null;
  for (let i = filterStart; i < STATUS_FILTERS.length; i += 1) {
    const statusFilter = STATUS_FILTERS[i];
    const pageBeginCallback = beginCallback ? ((p) => beginCallback({ page: p, filter: i })) : null;
    for await (const listing of getPaginatedListings(observedIds, { ...filter, ...statusFilter.filter }, { pageStart, pageBeginCallback, tooManyCallback: tooManyInnerCallback })) {
      const status = yield { ...listing, filterName: statusFilter.name };
      if (status === false) {
        // consumer wants us to stop on the current iteration and move on to the next one
        break;
      }
    }
    pageStart = 1;
    if (tooMany >= 1) {
      break;
    }
  }
}

async function* getFullListings(progress, setProgress) {
  let { latMin = -90, latMax = LAT_BEGIN, filter = 0, page = 1 } = JSON.parse(progress || '{}');
  const observedIds = new Set();
  while (latMin < 90) {
    const gap = latMax - latMin;
    let tooMany = 0;
    const tooManyCallback = (v) => { tooMany = v; };
    console.info(`Loading latitudes ${latMin} - ${latMax}`);
    yield* getFilteredListings(observedIds, {
      ...FILTER,
      lat_min: latMin,
      lat_max: latMax,
      lon_min: -180,
      lon_max: 180,
    }, {
      filterStart: filter,
      pageStart: page,
      beginCallback: (p) => setProgress(JSON.stringify({ latMin, latMax, ...p })),
      tooManyCallback: (gap > 0.01) ? tooManyCallback : null,
    });
    filter = 0;
    page = 1;
    if (tooMany >= 1) {
      console.info(`Too many results (${(tooMany * 100).toFixed()}%); reducing latitude range`);
      latMax = latMin + gap / (tooMany + 5);
    } else {
      latMin = latMax;
      latMax += Math.min(gap * 2, LAT_MAX_SEP);
      if (latMax >= LAT_END) {
        latMax = 90;
      }
    }
  }
}

function getLatestListings() {
  const observedIds = new Set();
  return getFilteredListings(observedIds, {
    ...FILTER,
    lat_min: -90,
    lat_max: 90,
    lon_min: -180,
    lon_max: 180,
  });
}

function fromAPIDate(d) {
  if (!d) {
    return null;
  }
  return new Date(d.replace(' ', 'T') + 'Z');
}

function normalise(s) {
  if (!s) {
    return '';
  }
  return s.toLowerCase().replace(/[^a-z]+/g, '_');
}

function mapPropertyType(type) {
  const norm = normalise(type);
  switch (norm) {
    case '': return 'unknown';

    case 'land':                return 'land';
    case 'parking_garage':      return 'land_parking';
    case 'farm':                return 'land_farm';
    case 'equestrian_property': return 'land_stables';

    case 'mobile_park_home': return 'mobile';
    case 'houseboat': return 'boat';

    case 'flat':       return 'flat';
    case 'studio':     return 'flat_studio';
    case 'maisonette': return 'flat_maisonette';

    case 'bungalow':               return 'bungalow';
    case 'detached_bungalow':      return 'bungalow_detached';
    case 'terraced_bungalow':      return 'bungalow_terraced';
    case 'semi_detached_bungalow': return 'bungalow_semi_detached';

    case 'detached_house':      return 'house_detached';
    case 'semi_detached_house': return 'house_semi_detached';
    case 'link_detached_house': return 'house_link_detached';
    case 'terraced_house':      return 'house_terraced';
    case 'mews_house':          return 'house_terraced_mews';
    case 'end_terrace_house':   return 'house_end_terrace';
    case 'farmhouse':           return 'house_farm';
    case 'country_house':       return 'house_country';
    case 'town_house':          return 'house_town';
    case 'barn_conversion':     return 'house_barn_conversion';

    case 'hotel_guest_house':   return 'business_hotel';
    case 'leisure_hospitality': return 'business_leisure';
    case 'retail_premises':     return 'business_shop';
    case 'block_of_flats':      return 'business_flats';
    case 'office':              return 'business_office';

    case 'cottage': return 'holiday_cottage';
    case 'lodge':   return 'holiday_lodge';
    case 'chalet':  return 'holiday_chalet';
    case 'villa':   return 'holiday_villa';

    default: return norm;
  }
}

function processData(filterName, raw) {
  const extracted = new Map();
  const data = JSON.parse(raw);

  let newbuild = false;
  if (filterName === 'new') {
    newbuild = true;
    extracted.set('chain', false);
  } else if (filterName === 'chain_free') {
    extracted.set('chain', false);
  } else {
    extracted.set('chain', true);
  }

  extracted.set('country_code', data.country_code);
  extracted.set('country', data.country);
  extracted.set('county', data.county);
  extracted.set('town', data.post_town);
  extracted.set('street_name', data.street_name);
  extracted.set('outcode', data.outcode);
  extracted.set('address', data.displayable_address);

  extracted.set('agent', data.agent_name);

  if (data.num_floors) {
    extracted.set('floors', data.num_floors);
  }
  if (data.num_recepts) {
    extracted.set('receptions', data.num_recepts);
  }
  if (data.num_bathrooms) {
    extracted.set('bathrooms', data.num_bathrooms);
  }
  if (data.location_is_approximate) {
    extracted.set('approx_location', true);
  }
  // data.category is always "Residential"
  let price = data.price;
  if (!price && data.price_change?.length) {
    price = data.price_change[0].price;
  }

  return patchFromDescription({
    listed: fromAPIDate(data.first_published_date),
    type: mapPropertyType(data.property_type),
    price,
    newbuild,
    beds: data.num_bedrooms || 0,
    latitude: data.latitude,
    longitude: data.longitude,
    extracted,
    thumbnail: data.thumbnail_url,
    image: data.image_url,
    url: data.details_url,
  }, data.description + '\n\n' + data.short_description);
}

export default {
  name: 'zoopla',
  checkConnectionError,
  getFullListings,
  getLatestListings,
  processData,
};
