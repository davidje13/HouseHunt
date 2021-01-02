export function patchFromDescription(details, description) {
  // TODO

  if (details.type === 'unknown') {
    if (/boat/i.test(description)) {
      details.type = 'boat';
    } else if (/mobile/i.test(description)) {
      details.type = 'mobile';
    } else if (/cottage/i.test(description)) {
      details.type = 'holiday_cottage';
    } else if (/lodge/i.test(description)) {
      details.type = 'holiday_lodge';
    } else if (/chalet/i.test(description)) {
      details.type = 'holiday_chalet';
    } else if (/villa/i.test(description)) {
      details.type = 'holiday_villa';
    } else if (/office space/i.test(description)) {
      details.type = 'business_office';
    } else if (/studio (flat|appartment)/i.test(description)) {
      details.type = 'flat_studio';
    } else if (/appartment/i.test(description)) {
      details.type = 'flat';
    } else if (/penthouse/i.test(description)) {
      details.type = 'flat';
    } else if (/semi[- ]*detached/i.test(description)) {
      details.type = 'house_semi_detached';
    } else if (/detached/i.test(description)) {
      details.type = 'house_detached';
    } else if (/end[- ]*terraced?/i.test(description)) {
      details.type = 'house_end_terrace';
    } else if (/terraced?/i.test(description)) {
      details.type = 'house_terraced';
    } else if (/(land|acre)?/i.test(description)) {
      details.type = 'land';
    }
  }

  if (details.type === 'house_town') {
    if (/semi[- ]*detached/i.test(description)) {
      details.type = 'house_semi_detached';
    } else if (/detached/i.test(description)) {
      details.type = 'house_detached';
    }
  }

  if (details.type.startsWith('flat')) {
    const floor = description.match(/([0-9]+)(st|nd|rd|th) floor/);
    if (floor) {
      details.extracted.set('floor', Number(floor[1]));
    }
  }

  if (details.type === 'flat_studio') {
    details.beds = 0;
  } else if (!details.beds) {
    details.beds = -1;
  }
  return details;
}
