export function quoteHValue(v) {
  if (v === undefined || v === null) {
    return '""';
  }
  const s = String(v);
  return `"${s.replace(/(["\\])/g, '\\$1')}"`;
}

export function encodeHStore(map) {
  const result = [];
  map.forEach((v, k) => {
    result.push(`${quoteHValue(k)}=>${quoteHValue(v)}`);
  });
  return result.join(',');
}

export function decodeHStore(hstore) {
  const result = new Map();
  let current = '';
  let currentKey = '';
  let quote = false;
  for (let p = 0; p < hstore.length;) {
    const c = hstore[p];
    switch (c) {
      case ' ':
      case '\r':
      case '\n':
      case '\t':
        if (quote) {
          current += c;
        }
        break;
      case '\\':
        current += hstore[p + 1];
        p += 1;
        break;
      case '"':
        quote = !quote;
        break;
      case '=':
        if (quote) {
          current += c;
        } else if (hstore[p + 1] === '>') {
          currentKey = current;
          current = '';
          p += 1;
        }
        break;
      case ',':
        if (quote) {
          current += c;
        } else {
          result.set(currentKey, current);
          currentKey = '';
          current = '';
        }
        break;
      default:
        current += c;
        break;
    }
    p += 1;
  }
  if (currentKey) {
    result.set(currentKey, current);
  }
  return result;
}
