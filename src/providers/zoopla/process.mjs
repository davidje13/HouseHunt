import { patchFromDescription } from '../descriptionParser.mjs';

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

export default function processData(filterName, raw) {
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
    share: 1,
    ownership: null,
    investment: false,
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
