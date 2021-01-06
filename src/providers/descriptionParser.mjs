function num(v) {
  return Number(v.replace(/ /g, ''));
}

function getFullValue(normDesc) {
  const price1 = normDesc.match(/price ?([0-9 ]+) 100 ?(?:%|percent)/);
  if (price1) {
    return num(price1[1]);
  }
  const price2 = normDesc.match(/(?:full|total) ?(?:market)? (?:value|price) ?(?:of|is)?([0-9 ]+)(?:[0-9]{2} ?(?:%|percent))/);
  if (price2) {
    return num(price2[1]);
  }
  const price3 = normDesc.match(/(?:full|total) ?(?:market)? (?:value|price) ?(?:of|is)?([0-9 ]+)/);
  if (price3) {
    return num(price3[1]);
  }
  return null;
}

function getShare(normDesc) {
  if (/100 ?(?:%|percent) ?(?:equity|share)/.test(normDesc)) {
    return 1;
  }
  const share0 = normDesc.match(/advertised(?: [a-z]+){0,2} ([0-9]{1,2}) ?(?:%|percent)/);
  if (share0) {
    return Number(share0[1]) * 0.01;
  }
  const share1 = normDesc.match(/([0-9]{1,2}) ?(?:%|percent) ?(?:purchase)? ?(?:equity|share|part ?buy|part ?rent)/);
  if (share1) {
    return Number(share1[1]) * 0.01;
  }
  const share2 = normDesc.match(/share[ds]? (?:of|(?:available|ownership|start|equity) ?(?:basis|scheme)? ?(?:of|at|from)?) ?([0-9]{1,2}) ?(?:%|percent)/);
  if (share2) {
    return Number(share2[1]) * 0.01;
  }
  return null;
}

function getBeds(normDesc) {
  const beds1 = normDesc.match(/([0-9]+) ?bed/);
  if (beds1) {
    return Number(beds1[1]);
  }
  const beds2 = normDesc.match(/([0-9]+)(?: [a-z]+){0,2} ?(?:double)? ?bed/);
  if (beds2) {
    return Number(beds2[1]);
  }
  return null;
}

export function patchFromDescription(details, description) {
  const normDesc = description
    .replace(/&[a-zA-Z0-9#]+;/g, '')
    .replace(/<\/?[a-zA-Z0-9 ="]+>/g, '')
    .replace(/('|\u2019)/g, '')
    .replace(/\.0+/g, '')
    .replace(/[^a-zA-Z0-9% ]+/g, ' ')
    .replace(/  +/g, ' ')
    .toLowerCase();

  if (details.type === 'unknown') {
    if (normDesc.includes('cottage')) {
      details.type = 'holiday_cottage';
    } else if (normDesc.includes('lodge')) {
      details.type = 'holiday_lodge';
    } else if (normDesc.includes('chalet')) {
      details.type = 'holiday_chalet';
    } else if (normDesc.includes('villa')) {
      details.type = 'holiday_villa';
    } else if (normDesc.includes('office space')) {
      details.type = 'business_office';
    } else if (/studio (flat|\bappt\b|app?artment)/.test(normDesc)) {
      details.type = 'flat_studio';
    } else if (/(\bappt\b|app?artment|pent ?house)/.test(normDesc)) {
      details.type = 'flat';
    } else if (/semi ?detached/.test(normDesc)) {
      details.type = 'house_semi_detached';
    } else if (normDesc.includes('detached')) {
      details.type = 'house_detached';
    } else if (/end ?terraced?/.test(normDesc)) {
      details.type = 'house_end_terrace';
    } else if (normDesc.includes('terrace')) {
      details.type = 'house_terraced';
    } else if (normDesc.includes('boat')) {
      details.type = 'boat';
    } else if (/\bflat\b/.test(normDesc)) {
      details.type = 'flat';
    } else if (normDesc.includes('mobile')) {
      details.type = 'mobile';
    } else if (/\b(land|[0-9]*acres?)\b/.test(normDesc)) {
      details.type = 'land';
    } else if (/holiday ?(home|park)/.text(normDesc)) {
      details.type = 'holiday_lodge';
    }
  }

  if (details.type === 'house_town') {
    if (/semi ?detached/.test(normDesc)) {
      details.type = 'house_semi_detached';
    } else if (normDesc.includes('detached')) {
      details.type = 'house_detached';
    }
  }

  if (
    /(current(ly)?|fully) tenanted/.test(normDesc) ||
    /investment( purposes)? (only|property|house|flat|\bappt\b|app?artment)/.test(normDesc) ||
    normDesc.includes('tenanted to')
  ) {
    details.investment = true;
  }

  if (!details.ownership) {
    if (/shared?( of)?( the)? free ?hold/.test(normDesc) || /free ?hold( is)? share/.test(normDesc)) {
      details.ownership = 'freehold_share';
    } else if (/lease ?hold/.test(normDesc) || /(lease|term) [0-9]+ years?/.test(normDesc)) {
      details.ownership = 'leasehold';
    } else if (/free ?hold/.test(normDesc)) {
      details.ownership = 'freehold';
    } else if (details.type.startsWith('flat')) {
      details.ownership = 'leasehold';
    }
  }

  if (/(over [0-9]+s?|retirement) (only|flat)/.test(normDesc)) {
    details.retirement = true;
  }

  if (details.type.startsWith('flat')) {
    const floor = normDesc.match(/([0-9]+)(?:st|nd|rd|th) floor/);
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

  if (details.share === 1 || details.share === 0) {
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
      } else if (share === null && normDesc.includes('shared ownership at')) {
        details.share = 0; // unknown shared ownership split
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
    const beds = getBeds(normDesc);
    if (beds !== null) {
      details.beds = beds;
    } else {
      details.beds = -1;
    }
  }
  return details;
}
