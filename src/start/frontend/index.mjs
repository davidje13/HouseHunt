//import Image from './Image.mjs';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

function make(tag, attrs = {}, children = []) {
  const o = document.createElement(tag);
  for (const c of children) {
    if (typeof c === 'string') {
      o.appendChild(document.createTextNode(c));
    } else {
      o.appendChild(c);
    }
  }
  Object.entries(attrs).forEach(([k, v]) => {
    o.setAttribute(k, v);
  });
  return o;
}

function makeCanvas(w, h) {
  const canvas = make('canvas', {
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
  });
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  return canvas;
}

//function drawMap(target, items, lonL, latT, lonR, latB) {
//  const ww = target.width;
//  const hh = target.height;
//  const scX = ww / (lonR - lonL);
//  const scY = hh / (latB - latT);
//  for (const item of items) {
//    const x = Math.floor((item.lon - lonL) * scX);
//    const y = Math.floor((item.lat - latT) * scY);
//    if (x >= 0 && x < ww && y >= 0 && y < hh) {
//      target.inc(x, y, 0, 1.0);
//    }
//  }
//}

//function renderData(canvas, data) {
//  const ww = data.width;
//  const hh = data.height;
//  const ctx = canvas.getContext('2d');
//  const ctxImg = ctx.createImageData(ww, hh);
//  for (let y = 0; y < hh; y += 1) {
//    for (let x = 0; x < ww; x += 1) {
//      const p = (y * ww + x) << 2;
//      const v = data.get(x, y, 0);
//      ctxImg.data[p  ] = v / 2.0 * 255.0;
//      ctxImg.data[p|1] = v / 12.0 * 255.0;
//      ctxImg.data[p|2] = 255;
//      ctxImg.data[p|3] = v * 6.0 * 255.0;
//    }
//  }
//  ctx.putImageData(ctxImg, 0, 0);
//}

function triState(v) {
  if (!v) {
    return null;
  }
  return v === 'true';
}

function renderPriceHistogram(canvas, items, { bucketCount, bucketMax, minPrice, maxPrice, normaliseSharedPrice } = {}) {
  const priceMapping = normaliseSharedPrice
    ? ((i) => (i.price / i.share))
    : ((i) => i.price);
  const prices = items.map(priceMapping).sort((a, b) => (a - b));
  if (!minPrice && (!maxPrice || !Number.isFinite(maxPrice))) {
    maxPrice = prices[prices.length - 1];
    const p95 = prices[Math.floor(prices.length * 0.95)];
    if (p95 < maxPrice * 0.7) {
      maxPrice = p95;
    }
    minPrice = prices[0];
    if (minPrice < maxPrice * 0.5) {
      minPrice = 0;
    }
  }
  if (!bucketCount) {
    bucketCount = canvas.width;
  }
  const histogram = new Uint32Array(bucketCount);
  const scale = (bucketCount - 1) / (maxPrice - minPrice);
  prices.forEach((price) => {
    const bucket = Math.floor((price - minPrice) * scale);
    if (bucket >= 0 && bucket < bucketCount) {
      histogram[bucket] += 1;
    }
  });

  if (!bucketMax) {
    bucketMax = Math.max(...histogram);
  }

  const ww = canvas.width;
  const hh = canvas.height;
  const xscale = ww / bucketCount;
  const yscale = hh / bucketMax;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ww, hh);
  ctx.fillStyle = '#FF0000';
  for (let i = 0; i < bucketCount; ++ i) {
    const v = histogram[i];
    if (v) {
      const x = Math.floor(i * xscale);
      const w = Math.floor((i + 1) * xscale) - x;
      const h = Math.ceil(v * yscale);
      ctx.fillRect(x, hh - h, w, h);
    }
  }

  return { bucketCount, bucketMax, minPrice, maxPrice };
}

async function init() {
  const side = document.getElementById('side');
  side.appendChild(make('h2', {}, ['Prices']));
  const priceHistogram = makeCanvas(300, 30); side.appendChild(priceHistogram);

  const filters = document.getElementById('filters');
  const total = document.getElementById('total');
  filters.addEventListener('submit', (e) => {
    e.preventDefault();
    refreshFilters();
  });
  const initial = new Map(new URLSearchParams(document.location.hash.substr(1)));
  for (const input of filters.querySelectorAll('input,select')) {
    input.addEventListener('input', () => {
      refreshFilters();
    });
    const initialValue = initial.get(input.getAttribute('name'));
    if (initialValue !== undefined) {
      input.value = initialValue;
    }
  }

  const locationsApi = await fetch('/api/locations');
  const locationsJson = await locationsApi.json();
  const allItems = locationsJson.items;
  let filteredItems = null;

  const mapItems = new ol.source.Vector();
  function replaceMapItems(items) {
    mapItems.clear();
    mapItems.addFeatures(items.map((item) => new ol.Feature({
      geometry: new ol.geom.Point(ol.proj.fromLonLat([item.lon, item.lat])),
    })));
  }

  let debouncedMapUpdate = null;
  function updateFilter(filter, minPrice, maxPrice, normaliseSharedPrice) {
    filteredItems = allItems.filter(filter);
    total.innerText = filteredItems.length.toLocaleString();
    renderPriceHistogram(priceHistogram, filteredItems, { bucketCount: 50, minPrice, maxPrice, normaliseSharedPrice });

    clearTimeout(debouncedMapUpdate);
    debouncedMapUpdate = setTimeout(() => replaceMapItems(filteredItems), 300);
  }

  function refreshFilters() {
    const savedValues = new URLSearchParams();
    for (const input of filters.querySelectorAll('input,select')) {
      savedValues.append(input.getAttribute('name'), input.value);
    }
    document.location.hash = savedValues.toString();

    const minPrice = Number(filters.querySelector('[name="price-min"]').value || '0');
    const maxPrice = Number(filters.querySelector('[name="price-max"]').value || 'Infinity');
    const minBeds = Number(filters.querySelector('[name="beds-min"]').value || '-1');
    const maxBeds = Number(filters.querySelector('[name="beds-max"]').value || 'Infinity');
    const investment = triState(filters.querySelector('[name="investment"]').value);
    const ownership = filters.querySelector('[name="ownership"]').value;
    const shared = filters.querySelector('[name="shared"]').value;
    const newBuild = triState(filters.querySelector('[name="new"]').value);
    updateFilter((i) => {
      let price = i.price;
      if (shared === 'full') {
        price /= i.share;
      } else if (shared === 'false' && i.share !== 1) {
        return false;
      }
      if (ownership && ownership !== i.ownership) {
        if (ownership === 'freehold_share' && i.ownership === 'freehold') {
          // also allowed (freehold > freehold_share)
        } else {
          return false;
        }
      }
      return (
        price >= minPrice && price <= maxPrice &&
        i.beds >= minBeds && i.beds <= maxBeds &&
        (investment === null || i.investment === investment) &&
        (newBuild === null || i.newbuild === newBuild)
      );
    }, minPrice, maxPrice, shared === 'full');
  }
  refreshFilters();

  const map = new ol.Map({
    target: 'map',
    moveTolerance: 3,
    pixelRatio: dpr,
    layers: [
      new ol.layer.Tile({
        source: new ol.source.OSM({
          transition: 0,
        }),
        opacity: 0.3,
      }),
      new ol.layer.WebGLPoints({
        source: mapItems,
        maxZoom: 11,
        style: {
          symbol: {
            symbolType: 'square',
            size: 0.5,
            color: '#FFFFFF',
          },
        },
        disableHitDetection: true,
      }),
      new ol.layer.WebGLPoints({
        source: mapItems,
        minZoom: 11,
        style: {
          symbol: {
            symbolType: 'circle',
            size: ['interpolate', ['exponential', 0.8], ['zoom'], 11, 3, 19, 30],
            color: '#FFFFFF',
          },
        },
      }),
    ],
    view: new ol.View({
      center: ol.proj.fromLonLat([-3.44, 55.38]),
      zoom: 5.5,
      maxZoom: 19,
    }),
  });

  //const canvas = makeCanvas(600, 750);
  //document.body.appendChild(canvas);

  //const raw = new Image(canvas.width, canvas.height, 1);

  //perFrame(batched(allItems, 10000), (itemsBatch) => {
  //  drawMap(raw, itemsBatch, -10, 60, 5, 48);

  //  const data = new Image(raw);
  //  data.blur(0.4);
  //  renderData(canvas, data);
  //});
}

init();
