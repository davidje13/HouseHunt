function getFullValue(normDesc) {
  const price1 = normDesc.match(/(?:full|total)(?: ?market)? (value|price)(?: of)?([0-9 ]+)(?:[0-9]{2} ?(?:%|percent))/i);
  if (price1) {
    return Number(price1[1]);
  }
  const price2 = normDesc.match(/(?:full|total)(?: ?market)? (value|price)(?: of)?([0-9 ]+)/i);
  if (price2) {
    return Number(price2[1]);
  }
  return null;
}

function getShare(normDesc) {
  if (/100 ?(?:%|percent) ?(?:equity|share)/i.test(normDesc)) {
    return 1;
  }
  const share1 = normDesc.match(/([0-9]{1,2}) ?(?:%|percent) ?(?:equity|share)/i);
  if (share1) {
    return Number(share1[1]) * 0.01;
  }
  const share2 = normDesc.match(/shared? (?:available|of|ownership(?: of)?) ?([0-9]{1,2}) ?(?:%|percent)/i);
  if (share2) {
    return Number(share2[1]) * 0.01;
  }
  return null;
}

export function patchFromDescription(details, description) {
  const normDesc = description
    .replace(/&[a-zA-Z0-9#]+;/g, '')
    .replace(/<\/?[a-zA-Z0-9]+>/g, '')
    .replace(/('|\u2019)/g, '')
    .replace(/\.0+/g, '')
    .replace(/[^a-zA-Z0-9%]+/g, ' ');

  if (details.type === 'unknown') {
    if (/boat/i.test(normDesc)) {
      details.type = 'boat';
    } else if (/mobile/i.test(normDesc)) {
      details.type = 'mobile';
    } else if (/cottage/i.test(normDesc)) {
      details.type = 'holiday_cottage';
    } else if (/lodge/i.test(normDesc)) {
      details.type = 'holiday_lodge';
    } else if (/chalet/i.test(normDesc)) {
      details.type = 'holiday_chalet';
    } else if (/villa/i.test(normDesc)) {
      details.type = 'holiday_villa';
    } else if (/office space/i.test(normDesc)) {
      details.type = 'business_office';
    } else if (/studio (flat|appartment)/i.test(normDesc)) {
      details.type = 'flat_studio';
    } else if (/appartment/i.test(normDesc)) {
      details.type = 'flat';
    } else if (/penthouse/i.test(normDesc)) {
      details.type = 'flat';
    } else if (/semi ?detached/i.test(normDesc)) {
      details.type = 'house_semi_detached';
    } else if (/detached/i.test(normDesc)) {
      details.type = 'house_detached';
    } else if (/end ?terraced?/i.test(normDesc)) {
      details.type = 'house_end_terrace';
    } else if (/terraced?/i.test(normDesc)) {
      details.type = 'house_terraced';
    } else if (/(land|acre)?/i.test(normDesc)) {
      details.type = 'land';
    }
  }

  if (details.type === 'house_town') {
    if (/semi ?detached/i.test(normDesc)) {
      details.type = 'house_semi_detached';
    } else if (/detached/i.test(normDesc)) {
      details.type = 'house_detached';
    }
  }

  if (
    /(current(ly)?|fully) tenanted/i.test(normDesc) ||
    /investment( purposes)? (only|property|house|flat|appartment)/i.test(normDesc) ||
    /tenanted to/i.test(normDesc)
  ) {
    details.investment = true;
  }

  if (!details.ownership) {
    if (/shared?( of)?( the)? free ?hold/i.test(normDesc) || /free ?hold( is)? share/i.test(normDesc)) {
      details.ownership = 'freehold_share';
    } else if (/lease ?hold/i.test(normDesc)) {
      details.ownership = 'leasehold';
    } else if (/free ?hold/i.test(normDesc)) {
      details.ownership = 'freehold';
    } else if (details.type.startsWith('flat')) {
      details.ownership = 'leasehold';
    }
  }

  if (details.type.startsWith('flat')) {
    const floor = normDesc.match(/([0-9]+)(?:st|nd|rd|th) floor/i);
    if (floor) {
      details.extracted.set('floor', Number(floor[1]));
    }
  }

  if (!details.price) {
    const value = getFullValue(normDesc);
    if (value) {
      details.price = value;
      details.share = 1;
    }
  }

  if (details.share === 1) {
    const value = getFullValue(normDesc);
    if (value && value > details.price) {
      details.share = details.price / value;
    } else {
      const share = getShare(normDesc);
      if (share > 0 && share < 1) {
        details.share = share;
        if (!details.ownership) {
          details.ownership = 'leasehold';
        }
      }
    }
  }

  if (!details.ownership) {
    // assume (perhaps naïvely) that no listed ownership type => freehold
    details.ownership = 'freehold';
  }

  if (details.type === 'flat_studio') {
    details.beds = 0;
  } else if (!details.beds) {
    const beds = normDesc.match(/([0-9]+) bed/i);
    if (beds) {
      details.beds = Number(beds[1]);
    } else {
      details.beds = -1;
    }
  }
  return details;
}
